import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Paths } from './paths.js';

/** Per-install settings, generated on first run. Secrets never ship inside the installer. */
export interface OnpremSettings {
  port: number;
  pgPort: number;
  dbName: string;
  dbUser: string;
  dbPassword: string;
  jwtSecret: string;
  /** Local hour (0-23) for the nightly backup. */
  backupHour: number;
  /** Number of backups to keep. */
  backupKeep: number;
  logLevel: 'info' | 'warn' | 'debug';
  /** App version that last ran against this data (used to take a backup before upgrades). */
  lastVersion?: string;
}

const secret = (bytes: number) => crypto.randomBytes(bytes).toString('base64url');

export function loadSettings(paths: Paths): OnpremSettings {
  fs.mkdirSync(paths.dataDir, { recursive: true });
  const defaults: OnpremSettings = {
    port: 8080, pgPort: 54329, dbName: 'tablewise', dbUser: 'tablewise',
    dbPassword: secret(24), jwtSecret: secret(48), backupHour: 23, backupKeep: 14, logLevel: 'info',
  };
  let current: Partial<OnpremSettings> = {};
  if (fs.existsSync(paths.configFile)) {
    current = JSON.parse(fs.readFileSync(paths.configFile, 'utf8')) as Partial<OnpremSettings>;
  }
  const merged = { ...defaults, ...current };
  if (JSON.stringify(merged) !== JSON.stringify(current)) saveSettings(paths, merged);
  return merged;
}

export function saveSettings(paths: Paths, s: OnpremSettings) {
  const tmp = path.join(paths.dataDir, 'config.json.tmp');
  fs.writeFileSync(tmp, JSON.stringify(s, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, paths.configFile);
}
