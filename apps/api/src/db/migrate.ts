import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createDb } from './client.js';

/** Migrations ship next to the code; bundled builds point MIGRATIONS_DIR at their copy. */
export function migrationsFolder(): string {
  return process.env.MIGRATIONS_DIR
    ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../drizzle');
}

export async function runMigrations(url: string): Promise<void> {
  const { db, pool } = createDb(url, 1);
  try {
    await migrate(db, { migrationsFolder: migrationsFolder() });
  } finally {
    await pool.end();
  }
}
