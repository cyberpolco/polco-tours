# CLAUDE.md — POLCO TOURS

Persistent brief for Claude Code. Read this first, every session. It encodes the
engineering charter, the current state, and the rules that must not be broken.

POLCO TOURS is a **Tourism Operating System** for **Namibia** and the
**Democratic Republic of Congo (DRC)** — tour package sales plus operations
management (tourists, operators, guides, drivers, vehicle owners, hotels,
restaurants, visa facilitators, immigration officers). Web platform first;
native apps later. Brand: **polcotours** (`polcotours.com`).

The authoritative spec is the 11-volume design package in
`docs/design-package/` and the governance record in
`docs/decisions/DECISION_LOG.md`. When code and a volume disagree, fix one of
them in the same PR — never leave them out of sync.

---

## Non-negotiable rules (the charter)

1. **Backend is the single source of truth.** No business logic in the
   frontend — it renders and validates for UX only. Prices, tax, permissions
   and state transitions are decided server-side.
2. **No business logic is duplicated** between frontend and backend.
3. **Every module is independent and reusable.** Modules talk to each other
   *only* through their `index.ts` public interface. Never reach into another
   module's tables, repository, or internals.
4. **No new technology, framework, database, or external service** without an
   approved decision entry (see "Living-document mandate" below). The approved
   stack is fixed (DR-001).
5. **No feature is complete without tests** — unit + API + security. Aim ≥ 80%
   coverage on service-layer logic.
6. **Six-question gate before building any feature:** user role · business
   process · database impact · API impact · security impact · testing strategy.
7. **Clean code:** readable, self-documenting, meaningful names, no needless
   complexity, reusable components. Comments explain *why*, not *what*.
8. **Third-party integrations must not crash the system.** Wrap them: timeouts,
   retries, circuit breaker, graceful degradation. Notification fallback chain
   is WhatsApp → SMS → email. A channel outage must never fail a booking.

## Living-document mandate (DR-007) — do not skip

Any **structural change** (data model, module public interface, permission,
business rule) or **integration change** (add/remove/reconfigure an external
service, webhook, or credential model) MUST, in the same PR:

1. Add a dated `DR-nnn` row to `docs/decisions/DECISION_LOG.md`.
2. Update the affected volume(s) in `docs/design-package/`.
3. Reference the `DR-nnn` id in the PR description (the PR template has the
   checkbox).

This is enforced by the PR template and the Definition of Done. Treat it as a
build gate, not a suggestion.

---

## Before every push (run locally — this catches the errors we keep hitting)

```bash
npm ci            # validates the lockfile resolves; catches dep conflicts
npm run lint
npm run typecheck
npm test          # includes the RLS cross-tenant test (Phase 0 exit gate)
npm run build     # catches Next/type build failures before Vercel does
```

Only push when all five pass. CI runs the same on GitHub with its own Postgres
service; Vercel deploys `main` → Production and every PR → Preview.

**Version-pinning caution:** dependencies are pinned to exact versions for
reproducibility. If you change one, run `npm install` and inspect the result —
the ecosystem drifts (we already had to bump Next for a security advisory and
align better-auth/zod/playwright). Prefer the current patched release of the
same major; record a DR for any security-driven bump.

---

## Tech stack (approved — DR-001, DR-004)

| Layer | Choice |
|-------|--------|
| Framework | Next.js `15.5.20` (App Router, TypeScript), React 19 |
| Hosting / CI | Vercel, deployed from GitHub. Region `fra1` (near EU data) |
| Database | Neon PostgreSQL (EU region), Prisma `5.22.0` |
| Auth | better-auth `1.6.23`, self-hosted (data in our DB) |
| Validation | zod `4.4.3` |
| Payments | DPO Pay (hosted page, v6, SAQ-A) — wired in Phase 1 |
| Cache / queue | Upstash Redis + QStash — Phase 1 |
| Email / WA / SMS | Resend · WhatsApp Cloud API · Africa's Talking — Phase 1/2 |
| Tests | Vitest (unit + RLS), Playwright `1.61.1` (E2E) |
| Observability | Sentry + Vercel Analytics + Axiom (structured logs) |

Do not swap any of these without a DR entry.

---

## Repository layout

