# Licence tools (vendor only)

On-prem installations verify licence keys offline with an Ed25519 public key compiled into the server.

1. **Once, before your first release:** `npm run license:keygen -- --out ~/tablewise-vendor/license-private.pem`
   and commit the regenerated `apps/api/src/lib/license-public-key.ts`. Back the private key up offline.
2. **Per customer:** `npm run license:issue -- --key ~/tablewise-vendor/license-private.pem --customer "Name" --outlets 2 --expires 2027-03-31`
3. The customer pastes the key in **Settings → System → Licence**.

`dev-private-key.pem` in this folder is a **development key only** — it matches the public key the
repository ships with so you can test licensing. Release builds refuse to package that key.
