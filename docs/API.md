# API reference (v1)

All endpoints are JSON under `/api/v1`. Authenticate with `Authorization: Bearer <accessToken>`.
Errors: `{ "error": { "code", "message", "details?" } }` with status 400/401/403/404/409/422/423/429.

## Auth
| Method | Path | Notes |
|---|---|---|
| POST | `/auth/register` | Create organisation + first outlet + owner (if `ALLOW_SIGNUP`) |
| POST | `/auth/login` | `{ email, password }` → `{ accessToken, user, organization, outlets, permissions }` + refresh cookie |
| POST | `/auth/refresh` | Rotates refresh cookie, returns new access token + profile |
| POST | `/auth/logout` | Revokes refresh token |
| GET | `/auth/me` | Current profile |
| POST | `/auth/change-password` | Revokes all sessions |

## Organisation
| Method | Path | Permission |
|---|---|---|
| POST | `/outlets` | `outlet:manage` |
| GET / PUT | `/outlets/:outletId` | assigned / `outlet:manage` |
| GET / POST | `/staff` | `staff:manage` |
| PATCH | `/staff/:userId` | `staff:manage` (managers cannot touch owners/managers) |

## Outlet-scoped (`/outlets/:outletId`)
| Method | Path | Permission |
|---|---|---|
| GET | `/dashboard` | any |
| GET | `/floor` | any |
| POST/PUT/DELETE | `/areas`, `/areas/:id`, `/tables`, `/tables/:id` | `tables:manage` |
| PATCH | `/tables/:id/status` | `tables:update_status` |
| GET | `/menu` | any |
| POST/PUT/DELETE | `/menu/categories[/:id]`, `/menu/items[/:id]` | `menu:manage` |
| PATCH | `/menu/items/:id/availability` | `menu:manage` or `kitchen:update` |
| GET/PUT | `/menu/items/:id/recipe` | any / `menu:manage` |
| GET | `/orders?status&type&q&from&to&page&pageSize` | `orders:view` |
| POST | `/orders` | `orders:create` |
| GET / PATCH | `/orders/:id` | `orders:view` / `orders:update` (incl. table transfer) |
| POST | `/orders/:id/items` | `orders:update` |
| PATCH | `/orders/:id/items/:itemId` | `orders:update` (unsent only) |
| POST | `/orders/:id/items/:itemId/void` | `orders:update`; fired items need `orders:void_item` + reason |
| POST | `/orders/:id/fire` | `orders:update` |
| POST | `/orders/:id/items/:itemId/serve` | `orders:update` |
| POST | `/orders/:id/discount` | `orders:discount` (>20% needs manager) |
| POST | `/orders/:id/cancel` | `orders:cancel` |
| POST | `/orders/:id/payments` | `payments:create` — `{ method, amountCents, tipCents?, reference?, idempotencyKey? }` |
| POST | `/orders/:id/payments/:paymentId/refund` | `payments:refund` |
| GET | `/kitchen?station=` | `kitchen:view` |
| POST | `/kitchen/items/:itemId/status` | `kitchen:update` |
| POST | `/kitchen/orders/:orderId/bump` | `kitchen:update` |
| GET/POST/PUT | `/reservations[/:id]` | `reservations:view` / `reservations:manage` |
| PATCH | `/reservations/:id/status` | `reservations:manage` |
| GET/POST/PUT/DELETE | `/inventory[/:id]` | `inventory:view` / `inventory:manage` |
| GET/POST | `/inventory/:id/movements` | `inventory:view` / `inventory:manage` |
| GET | `/reports/sales?from&to` | `reports:view` |
| GET | `/reports/orders.csv?from&to` | `reports:view` |
| GET | `/audit?page&entityId` | `audit:view` |

## WebSocket
Connect to `/socket.io` with `auth: { token }`, then `emit('join', outletId, ack)`.
Events: `order.updated`, `kitchen.updated`, `table.updated`, `reservation.updated`, `menu.updated`, `inventory.low`.
