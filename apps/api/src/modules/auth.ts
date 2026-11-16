import crypto from 'node:crypto';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  changePasswordSchema, loginSchema, registerOrgSchema, ROLE_PERMISSIONS,
} from '@tablewise/shared';
import { organizations, outlets, refreshTokens, userOutlets, users } from '../db/schema.js';
import { AppError, conflict, forbidden, unauthorized } from '../lib/errors.js';
import { parse } from '../lib/validate.js';
import { dummyVerify, hashPassword, verifyPassword } from '../lib/password.js';
import { audit } from '../lib/audit.js';

const REFRESH_COOKIE = 'tw_refresh';
const MAX_FAILED_LOGINS = 5;
const LOCKOUT_MINUTES = 15;
const REUSE_GRACE_MS = 10_000;

const sha256 = (v: string) => crypto.createHash('sha256').update(v).digest('hex');

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 60) || 'org';
}

export default async function authRoutes(app: FastifyInstance) {
  const cookiePath = '/api/v1/auth';

  async function issueTokens(
    req: FastifyRequest, reply: FastifyReply,
    user: { id: string; organizationId: string; role: (typeof users.$inferSelect)['role'] },
    familyId: string = crypto.randomUUID(),
  ) {
    const accessToken = app.jwt.sign({ sub: user.id, org: user.organizationId, role: user.role });
    const raw = crypto.randomBytes(48).toString('base64url');
    const expiresAt = new Date(Date.now() + app.config.REFRESH_TOKEN_TTL_DAYS * 86_400_000);
    const [row] = await app.db.insert(refreshTokens).values({
      userId: user.id,
      tokenHash: sha256(raw),
      familyId,
      expiresAt,
      userAgent: req.headers['user-agent']?.slice(0, 300) ?? null,
      ip: req.ip,
    }).returning({ id: refreshTokens.id });
    reply.setCookie(REFRESH_COOKIE, raw, {
      httpOnly: true,
      secure: app.config.COOKIE_SECURE,
      sameSite: 'strict',
      path: cookiePath,
      expires: expiresAt,
    });
    return { accessToken, refreshTokenId: row!.id };
  }

  async function profile(userId: string) {
    const [u] = await app.db.select().from(users).where(eq(users.id, userId));
    if (!u) throw unauthorized();
    const [org] = await app.db.select().from(organizations).where(eq(organizations.id, u.organizationId));
    const outletRows = u.role === 'OWNER'
      ? await app.db.select().from(outlets).where(eq(outlets.organizationId, u.organizationId)).orderBy(outlets.createdAt)
      : await app.db
          .select({ outlet: outlets })
          .from(userOutlets)
          .innerJoin(outlets, eq(outlets.id, userOutlets.outletId))
          .where(eq(userOutlets.userId, u.id))
          .orderBy(outlets.createdAt)
          .then((r) => r.map((x) => x.outlet));
    return {
      user: { id: u.id, name: u.name, email: u.email, role: u.role },
      organization: org ? { id: org.id, name: org.name, slug: org.slug } : null,
      outlets: outletRows.filter((o) => o.isActive).map((o) => ({
        id: o.id, name: o.name, currency: o.currency, timezone: o.timezone,
        taxRateBps: o.taxRateBps, serviceChargeBps: o.serviceChargeBps,
        legalName: o.legalName, address: o.address, phone: o.phone, gstin: o.gstin,
        fssaiNumber: o.fssaiNumber, upiVpa: o.upiVpa, receiptFooter: o.receiptFooter, roundOff: o.roundOff,
      })),
      permissions: ROLE_PERMISSIONS[u.role],
    };
  }

  app.post('/register', { config: { rateLimit: { max: 5, timeWindow: '1 hour' } } }, async (req, reply) => {
    // First-run setup is always allowed on an empty installation; afterwards only if signup is enabled.
    const [{ n } = { n: 0 }] = await app.db.select({ n: sql<number>`count(*)::int` }).from(organizations);
    if (n > 0 && !app.config.ALLOW_SIGNUP) {
      throw forbidden(app.config.DEPLOYMENT_MODE === 'onprem' ? 'setup.alreadyDone' : 'auth.signupDisabled');
    }
    const input = parse(registerOrgSchema, req.body);
    const existing = await app.db.select({ id: users.id }).from(users)
      .where(sql`lower(${users.email}) = ${input.email}`);
    if (existing.length) throw conflict('auth.emailExists');

    const passwordHash = await hashPassword(input.password);
    const user = await app.db.transaction(async (tx) => {
      const slug = `${slugify(input.organizationName)}-${crypto.randomBytes(3).toString('hex')}`;
      const [org] = await tx.insert(organizations).values({ name: input.organizationName, slug }).returning();
      const [outlet] = await tx.insert(outlets).values({
        organizationId: org!.id, name: input.outletName, currency: input.currency, timezone: input.timezone,
      }).returning();
      const [u] = await tx.insert(users).values({
        organizationId: org!.id, email: input.email, name: input.ownerName, passwordHash, role: 'OWNER',
      }).returning();
      await tx.insert(userOutlets).values({ userId: u!.id, outletId: outlet!.id });
      return u!;
    });
    const { accessToken } = await issueTokens(req, reply, user);
    reply.code(201);
    return { accessToken, ...(await profile(user.id)) };
  });

  app.post('/login', { config: { rateLimit: { max: 20, timeWindow: '15 minutes' } } }, async (req, reply) => {
    const input = parse(loginSchema, req.body);
    const [user] = await app.db.select().from(users).where(sql`lower(${users.email}) = ${input.email}`);
    if (!user) {
      await dummyVerify(input.password);
      throw unauthorized('auth.invalidCredentials');
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new AppError(423, 'ACCOUNT_LOCKED', 'auth.locked');
    }
    const ok = await verifyPassword(input.password, user.passwordHash);
    if (!ok) {
      const failed = user.failedLoginCount + 1;
      await app.db.update(users).set({
        failedLoginCount: failed >= MAX_FAILED_LOGINS ? 0 : failed,
        lockedUntil: failed >= MAX_FAILED_LOGINS ? new Date(Date.now() + LOCKOUT_MINUTES * 60_000) : null,
      }).where(eq(users.id, user.id));
      throw unauthorized('auth.invalidCredentials');
    }
    if (!user.isActive) throw unauthorized('auth.disabled');
    await app.db.update(users)
      .set({ failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() })
      .where(eq(users.id, user.id));
    const { accessToken } = await issueTokens(req, reply, user);
    req.user = { sub: user.id, org: user.organizationId, role: user.role };
    await audit(app.db, req, { action: 'auth.login', entityType: 'user', entityId: user.id });
    return { accessToken, ...(await profile(user.id)) };
  });

  /** Refresh-token rotation with reuse detection: replaying a rotated token revokes the whole family. */
  app.post('/refresh', { config: { rateLimit: { max: 60, timeWindow: '15 minutes' } } }, async (req, reply) => {
    const raw = req.cookies[REFRESH_COOKIE];
    if (!raw) throw unauthorized('auth.noRefresh');
    const [token] = await app.db.select().from(refreshTokens).where(eq(refreshTokens.tokenHash, sha256(raw)));
    if (!token) throw unauthorized('auth.refreshInvalid');
    if (token.revokedAt) {
      // Two tabs refreshing at the same moment is benign: don't treat a token
      // rotated within the last few seconds as theft.
      if (token.replacedById && Date.now() - token.revokedAt.getTime() < REUSE_GRACE_MS) {
        throw unauthorized('auth.refreshRotated');
      }
      await app.db.update(refreshTokens).set({ revokedAt: new Date() })
        .where(and(eq(refreshTokens.familyId, token.familyId), isNull(refreshTokens.revokedAt)));
      reply.clearCookie(REFRESH_COOKIE, { path: cookiePath });
      throw unauthorized('auth.refreshReuse');
    }
    if (token.expiresAt < new Date()) throw unauthorized('auth.refreshInvalid');
    const [user] = await app.db.select().from(users).where(eq(users.id, token.userId));
    if (!user || !user.isActive) throw unauthorized('auth.disabled');

    // Atomically claim the token so two concurrent refreshes can't both succeed.
    const claimed = await app.db.update(refreshTokens).set({ revokedAt: new Date() })
      .where(and(eq(refreshTokens.id, token.id), isNull(refreshTokens.revokedAt)))
      .returning({ id: refreshTokens.id });
    if (!claimed.length) throw unauthorized('auth.refreshRotated');

    const { accessToken, refreshTokenId } = await issueTokens(req, reply, user, token.familyId);
    await app.db.update(refreshTokens).set({ replacedById: refreshTokenId }).where(eq(refreshTokens.id, token.id));
    return { accessToken, ...(await profile(user.id)) };
  });

  app.post('/logout', async (req, reply) => {
    const raw = req.cookies[REFRESH_COOKIE];
    if (raw) {
      await app.db.update(refreshTokens).set({ revokedAt: new Date() })
        .where(and(eq(refreshTokens.tokenHash, sha256(raw)), isNull(refreshTokens.revokedAt)));
    }
    reply.clearCookie(REFRESH_COOKIE, { path: cookiePath });
    return { ok: true };
  });

  app.get('/me', { preHandler: [app.authenticate] }, async (req) => profile(req.user.sub));

  app.post('/change-password', { preHandler: [app.authenticate] }, async (req) => {
    const input = parse(changePasswordSchema, req.body);
    const [user] = await app.db.select().from(users).where(eq(users.id, req.user.sub));
    if (!user || !(await verifyPassword(input.currentPassword, user.passwordHash))) {
      throw new AppError(400, 'INVALID_PASSWORD', 'auth.wrongPassword');
    }
    await app.db.transaction(async (tx) => {
      await tx.update(users).set({ passwordHash: await hashPassword(input.newPassword) }).where(eq(users.id, user.id));
      // Sign out every other session.
      await tx.update(refreshTokens).set({ revokedAt: new Date() })
        .where(and(eq(refreshTokens.userId, user.id), isNull(refreshTokens.revokedAt), gt(refreshTokens.expiresAt, new Date())));
      await audit(tx, req, { action: 'auth.password_changed', entityType: 'user', entityId: user.id });
    });
    return { ok: true };
  });
}
