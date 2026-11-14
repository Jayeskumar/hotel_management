# TableWise — Restaurant Management Platform

Multi-tenant, multi-outlet restaurant operations software: floor & table management, POS ordering,
kitchen display (KDS), split payments, reservations, recipe-based inventory, reporting, staff RBAC
and a full audit trail. Updates push to every screen in real time.

| Area | Highlights |
|---|---|
| **Floor & tables** | Areas, live table status (available / occupied / reserved / cleaning / out of service), time-seated timers, table transfers |
| **POS ordering** | Dine-in, takeaway, delivery; modifiers & kitchen notes; edit unsent items; send to kitchen by station |
| **Kitchen display** | Tickets per station (Kitchen, Grill, Bar, Dessert), colour-coded ageing, tap to advance, bump ticket, new-ticket chime |
| **Billing** | Per-item tax rates, service charge, % / flat discounts (cashier limit 20%), split & partial payments, tips, cash change, idempotent payments, refunds, 80mm receipt printing |
| **Reservations** | Day view, table assignment with overlap & capacity checks, seat / no-show / cancel flow |
| **Inventory** | Stock items, purchases / waste / adjustments, recipes that auto-deduct stock on sale, low-stock alerts |
| **Reports** | Sales by day / hour / type / category / payment method, top items, staff performance, voids / cancellations / refunds, CSV export |
| **Admin** | Multi-outlet organisations, 5 roles with fine-grained permissions, staff management, audit log |

## Tech stack

- **API** — Node 22, TypeScript, Fastify 5, Drizzle ORM, PostgreSQL 16, Socket.IO, Zod
- **Web** — React 19, Vite, Tailwind CSS 4, TanStack Query, React Router, Recharts
- **Shared** — `@tablewise/shared`: enums, permissions, validation schemas and billing math used by both sides
- **Ops** — Docker images (API + nginx web), docker-compose, GitHub Actions CI

```
apps/api        Fastify REST + WebSocket API, migrations, seed, integration tests
apps/web        React SPA
packages/shared Shared domain logic (billing, RBAC, schemas)
docs/           Architecture, API reference, roadmap
```

## Quick start (local development)

Requires Node 20+ and PostgreSQL 14+.

```bash
npm install
```

```bash
createdb tablewise   # or use any Postgres you have
cp apps/api/.env.example apps/api/.env   # edit DATABASE_URL / JWT_SECRET
```

```bash
npm run db:seed      # applies migrations and loads demo data
```

```bash
npm run dev:api      # http://localhost:4000
```

```bash
npm run dev:web      # http://localhost:5173
```

Demo accounts (password `Password123`): `owner@`, `manager@`, `cashier@`, `waiter@`, `chef@demo.tablewise.app`.

## Run with Docker

```bash
cp .env.example .env   # set JWT_SECRET and POSTGRES_PASSWORD
docker compose up --build
```

The app is served on http://localhost:8080. Migrations run automatically when the API starts.
Load demo data with `docker compose exec api node dist/db/seed.js`.

## Tests

```bash
npm test
```

Runs unit tests for billing/permissions and API integration tests against a real Postgres
database (`TEST_DATABASE_URL`, default `postgres://tablewise:tablewise@localhost:5432/tablewise_test`;
the test schema is reset on every run). Coverage includes auth & token rotation, account lockout,
tenant isolation, role enforcement, the full order → kitchen → payment → inventory flow,
concurrency (order numbers, double-seating), reservations and reports.

## Configuration (API)

| Variable | Default | Notes |
|---|---|---|
| `DATABASE_URL` | — | Postgres connection string |
| `JWT_SECRET` | — | ≥ 32 chars; the example value is rejected in production |
| `ACCESS_TOKEN_TTL` | `15m` | Access token lifetime |
| `REFRESH_TOKEN_TTL_DAYS` | `30` | Refresh token lifetime |
| `CORS_ORIGINS` | `http://localhost:5173` | Comma-separated |
| `ALLOW_SIGNUP` | `true` | Self-serve organisation signup |
| `MIGRATE_ON_START` | `true` | Run migrations at boot |
| `DB_POOL_MAX` | `20` | Connection pool size |

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for design details, [docs/API.md](docs/API.md) for
endpoints and [docs/ROADMAP.md](docs/ROADMAP.md) for what's next before general availability.
