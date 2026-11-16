import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { invalidateLicenseCache, signLicense, type LicensePayload } from '../src/lib/license.js';
import { Client, makeApp, setupOutlet } from './helpers.js';

const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
const PUB = publicKey.export({ type: 'spki', format: 'pem' }).toString();
const PRIV = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const webDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-web-'));
fs.mkdirSync(path.join(webDir, 'assets'));
fs.writeFileSync(path.join(webDir, 'index.html'), '<!doctype html><div id="root">TableWise</div>');
fs.writeFileSync(path.join(webDir, 'assets', 'app-abc.js'), 'console.log(1)');

const license = (over: Partial<LicensePayload> = {}): string => signLicense({
  id: crypto.randomUUID(), customer: 'Thendral Foods', edition: 'standard', maxOutlets: 2,
  issuedAt: new Date().toISOString(), expiresAt: null, ...over,
}, PRIV);

let ctx: Awaited<ReturnType<typeof makeApp>>;
beforeAll(async () => {
  ctx = await makeApp({ DEPLOYMENT_MODE: 'onprem', LICENSE_PUBLIC_KEY: PUB, WEB_DIR: webDir, NODE_ENV: 'production' });
  // On-prem installs start empty; other test files create their own orgs afterwards.
  await ctx.db.execute(sql`truncate organizations, system_settings cascade`);
  invalidateLicenseCache();
});
afterAll(async () => { await ctx.close(); fs.rmSync(webDir, { recursive: true, force: true }); });

describe('on-prem installation', () => {
  let owner: Client;
  let base = '';
  let w: Awaited<ReturnType<typeof setupOutlet>>;

  it('reports first-run setup and a fresh 30-day trial', async () => {
    const info = await new Client(ctx.app).get('/api/v1/system/info');
    expect(info.body).toMatchObject({ mode: 'onprem', setupRequired: true, signupAllowed: false });
    expect(info.body.license).toMatchObject({ state: 'trial', canOperate: true, daysLeft: 30 });
  });

  it('allows exactly one organisation to be created by the setup wizard', async () => {
    owner = new Client(ctx.app);
    const res = await owner.post('/api/v1/auth/register', {
      organizationName: 'Thendral Foods', outletName: 'T. Nagar', ownerName: 'Senthil', email: 'owner@onprem.local', password: 'Sup3rSecret!',
    });
    expect(res.status).toBe(201);
    // LAN installs run over plain HTTP, so the refresh cookie must not be Secure.
    expect(String(res.headers['set-cookie'])).not.toContain('Secure');
    owner.token = res.body.accessToken;
    base = `/api/v1/outlets/${res.body.outlets[0].id}`;
    w = await setupOutlet(owner, res.body.outlets[0].id);

    const again = await new Client(ctx.app).post('/api/v1/auth/register', {
      organizationName: 'Other', outletName: 'X', ownerName: 'Y', email: 'x@onprem.local', password: 'Sup3rSecret!',
    });
    expect(again.status).toBe(403);
    expect(again.body.error.key).toBe('setup.alreadyDone');
    expect((await new Client(ctx.app).get('/api/v1/system/info')).body.setupRequired).toBe(false);
  });

  it('limits the trial to one branch', async () => {
    const res = await owner.post('/api/v1/outlets', { name: 'Madurai', currency: 'INR', timezone: 'Asia/Kolkata', taxRateBps: 500, serviceChargeBps: 0 });
    expect(res.status).toBe(403);
    expect(res.body.error.key).toBe('license.outletLimit');
  });

  it('pauses new orders when the trial ends but lets open bills be settled', async () => {
    const open = (await owner.post(`${base}/orders`, { type: 'TAKEAWAY', items: [{ menuItemId: w.soda.id, quantity: 1 }] })).body;
    await owner.post(`${base}/orders/${open.id}/fire`);

    await ctx.db.execute(sql`update system_settings set value = jsonb_build_object('installedAt', (now() - interval '31 days')::text) where key = 'install'`);
    invalidateLicenseCache();

    const info = await new Client(ctx.app).get('/api/v1/system/info');
    expect(info.body.license).toMatchObject({ state: 'trial_expired', canOperate: false });
    const blocked = await owner.post(`${base}/orders`, { type: 'TAKEAWAY' });
    expect(blocked.status).toBe(402);
    expect(blocked.body.error.key).toBe('license.expired');

    const paid = await owner.post(`${base}/orders/${open.id}/payments`, { method: 'CASH', amountCents: open.totalCents });
    expect(paid.body.status).toBe('COMPLETED');
  });

  it('rejects forged licences and activates a valid one', async () => {
    const forged = signLicense({
      id: 'x', customer: 'Pirate', edition: 'enterprise', maxOutlets: 99, issuedAt: new Date().toISOString(), expiresAt: null,
    }, crypto.generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'pem' }).toString());
    const bad = await owner.post('/api/v1/system/license', { key: forged });
    expect(bad.status).toBe(400);
    expect(bad.body.error.key).toBe('license.invalid');

    const ok = await owner.post('/api/v1/system/license', { key: license() });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ state: 'licensed', canOperate: true, maxOutlets: 2, daysLeft: null });
    expect((await owner.post(`${base}/orders`, { type: 'TAKEAWAY' })).status).toBe(201);
    expect((await owner.post('/api/v1/outlets', { name: 'Madurai', currency: 'INR', timezone: 'Asia/Kolkata', taxRateBps: 500, serviceChargeBps: 0 })).status).toBe(201);
    expect((await owner.post('/api/v1/outlets', { name: 'Coimbatore', currency: 'INR', timezone: 'Asia/Kolkata', taxRateBps: 500, serviceChargeBps: 0 })).status).toBe(403);
  });

  it('treats an expired licence as expired', async () => {
    await owner.post('/api/v1/system/license', { key: license({ expiresAt: new Date(Date.now() - 86_400_000).toISOString() }) });
    const details = await owner.get('/api/v1/system/details');
    expect(details.body.license.state).toBe('expired');
    expect(details.body.backupsAvailable).toBe(false);
    expect((await owner.post(`${base}/orders`, { type: 'TAKEAWAY' })).status).toBe(402);
    await owner.post('/api/v1/system/license', { key: license() });
  });

  it('serves the web app for client-side routes and JSON for the API', async () => {
    const page = await ctx.app.inject({ method: 'GET', url: '/orders/123' });
    expect(page.statusCode).toBe(200);
    expect(page.body).toContain('TableWise');
    const asset = await ctx.app.inject({ method: 'GET', url: '/assets/app-abc.js' });
    expect(asset.statusCode).toBe(200);
    expect(asset.headers['cache-control']).toContain('immutable');
    const api = await ctx.app.inject({ method: 'GET', url: '/api/v1/nope' });
    expect(api.statusCode).toBe(404);
    expect(api.json().error.code).toBe('NOT_FOUND');
  });
});
