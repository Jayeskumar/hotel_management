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

## Money & tax

* All amounts are integer minor units (`*_cents`) and rates are basis points — no floats in storage.
* `computeBill()` in the shared package is the single source of truth: discount is applied
  pre-tax and allocated proportionally across lines; service charge is applied to the discounted
  subtotal and taxed at the weighted line rate. Order lines snapshot name, price, tax rate and
  modifiers at the time of ordering so menu edits never change historical bills.

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
