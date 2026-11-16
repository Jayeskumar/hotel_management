# Roadmap to general availability

What exists today is a production-shaped core. Before selling to paying customers, plan for:

## Must-have before first paid customer
- **Payment confirmation** — the UPI QR is generated locally and staff confirm payment by eye. Integrate
  a payment provider (Razorpay / PhonePe / Paytm / Pine Labs) for automatic UPI confirmation via
  webhook and for card terminals. Card data must never touch our servers.
- **Chartered accountant review of GST handling** — rates (5% standalone vs 18% for restaurants in
  hotels with room tariff above ₹7,500), composition-scheme outlets (no GST collected, "composition
  taxable person" on bill), credit notes for post-invoice refunds, and B2B invoices with buyer GSTIN.
- **Thermal printing** — browser printing renders Tamil correctly. Direct ESC/POS printing needs Tamil
  rendered as an image, because most thermal printers have no built-in Tamil font.
- **Tamil copy review** by a native speaker from the target region before launch.
- **Email delivery** — password reset, staff invitations (replace admin-set temporary passwords).
- **Backups & DR** — managed Postgres with PITR, documented restore drill.
- **Security** — external penetration test, dependency scanning in CI, CSP headers on the web
  tier, optional 2FA for owners/managers, SSO (SAML/OIDC) for enterprise tiers.
- **Legal** — terms, privacy policy, DPA, data retention & deletion (GDPR/DPDP).
- **Monitoring** — error tracking (e.g. Sentry), metrics, uptime alerts, on-call runbook.

## Product
- Swiggy / Zomato order integration, Tally / Zoho Books export, WhatsApp bill sharing
- More languages (Malayalam, Telugu, Kannada, Hindi) — the i18n layer already supports adding dictionaries
- Shift / cash-drawer management (open/close till, X/Z reports, cash variance)
- Printer routing (kitchen ticket printers per station, ESC/POS over network)
- Offline mode for POS (queue orders locally, sync when back online)
- Combos, modifier groups with min/max rules, happy-hour pricing, time-based menus
- Customer CRM & loyalty, gift cards, QR table ordering, online ordering & delivery aggregators
- Supplier purchase orders, stock takes, food-cost & margin reports
- Multi-outlet consolidated reporting for owners; central menu pushed to outlets
- Hotel PMS integration (room charge / post to folio)

## On-premise edition
- Test the installer on real Windows 10/11 machines (checklist in docs/ONPREM.md) and buy a code-signing certificate
- In-app update notifications (check a release feed, download the new installer)
- Optional encrypted off-site backup upload (S3 / Google Drive) as a paid add-on
- Hybrid mode: on-prem server that syncs to the cloud for owner dashboards across branches
- Hardware licence binding (machine fingerprint) if licence sharing becomes a problem

## Platform
- Subscription billing & plan limits (outlets, staff seats)
- Socket.IO Redis adapter + sticky sessions for horizontal scaling
- Postgres row-level security as defence-in-depth for tenancy
- OpenAPI spec generation and public API keys / webhooks for integrations
- Web E2E tests (Playwright) in CI; load testing for peak service
