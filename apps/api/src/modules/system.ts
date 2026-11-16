import os from 'node:os';
import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { organizations } from '../db/schema.js';
import { AppError, badRequest, forbidden } from '../lib/errors.js';
import { parse } from '../lib/validate.js';
import { audit } from '../lib/audit.js';
import { getLicenseStatus, installLicense } from '../lib/license.js';

/** Installation info, licensing and backups. Most of this only applies to on-prem installs. */
export default async function systemRoutes(app: FastifyInstance) {
  const onprem = app.config.DEPLOYMENT_MODE === 'onprem';

  async function setupRequired() {
    const [r] = await app.db.select({ n: sql<number>`count(*)::int` }).from(organizations);
    return (r?.n ?? 0) === 0;
  }

  function lanUrls(): string[] {
    const port = app.config.PORT;
    return Object.values(os.networkInterfaces()).flat()
      .filter((i): i is os.NetworkInterfaceInfo => !!i && i.family === 'IPv4' && !i.internal)
      .map((i) => `http://${i.address}:${port}`);
  }

  /** Public: lets the web app decide between sign-in and the first-run setup wizard. */
  app.get('/info', async () => {
    const license = await getLicenseStatus(app.db, app.config);
    return {
      mode: app.config.DEPLOYMENT_MODE,
      version: app.config.APP_VERSION,
      setupRequired: await setupRequired(),
      signupAllowed: app.config.ALLOW_SIGNUP,
      license: { state: license.state, canOperate: license.canOperate, daysLeft: license.daysLeft },
    };
  });

  app.get('/details', { preHandler: [app.authenticate, app.requirePermission('outlet:manage')] }, async () => {
    const license = await getLicenseStatus(app.db, app.config);
    return {
      mode: app.config.DEPLOYMENT_MODE,
      version: app.config.APP_VERSION,
      license,
      lanUrls: onprem ? lanUrls() : [],
      dataDir: onprem ? app.system.dataDir ?? null : null,
      backupsAvailable: !!app.system.backupNow,
      backups: app.system.listBackups ? await app.system.listBackups() : [],
    };
  });

  app.post('/license', { preHandler: [app.authenticate, app.requirePermission('outlet:manage')] }, async (req) => {
    if (!onprem) throw badRequest('license.onpremOnly');
    const { key } = parse(z.object({ key: z.string().min(20).max(5000) }), req.body);
    const payload = await installLicense(app.db, key, app.config.LICENSE_PUBLIC_KEY);
    if (!payload) throw new AppError(400, 'LICENSE_INVALID', 'license.invalid');
    await audit(app.db, req, {
      action: 'system.license_installed', entityType: 'system',
      metadata: { licenseId: payload.id, customer: payload.customer, edition: payload.edition, expiresAt: payload.expiresAt },
    });
    return getLicenseStatus(app.db, app.config);
  });

  app.post('/backups', {
    preHandler: [app.authenticate, app.requirePermission('outlet:manage')],
    config: { rateLimit: { max: 6, timeWindow: '1 hour' } },
  }, async (req, reply) => {
    if (!app.system.backupNow) throw forbidden('system.notAvailable');
    const backup = await app.system.backupNow();
    await audit(app.db, req, { action: 'system.backup_created', entityType: 'system', metadata: { file: backup.file } });
    reply.code(201);
    return backup;
  });
}
