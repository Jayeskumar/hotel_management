/**
 * On-prem entry point (bundled to app/server.mjs and run by the Windows service).
 *
 *   server.mjs run                          start database + web server (default)
 *   server.mjs info                         show paths, ports and LAN addresses
 *   server.mjs backup                       take a backup now
 *   server.mjs restore <file.dump>          queue a restore; it runs when the service restarts
 *   server.mjs reset-password <email> <new> reset a user's password and unlock the account
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import { loadConfig } from '../config.js';
import { createDb } from '../db/client.js';
import { users } from '../db/schema.js';
import { hashPassword } from '../lib/password.js';
import { startServer, type RunningServer } from '../server.js';
import { Backups } from './backups.js';
import { resolvePaths } from './paths.js';
import { EmbeddedPostgres } from './postgres.js';
import { loadSettings, saveSettings } from './settings.js';

declare const __APP_VERSION__: string | undefined;
const VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : (process.env.APP_VERSION ?? '0.0.0-dev');

const log = (m: string) => console.log(`[${new Date().toISOString()}] ${m}`);
const paths = resolvePaths();
const settings = loadSettings(paths);
const pgsql = new EmbeddedPostgres(paths, settings, log);
const backups = new Backups(paths, settings, pgsql, log);

function lanUrls() {
  return Object.values(os.networkInterfaces()).flat()
    .filter((i): i is os.NetworkInterfaceInfo => !!i && i.family === 'IPv4' && !i.internal)
    .map((i) => `http://${i.address}:${settings.port}`);
}

const restoreRequestFile = () => path.join(paths.dataDir, 'restore-request.json');

/**
 * Restores are performed by the service itself at start-up, before the web server opens.
 * On Windows only the service account can touch the database files (PostgreSQL drops admin
 * rights), so the CLI just queues the request and restarts the service.
 */
async function applyPendingRestore() {
  const reqFile = restoreRequestFile();
  if (!fs.existsSync(reqFile)) return;
  const { file } = JSON.parse(fs.readFileSync(reqFile, 'utf8')) as { file: string };
  fs.rmSync(reqFile, { force: true });
  if (!fs.existsSync(file)) { log(`Restore skipped: ${file} not found`); return; }
  log(`Restoring ${file} — taking a safety backup of the current data first…`);
  await backups.create('before-restore');
  await pgsql.restore(file);
  log('Restore complete.');
}

async function runServer() {
  log(`TableWise ${VERSION} (on-prem) starting. Data: ${paths.dataDir}`);
  for (const d of [paths.dataDir, paths.backupsDir, paths.logsDir]) fs.mkdirSync(d, { recursive: true });
  const startedDb = await pgsql.start();
  await pgsql.ensureDatabase();
  await applyPendingRestore();
  // Desktop shortcuts read the port from here (the data folder is admin-only).
  try { fs.writeFileSync(path.join(paths.installDir, 'port.txt'), String(settings.port)); } catch { /* read-only install dir */ }

  // Safety net: snapshot the data before a new version runs its migrations.
  if (settings.lastVersion && settings.lastVersion !== VERSION) {
    log(`Upgrade detected (${settings.lastVersion} → ${VERSION}); taking a backup first.`);
    await backups.create('pre-upgrade');
  }

  process.env.MIGRATIONS_DIR = paths.migrationsDir;
  const config = loadConfig({
    NODE_ENV: 'production',
    DEPLOYMENT_MODE: 'onprem',
    DATABASE_URL: pgsql.url,
    JWT_SECRET: settings.jwtSecret,
    PORT: String(settings.port),
    HOST: '0.0.0.0',
    WEB_DIR: paths.webDir,
    APP_VERSION: VERSION,
    LOG_LEVEL: settings.logLevel,
    CORS_ORIGINS: `http://localhost:${settings.port}`,
    DB_POOL_MAX: '20',
  });

  let server: RunningServer;
  try {
    server = await startServer({
      config,
      hooks: { dataDir: paths.dataDir, backupNow: () => backups.create('manual'), listBackups: () => backups.list() },
    });
  } catch (e) {
    if (startedDb) await pgsql.stop().catch(() => undefined);
    throw e;
  }
  saveSettings(paths, { ...settings, lastVersion: VERSION });
  const timer = backups.schedule();

  log(`Ready on http://localhost:${settings.port}`);
  for (const u of lanUrls()) log(`Other devices on this network can open ${u}`);

  let stopping = false;
  const shutdown = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    log(`Received ${signal}; shutting down`);
    clearInterval(timer);
    await server.close().catch(() => undefined);
    await pgsql.stop().catch((e) => log(`Database stop failed: ${(e as Error).message}`));
    process.exit(0);
  };
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGBREAK'] as const) process.on(sig, () => void shutdown(sig));
}

