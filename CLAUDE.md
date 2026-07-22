# CLAUDE.md — POLCO TOURS

Persistent brief for Claude Code. Read this first, every session. It encodes
the engineering charter and the **current state** of the system. This file
describes what the system *is*, not the history of how it got here — for
that, see `git log` and `docs/decisions/DECISION_LOG.md` (the canonical,
dated decision record, DR-007).

POLCO TOURS is a **Tourism Operating System** for **Namibia** and the
**Democratic Republic of Congo (DRC)** (also operating in **Zambia** and
**Zimbabwe**) — tour package sales plus operations management (tourists,
operators, guides, drivers, vehicle owners, hotels, restaurants, visa
facilitators). Web platform first; native apps later. Brand: **polcotours**
(`polcotours.com`).

> Last updated: 2026-07-22, HEAD `fdcd0ca` (+ an uncommitted guest-site
> UI/UX modernization effort, DR-068/DR-069 — new Framer Motion
> dependency, a repalette to a "Horizon" sunset identity across shared
> `Button`/`Card`/`Badge`/`Table` primitives, and an optional
> `TourPackage.imageUrl` column, applied to the shared Neon DB. The
> Horizon treatment now covers the full guest site, not just the
> homepage/catalog — every remaining page (package listing, both
> booking-start pages, the full booking-management flow, find-booking,
> rate, and the static content pages) carries the same Reveal/Card/Badge
> pattern, and `AvailabilityBadge` is wired onto `/book/[departureId]`).
> Decision log current through DR-069. Both Upstash integrations (Redis rate
> limiting, QStash scheduled jobs) are live in production — see Open Items.

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
2. Update the affected volume(s) in `docs/design-package/` (see note below —
   this directory doesn't exist yet).
3. Reference the `DR-nnn` id in the PR description (the PR template has the
   checkbox).
4. Update this file (`CLAUDE.md`) if the change affects current architecture,
   permissions, phase status, or open items — keep it describing *current
   state*, not a running log. Append-only narrative belongs in the decision
   log, not here.

This is enforced by the PR template and the Definition of Done. Treat it as a
build gate, not a suggestion.

**Note:** `docs/design-package/` (the 11-volume design spec DR-007 references)
does not exist in the repo yet — only `docs/decisions/DECISION_LOG.md` is
populated. Treat the decision log as authoritative; a DR's "Affects: Vn" tags
can't be made concrete until those volumes are added. Surface this to the
human rather than fabricating volume content.

---

## Before every push (run locally)

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
reproducibility. If you change one, run `npm install` and inspect the result.
Record a DR for any security-driven bump.

**CI is the source of truth, not a locally-clean run.** A DB-backed test suite
passing locally only proves it works against whichever Neon DB you happen to
be pointed at — check `gh run list`/`gh run view` after every push rather than
assuming a green local run means CI is green too (see Gotchas: local dev
always talks to the one already-migrated shared Neon DB, which masks schema
gaps a fresh Postgres would hit).

---

## Tech stack (approved — DR-001, DR-004, DR-010)

| Layer | Choice |
|-------|--------|
| Framework | Next.js `15.5.20` (App Router, TypeScript), React 19 |
| Hosting / CI | Vercel, deployed from GitHub. Region `fra1` (near EU data) |
| Database | Neon PostgreSQL (EU region, `eu-central-1`), Prisma `5.22.0` |
| Auth | better-auth `1.6.23`, self-hosted (data in our DB) |
| Validation | zod `4.4.3` |
| Object storage | Vercel Blob `2.6.1`, region `fra1` — passports (private, authenticated streaming route); visa decision documents land in Phase 2 |
| Payments | DPO Pay (hosted page, v6, SAQ-A) — stubbed behind a `PaymentGateway` interface, commercial terms still open (OI-01) |
| Cache / rate limiting | Upstash Redis `@upstash/redis 1.38.0` — live in production (`src/lib/rate-limit.ts`) |
| Scheduled jobs | Upstash QStash `@upstash/qstash 2.11.2` — live in production (`src/app/api/jobs/sweep-bookings`) |
| Email / WA / SMS | Resend · WhatsApp Cloud API · Africa's Talking — Resend + Africa's Talking have real, live credentials (see Open Items for delivery caveats); WhatsApp still unconfigured (OI-06) |
| Tests | Vitest (unit + RLS), Playwright `1.61.1` (E2E) |
| Observability | Sentry + Vercel Analytics + Axiom (structured logs) |
| Geo/map viz | `@visx/geo`+`@visx/responsive`+`@visx/tooltip`+`@visx/event` `4.0.0`, `topojson-client` `3.1.0`, `world-atlas` `2.0.2` — homepage Africa/Namibia/DRC map. Not `react-simple-maps` (no React 19 support) |
| i18n | `next-intl` `4.13.2` — cookie-based EN/FR locale, no URL prefixing; guest site only, partial coverage (Nav/Footer/HomePage) |
| Motion | `framer-motion` `12.42.2` (DR-068) — scroll-reveal/hover micro-interactions + the homepage `HeroCarousel`; every animated surface respects `prefers-reduced-motion` |

Do not swap any of these without a DR entry.

---

## Repository layout

```
src/
  app/
    api/v1/...                 # REST routes, one directory per module (see below)
    api/auth/[...all]/         # Better Auth's own mount
    api/jobs/sweep-bookings/    # QStash-signature-verified scheduled sweep endpoint
    staff/
      login/, forbidden/       # outside the auth gate
      change-password/         # forced first-login flow (mustChangePassword) + voluntary visit
      (dashboard)/             # gated by requireStaffContext (isStaffRole baseline)
        layout.tsx, nav.tsx, back-button.tsx, sidebar-shell.tsx, settings-items.ts
        bookings/, departures/, itineraries/, hotels/, restaurants/,
        fleet/, schedule/, visa-queue/, country-regulations/,
        finance/, insights/, tracking/, ratings/, packages/, profile/,
        settings/ (tax-rates, platform-rate), admin/ (users, clients, permissions)
    (guest)/                   # tourist self-serve site — NO ACCOUNTS, ever
      page.tsx, packages/, book-package/[packageId]/, book/[departureId]/,
      booking/[bookingId]/, plan-my-trip/, find-booking/, rate/,
      about/, faq/, contact/, terms/, policies/
  lib/                        # shared kernel: db, auth, auth-client, rbac, errors,
                              #   money, audit, logger, route-guard, staff-guard,
                              #   guest-guard, primary-org, country-codes, tax,
                              #   platform-rate, rate-limit, qstash, geo
  modules/                    # feature modules — independent, reusable
    auth/          # User/Membership/Session, RBAC resolution, multi-role support
    catalog/       # TourPackage + PackageTag + Departure + AddonService +
                   #   PackageItineraryDay (per-package itinerary template)
    booking/       # Booking (11-state lifecycle) + Traveler + BookingAddon;
                   #   bookingReference is the sole guest-facing lookup key
    invoicing/     # Invoice + Payment (DPO stubbed behind PaymentGateway)
    notifications/ # WhatsApp→SMS→email fallback gateways, no repository.ts
    documents/     # Document metadata + Vercel Blob gateway (private access)
    fleet/         # Vehicle + DriverProfile + GuideProfile + StarlinkKit +
                   #   MaintenanceRecord, compliance-document tracking
    assignment/    # Assignment (Departure -> vehicle/driver/guide), overlap rule
    visa/          # VisaApplication lifecycle, facilitator queue
    itinerary/     # Itinerary + ItineraryDay + Hotel/Restaurant reference
                   #   entities + HotelRating/RestaurantRating (staff-only)
    immigration/   # CountryRegulation — platform-wide visa/entry reference data
    ratings/       # Tourist-facing driver/guide/agency reviews (RatingCode,
                   #   Review, ReviewSubjectRating) — distinct from itinerary's
                   #   staff-only hotel/restaurant ratings
    insights/      # Read-only executive dashboard, no repository.ts (owns no table)
    finance/       # Cost-plus pricing engine — 6 rate tables + PackageCostBreakdown
    tracking/      # Fleet location + trip-progress composition, no repository.ts
    settings/      # TaxRate + PlatformRate CRUD, SiteContent/FaqEntry (schema-only,
                   #   unbuilt — reserved for a future Content module)
  middleware.ts    # trace id + locale
prisma/
  schema.prisma        # data model
  rls.sql              # Row-Level Security policies (applied AFTER db push)
  sequences.sql         # booking/package reference sequences (applied via db:sequences)
  seed.ts               # Lam operator + superadmin + tax rates + demo fleet/hotels/etc.
scripts/                # apply-rls.mjs, apply-sequences.mjs, create-staff-user.ts,
                        #   set-staff-password.ts, reset-all-users.ts,
                        #   register-qstash-schedule.ts
tests/                  # Vitest: RLS cross-tenant (one file per tenant table),
                        #   RBAC, money, domain tests per module, api/ (route-level)
e2e/                    # Playwright: smoke, staff-dashboard, guest-checkout, fleet,
                        #   departures — has its own CI job (own Postgres bootstrap)
docs/decisions/         # DECISION_LOG.md — the DR-007 living record (canonical)
docs/design-package/    # NOT in repo yet — see the note under Living-document mandate
docs/openapi.yaml       # keep current with routes
.github/                # CI workflow + PR template (enforces the DR gate)
```

**New module = copy the `auth/` shape:** `domain.ts` (pure types/rules, no
framework/DB) · `repository.ts` (only place touching Prisma for that module,
omitted for modules that own no table, e.g. `notifications`/`insights`/
`tracking`) · `service.ts` (business logic) · `index.ts` (public interface —
the only thing other modules may import).

**Module dependency direction matters.** `itinerary` depends on `booking`/
`assignment`/`catalog`; `booking` never depends on `itinerary` (that would be
circular) — any orchestration needing both happens one level up, in a Server
Action or route handler, not inside either module's service.

---

## Commands

| Script | Purpose |
|--------|---------|
| `npm run dev` / `build` / `start` | Next.js |
| `npm run lint` / `typecheck` | ESLint / `tsc --noEmit` |
| `npm test` / `test:watch` / `test:coverage` | Vitest (unit + RLS) |
| `npm run test:e2e` | Playwright |
| `npm run db:push` | Sync Prisma schema → DB |
| `npm run db:sequences` | Apply `prisma/sequences.sql` (booking/package reference sequences) |
| `npm run db:rls` | Apply `prisma/rls.sql` |
| `npm run db:seed` | Seed Lam org + superadmin + tax rates + demo data |
| `npm run db:setup` | push + sequences + rls + seed, in that order |
| `npm run staff:create` / `staff:set-password` | `scripts/create-staff-user.ts` / `set-staff-password.ts` |
| `npm run users:reset-all` | `scripts/reset-all-users.ts` — **destructive**, confirm with the user first |
| `npm run qstash:register-schedule` | One-time: registers the real QStash cron schedule against a deployed URL |

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
- **RBAC** (`src/lib/rbac.ts`) is the app-layer source of truth; RLS is
  defense in depth. Every API route declares a required permission; unmapped
  routes fail closed. Re-check object ownership in services (anti-BOLA).
  What a role grants is **DB-backed** (`RolePermission` table, global, no
  RLS — same precedent as `TaxRate`) and editable at runtime by SUPERADMIN
  via `/staff/admin/permissions`. `SUPERADMIN` is the one hardcoded,
  permanently-uneditable wildcard (`can`/`assertCan` short-circuit true for
  it, never consulting the DB) — every other role, including
  `PLATFORM_ADMIN`, is fully DB-editable. `can`/`assertCan` take a
  `PermissionSource` (`{ roles, permissions }`), resolved once per request in
  `authService.resolveSession`. `rbac.ts`'s `DEFAULT_PERMISSIONS` is the
  one-time seed source (`prisma/seed.ts`), not consulted live. **Adding a
  new permission requires a `db:seed` re-run** to actually grant it to any
  role — the code-level union alone grants nothing.
  Several permissions (`booking.delete`, `fleet.delete`,
  `country_regulation.write`, `finance_config.write`,
  `platform_settings.write`) are **never seeded to any role**, gated instead
  by a hardcoded `SUPERADMIN`-only check one layer below the route/service
  permission gate (`isBookingDeleter`, `isFleetDeleter`,
  `isCountryRegulationWriter`, `isFinanceConfigWriter`,
  `requireSettingsWriter`) — granting the bare permission via the runtime
  matrix editor would still not unlock the action for anyone but SUPERADMIN.
- **Launch tenancy (DR-005):** single operator **Lam** (Namibia + DRC), seeded
  as `lam@polcotours.com` with role `SUPERADMIN` (PLATFORM_ADMIN + own-org
  TOUR_OPERATOR). Multi-tenant isolation stays on so more operators can onboard
  with no migration.
- **Money (BR-02):** integer minor units + ISO-4217 code, never floats; FX rate
  snapshotted per transaction. Currencies: USD, EUR, NAD, CDF — **no FX
  conversion anywhere in this app**; never rank/compare/sum across
  currencies. Helpers in `src/lib/money.ts`.
- **Tax (DR-006 / BR-01):** per-country, effective-dated. Never hardcode a
  flat rate — read `tax_rates` via `src/lib/tax.ts`.
- **Documents (passports/visas):** object storage + short-lived authenticated
  streaming route + access logging; DB stores references only. Passports
  implemented via Vercel Blob `access: 'private'` — no retention-limit job
  exists yet. Visa decision documents are still Phase 2.
- **Audit (NFR-07):** append-only `audit_logs` (UPDATE/DELETE denied at DB).
  Log payments, document access, role/permission changes, assignments, visa
  decisions. Reads are RLS-protected too — go through `withOrg`, not the raw
  admin client.
- **Errors:** RFC 9457 `application/problem+json` via `src/lib/errors.ts`. No
  internals/stack traces to clients.
- **i18n:** full EN + FR parity for every user-facing string on the guest
  site (partial coverage today — Nav/Footer/HomePage only).

---

## Domain & regulatory context (Namibia, DRC, Zambia & Zimbabwe)

Why the app is shaped the way it is — and the real-world rules any feature
touching operators, vehicles, guides, visas, or destinations must respect.
**All figures are effective-dated and change often; never hardcode them —
verify against NTB/MEFT (Namibia), ICCN/Ministry of Tourism (DRC), and the
relevant Zambia/Zimbabwe authorities/embassies. Treat this as orientation,
not legal ground truth.**

**Four regimes, one platform.** Namibia, the DRC, Zambia, and Zimbabwe have
very different tourism governance. This is the reason for per-country tax,
per-country operator compliance (BR-12), country-scoped visa applications
(`VisaApplication.country`), EN/FR bilingual content, and packages priced in
one of four currencies with **no FX conversion anywhere**.

**Country Regulations (`immigration` module) is the structured source of
truth going forward** for visa requirements, required documents, processing
times, entry conditions, immigration fees, embassy details, health
requirements, travel advisories, and special restrictions, one row per
country — staff-editable at `/staff/country-regulations`
(`SUPERADMIN`-only write). The bullets below are general-knowledge starting
points, not verified against each country's actual immigration authority —
correct them in the UI, not by hand-editing this file or `seed.ts`.

- **Namibia — operator & fleet compliance (feeds `fleet`/`documents`).**
  Operators register with the **Namibia Tourism Board (NTB)** (Act 21/2000):
  NTB licence + **BIPA** Certificate to Commence Business + **NamRA** tax
  registration + public/passenger liability insurance. Vehicles need
  roadworthiness certificates, company name on both sides, fire extinguisher
  + first-aid kit, and an **NTB inspection disc**; drivers carrying paying
  passengers need a **Professional Driving Permit (PDP)**. Foreign guides
  need a work permit. → These map directly to the compliance `Document`
  kinds the fleet module tracks (registration, insurance, inspection,
  licence) and their `expiresAt`.
- **Namibia — visas (feeds `visa`).** The regime changed in 2025: 33
  previously visa-exempt nationalities (incl. US/UK/EU/Canada/Australia) now
  need an e-visa / visa-on-arrival. Rules shifted **twice** in 2025 — model
  visa requirements as effective-dated data, never a hardcoded nationality list.
- **DRC — no central tourism board (feeds `fleet`/`visa`/BR-12).** Operators
  navigate several bodies: **DARA** business licence + **DGI** tax
  registration + **ICCN** authorization for any park operation + a Ministry
  of Tourism Competence Certificate; foreign operators must work through a
  licensed local **DMC**; immigration is **DGM**. Parks (Virunga,
  Kahuzi-Biéga, Salonga…) are ICCN-managed; gorilla permits run through ICCN
  / the Virunga Foundation.
- **DRC — security zones (BR-07, a hard product rule).** Eastern DRC is under
  active conflict. Zone posture (2025): Kinshasa & western DRC generally
  accessible; Congo River basin accessible with experienced operators;
  **North Kivu (incl. Virunga) high-risk / specialist only**; **South Kivu
  elevated**; **Ituri — do not operate**; **Kasai — elevated**. Any booking
  into a flagged province must carry a current security assessment and show
  a mandatory advisory to the traveler; the platform may block sales per
  admin policy. **Not yet implemented in code** — departures have no
  location/region field yet; this is where BR-07 gets enforced once they do.
- **Guest health/logistics (for briefings, not yet modeled).** Malaria risk in
  northern Namibia (Etosha/Caprivi/Kavango) and much of the DRC; yellow-fever
  proof if arriving from an endemic country; gorilla trekking has strict rules
  (accredited local guide, ~8/group, 7 m distance, no flash, sick visitors may
  not trek).

**Implication for engineering:** compliance data is documents-with-expiry, not
free text; visa and immigration flows are country-scoped; destination risk is
a first-class booking concern once departures carry a region. If you're
building anything in `fleet`, `visa`, `catalog` (destinations), or booking
eligibility, re-read this section and prefer configurable/effective-dated
data over constants.

---

## Security posture (CIA · STRIDE · OWASP)

The reference frame for the six-question gate's **security impact** answer.
Every feature states its abuse cases; every new tenant table gets an RLS
policy + a cross-tenant test; every new external service is schema-validated,
timed out, and degrades gracefully.

**Crown-jewel assets (highest protection):**
- Passport / visa / ID documents (`documents`, `visa`) — private Vercel Blob,
  authenticated+audited streaming route, never a public URL; data-minimized
  facilitator/officer projections.
- Payment integrity (`invoicing`) — server-computed amounts only; when DPO
  lands, `verifyToken` is the sole source of truth, with idempotency.
- Tourist physical-safety data — itineraries, traveler manifest,
  disabilities/allergies, GPS (Phase 2). Minimize exposure; guide/facilitator
  views see only what their duty needs.
- Credentials & sessions (`auth`) — better-auth, httpOnly cookies, a real
  30-minute inactivity session timeout (`{expiresIn: 30m, updateAge: 30m}`,
  applied globally including anonymous guest-checkout sessions); anonymous
  guest sessions are real sessions, not bare ids.
- Tenant business data — organization-scoped, RLS-isolated.

**STRIDE → controls in place:**
- **Spoofing** → better-auth + email verification; auth sign-in/sign-up
  rate-limited (`/sign-in/email` 5/min, `/sign-up/email` 3/min), real
  Redis-backed in production.
- **Tampering** → prices/tax/state computed server-side only (charter rule 1);
  `verifyToken` authority for payments once DPO is live.
- **Repudiation** → append-only `audit_logs` (UPDATE/DELETE denied at the DB);
  log payments, document access, role changes, assignments, visa decisions.
- **Information disclosure** → RLS (FORCE) + anti-BOLA object-ownership checks
  (404-not-403 convention) + private Blob; problem+json leaks no internals.
- **Denial of service** → the public guest lookups (find-booking,
  rating-code) are rate-limited via `src/lib/rate-limit.ts`, real
  Redis-backed in production. Per-class rate limiting beyond these two
  lookups and the auth endpoints above is still not built.
- **Elevation** → fail-closed RBAC (`src/lib/rbac.ts`), unmapped routes
  denied; `SUPERADMIN`/`admin.all` actions are audited. The permission
  matrix itself is a runtime-editable, SUPERADMIN-only attack surface — a
  role-identity check (`isSuperAdmin`), not just a permission, gates who can
  write it, and SUPERADMIN's own access can never be edited away.

**OWASP focus for this app:** BOLA is the #1 marketplace risk — every
read/write re-checks object ownership *and* is backstopped by RLS, with
dedicated `*.security.test.ts` files and per-table cross-tenant RLS tests.
Security headers are set in `next.config.mjs` (CSP/HSTS/frame-deny).
Third-party responses (DPO, WhatsApp, SMS) must be schema-validated and
quarantined, never trusted or rendered raw.

**Compliance posture:** DPO's hosted page keeps card handling in **PCI
SAQ-A** (no PAN ever touches our servers). **GDPR** is the platform-wide
standard (EU tourists are a core segment). Document retention limits and a
DSAR/erasure workflow are still TODO.

**When you add …**
- a tenant table → RLS policy in `prisma/rls.sql` + `npm run db:rls` + a
  `rls.cross-tenant.<table>.test.ts`.
- an external integration → gateway interface, env-gated, timeout + graceful
  degradation, schema-validate the response, and a DR entry.
- a new permission or role-scoped route → update `rbac.ts`, run
  `npm run db:seed` to actually grant it, add a `*.security.test.ts`
  asserting the denied cases (cross-tenant + wrong-role).

---

## Design system

Identity is **"Meridian Cartography"** (survey-line precision, expedition
palette). Tokens in `tailwind.config.ts`: navy `#152238`, dune amber
`#C97B2D`, forest `#2E5B41`, bone `#F7F4EE`, mist, ink, rule. Keep product
surfaces visually coherent with the design package.

---

## Current architecture summary

- **Roles** (`Role` enum): `SUPERADMIN`, `PLATFORM_ADMIN`, `TOUR_OPERATOR`,
  `TOUR_GUIDE`, `DRIVER`, `VEHICLE_OWNER`, `VISA_FACILITATOR`, `TOURIST`. A
  user can hold several simultaneous roles via `Membership` (union
  permission semantics). `TOURIST` never gets staff dashboard access; every
  other role passes the `isStaffRole` baseline gate, then each page/route
  gates on its own specific permission.
- **Booking lifecycle** (`BookingStatus`, 11 values): `DRAFT` →
  `AWAITING_QUOTATION`/`AWAITING_DEPOSIT` → `DEPOSIT_PAID`/`FULLY_PAID` →
  `CONFIRMED` → `IN_PROGRESS` → `COMPLETED`, with `CANCELLED`/`REFUNDED` as
  terminal exits. `DRAFT` is currently unreachable in practice but kept in
  the enum (harmless). Two origins (`BookingOrigin`): `PREDEFINED_PACKAGE`
  (guest picks a start date, server creates a fresh `Departure` from
  `TourPackage.durationDays`) and `TAILOR_MADE` (guest's `/plan-my-trip`
  9-step wizard request, staff quotes a price afterward).
  `bookingReference` (6-char pattern code) is the sole guest-facing lookup
  key (paired with the tour lead's last name at `/find-booking`) —
  `confirmationCode` was removed entirely.
- **Guest site** (`(guest)/`) has no tourist accounts, ever — bookings ride
  better-auth's `anonymous` plugin. Every booking (from guest package
  browse, guest `/plan-my-trip`, or staff's own "New Booking" flow) shows up
  on `/staff/bookings`, filterable by status/origin — there is no separate
  "pending inquiry" or "quote request" queue.
- **Staff dashboard** (`staff/(dashboard)/`) is one shell with a shared
  `BackButton` and a Settings sidebar grouping the admin-facing pages
  (country regulations, operational rates, insights, users, permissions,
  clients, tax/platform rates, profile).
- **Itinerary vs. Assignment**: `Itinerary`/`ItineraryDay` (the day-by-day
  operational plan, 1:1 with a Booking) is a distinct concept from
  `Assignment` (which vehicle/driver/guide serves a `Departure` — shared
  across every booking on that departure). The `itinerary` module composes
  `assignment`'s data rather than duplicating it.
- **Two separate ratings systems**: `ratings` module (tourist-facing
  driver/guide/agency reviews via a single-use Rating Code) and
  `itinerary` module's `HotelRating`/`RestaurantRating` (staff-only,
  overwritten per rater, not tourist-facing).
- **Notifications** fall back WhatsApp → SMS → email, real (not permanently
  stubbed) HTTP adapters behind a shared gateway interface, each degrading
  gracefully to "unavailable" when unconfigured. See Open Items for current
  per-channel credential status.
- **Soft-delete + SUPERADMIN-only hard gates**: `Booking` (90-day retention
  purge via the lazy sweep / QStash job), `Vehicle`/`DriverProfile`/
  `GuideProfile` (indefinite, no purge). `StarlinkKit` is a genuine hard
  delete (confirmed no FK references it). All gated by a `SUPERADMIN`-only
  service-layer check beneath the route permission, never by the bare
  permission alone.
- **No scheduled-job infrastructure exists beyond the one QStash-triggered
  sweep** (`/api/jobs/sweep-bookings`, every 15 minutes in production) — any
  future periodic task needs its own route + schedule registration, there is
  no generic job runner.

## Roadmap (not yet built)

- **Phase 1 remainder:** real DPO payment integration (OI-01, blocked on
  commercial terms), WhatsApp notifications (OI-06).
- **Phase 2 remainder:** real Starlink API integration for live fleet
  location (OI-09, currently staff-entered only), CRM.
- **Phase 3:** real ML/AI-driven assignment recommendation and analytics
  (the current `assignmentService.recommendAssignment` is an honest,
  explicitly-labeled rules-based scorer, not AI) — document
  retention/DSAR-erasure workflow, BR-07 security-zone enforcement (needs a
  departure region field first).
- **Phase 4:** native Android/iOS, additional countries.
- **Deliberately deferred, not forgotten:** a Content module for the
  schema-only `SiteContent`/`FaqEntry` tables (would replace the hardcoded
  guest About/FAQ pages); deduplicating the hand-copied
  `CANCELLABLE_STATUSES` arrays across booking-detail pages; removing the
  unreachable `DRAFT` `BookingStatus` value (blocked on cleaning up leftover
  `DRAFT` test-fixture rows in the shared DB, including one in the real
  "Lam" org).

Full roadmap and testing strategy: Volume 10 (design package, not yet in repo).

---

## Open items — cannot be decided in code

Surface these to the human — don't invent answers.

- **OI-01** DPO written commercial terms (fee %, EUR support, DRC/Namibia
  mobile money, settlement SLA, rolling-reserve %). Blocks real payment
  processing; DPO stays stubbed behind `PaymentGateway`.
- **OI-02** Trademark clearance for "polcotours"/"POLCO TOURS" in NA + DRC
  (existing Greek tourism brand + US "Polco"). Blocks public launch.
- **OI-03** Lam per-market legal registrations (Namibia NTB/BIPA/NamRA; DRC
  DARA/DGI/Ministry of Tourism). Blocks go-live.
- **OI-05** Resend email: API key is real and live, but **the account has no
  verified sending domain** — Resend sandboxes delivery to only the account
  owner's own address (`cyberpolco@gmail.com`). Any other recipient 403s.
  Real end-to-end email testing only works when the guest-typed contact
  email IS `cyberpolco@gmail.com`. Fix requires verifying a domain (e.g.
  `polcotours.com`) at resend.com/domains — an external DNS/account action.
- **OI-06** WhatsApp Cloud API access (Meta Business verification, phone
  number) — not yet configured. Blocks real WhatsApp notifications.
- **OI-07** Africa's Talking SMS: confirmed live and working, but the
  account balance is very low (`USD 0.0621` as of last check) — likely good
  for only 1-2 real sends before it starts failing (gracefully). Top up
  before relying on this in practice.
- **OI-09** Real Starlink API/account access (live kit location feed).
  `StarlinkKit.lastLatitude`/`lastLongitude` is staff-entered for now.
  Blocks real-time fleet location tracking.
- **OI-12** (new, DR-069) No destination/hotel/package photography exists or
  is licensed. `TourPackage.imageUrl` ships with every package `null` and an
  illustrated gradient fallback (`PackageImage`) until real photos are
  sourced — either operator-supplied or a licensed stock budget. Don't
  fabricate or scrape images to fill this.

**Resolved:** OI-04 (object storage → Vercel Blob), OI-08
(`BLOB_READ_WRITE_TOKEN` provisioned), OI-10 (Upstash Redis — real
credentials live in production since 2026-07-22), OI-11 (Upstash QStash —
real credentials + registered schedule live in production since
2026-07-22). See `docs/decisions/DECISION_LOG.md` for how each was closed.

---

## Gotchas — persistent environment/process quirks

These are still-relevant patterns, not one-off incident reports. Full
incident history (including two production `users`-table wipes since fixed)
lives in `docs/decisions/DECISION_LOG.md` and git history.

- **Prisma's query engine intermittently can't reach the Neon pooler from a
  sandbox, while `psql` on the same credentials connects fine.** Treat as
  transient and retry rather than assuming a real outage. It has also been
  observed to fail *only inside `vitest run`* while a bare `tsx` script
  against the identical `PrismaClient`/`DATABASE_URL` connects immediately —
  sanity-check with a bare script before concluding code or DB is broken.
- **Neon's default `neondb_owner` role has `BYPASSRLS`** — connecting the
  app/tests through it silently no-ops every RLS policy (`FORCE ROW LEVEL
  SECURITY` doesn't help; `BYPASSRLS` overrides `FORCE`). Runtime/tests/seed
  must use the least-privilege `polco_app` role instead (`NOSUPERUSER
  NOBYPASSRLS`, direct object grants — Neon blocks `GRANT neondb_owner TO
  polco_app`). `polco_app` isn't an owner, though, so `db:push`/`db:rls`
  still need `neondb_owner`'s connection string — there is currently no
  single credential that does both.
- **A failed test `beforeAll` can silently wipe an entire unscoped table.**
  Prisma drops `undefined`-valued `where` keys, so a fixture cleanup like
  `deleteMany({ where: { organizationId: orgId } })` becomes an unscoped
  `deleteMany({})` if `orgId` was never assigned (setup threw first) —
  catastrophic for a table with no RLS, like `users`. Every `afterAll` that
  scopes a delete by a `beforeAll`-assigned id must guard with
  `if (!id) { await admin.$disconnect(); ...; return; }` before running any
  scoped delete. Apply this convention to any new fixture file.
- **A pure-domain/rbac unit test can go stale silently after an `rbac.ts` or
  enum change**, with nothing catching it until someone actually runs the
  file — `tsc`/lint don't catch factually-wrong-but-well-typed assertions.
  Run `tests/rbac.test.ts` specifically after any `rbac.ts` edit; grep
  `tests/` **and** `e2e/` (separate CI jobs, a green "quality" job tells you
  nothing about E2E) for the affected role/format whenever a permission or a
  generated field's shape changes.
- **A `vi.fn()` mock's return value bypasses `tsc` entirely** — a fixture
  passed to `.mockResolvedValue({...})` is never checked against the real
  return type. After a type/shape rename (e.g. `AuthContext`), grep `tests/`
  for the old field name directly rather than trusting a clean
  `tsc --noEmit` to have caught every mocked call site.
- **Schema changes to the shared Neon DB are applied by hand** (via a
  user-pasted `neondb_owner` credential, never written to a file) using
  `db push` + `db:rls`/`db:sequences` as needed, then verified via `psql`.
  There is no separate staging environment (DR-005, single-tenant launch) —
  changes go straight to the one shared dev/production database with
  explicit user confirmation first.
- **A brand-new permission needs a `db:seed` re-run to actually grant it
  live** — since permissions are DB-backed (`RolePermission`), adding one to
  `rbac.ts` alone changes nothing until the seed's upsert runs.
- **`@visx/responsive`'s `ParentSize` collapses to 0 height if you only
  give it a Tailwind height class** — its own inline `style={{height:
  '100%'}}` wins over any CSS class. Pass `style={{ height: N }}` as a prop
  instead, and check for `height === 0` (not just `width === 0`) before
  rendering measured content.
- **better-auth's adapter silently drops any `User` column not declared in
  `authConfig.user.additionalFields`** — a `databaseHooks` hook can compute
  a value and merge it into the create payload, but if the field isn't
  registered, it's discarded right before the Prisma write with no error.
  `organizationId` is registered (`input: false`, server-only); any *new*
  custom `User` column a hook needs to set must be registered the same way.
- **A bare `.click()` on a Server Action form immediately followed by a
  non-navigation assertion can race and abort the navigation** in
  Playwright/Chromium. Prefer `await Promise.all([page.waitForURL(...),
  button.click()])` over a bare click whenever the next assertion doesn't
  already retry-until-navigated.
- **A disposable local Postgres needs no sudo/Docker** for reproducing a
  CI-only e2e failure without touching the shared Neon DB: `initdb` into a
  scratch dir, `pg_ctl start` with a short `-k` socket dir (Unix socket path
  cap is 107 bytes), then run the same `db:push`/`db:sequences`/`db:rls`/
  `db:seed` sequence CI does. Re-running e2e against the same un-reset
  local DB across attempts accumulates fixture rows with no dedup — use
  `db push --force-reset` or a fresh `initdb` between attempts.
- Missing `package-lock.json` breaks `npm ci` + Actions npm cache — keep it
  committed and in sync.
- `apply-rls.mjs`/`apply-sequences.mjs` strip SQL comments before splitting
  on `;` — don't reintroduce naive comment-then-split ordering.
- Next.js 15's `after()` throws synchronously outside Next's own request
  pipeline — this repo's `tests/api/*.test.ts` call route handlers directly,
  bypassing that pipeline, so `after()` can't be used in any
  `src/modules/*/service.ts`. Use a plain `await` for fire-and-forget side
  effects instead.
- `prisma/seed.ts` seeds Lam with no password (no credential `Account` row)
  — never hardcode a test password there; it runs against the real shared
  DB via `db:setup`. For a real credentialed e2e login, create a throwaway
  user via `auth.api.signUpEmail` (see `e2e/helpers/staff-user.ts`).
  Currently only `cyberpolco@gmail.com` (bootstrap SUPERADMIN) has a real
  password set among seeded fixture-style accounts — "incorrect password"
  for any other account usually means it has no credential `Account` row at
  all, not a wrong password.
- e2e fixtures for tenant-scoped tables **must** be seeded through
  `withOrg(...)`, never a raw unscoped `prisma.create` — RLS is live for the
  app under test in CI.