```
src/
  app/                 # Next.js App Router (UI + /api/v1 route handlers)
    api/v1/health/     # liveness probe
  lib/                 # shared kernel: db, auth, rbac, errors, money, audit, logger
  modules/             # feature modules — independent, reusable (Vol. 5 §5.2)
    auth/              # REFERENCE module: domain · repository · service · index
  middleware.ts        # trace id + locale (rate limit / session hook in Phase 1)
prisma/
  schema.prisma        # data model
  rls.sql              # Row-Level Security policies (applied AFTER db push)
  seed.ts              # Lam operator + superadmin + per-country tax
scripts/apply-rls.mjs  # runs rls.sql
tests/                 # Vitest: RLS cross-tenant, RBAC, money
e2e/                   # Playwright smoke
docs/decisions/        # DECISION_LOG.md (DR-007 living record)
docs/design-package/   # the 11 volumes (put the master PDF/markdown here)
.github/               # CI workflow + PR template (enforces the DR gate)
```

**New module = copy the `auth/` shape:** `domain.ts` (pure types/rules, no
framework/DB) · `repository.ts` (only place touching Prisma for that module) ·
`service.ts` (business logic) · `index.ts` (public interface — the only thing
other modules may import).

---

## Commands

| Script | Purpose |
|--------|---------|
| `npm run dev` / `build` / `start` | Next.js |
| `npm run lint` / `typecheck` | ESLint / `tsc --noEmit` |
| `npm test` / `test:watch` | Vitest (unit + RLS) |
| `npm run test:e2e` | Playwright smoke |
| `npm run db:push` | Sync Prisma schema → DB |
| `npm run db:rls` | Apply `prisma/rls.sql` |
| `npm run db:seed` | Seed Lam + tax rates |
| `npm run db:setup` | push + rls + seed |

First-time DB setup: `cp .env.example .env` (fill Neon `DATABASE_URL` pooled +
`DIRECT_URL` direct, and `BETTER_AUTH_SECRET`), then `npm run db:setup`, then
`npx @better-auth/cli@latest generate && npm run db:push` for auth tables.

---

## Data & security rules

- **Multi-tenancy + RLS.** Tenant tables carry `organizationId`. Access them
  through `withOrg(orgId, tx => ...)` in `src/lib/db.ts`, which sets the
  Postgres `app.org_id` GUC so Row-Level Security filters every statement.
  Deny-by-default: no scope set → zero rows.
- **Prisma does NOT manage RLS.** After any schema change that adds a
  tenant-scoped table: add its policy to `prisma/rls.sql` and run
  `npm run db:rls`. Enable + `FORCE` RLS so the owner is also subject.
- **RBAC** (`src/lib/rbac.ts`) is the app-layer source of truth; RLS is defense
  in depth. Every API route declares a required permission; unmapped routes
  fail closed. Re-check object ownership in services (anti-BOLA).
- **Launch tenancy (DR-005):** single operator **Lam** (Namibia + DRC), seeded
  as `lam@polcotours.com` with role `SUPERADMIN` (PLATFORM_ADMIN + own-org
  TOUR_OPERATOR). Multi-tenant isolation stays on so more operators can onboard
  with no migration.
- **Money (BR-02):** integer minor units + ISO-4217 code, never floats; FX rate
  snapshotted per transaction. Currencies: USD, EUR, NAD, CDF. Helpers in
  `src/lib/money.ts`.
- **Tax (DR-006 / BR-01):** per-country, effective-dated. DRC VAT 16%, Namibia
  VAT 15%. Never hardcode a flat rate — read `tax_rates`.
- **Documents (passports/visas):** object storage + encryption + short-lived
  signed URLs + access logging; DB stores references only; retention limits.
- **Audit (NFR-07):** append-only `audit_logs` (UPDATE/DELETE denied at DB).
  Log payments, document access, role/permission changes, assignments.
- **Errors:** RFC 9457 `application/problem+json` via `src/lib/errors.ts`. No
  internals/stack traces to clients.
- **i18n:** full EN + FR parity for every user-facing string.
- **Immigration Officer:** strictly read-only, country-scoped, every view
  audited (BR-10).

---

## Design system

Identity is **"Meridian Cartography"** (survey-line precision, expedition
palette) — matches the design package. Tokens in `tailwind.config.ts`:
navy `#152238`, dune amber `#C97B2D`, forest `#2E5B41`, bone `#F7F4EE`, mist,
ink, rule. Keep product surfaces visually coherent with the documents.

---

## Phase status

