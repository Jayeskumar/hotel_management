# Roadmap to general availability

What exists today is a production-shaped core. Before selling to paying customers, plan for:

## Must-have before first paid customer
- **Payment gateway integration** (Stripe Terminal / Adyen / Razorpay) — today payments are
  *recorded*, not *processed*. Card data must never touch our servers (use terminal SDKs / hosted fields).
- **Fiscal / tax compliance per market** — e.g. GST invoices & HSN codes (India), VAT receipts
  (EU/UK), fiscal printers where mandated. Invoice numbering separate from order numbers.
- **Email delivery** — password reset, staff invitations (replace admin-set temporary passwords).
- **Backups & DR** — managed Postgres with PITR, documented restore drill.
- **Security** — external penetration test, dependency scanning in CI, CSP headers on the web
  tier, optional 2FA for owners/managers, SSO (SAML/OIDC) for enterprise tiers.
- **Legal** — terms, privacy policy, DPA, data retention & deletion (GDPR/DPDP).
- **Monitoring** — error tracking (e.g. Sentry), metrics, uptime alerts, on-call runbook.

## Product
- Shift / cash-drawer management (open/close till, X/Z reports, cash variance)
- Printer routing (kitchen ticket printers per station, ESC/POS over network)
- Offline mode for POS (queue orders locally, sync when back online)
- Combos, modifier groups with min/max rules, happy-hour pricing, time-based menus
- Customer CRM & loyalty, gift cards, QR table ordering, online ordering & delivery aggregators
- Supplier purchase orders, stock takes, food-cost & margin reports
- Multi-outlet consolidated reporting for owners; central menu pushed to outlets
- Hotel PMS integration (room charge / post to folio)

## Platform
- Subscription billing & plan limits (outlets, staff seats)
- Socket.IO Redis adapter + sticky sessions for horizontal scaling
- Postgres row-level security as defence-in-depth for tenancy
- OpenAPI spec generation and public API keys / webhooks for integrations
- Web E2E tests (Playwright) in CI; load testing for peak service
