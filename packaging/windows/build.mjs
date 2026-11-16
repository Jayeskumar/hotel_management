#!/usr/bin/env node
/**
 * Builds the Windows on-prem installer: dist/windows/TableWise-Setup-<version>-x64.exe
 *
 *   node packaging/windows/build.mjs                 full build (needs makensis on PATH)
 *   node packaging/windows/build.mjs --bundle-only   just app/ (server.mjs + web + migrations), for testing
 *   node packaging/windows/build.mjs --release       refuse to build with the development licence key
 *
 * Runs on Linux, macOS or Windows. Downloads (cached in .cache/windows):
 *   - Node.js for Windows (node.exe)            from the npm package node-win-x64
 *   - PostgreSQL for Windows binaries            from EnterpriseDB (official build)
 *   - WinSW 2.12 service wrapper                 from GitHub releases (checksum pinned)
 */
import { execFileSync, execSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = new Set(process.argv.slice(2));
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const VERSION = process.env.TABLEWISE_VERSION ?? pkg.version;
const NODE_VERSION = process.env.NODE_WIN_VERSION ?? '22.23.4';
const PG_VERSION = process.env.PG_WIN_VERSION ?? '17.12-1';
/** SHA-256 of the EDB archive for the default version (verified on first download; override with PG_WIN_SHA256). */
const PG_SHA256 = { '17.12-1': 'a2cd8a774389347b70be7748ac4a37ef43cb6ee539c5fc3e85ae264b15e4a04c' };
const WINSW_VERSION = '2.12.0';
const WINSW_SHA256 = '05b82d46ad331cc16bdc00de5c6332c1ef818df8ceefcd49c726553209b3a0da';

const cache = path.join(root, '.cache', 'windows');
const out = path.join(root, 'dist', 'windows');
const stage = path.join(out, 'stage');
const sh = (cmd, opts = {}) => execSync(cmd, { stdio: 'inherit', cwd: root, ...opts });
const step = (m) => console.log(`\n▶ ${m}`);

// ---------------------------------------------------------------- guard rails
const keyFile = fs.readFileSync(path.join(root, 'apps/api/src/lib/license-public-key.ts'), 'utf8');
if (/IS_DEV_KEY = true/.test(keyFile)) {
  if (args.has('--release')) {
    console.error('✖ The development licence key is still in use. Run `npm run license:keygen -- --out <file>` first.');
    process.exit(1);
  }
  console.warn('⚠ Building with the DEVELOPMENT licence key — licences can be forged. Not for customers.');
}

// ---------------------------------------------------------------- 1. app bundle
step('Building shared package and web app');
sh('npm run build -w @tablewise/shared');
sh('npm run build -w @tablewise/web');

step('Bundling server');
fs.rmSync(stage, { recursive: true, force: true });
const appDir = path.join(stage, 'app');
fs.mkdirSync(appDir, { recursive: true });
await build({
  entryPoints: [path.join(root, 'apps/api/src/onprem/launcher.ts')],
  outfile: path.join(appDir, 'server.mjs'),
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  minify: false,
  sourcemap: 'linked',
  legalComments: 'external',
  define: { __APP_VERSION__: JSON.stringify(VERSION) },
  // Optional native add-ons that the pure-JS code paths never load.
  external: ['pg-native', 'bufferutil', 'utf-8-validate', 'pino-pretty'],
  banner: {
    js: [
      "import { createRequire as __twCreateRequire } from 'node:module';",
      "import { fileURLToPath as __twFileURLToPath } from 'node:url';",
      "import { dirname as __twDirname } from 'node:path';",
      'const require = __twCreateRequire(import.meta.url);',
      'const __filename = __twFileURLToPath(import.meta.url);',
      'const __dirname = __twDirname(__filename);',
    ].join('\n'),
  },
  logLevel: 'warning',
});
fs.cpSync(path.join(root, 'apps/web/dist'), path.join(appDir, 'web'), { recursive: true });
fs.cpSync(path.join(root, 'apps/api/drizzle'), path.join(appDir, 'drizzle'), { recursive: true });
fs.writeFileSync(path.join(appDir, 'package.json'), JSON.stringify({ name: 'tablewise-onprem', version: VERSION, type: 'module', private: true }, null, 2));
console.log(`  app bundle → ${path.relative(root, appDir)}`);

if (args.has('--bundle-only')) process.exit(0);

// ---------------------------------------------------------------- 2. runtimes
fs.mkdirSync(cache, { recursive: true });

function npmPack(spec) {
  const dir = path.join(cache, spec.replace(/[@/]/g, '_'));
  if (!fs.existsSync(path.join(dir, 'package'))) {
    fs.mkdirSync(dir, { recursive: true });
    const tgz = execFileSync('npm', ['pack', spec, '--silent', '--pack-destination', dir], { encoding: 'utf8' }).trim().split('\n').pop();
    execFileSync('tar', ['xzf', path.join(dir, tgz), '-C', dir]);
  }
  return path.join(dir, 'package');
}

step(`Node.js ${NODE_VERSION} for Windows`);
const nodePkg = npmPack(`node-win-x64@${NODE_VERSION}`);
fs.mkdirSync(path.join(stage, 'node'), { recursive: true });
fs.copyFileSync(path.join(nodePkg, 'bin', 'node.exe'), path.join(stage, 'node', 'node.exe'));

step(`PostgreSQL ${PG_VERSION} for Windows`);
const pgZip = path.join(cache, `postgresql-${PG_VERSION}-windows-x64-binaries.zip`);
if (!fs.existsSync(pgZip)) {
  const url = `https://get.enterprisedb.com/postgresql/postgresql-${PG_VERSION}-windows-x64-binaries.zip`;
  console.log(`  downloading ${url}`);
  sh(`curl -fL --retry 4 -o "${pgZip}.part" "${url}"`);
  fs.renameSync(`${pgZip}.part`, pgZip);
}
const pgSha = crypto.createHash('sha256').update(fs.readFileSync(pgZip)).digest('hex');
console.log(`  sha256 ${pgSha}`);
const expectedPgSha = process.env.PG_WIN_SHA256 ?? PG_SHA256[PG_VERSION];
if (expectedPgSha && expectedPgSha !== pgSha) {
  console.error(`✖ PostgreSQL archive checksum mismatch (expected ${expectedPgSha})`); process.exit(1);
}
const pgExtract = path.join(cache, `pgsql-${PG_VERSION}`);
if (!fs.existsSync(path.join(pgExtract, 'pgsql', 'bin', 'pg_ctl.exe'))) {
  fs.mkdirSync(pgExtract, { recursive: true });
  // Only the server runtime: skip pgAdmin, StackBuilder, docs, headers and debug symbols (~250 MB).
  sh(`unzip -q -o "${pgZip}" "pgsql/bin/*" "pgsql/lib/*" "pgsql/share/*" -d "${pgExtract}"`);
}
fs.cpSync(path.join(pgExtract, 'pgsql'), path.join(stage, 'pgsql'), { recursive: true });
for (const lib of fs.readdirSync(path.join(stage, 'pgsql', 'lib'))) {
  if (lib.endsWith('.lib') || lib.endsWith('.a')) fs.rmSync(path.join(stage, 'pgsql', 'lib', lib));
}

step(`Windows service wrapper (WinSW ${WINSW_VERSION})`);
const winsw = path.join(cache, `WinSW-x64-${WINSW_VERSION}.exe`);
if (!fs.existsSync(winsw)) {
  sh(`curl -fL --retry 4 -o "${winsw}.part" "https://github.com/winsw/winsw/releases/download/v${WINSW_VERSION}/WinSW-x64.exe"`);
  fs.renameSync(`${winsw}.part`, winsw);
}
const winswSha = crypto.createHash('sha256').update(fs.readFileSync(winsw)).digest('hex');
if (winswSha !== WINSW_SHA256) { console.error(`✖ WinSW checksum mismatch: ${winswSha}`); process.exit(1); }
const svcDir = path.join(stage, 'service');
fs.mkdirSync(svcDir, { recursive: true });
fs.copyFileSync(winsw, path.join(svcDir, 'TableWiseService.exe'));
fs.copyFileSync(path.join(root, 'packaging/windows/TableWiseService.xml'), path.join(svcDir, 'TableWiseService.xml'));

step('Launchers and docs');
for (const f of ['tablewise.cmd', 'open-tablewise.vbs', 'wait-ready.mjs', 'README.txt', 'EULA.txt']) {
  fs.copyFileSync(path.join(root, 'packaging/windows', f), path.join(stage, f));
}
fs.copyFileSync(path.join(root, 'apps/web/public/favicon.ico'), path.join(stage, 'tablewise.ico'));
fs.writeFileSync(path.join(stage, 'VERSION.txt'), `TableWise ${VERSION}\nNode.js ${NODE_VERSION}\nPostgreSQL ${PG_VERSION}\n`);

// ---------------------------------------------------------------- 3. installer
step('Compiling installer (NSIS)');
const exe = path.join(out, `TableWise-Setup-${VERSION}-x64.exe`);
execFileSync('makensis', [
  '-V2', `-DVERSION=${VERSION}`, `-DSTAGE=${stage}`, `-DOUTFILE=${exe}`,
  path.join(root, 'packaging/windows/installer.nsi'),
], { stdio: 'inherit' });

if (process.env.WINDOWS_SIGN_PFX) {
  step('Code signing');
  const signed = `${exe}.signed`;
  execFileSync('osslsigncode', [
    'sign', '-pkcs12', process.env.WINDOWS_SIGN_PFX, '-pass', process.env.WINDOWS_SIGN_PASSWORD ?? '',
    '-n', 'TableWise', '-t', 'http://timestamp.digicert.com', '-in', exe, '-out', signed,
  ], { stdio: 'inherit' });
  fs.renameSync(signed, exe);
}

const size = (fs.statSync(exe).size / 1024 / 1024).toFixed(1);
const sha = crypto.createHash('sha256').update(fs.readFileSync(exe)).digest('hex');
fs.writeFileSync(`${exe}.sha256`, `${sha}  ${path.basename(exe)}\n`);
console.log(`\n✔ ${path.relative(root, exe)} (${size} MB)\n  sha256 ${sha}`);
