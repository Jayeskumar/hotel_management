#!/usr/bin/env node
/**
 * Issues a licence key for an on-prem customer.
 *
 *   npm run license:issue -- --key ~/tablewise-vendor/license-private.pem \
 *     --customer "Thendral Foods Pvt Ltd" --outlets 3 --edition standard --expires 2027-12-31
 *
 * Use --perpetual instead of --expires for a licence that never expires.
 * Paste the printed key into Settings → System → Licence on the customer's install.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';

const args = process.argv.slice(2);
const get = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
const keyPath = get('key');
const customer = get('customer');
const outlets = Number(get('outlets') ?? 1);
const edition = get('edition') ?? 'standard';
const expires = get('expires');
const perpetual = args.includes('--perpetual');

if (!keyPath || !customer || (!expires && !perpetual) || !Number.isInteger(outlets) || outlets < 1 || !['standard', 'enterprise'].includes(edition)) {
  console.error('Usage: npm run license:issue -- --key <private.pem> --customer "<name>" --outlets <n> [--edition standard|enterprise] (--expires YYYY-MM-DD | --perpetual)');
  process.exit(1);
}
let expiresAt = null;
if (expires) {
  const d = new Date(`${expires}T23:59:59+05:30`);
  if (Number.isNaN(d.getTime())) { console.error('Invalid --expires date'); process.exit(1); }
  expiresAt = d.toISOString();
}

const privateKey = fs.readFileSync(keyPath.replace(/^~/, os.homedir()), 'utf8');
const payload = { id: crypto.randomUUID(), customer, edition, maxOutlets: outlets, issuedAt: new Date().toISOString(), expiresAt };
const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
const sig = crypto.sign(null, Buffer.from(`TW1.${body}`), privateKey).toString('base64url');

console.error(JSON.stringify(payload, null, 2));
console.log(`TW1.${body}.${sig}`);
