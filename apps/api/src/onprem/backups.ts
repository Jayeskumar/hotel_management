import fs from 'node:fs';
import path from 'node:path';
import type { BackupInfo } from '../lib/system.js';
import type { Paths } from './paths.js';
import type { EmbeddedPostgres } from './postgres.js';
import type { OnpremSettings } from './settings.js';

const PATTERN = /^tablewise-(\d{8})-(\d{6})(-[a-z-]+)?\.dump$/;
const pad = (n: number) => String(n).padStart(2, '0');
const stamp = (d: Date) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;

/** Nightly + on-demand backups with retention, stored in <data>\backups. */
export class Backups {
  private running: Promise<BackupInfo> | null = null;

  constructor(private paths: Paths, private s: OnpremSettings, private db: EmbeddedPostgres, private log: (m: string) => void = console.log) {}

  async list(): Promise<BackupInfo[]> {
    if (!fs.existsSync(this.paths.backupsDir)) return [];
    return fs.readdirSync(this.paths.backupsDir)
      .filter((f) => PATTERN.test(f))
      .map((f) => {
        const st = fs.statSync(path.join(this.paths.backupsDir, f));
        return { file: f, sizeBytes: st.size, createdAt: st.mtime.toISOString() };
      })
      .sort((a, b) => b.file.localeCompare(a.file));
  }

  /** Creates a backup; concurrent callers share one run. */
  create(tag?: string): Promise<BackupInfo> {
    this.running ??= this.doCreate(tag).finally(() => { this.running = null; });
    return this.running;
  }

  private async doCreate(tag?: string): Promise<BackupInfo> {
    fs.mkdirSync(this.paths.backupsDir, { recursive: true });
    const name = `tablewise-${stamp(new Date())}${tag ? `-${tag}` : ''}.dump`;
    const final = path.join(this.paths.backupsDir, name);
    const partial = `${final}.partial`;
    await this.db.dump(partial);
    fs.renameSync(partial, final);
    this.log(`Backup written: ${final}`);
    await this.prune();
    const st = fs.statSync(final);
    return { file: name, sizeBytes: st.size, createdAt: st.mtime.toISOString() };
  }

  private async prune() {
    const all = await this.list();
    for (const old of all.slice(this.s.backupKeep)) fs.rmSync(path.join(this.paths.backupsDir, old.file), { force: true });
  }

  /** Checks every few minutes and takes one backup per day at the configured hour. */
  schedule(): NodeJS.Timeout {
    const tick = async () => {
      const now = new Date();
      if (now.getHours() !== this.s.backupHour) return;
      const today = stamp(now).slice(0, 8);
      if ((await this.list()).some((b) => b.file.startsWith(`tablewise-${today}`) && b.file.includes('-nightly'))) return;
      await this.create('nightly').catch((e) => this.log(`Nightly backup failed: ${(e as Error).message}`));
    };
    const t = setInterval(() => void tick(), 5 * 60_000);
    t.unref();
    void tick();
    return t;
  }
}
