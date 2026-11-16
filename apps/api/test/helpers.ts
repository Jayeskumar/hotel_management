import crypto from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createDb } from '../src/db/client.js';

process.env.NODE_ENV = 'test';
const TEST_DB = process.env.TEST_DATABASE_URL ?? 'postgres://tablewise:tablewise@localhost:5432/tablewise_test';

export async function makeApp(extraEnv: Record<string, string> = {}) {
  const config = loadConfig({
    NODE_ENV: 'test', DATABASE_URL: TEST_DB, JWT_SECRET: 'test-secret-test-secret-test-secret-123', LOG_LEVEL: 'silent',
    ...extraEnv,
  });
  const { db, pool } = createDb(TEST_DB, 5);
  const app = await buildApp({ config, db, logger: false });
  await app.ready();
  return { app, db, close: async () => { await app.close(); await pool.end(); } };
}

export const uid = () => crypto.randomBytes(4).toString('hex');

export class Client {
  token = '';
  cookie = '';
  constructor(private app: FastifyInstance) {}

  async req<T = any>(method: string, url: string, body?: unknown): Promise<{ status: number; body: T; headers: Record<string, unknown> }> {
    const res = await this.app.inject({
      method: method as any,
      url,
      payload: body as any,
      headers: {
        ...(this.token ? { authorization: `Bearer ${this.token}` } : {}),
        ...(this.cookie ? { cookie: this.cookie } : {}),
      },
    });
    const setCookie = res.headers['set-cookie'];
    const c = Array.isArray(setCookie) ? setCookie[0] : setCookie;
    if (c && c.startsWith('tw_refresh=')) this.cookie = c.split(';')[0]!;
    let parsed: any = res.body;
    try { parsed = res.json(); } catch { /* not json */ }
    return { status: res.statusCode, body: parsed, headers: res.headers };
  }
  get = <T = any>(u: string) => this.req<T>('GET', u);
  post = <T = any>(u: string, b?: unknown) => this.req<T>('POST', u, b ?? {});
  put = <T = any>(u: string, b?: unknown) => this.req<T>('PUT', u, b);
  patch = <T = any>(u: string, b?: unknown) => this.req<T>('PATCH', u, b);
  del = <T = any>(u: string) => this.req<T>('DELETE', u);
}

/** Registers a fresh org and returns an owner client plus its outlet id. */
export async function registerOrg(app: FastifyInstance) {
  const c = new Client(app);
  const email = `owner-${uid()}@test.local`;
  const res = await c.post('/api/v1/auth/register', {
    organizationName: `Org ${uid()}`, outletName: 'Main', ownerName: 'Owner', email, password: 'Sup3rSecret!',
  });
  if (res.status !== 201) throw new Error(`register failed: ${JSON.stringify(res.body)}`);
  c.token = res.body.accessToken;
  return { owner: c, outletId: res.body.outlets[0].id as string, email };
}

export async function addStaff(app: FastifyInstance, owner: Client, outletId: string, role: string) {
  const email = `${role.toLowerCase()}-${uid()}@test.local`;
  const res = await owner.post('/api/v1/staff', { name: role, email, password: 'Sup3rSecret1', role, outletIds: [outletId] });
  if (res.status !== 201) throw new Error(`staff failed: ${JSON.stringify(res.body)}`);
  const c = new Client(app);
  const login = await c.post('/api/v1/auth/login', { email, password: 'Sup3rSecret1' });
  c.token = login.body.accessToken;
  return { client: c, id: res.body.id as string, email };
}

/** Creates an area, two tables, a category and a few menu items. */
export async function setupOutlet(owner: Client, outletId: string) {
  const base = `/api/v1/outlets/${outletId}`;
  await owner.put(`/api/v1/outlets/${outletId}`, {
    name: 'Main', currency: 'INR', timezone: 'Asia/Kolkata', taxRateBps: 500, serviceChargeBps: 1000, roundOff: true,
    gstin: '33AABCT1234F1Z5', upiVpa: 'test.shop@okaxis',
  });
  const area = (await owner.post(`${base}/areas`, { name: 'Hall' })).body;
  const t1 = (await owner.post(`${base}/tables`, { areaId: area.id, label: 'T1', seats: 4 })).body;
  const t2 = (await owner.post(`${base}/tables`, { areaId: area.id, label: 'T2', seats: 2 })).body;
  const cat = (await owner.post(`${base}/menu/categories`, { name: 'Mains' })).body;
  // ₹100 dosa with a ₹20 ghee add-on, and ₹35 filter coffee.
  const burger = (await owner.post(`${base}/menu/items`, {
    categoryId: cat.id, name: 'Masala Dosa', nameTa: 'மசாலா தோசை', priceCents: 10000, station: 'TIFFIN',
    modifiers: [{ name: 'Ghee', nameTa: 'நெய்', priceCents: 2000 }],
  })).body;
  const soda = (await owner.post(`${base}/menu/items`, { categoryId: cat.id, name: 'Filter Coffee', nameTa: 'ஃபில்டர் காபி', priceCents: 3500, station: 'BEVERAGE' })).body;
  return { base, area, t1, t2, cat, burger, soda };
}
