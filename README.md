# TableWise — Restaurant Management Platform for India

Multi-branch restaurant operations software built for Indian restaurants, with a fully bilingual
**Tamil / English** interface: floor & table management, POS ordering, KOT kitchen display,
GST billing with UPI, reservations, recipe-based inventory, reporting, staff roles and a full audit
trail. Updates push to every screen in real time.

### Built for India
- **Tamil and English everywhere** — every screen, toast and server error message. Each device
  (billing counter, waiter tablet, kitchen screen) remembers its own language. Dishes, categories
  and add-ons carry a Tamil name shown alongside the English one.
- **GST billing** — 5% default GST added on top of menu prices, split into **CGST + SGST** on screen
  and on the bill, per-dish GST rate override, bills rounded to the nearest rupee with a round-off line.
- **GST tax invoice** — GSTIN, FSSAI licence number, SAC 996331, and gap-free invoice numbers that
  restart every financial year (`TNG/2627/000001`). Bills print on 80mm thermal printers with Tamil + English dish names.
- **UPI first** — the payment screen shows a UPI QR code with the exact amount for the customer to scan;
  UTR reference capture; Cash / UPI / Card / Wallet split payments.
- **Service charge is optional** — off by default; if enabled, staff can remove it from any bill when
  the guest declines, as required by the Central Consumer Protection Authority (CCPA) guidelines.
- **KOT** — kitchen order tickets by counter (Kitchen, Tiffin/Dosa, Tandoor, Beverages, Sweets), on screen or printed.
- **GST summary report** — taxable value, CGST and SGST by rate for GSTR-1 / GSTR-3B; CSV export
  with invoice numbers that opens correctly in Excel (Tamil included).
- ₹ amounts in Indian digit grouping (₹1,23,456.00), lakh/crore chart axes, IST timezone, veg/non-veg marks.

| Area | Highlights |
|---|---|
| **Floor & tables** | Areas, live table status (available / occupied / reserved / cleaning / out of service), time-seated timers, table transfers |
| **POS ordering** | Dine-in, parcel, delivery; add-ons & kitchen notes; edit unsent items; send KOT by counter |
| **Kitchen display** | KOTs per counter, colour-coded ageing, tap to advance, bump ticket, new-ticket chime, Tamil/English per screen |
| **Billing** | GST (CGST/SGST), round-off, optional service charge, % / flat discounts (cashier limit 20%), split payments, UPI QR, tips, cash change, idempotent payments, refunds, GST tax invoice printing |
| **Reservations** | Day view, table assignment with overlap & capacity checks, seat / no-show / cancel flow |
| **Inventory** | Stock items, purchases / waste / adjustments, recipes that auto-deduct stock on sale, low-stock alerts |
| **Reports** | Sales by day / hour / type / category / payment mode, GST summary, top dishes, staff performance, voids / cancellations / refunds, CSV export |
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
The demo is a Chennai restaurant ("Thendral — T. Nagar") with a South Indian menu in Tamil and English and
two weeks of order history. Switch language with the **English / தமிழ்** toggle on the sign-in page or in the sidebar.

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
