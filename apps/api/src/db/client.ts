import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.js';

export type DB = NodePgDatabase<typeof schema>;
/** A transaction handle has the same query surface as the root db. */
export type Tx = Parameters<Parameters<DB['transaction']>[0]>[0];
export type Executor = DB | Tx;

export function createDb(url: string, max = 20): { db: DB; pool: pg.Pool } {
  const pool = new pg.Pool({ connectionString: url, max });
  // An idle connection can be dropped by the server (restart, failover, admin action). pg emits
  // that on the pool; without a listener Node treats it as fatal and the whole API would exit.
  // The broken client is discarded and the next query opens a fresh connection.
  pool.on('error', (err) => {
    console.error(`[db] idle connection lost: ${err.message}`);
  });
  const db = drizzle(pool, { schema });
  return { db, pool };
}
