import crypto from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import type { Config } from '../config.js';
import type { DB, Executor } from '../db/client.js';
import { outlets, systemSettings } from '../db/schema.js';
import { LICENSE_PUBLIC_KEY_PEM } from './license-public-key.js';

/**
 * Offline licences for on-prem installs. A licence is
 *   TW1.<base64url(JSON payload)>.<base64url(Ed25519 signature over "TW1.<payload>")>
 * signed with the vendor's private key (tools/license/issue.mjs) and verified here with
 * the embedded public key, so no internet connection is needed at the restaurant.
 */
export interface LicensePayload {
  id: string;
  customer: string;
  edition: 'standard' | 'enterprise';
  maxOutlets: number;
  issuedAt: string;
  /** ISO date; null = perpetual. */
  expiresAt: string | null;
}

export type LicenseState = 'cloud' | 'licensed' | 'trial' | 'trial_expired' | 'expired';

export interface LicenseStatus {
  state: LicenseState;
  /** Whether day-to-day operations (new orders) are allowed. */
  canOperate: boolean;
  daysLeft: number | null;
  license: LicensePayload | null;
  trialEndsAt: string | null;
  maxOutlets: number | null;
}

export const TRIAL_DAYS = 30;
const TRIAL_MAX_OUTLETS = 1;
const PREFIX = 'TW1.';

export function verifyLicense(key: string, publicKeyPem: string = LICENSE_PUBLIC_KEY_PEM):
  { ok: true; payload: LicensePayload } | { ok: false } {
  try {
    const trimmed = key.trim().replace(/\s+/g, '');
    if (!trimmed.startsWith(PREFIX)) return { ok: false };
    const [payloadB64, sigB64] = trimmed.slice(PREFIX.length).split('.');
    if (!payloadB64 || !sigB64) return { ok: false };
    const valid = crypto.verify(null, Buffer.from(PREFIX + payloadB64), publicKeyPem, Buffer.from(sigB64, 'base64url'));
    if (!valid) return { ok: false };
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as LicensePayload;
    if (!payload.id || !payload.customer || !Number.isInteger(payload.maxOutlets)) return { ok: false };
    return { ok: true, payload };
  } catch {
    return { ok: false };
  }
}

/** Sign a licence (vendor side; also used by tests). */
export function signLicense(payload: LicensePayload, privateKeyPem: string): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.sign(null, Buffer.from(PREFIX + body), privateKeyPem).toString('base64url');
  return `${PREFIX}${body}.${sig}`;
}

async function getSetting<T>(db: Executor, key: string): Promise<T | null> {
  const [row] = await db.select().from(systemSettings).where(eq(systemSettings.key, key));
  return (row?.value as T) ?? null;
}

async function setSetting(db: Executor, key: string, value: unknown) {
  await db.insert(systemSettings).values({ key, value })
    .onConflictDoUpdate({ target: systemSettings.key, set: { value, updatedAt: new Date() } });
}

const DAY = 86_400_000;
let cache: { at: number; status: LicenseStatus } | null = null;

export function invalidateLicenseCache() {
  cache = null;
}

export async function getLicenseStatus(db: DB, config: Config): Promise<LicenseStatus> {
  if (config.DEPLOYMENT_MODE === 'cloud') {
    return { state: 'cloud', canOperate: true, daysLeft: null, license: null, trialEndsAt: null, maxOutlets: null };
  }
  if (cache && Date.now() - cache.at < 60_000) return cache.status;

  // The trial clock starts the first time the server runs.
  let install = await getSetting<{ installedAt: string }>(db, 'install');
  if (!install) {
    install = { installedAt: new Date().toISOString() };
    await setSetting(db, 'install', install);
  }
  const key = await getSetting<string>(db, 'license');
  const verified = key ? verifyLicense(key, config.LICENSE_PUBLIC_KEY ?? LICENSE_PUBLIC_KEY_PEM) : null;

  let status: LicenseStatus;
  if (verified?.ok) {
    const p = verified.payload;
    const expires = p.expiresAt ? new Date(p.expiresAt).getTime() : null;
    const daysLeft = expires === null ? null : Math.ceil((expires - Date.now()) / DAY);
    const active = expires === null || expires > Date.now();
    status = { state: active ? 'licensed' : 'expired', canOperate: active, daysLeft, license: p, trialEndsAt: null, maxOutlets: p.maxOutlets };
  } else {
    const trialEnds = new Date(install.installedAt).getTime() + TRIAL_DAYS * DAY;
    const daysLeft = Math.ceil((trialEnds - Date.now()) / DAY);
    status = {
      state: daysLeft > 0 ? 'trial' : 'trial_expired', canOperate: daysLeft > 0,
      daysLeft: Math.max(0, daysLeft), license: null, trialEndsAt: new Date(trialEnds).toISOString(), maxOutlets: TRIAL_MAX_OUTLETS,
    };
  }
  cache = { at: Date.now(), status };
  return status;
}

export async function installLicense(db: DB, key: string, publicKeyPem?: string): Promise<LicensePayload | null> {
  const v = verifyLicense(key, publicKeyPem ?? LICENSE_PUBLIC_KEY_PEM);
  if (!v.ok) return null;
  await setSetting(db, 'license', key.trim().replace(/\s+/g, ''));
  invalidateLicenseCache();
  return v.payload;
}

export async function outletCount(db: DB, organizationId: string): Promise<number> {
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(outlets).where(eq(outlets.organizationId, organizationId));
  return r?.n ?? 0;
}