/** Runs a short task with the database up, stopping it afterwards only if we started it. */
async function withDatabase<T>(fn: () => Promise<T>): Promise<T> {
  if (process.platform === 'win32' && !(await pgsql.isRunning())) {
    throw new Error('The TableWise service is not running. Start it first:  net start TableWise');
  }
  const started = await pgsql.start();
  try {
    await pgsql.ensureDatabase();
    return await fn();
  } finally {
    if (started) await pgsql.stop();
  }
}

async function main() {
  const [cmd = 'run', ...args] = process.argv.slice(2);
  switch (cmd) {
    case 'run':
      return runServer();
    case 'info':
      console.log(JSON.stringify({
        version: VERSION, dataDir: paths.dataDir, installDir: paths.installDir, webPort: settings.port,
        databasePort: settings.pgPort, databaseRunning: await pgsql.isRunning(), lanUrls: lanUrls(),
        backupHour: settings.backupHour, backupKeep: settings.backupKeep, backups: (await backups.list()).slice(0, 5),
      }, null, 2));
      return;
    case 'backup': {
      const b = await withDatabase(() => backups.create('manual'));
      console.log(path.join(paths.backupsDir, b.file));
      return;
    }
    case 'restore': {
      const file = args[0] && path.resolve(args[0]);
      if (!file || !fs.existsSync(file)) throw new Error('Usage: restore <path-to-backup.dump>');
      fs.writeFileSync(restoreRequestFile(), JSON.stringify({ file, requestedAt: new Date().toISOString() }));
      if (process.platform === 'win32') {
        log('Restarting the TableWise service to restore… (the current data is backed up first)');
        const { execFileSync } = await import('node:child_process');
        try { execFileSync('net', ['stop', 'TableWise'], { stdio: 'inherit' }); } catch { /* not running */ }
        execFileSync('net', ['start', 'TableWise'], { stdio: 'inherit' });
        log('Done. Check logs\\TableWise.out.log if anything looks wrong.');
      } else {
        log(`Restore queued. Restart the server to apply it: ${file}`);
      }
      return;
    }
    case 'reset-password': {
      const [email, password] = args;
      if (!email || !password || password.length < 10) throw new Error('Usage: reset-password <email> <new-password (10+ chars)>');
      await withDatabase(async () => {
        const { db, pool } = createDb(pgsql.url, 1);
        try {
          const updated = await db.update(users)
            .set({ passwordHash: await hashPassword(password), failedLoginCount: 0, lockedUntil: null, isActive: true })
            .where(sql`lower(${users.email}) = ${email.toLowerCase()}`).returning({ id: users.id });
          if (!updated.length) throw new Error(`No user with email ${email}`);
        } finally {
          await pool.end();
        }
      });
      log(`Password reset for ${email}.`);
      return;
    }
    default:
      console.log('Commands: run | info | backup | restore <file> | reset-password <email> <password>');
      process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(`[${new Date().toISOString()}] Fatal: ${(e as Error).stack ?? e}`);
  process.exit(1);
});
