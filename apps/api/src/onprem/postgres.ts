import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import pg from 'pg';
import type { Paths } from './paths.js';
import type { OnpremSettings } from './settings.js';

const run = promisify(execFile);

/**
 * Manages the private PostgreSQL cluster that ships with the on-prem install.
 * It listens on 127.0.0.1 only; the web/API server is the only thing exposed on the LAN.
 * pg_ctl is always used to start the server because, on Windows, it drops administrator
 * rights (PostgreSQL refuses to run as an administrator, e.g. under LocalSystem).
 */
export class EmbeddedPostgres {
  constructor(private paths: Paths, private s: OnpremSettings, private log: (m: string) => void = console.log) {}

  get url() {
    return `postgres://${this.s.dbUser}:${encodeURIComponent(this.s.dbPassword)}@127.0.0.1:${this.s.pgPort}/${this.s.dbName}`;
  }

  private env() {
    return { ...process.env, PGPASSWORD: this.s.dbPassword };
  }

  private async exec(name: string, args: string[], timeout = 120_000) {
    return run(this.paths.exe(name), args, { env: this.env(), windowsHide: true, timeout, maxBuffer: 16 * 1024 * 1024 });
  }

  isInitialised() {
    return fs.existsSync(path.join(this.paths.pgData, 'PG_VERSION'));
  }

  async init() {
    if (this.isInitialised()) return;
    this.log('Creating database cluster (first run)…');
    fs.mkdirSync(this.paths.dataDir, { recursive: true });
    const pwFile = path.join(this.paths.dataDir, `.pw-${process.pid}`);
    fs.writeFileSync(pwFile, this.s.dbPassword, { mode: 0o600 });
    try {
      await this.exec('initdb', [
        '-D', this.paths.pgData, '-U', this.s.dbUser, `--pwfile=${pwFile}`,
        '-E', 'UTF8', '--no-locale', '-A', 'scram-sha-256',
      ]);
    } finally {
      fs.rmSync(pwFile, { force: true });
    }
    fs.appendFileSync(path.join(this.paths.pgData, 'postgresql.conf'), [
      '', '# --- TableWise on-prem ---',
      "listen_addresses = '127.0.0.1'",
      `port = ${this.s.pgPort}`,
      'max_connections = 60',
      "timezone = 'UTC'",
      '',
    ].join('\n'));
  }

  async isRunning() {
    try {
      await this.exec('pg_ctl', ['status', '-D', this.paths.pgData], 15_000);
      return true;
    } catch {
      return false;
    }
  }

  /** Starts the cluster if needed. Returns true if this call started it. */
  async start(): Promise<boolean> {
    await this.init();
    if (await this.isRunning()) return false;
    fs.mkdirSync(this.paths.logsDir, { recursive: true });
    this.log('Starting database…');
    await this.exec('pg_ctl', [
      'start', '-D', this.paths.pgData, '-w', '-t', '90',
      '-l', path.join(this.paths.logsDir, 'postgresql.log'), '-o', `-p ${this.s.pgPort}`,
    ]);
    return true;
  }

  async stop() {
    if (!(await this.isRunning())) return;
    this.log('Stopping database…');
    await this.exec('pg_ctl', ['stop', '-D', this.paths.pgData, '-m', 'fast', '-w', '-t', '60']);
  }

  private async admin<T>(fn: (c: pg.Client) => Promise<T>): Promise<T> {
    const c = new pg.Client({ host: '127.0.0.1', port: this.s.pgPort, user: this.s.dbUser, password: this.s.dbPassword, database: 'postgres' });
    await c.connect();
    try { return await fn(c); } finally { await c.end(); }
  }

  async ensureDatabase() {
    await this.admin(async (c) => {
      const r = await c.query('select 1 from pg_database where datname = $1', [this.s.dbName]);
      if (!r.rowCount) await c.query(`create database "${this.s.dbName}" encoding 'UTF8'`);
    });
  }

  /** Custom-format dump (compressed, restorable with pg_restore). */
  async dump(file: string) {
    await this.exec('pg_dump', ['-h', '127.0.0.1', '-p', String(this.s.pgPort), '-U', this.s.dbUser, '-Fc', '-f', file, this.s.dbName], 30 * 60_000);
  }

  /** Replaces the database with the contents of a dump. The web server must be stopped. */
  async restore(file: string) {
    await this.admin(async (c) => {
      await c.query(`drop database if exists "${this.s.dbName}" with (force)`);
      await c.query(`create database "${this.s.dbName}" encoding 'UTF8'`);
    });
    await this.exec('pg_restore', ['-h', '127.0.0.1', '-p', String(this.s.pgPort), '-U', this.s.dbUser, '--no-owner', '-d', this.s.dbName, file], 60 * 60_000);
  }
}
