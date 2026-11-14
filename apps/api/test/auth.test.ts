import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client, addStaff, makeApp, registerOrg } from './helpers.js';

let ctx: Awaited<ReturnType<typeof makeApp>>;
beforeAll(async () => { ctx = await makeApp(); });
afterAll(async () => { await ctx.close(); });

describe('auth', () => {
  it('registers an org and returns profile + permissions', async () => {
    const { owner } = await registerOrg(ctx.app);
    const me = await owner.get('/api/v1/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.user.role).toBe('OWNER');
    expect(me.body.outlets).toHaveLength(1);
    expect(me.body.permissions).toContain('outlet:manage');
  });

  it('rejects weak passwords and duplicate emails', async () => {
    const c = new Client(ctx.app);
    const weak = await c.post('/api/v1/auth/register', {
      organizationName: 'X', outletName: 'Y', ownerName: 'Z', email: 'weak@test.local', password: 'short',
    });
    expect(weak.status).toBe(422);
    const { email } = await registerOrg(ctx.app);
    const dup = await c.post('/api/v1/auth/register', {
      organizationName: 'X', outletName: 'Y', ownerName: 'Z', email: email.toUpperCase(), password: 'Sup3rSecret!',
    });
    expect(dup.status).toBe(409);
  });

  it('requires a token for protected routes', async () => {
    const res = await new Client(ctx.app).get('/api/v1/auth/me');
    expect(res.status).toBe(401);
  });

  it('locks the account after repeated failures', async () => {
    const { email } = await registerOrg(ctx.app);
    const c = new Client(ctx.app);
    for (let i = 0; i < 5; i++) {
      expect((await c.post('/api/v1/auth/login', { email, password: 'wrong-password' })).status).toBe(401);
    }
    const locked = await c.post('/api/v1/auth/login', { email, password: 'Sup3rSecret!' });
    expect(locked.status).toBe(423);
  });

  it('rotates refresh tokens and detects reuse', async () => {
    const { email } = await registerOrg(ctx.app);
    const c = new Client(ctx.app);
    await c.post('/api/v1/auth/login', { email, password: 'Sup3rSecret!' });
    const first = c.cookie;
    const r1 = await c.post('/api/v1/auth/refresh');
    expect(r1.status).toBe(200);
    expect(r1.body.accessToken).toBeTruthy();
    const second = c.cookie;
    expect(second).not.toBe(first);

    // Replay the old token -> family revoked
    c.cookie = first;
    expect((await c.post('/api/v1/auth/refresh')).status).toBe(401);
    c.cookie = second;
    expect((await c.post('/api/v1/auth/refresh')).status).toBe(401);
  });

  it('deactivated staff lose access immediately', async () => {
    const { owner, outletId } = await registerOrg(ctx.app);
    const waiter = await addStaff(ctx.app, owner, outletId, 'WAITER');
    expect((await waiter.client.get('/api/v1/auth/me')).status).toBe(200);
    expect((await owner.patch(`/api/v1/staff/${waiter.id}`, { isActive: false })).status).toBe(200);
    expect((await waiter.client.get('/api/v1/auth/me')).status).toBe(401);
  });
});

describe('authorization & tenancy', () => {
  it('isolates organizations', async () => {
    const a = await registerOrg(ctx.app);
    const b = await registerOrg(ctx.app);
    const res = await b.owner.get(`/api/v1/outlets/${a.outletId}/menu`);
    expect(res.status).toBe(404);
    const staff = await b.owner.get('/api/v1/staff');
    expect(staff.body.every((s: any) => s.email !== a.email)).toBe(true);
  });

  it('enforces role permissions', async () => {
    const { owner, outletId } = await registerOrg(ctx.app);
    const waiter = await addStaff(ctx.app, owner, outletId, 'WAITER');
    const res = await waiter.client.post(`/api/v1/outlets/${outletId}/menu/categories`, { name: 'Nope' });
    expect(res.status).toBe(403);
    expect((await waiter.client.get('/api/v1/staff')).status).toBe(403);
    expect((await waiter.client.get(`/api/v1/outlets/${outletId}/reports/sales`)).status).toBe(403);
  });

  it('prevents managers from creating owners', async () => {
    const { owner, outletId } = await registerOrg(ctx.app);
    const manager = await addStaff(ctx.app, owner, outletId, 'MANAGER');
    const res = await manager.client.post('/api/v1/staff', {
      name: 'Evil', email: 'evil@test.local', password: 'Sup3rSecret1', role: 'OWNER', outletIds: [outletId],
    });
    expect(res.status).toBe(403);
  });

  it('blocks staff from outlets they are not assigned to', async () => {
    const { owner, outletId } = await registerOrg(ctx.app);
    const second = await owner.post('/api/v1/outlets', {
      name: 'Second', currency: 'USD', timezone: 'UTC', taxRateBps: 0, serviceChargeBps: 0,
    });
    expect(second.status).toBe(201);
    const waiter = await addStaff(ctx.app, owner, outletId, 'WAITER');
    expect((await waiter.client.get(`/api/v1/outlets/${second.body.id}/menu`)).status).toBe(403);
  });
});