- **Phase 0 — Foundation: in progress / stabilizing CI.** Repo, GitHub→Vercel
  pipeline, Prisma schema + RLS, auth/RBAC skeleton, Lam seed, tax table,
  observability baseline, design tokens. **Exit gate:** `npm test` green
  (cross-tenant RLS proven) + `main` deployed on Vercel.
- **Phase 1 — Core Booking (next):** catalog, departures, availability,
  booking + holds (30-min expiry), DPO deposit/balance, invoicing with
  per-country tax, email notifications, EN/FR. Pilot with Lam.
- **Phase 2:** operations (fleet+compliance, assignments, documents, visa,
  WhatsApp/SMS fallback, GPS v1, CRM, reviews).
- **Phase 3:** AI assignment engine (operator-validated), analytics.
- **Phase 4:** native Android/iOS, more countries.

Full roadmap and testing strategy: Volume 10.

---

## Decision log — recent

Maintained in `docs/decisions/DECISION_LOG.md`. Current: DR-001 stack ·
DR-002 DPO locked · DR-003 brand polcotours · DR-004 Vercel · DR-005 Lam
superadmin · DR-006 per-country tax · DR-007 living-doc mandate · DR-008
Phase 0 scaffold. **Pending to record: DR-009 — dependency security bump
(Next 15.1.6 → 15.5.20, better-auth 1.6.23, zod 4.4.3, playwright 1.61.1).**
Add it if not yet present.

## Open items — cannot be decided in code (see log OI-01..04)

- **OI-01** DPO written commercial terms (fee %, EUR support, DRC/Namibia mobile
  money, settlement SLA, rolling-reserve %). Blocks Phase 1 finance.
- **OI-02** Trademark clearance for "polcotours"/"POLCO TOURS" in NA + DRC
  (existing Greek tourism brand + US "Polco"). Blocks public launch.
- **OI-03** Lam per-market legal registrations (Namibia NTB/BIPA/NamRA; DRC
  DARA/DGI/Ministry of Tourism). Blocks go-live.
- **OI-04** Object-storage provider + EU region confirmation. Blocks Phase 0
  close.

Surface these to the human — don't invent answers.

---

## Gotchas we already hit

- Missing `package-lock.json` breaks `npm ci` + Actions npm cache — keep it
  committed and in sync.
- `apply-rls.mjs` strips SQL comments before splitting on `;` — don't
  reintroduce naive splitting (a semicolon in a comment broke it once, then
  broke CI again on 2026-07-08 when the split-before-strip order regressed —
  `rls.sql`'s FORCE-policy comment contains "...policies; without FORCE...").
- `prisma generate` (postinstall) downloads engines from `binaries.prisma.sh`
  — fine on Vercel/GitHub, may be blocked in restricted sandboxes.
- better-auth needs `npx @better-auth/cli generate` to emit its tables into the
  schema before `db:push`.
- `prisma/schema.prisma` maps table names to snake_case (`@@map("tour_packages")`)
  but never `@map`s individual fields — so DB columns stay camelCase
  (`"organizationId"`, quoted). `rls.sql` policies must reference the quoted
  camelCase column, not `organization_id` — this broke CI on 2026-07-08. When
  adding a new tenant-scoped table's RLS policy, match the actual column name
  in the schema, don't assume snake_case from the table name.
- CI's `postgres:16` service image makes `POSTGRES_USER` the initdb bootstrap
  **superuser** — and superusers always bypass Row-Level Security, even with
  `FORCE ROW LEVEL SECURITY`. Connecting as that user silently no-ops every
  policy, so the cross-tenant test would pass/fail independent of whether the
  policies actually work. CI now creates a `polco_app` role with `NOSUPERUSER
  NOBYPASSRLS` right after `npm ci` and points `DATABASE_URL`/`DIRECT_URL` at
  it for the rest of the job (`.github/workflows/ci.yml`) — keep DB creds
  pointed at that role, not the bootstrap `polco` user, in any future CI edits.
- RLS policies must wrap `current_setting('app.org_id', true)` in
  `NULLIF(..., '')` before casting to `::uuid`. It only returns real `NULL` the
  first time a custom GUC is touched on a connection; once any transaction on
  a pooled connection has done `SET LOCAL app.org_id = ...`, Postgres's
  placeholder for that GUC resets to `''` (not NULL) afterwards, so a later
  unscoped query on the same reused connection throws an `invalid input syntax
  for type uuid` cast error instead of failing closed with zero rows.
