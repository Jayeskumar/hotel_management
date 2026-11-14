# Architecture

## Tenancy model

```
Organization ──< Outlet ──< Area ──< DiningTable
     │             ├──< MenuCategory ──< MenuItem ──< RecipeLine >── InventoryItem
     │             ├──< Order ──< OrderItem
     │             │        └──< Payment
     │             ├──< Reservation
     │             └──< InventoryItem ──< StockMovement
     └──< User >──< UserOutlet (assignment)
AuditLog (organization, outlet, user, action, entity, metadata)
```

* Every outlet-scoped route lives under `/api/v1/outlets/:outletId/...`. A shared `preHandler`
  verifies the JWT, re-checks the user is still active (deactivation is immediate), confirms the
  outlet belongs to the caller's organisation and that the user is assigned to it (owners see all
  outlets). Every query is additionally filtered by `outlet_id`, so a leaked ID from another tenant
  returns 404.
* Roles → permissions are defined once in `packages/shared/src/permissions.ts` and enforced on the
  server; the web app uses the same table only to hide UI.

## Auth

* Short-lived access JWT (15 min) held in memory by the SPA — never in localStorage.
* Refresh token: random 384-bit value, stored **hashed** (SHA-256), sent as an `httpOnly`,
  `SameSite=Strict` cookie scoped to `/api/v1/auth`. Rotated on every use; replaying a rotated
  token outside a 10 s grace window (for simultaneous tabs) revokes the whole token family.
* bcrypt (cost 12), account lockout after 5 failures for 15 min, timing-safe unknown-user path,
  per-route rate limits on login/register/refresh.
* Password change or staff deactivation revokes all refresh tokens.

## Money & GST

* All amounts are integer paise (columns are named `*_cents` for currency neutrality) and rates are
  basis points (5% = 500) — no floats in storage.
* `computeBillDetail()` in the shared package is the single source of truth, used by the API, the
  POS screen and the printed invoice: discount is applied pre-tax and allocated proportionally across
  lines; any service charge is applied to the discounted subtotal and attributed to each GST rate in
  proportion. Tax is grouped by rate with largest-remainder rounding so the per-rate buckets sum
  exactly to the bill's GST. `splitGst()` halves it into CGST and SGST (SGST takes the odd paisa).
* Round-off to the nearest rupee is an outlet setting snapshotted on each order (`round_off_cents`).
* Order lines snapshot English name, Tamil name, price, GST rate and add-ons at the time of ordering
  so menu edits never change historical bills.
* **Invoice numbers**: allocated only when an order is fully paid, inside the payment transaction,
  from a per-outlet counter that resets when the Indian financial year (April–March, computed in the
  outlet's timezone) changes. Format `PREFIX/YYYY/NNNNNN`, at most 16 characters as GST rules
  require, unique per outlet.

## Internationalisation (Tamil / English)

* **UI strings**: `apps/web/src/i18n/en.ts` and `ta.ts`. `ta` is typed as `Record<keyof typeof en, string>`,
  so a missing Tamil translation fails the TypeScript build.
* **Server errors**: the API never returns UI text alone. Every error carries a message `key` and
  `params` (plus an English `message` for logs/integrators); the catalogue in
  `packages/shared/src/messages.ts` holds both languages and the client renders the active one.
  A unit test asserts every key has a Tamil translation.
* **Data**: categories, dishes and add-ons have an optional `name_ta`; the UI shows the active
  language first and the other underneath. Receipts print both.
* Language is stored per device (localStorage), not per user, so a shared billing counter and the
  kitchen screen can each use their own language. Fonts (Inter + Noto Sans Tamil) are self-hosted
  so terminals work without Google Fonts access.
* Numbers and dates use `en-IN` / `ta-IN` locales (Indian digit grouping).

## Consistency & concurrency

* Order mutations run in a transaction holding `SELECT … FOR UPDATE` on the order row; totals are
  recomputed from lines on every change and a `version` column is bumped.
* Order numbers come from an atomic `UPDATE outlets SET order_seq = order_seq + 1 RETURNING`.
* Seating locks the table row, preventing two waiters opening the same table.
* Kitchen status changes use compare-and-set on the previous status.
* Payments accept a client `idempotencyKey` (unique per outlet) so retries never double-charge;
  amounts above the balance are rejected; the order closes automatically when fully paid, which
  releases the table to *cleaning* and deducts recipe ingredients from inventory.
* Fired items cannot be edited — only voided, which requires `orders:void_item` and a reason.

## Realtime

Socket.IO on the same port (`/socket.io`). Clients authenticate with the access token in the
handshake and `join` an outlet room after a server-side access check. The server emits thin
events (`order.updated`, `kitchen.updated`, `table.updated`, …) and clients invalidate the
matching React Query caches, so the REST API remains the only source of data.

For horizontal scaling run multiple API replicas behind a load balancer with sticky sessions and
add the Socket.IO Redis adapter (see roadmap).

## Audit

Sensitive actions are written to `audit_logs` inside the same transaction as the change: logins,
order creation/cancellation, voids (with value), discounts, payments, refunds, table transfers,
menu price changes, 86'ing, staff and outlet changes, inventory movements.

## Observability

Structured JSON logs (pino) with request IDs (`x-request-id` is honoured and echoed), secrets
redacted. `/health` (liveness) and `/ready` (DB check) endpoints for orchestrators.
