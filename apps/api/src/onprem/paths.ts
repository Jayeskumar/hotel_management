import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const isWin = process.platform === 'win32';

/**
 * Install layout (Windows):
 *   C:\Program Files\TableWise\        app\server.mjs, app\web\, app\drizzle\, node\node.exe, pgsql\bin\, service\
 *   C:\ProgramData\TableWise\          config.json, pgdata\, backups\, logs\   (kept across upgrades)
 */
export function resolvePaths() {
  const appDir = process.env.TABLEWISE_APP_DIR ?? path.dirname(fileURLToPath(import.meta.url));
  const installDir = path.resolve(appDir, '..');
  const dataDir = process.env.TABLEWISE_DATA
    ?? (isWin ? path.join(process.env.ProgramData ?? 'C:\\ProgramData', 'TableWise') : path.join(os.homedir(), '.tablewise'));
  const pgBin = process.env.PG_BIN ?? path.join(installDir, 'pgsql', 'bin');
  return {
    appDir,
    installDir,
    dataDir,
    pgBin,
    pgData: path.join(dataDir, 'pgdata'),
    backupsDir: path.join(dataDir, 'backups'),
    logsDir: path.join(dataDir, 'logs'),
    configFile: path.join(dataDir, 'config.json'),
    webDir: process.env.TABLEWISE_WEB_DIR ?? path.join(appDir, 'web'),
    migrationsDir: process.env.MIGRATIONS_DIR ?? path.join(appDir, 'drizzle'),
    exe: (name: string) => path.join(pgBin, isWin ? `${name}.exe` : name),
  };
}

export type Paths = ReturnType<typeof resolvePaths>;
