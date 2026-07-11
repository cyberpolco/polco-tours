# CLAUDE.md — POLCO TOURS

Persistent brief for Claude Code. Read this first, every session. It encodes the
engineering charter, the current state, and the rules that must not be broken.

POLCO TOURS is a **Tourism Operating System** for **Namibia** and the
**Democratic Republic of Congo (DRC)** — tour package sales plus operations
management (tourists, operators, guides, drivers, vehicle owners, hotels,
restaurants, visa facilitators, immigration officers). Web platform first;
native apps later. Brand: **polcotours** (`polcotours.com`).

> Last updated: 2026-07-11, against repo HEAD `e3c0192` (Phase 2 Increment 3
> complete, DR-019). This revision fixes the design-package reference below and
> adds two grounded sections: **Domain & regulatory context** and **Security
> posture**.

The governance record in `docs/decisions/DECISION_LOG.md` is the **canonical,
in-repo source of truth** and must be kept current (DR-007). The 11-volume
design package it references (Volumes 1–11) currently lives **outside the repo**
as a delivered master PDF — it is **not yet** in `docs/design-package/`. Until
those volumes are added as markdown, a DR's "Affects: Vn" tags cannot be applied
to real files, so treat the decision log as authoritative and, when the log and
the code disagree, fix one of them in the same PR. (See the note at the end of
"Open items" about adding the volumes so the DR-007 loop is whole again.)

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

## Tech stack (approved — DR-001, DR-004, DR-010)

| Layer | Choice |
|-------|--------|
| Framework | Next.js `15.5.20` (App Router, TypeScript), React 19 |
| Hosting / CI | Vercel, deployed from GitHub. Region `fra1` (near EU data) |
| Database | Neon PostgreSQL (EU region), Prisma `5.22.0` |
| Auth | better-auth `1.6.23`, self-hosted (data in our DB) |
| Validation | zod `4.4.3` |
| Object storage | Vercel Blob, region `fra1` — wired for passports (DR-015); visa docs land in Phase 2 |
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
    api/v1/health/                        # liveness probe
    api/v1/catalog/packages/...           # catalog module routes
    api/v1/departures/[departureId]/...   # departure detail + availability
    api/v1/bookings/...                   # booking module routes
    api/v1/bookings/[bookingId]/invoice   # invoicing module routes (DR-012)
    api/v1/bookings/[bookingId]/travelers, /travelers/[travelerId]/passport,
      /addons                             # booking-setup wizard routes (DR-015)
    api/v1/invoices/[invoiceId]/payments  #   ...
    api/v1/payments/[paymentId]/resolve   #   ...
    api/v1/users/me                       # profile self-service (DR-013)
    api/v1/fleet/vehicles(/[vehicleId](/documents(/[documentId]))),
      api/v1/fleet/drivers(/[driverProfileId](/documents(/[documentId])))
                                           # fleet + compliance (DR-017)
    api/v1/departures/[departureId]/assignments, api/v1/assignments/
      [assignmentId], api/v1/assignments/mine
                                           # assignments (DR-018)
    api/v1/bookings/[bookingId]/travelers/[travelerId]/visa(/submit,/decide,
      /document), api/v1/immigration/visa-applications,
      api/v1/immigration/officers, api/v1/users/[userId]/assign-country
                                           # visa documents (DR-019) + officer
                                           #   listing (DR-020)
    api/auth/[...all]/                    # Better Auth's own mount (DR-014)
    staff/login, staff/forbidden          # outside the auth gate (DR-014)
    staff/(dashboard)/...                 # staff pilot dashboard (DR-014);
      baseline gate is "any staff role" (isStaffRole), not one hardcoded
      permission, since DR-020 -- StaffNav filters links per-role
      bookings/[bookingId]/{travelers/new,passport,addons} = setup wizard (DR-015)
      fleet(/vehicles(/new|/[vehicleId]),/drivers(/new|/[driverProfileId]))
        = fleet + compliance (DR-017)
      departures(/[departureId]) = browse + manage assignments (DR-018;
        first staff departures UI -- packages/departures were API-only before)
      immigration = IMMIGRATION_OFFICER's own country-scoped visa queue,
        strictly read-only (BR-10, DR-020)
      admin/officers = admin-only: assign/reassign an officer's country
        (DR-020; account creation itself stays CLI-only)
    (guest)/...                          # tourist self-serve site, NO ACCOUNTS
      (DR-016) -- /, /packages(/[packageId]), /quiz(/results), /book/[departureId]
      (anonymous sign-in), /booking/[bookingId]/{travelers/new,passport,addons}
      (same wizard as staff's, requireGuestContext instead), /find-booking(/result)
  lib/                 # shared kernel: db, auth, auth-client, rbac, errors,
                       #   money, audit (+countRecentAuditEvents, DR-016),
                       #   logger, route-guard (withAuth: HTTP routes),
                       #   staff-guard (requireStaffContext, DR-014),
                       #   guest-guard (requireGuestContext, DR-016),
                       #   primary-org (getPrimaryOrgId, DR-016),
                       #   country-codes (phone/flag + nationality picker
                       #   data, no dependency, DR-015)
  modules/             # feature modules — independent, reusable (Vol. 5 §5.2)
    auth/              # REFERENCE module: domain · repository · service · index
    catalog/           # TourPackage (+tags/PackageTag, DR-016) + Departure +
                       #   AddonService (DR-011, DR-015); public/quiz methods
                       #   need no ctx (DR-016)
    booking/           # Booking, incl. holds (status=HELD + holdExpiresAt) +
                       #   confirmationCode (DR-016); Traveler + BookingAddon
                       #   folded in (DR-011, DR-015)
    invoicing/         # Invoice + Payment (stubbed DPO gateway) (DR-012)
    notifications/     # WhatsApp→SMS→email fallback, no repository.ts (DR-013)
    documents/         # Document metadata + Vercel Blob gateway, access:
                       #   'private' (DR-015; first real DR-010 usage);
                       #   generalized uploadDocument (kind-based validation
                       #   table + expiresAt/vehicleId/driverProfileId) DR-017
    fleet/             # Vehicle + DriverProfile (compliance docs via
                       #   documents module), complianceStatus rule (DR-017);
                       #   linked to Departure via Assignment (DR-018)
    assignment/        # Assignment (Departure -> vehicle/driver/guide),
                       #   departuresOverlap double-booking rule (DR-018);
                       #   no self-service portal yet for guide/driver/
                       #   vehicle-owner roles (staff-managed only)
    visa/              # VisaApplication (per Traveler, SUBMITTED ->
                       #   APPROVED/REJECTED), canDecide rule, OfficerVisaView
                       #   (data-minimized, country-scoped) (DR-019); traveler
                       #   identity snapshotted so IMMIGRATION_OFFICER's list
                       #   never needs booking.read; listForCountry now
                       #   audits an officer's own reads (DR-020, BR-10)
  middleware.ts        # trace id + locale (rate limit hook in a later increment)
prisma/
  schema.prisma        # data model
  rls.sql              # Row-Level Security policies (applied AFTER db push)
  seed.ts              # Lam operator + superadmin + per-country tax
scripts/apply-rls.mjs  # runs rls.sql
tests/                 # Vitest: RLS cross-tenant (one file per tenant table),
                       #   RBAC, money, catalog/booking domain, api/ (route-
                       #   level, real session via tests/helpers/test-auth.ts)
e2e/                   # Playwright: smoke + staff-dashboard (DR-014, has its
                       #   own CI job -- Postgres bootstrap isn't shared with
                       #   the `quality` job)
docs/decisions/        # DECISION_LOG.md (DR-007 living record)
docs/design-package/   # NOT in repo yet — the 11 volumes belong here as
                       #   markdown so DR "Affects: Vn" tags become real (see
                       #   the note under Open items); master PDF delivered
                       #   separately for now
docs/openapi.yaml      # started in DR-011's PR — keep it current with routes
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
  Passports implemented (DR-015, `src/modules/documents/`) via Vercel Blob
  `access: 'private'` + an authenticated streaming route — no retention-limit
  job exists yet. Visa documents are still Phase 2.
- **Audit (NFR-07):** append-only `audit_logs` (UPDATE/DELETE denied at DB).
  Log payments, document access, role/permission changes, assignments.
- **Errors:** RFC 9457 `application/problem+json` via `src/lib/errors.ts`. No
  internals/stack traces to clients.
- **i18n:** full EN + FR parity for every user-facing string.
- **Immigration Officer:** strictly read-only, country-scoped, every view
  audited (BR-10).

---

## Domain & regulatory context (Namibia & DRC)

Why the app is shaped the way it is — and the real-world rules any feature
touching operators, vehicles, guides, visas, or destinations must respect.
**All figures are effective-dated and change often; never hardcode them —
verify against NTB/MEFT (Namibia), ICCN/Ministry of Tourism (DRC) and the
relevant embassies. Treat this as orientation, not legal ground truth.**

**Two regimes, one platform.** Namibia and the DRC have very different tourism
governance. This is the reason for per-country tax (DR-006), per-country
operator compliance (BR-12), `IMMIGRATION_OFFICER.assignedCountry` scoping
(DR-019), EN/FR bilingual content, and packages priced in one of four
currencies with **no FX conversion anywhere** (never rank/compare by price
across currencies — see `scorePackagesForQuiz`).

- **Namibia — operator & fleet compliance (feeds `fleet`/`documents`, DR-017).**
  Operators register with the **Namibia Tourism Board (NTB)** (Act 21/2000):
  NTB licence (fee N$1,000 + N$400/vehicle) + **BIPA** Certificate to Commence
  Business + **NamRA** tax registration + public/passenger liability insurance.
  Vehicles need roadworthiness certificates, company name on both sides, fire
  extinguisher + first-aid kit, and an **NTB inspection disc**; drivers carrying
  paying passengers need a **Professional Driving Permit (PDP)**. Foreign guides
  need a work permit. → These map directly to the compliance `Document` kinds
  the fleet module tracks (registration, insurance, inspection, licence) and
  their `expiresAt`.
- **Namibia — visas (feeds `visa`, DR-019).** The regime changed in 2025: 33
  previously visa-exempt nationalities (incl. US/UK/EU/Canada/Australia) now
  need an e-visa / visa-on-arrival. Rules shifted **twice** in 2025 — model
  visa requirements as effective-dated data, never a hardcoded nationality list.
- **DRC — no central tourism board (feeds `fleet`/`visa`/BR-12).** Operators
  navigate several bodies: **DARA** business licence + **DGI** tax registration
  + **ICCN** authorization for any park operation + a Ministry of Tourism
  Competence Certificate; foreign operators must work through a licensed local
  **DMC**; immigration is **DGM**. Parks (Virunga, Kahuzi-Biéga, Salonga…) are
  ICCN-managed; gorilla permits run through ICCN / the Virunga Foundation.
- **DRC — security zones (BR-07, a hard product rule).** Eastern DRC is under
  active conflict. Zone posture (2025): Kinshasa & western DRC generally
  accessible; Congo River basin accessible with experienced operators; **North
  Kivu (incl. Virunga) high-risk / specialist only**; **South Kivu elevated**;
  **Ituri — do not operate**; **Kasai — elevated**. Any booking into a flagged
  province must carry a current security assessment and show a mandatory
  advisory to the traveler; the platform may block sales per admin policy.
  When departures gain a location/region field, this is where BR-07 gets
  enforced in code — it is not yet implemented.
- **Guest health/logistics (for briefings, not yet modeled).** Malaria risk in
  northern Namibia (Etosha/Caprivi/Kavango) and much of the DRC; yellow-fever
  proof if arriving from an endemic country; gorilla trekking has strict rules
  (accredited local guide, ~8/group, 7 m distance, no flash, sick visitors may
  not trek).

**Implication for engineering:** compliance data is documents-with-expiry, not
free text; visa and immigration flows are country-scoped; destination risk is a
first-class booking concern once departures carry a region. If you're building
anything in `fleet`, `visa`, `catalog` (destinations), or booking eligibility,
re-read this section and prefer configurable/effective-dated data over constants.

---

## Security posture (CIA · STRIDE · OWASP)

The reference frame for the six-question gate's **security impact** answer.
Every feature states its abuse cases; every new tenant table gets an RLS policy
+ a cross-tenant test; every new external service is schema-validated, timed
out, and degrades gracefully. The habit to keep: DR-016 ran an **adversarial
review that killed an insecure design before code was written** — do that.

**Crown-jewel assets (highest protection):**
- Passport / visa / ID documents (`documents`, `visa`) — private Vercel Blob,
  authenticated+audited streaming route, never a public URL; data-minimized
  officer projections (`OfficerVisaView`). Retention-limit job still TODO.
- Payment integrity (`invoicing`) — server-computed amounts only; when DPO
  lands (OI-01), `verifyToken` is the sole source of truth, with idempotency.
- Tourist physical-safety data — itineraries, traveler manifest, disabilities/
  allergies, GPS (Phase 2). Minimize exposure; officer/guide views see only
  what their duty needs.
- Credentials & sessions (`auth`) — better-auth, httpOnly cookies, session
  timeouts; anonymous-guest sessions are real sessions, not bare ids.
- Tenant business data — organization-scoped, RLS-isolated.

**STRIDE → controls already in place (or the plan):**
- **Spoofing** → better-auth + email verification; add auth rate-limit/lockout.
- **Tampering** → prices/tax/state computed server-side only (charter rule 1);
  `verifyToken` authority for payments once DPO is live.
- **Repudiation** → append-only `audit_logs` (UPDATE/DELETE denied at the DB);
  log payments, document access, role changes, assignments, visa decisions.
- **Information disclosure** → RLS (FORCE) + anti-BOLA object-ownership checks
  (404-not-403 convention) + private Blob; problem+json leaks no internals.
- **Denial of service** → per-class rate limiting is **not yet built** (only the
  crude audit-log-backed limiter on booking lookup, DR-016); real Upstash
  rate-limiting is a known gap.
- **Elevation** → fail-closed RBAC (`src/lib/rbac.ts`), unmapped routes denied;
  `SUPERADMIN`/`admin.all` actions are audited.

**OWASP focus for this app:** BOLA is the #1 marketplace risk — every read/write
re-checks object ownership *and* is backstopped by RLS, with dedicated
`*.security.test.ts` files and 13 per-table cross-tenant RLS tests. Security
headers are set in `next.config.mjs` (CSP/HSTS/frame-deny). Third-party
responses (DPO, WhatsApp, SMS) must be schema-validated and quarantined, never
trusted or rendered raw.

**Compliance posture:** DPO's hosted page keeps card handling in **PCI SAQ-A**
(no PAN ever touches our servers). **GDPR** is the platform-wide standard
(EU tourists are a core segment), exceeding current DRC/Namibia data-protection
demands. Document retention limits and a DSAR/erasure workflow are still TODO.

**When you add …**
- a tenant table → RLS policy in `prisma/rls.sql` + `npm run db:rls` + a
  `rls.cross-tenant.<table>.test.ts`.
- an external integration → gateway interface, env-gated, timeout + graceful
  degradation, schema-validate the response, and a DR entry.
- a new permission or role-scoped route → update `rbac.ts`, add a
  `*.security.test.ts` asserting the denied cases (cross-tenant + wrong-role).

---

## Design system

Identity is **"Meridian Cartography"** (survey-line precision, expedition
palette) — matches the design package. Tokens in `tailwind.config.ts`:
navy `#152238`, dune amber `#C97B2D`, forest `#2E5B41`, bone `#F7F4EE`, mist,
ink, rule. Keep product surfaces visually coherent with the documents.

---

## Phase status

- **Phase 0 — Foundation: closed 2026-07-08.** Repo, GitHub→Vercel pipeline,
  Prisma schema + RLS, auth/RBAC skeleton, Lam seed, tax table, observability
  baseline, design tokens. **Exit gate met:** `npm test` green (cross-tenant
  RLS proven) + `main` deployed on Vercel, confirmed on commit `51a924d`. CI
  had been red since the DR-008 scaffold landed; four real bugs were found and
  fixed to get here (see Gotchas: `apply-rls.mjs` comment splitting, the
  `organizationId` column-name mismatch, the CI superuser bypassing RLS, and
  the GUC placeholder reset value). OI-04 (last blocker) resolved via DR-010
  (Vercel Blob, `fra1`). **Next: start Phase 1 (Core Booking).**
- **Phase 1 — Core Booking, Increment 1 done 2026-07-08 (DR-011):** catalog
  (`TourPackage`/`Departure`) + booking/holds shipped — `src/modules/catalog/`,
  `src/modules/booking/`, 13 routes under `src/app/api/v1/{catalog,departures,
  bookings}/...`, `docs/openapi.yaml` started, CI green + deployed on commit
  `33f6994`. Deliberately **not yet done**: DPO deposit/balance (OI-01 still
  open), invoicing with per-country tax, email notifications, EN/FR — those
  are Increment 2 (payments/invoicing) and Increment 3 (notifications/i18n).
  Booking confirm is manual-operator-only until DPO lands. Two real bugs
  found building this increment (see Gotchas): Better Auth's non-UUID default
  IDs vs. our `@db.Uuid` columns, and a Phase-0-era `audit()` RLS bug that
  nothing had triggered until this increment's first tenant-scoped audit call.
- **Phase 1 — Core Booking, Increment 2 done 2026-07-09 (DR-012):** invoicing
  with per-country tax + a stubbed DPO payment flow shipped — new
  `src/modules/invoicing/` (Invoice 1:1 with Booking, Payment folded in as a
  sub-concept per DR-011's precedent), `src/lib/tax.ts` (first `TaxRate`
  reader), 4 new routes, `docs/openapi.yaml` updated. New business rule:
  40%/60% deposit/balance split, half-up, on the post-tax total. DPO is
  stubbed behind a `PaymentGateway` interface (charter rule 8) — a staff-only
  route resolves a `PENDING` payment to `SUCCEEDED`/`FAILED`, standing in for
  DPO's future webhook; only the adapter changes when OI-01's commercial
  terms land. Deliberately **not yet done**: booking confirmation is still
  uncoupled from invoice/payment status (that coupling waits for real DPO),
  plus email notifications and EN/FR — those are Increment 3. Pilot with Lam
  once Increment 3 lands.
- **Phase 1 — Core Booking, Increment 3 done 2026-07-09 (DR-013):** notifications
  + notification-content i18n shipped — new `src/modules/notifications/`
  (deliberately no `repository.ts`; delivery outcomes go through the existing
  `audit()` log, not a bespoke table) wired into booking confirm/cancel and
  invoicing payment-resolve. Real (not permanently-stubbed) HTTP adapters for
  Resend/WhatsApp Cloud API/Africa's Talking behind a shared
  `NotificationChannelGateway` interface (charter rule 8) — no provider
  credentials exist yet in any environment (OI-05/06/07), so every send
  degrades gracefully to "unavailable" and falls through the WhatsApp→SMS→
  email chain without ever failing the triggering request. New
  `User.phone`/`preferredLocale` + a `profile.write` self-service
  `PATCH /users/me` (every role except `IMMIGRATION_OFFICER`). i18n scope
  this increment is notification templates only (EN/FR) — existing API error
  messages stay English-only, deferred (would need locale threaded through
  `AuthContext`). Two real findings while building this increment (see
  Gotchas): Next 15's `after()` can't be used here (throws outside the
  request scope this repo's route-handler tests run in), and `audit_logs`
  reads are RLS-protected too, not just writes.
- **Staff dashboard (pilot tooling) done 2026-07-09 (DR-014):** the repo's
  first authenticated frontend — `src/app/staff/...` (login outside the
  auth gate, a `(dashboard)` route group for everything else), backed by
  Better Auth's HTTP route mounted for the first time
  (`toNextJsHandler`/`createAuthClient`) and `src/lib/staff-guard.ts`
  (`requireStaffContext`, the Server-Component/Action equivalent of
  `withAuth`). Lets Lam log in, list/confirm/cancel bookings, view an
  invoice, send a deposit/balance payment link, and mark a payment resolved
  by hand (real money still goes through cash/bank transfer this pilot —
  DPO stays stubbed, OI-01 still open). Staff can only book on behalf of a
  tourist who **already has an account** (found by email) — creating one on
  the spot is explicitly deferred, `Booking.touristUserId` is a hard FK and
  no such capability exists yet. First real Playwright coverage + a new CI
  job (`e2e`, own Postgres bootstrap, mirrors `quality`). **Pilot with Lam
  next** — no further increment is blocking it; OI-01/02/03/05/06/07 remain
  founder/ops items, not engineering ones. Tourist-facing self-serve site
  (package "tailor your trip" quiz → book → pay) landed as DR-016.
- **Booking-setup wizard (staff tooling) done 2026-07-09 (DR-015):** extends
  the DR-014 "new booking" staff flow into a multi-step wizard — per-seat
  `Traveler` records (name/age/sex/nationality/ID-or-passport/phone/
  disabilities/allergies/drinkPreference), exactly one flagged `isTourLead`
  regardless of group size, that traveler's passport PDF (first real DR-010
  Vercel Blob usage, `access: 'private'`, streamed back only through an
  audited API route — never a public URL), and priced add-on services
  (`AddonService` in `catalog`, selection in `booking`) that now flow into
  the invoice subtotal via new `bookingService.getBillableTotal`.
  `GET /bookings/{id}/invoice` now 409s until travelers + passport + add-ons
  are all complete — the staff booking-detail page gates on this instead of
  eagerly creating the invoice. Staff-only at the time (a tourist self-serve
  equivalent landed next, as DR-016, reusing this same wizard). OI-08
  (`BLOB_READ_WRITE_TOKEN`) resolved 2026-07-09: `polco-tours-documents` Blob
  store created (`fra1`, private), connected to Production/Preview/
  Development on Vercel, and set as a GitHub Actions secret wired into the
  `e2e` job's `env:`.
- **Tourist self-serve site done 2026-07-09 (DR-016):** guest checkout, no
  accounts — confirmed directly that clients never sign up, only operational
  roles (admin/guide/driver/vehicle-owner/visa-facilitator) get real
  accounts. New `(guest)` route group: public browse (`/packages`, no
  session at all — new `catalogService.listPublicPackages`/etc. resolve
  `getPrimaryOrgId()` themselves, DR-005 single-tenant launch) and a real
  "tailor your trip" quiz (`TourPackage.tags` + `scorePackagesForQuiz`,
  tag-overlap ranking, alphabetical tiebreak — never price, packages span 4
  currencies with no FX conversion anywhere in this app). Booking uses
  better-auth's bundled `anonymous` plugin (already part of the DR-001
  stack) to mint a real cookie-backed session with zero password/email UX —
  the *entire* existing `bookingService`/`invoicingService`/`documentsService`
  stack from DR-011/012/015 works for a guest completely unchanged, no
  synthetic `AuthContext`, no hand-rolled tokens. New `Booking
  .confirmationCode` (short, unique, revealed once setup + a payment attempt
  are both done) plus the tour lead's last name (two factors) unlock a
  read-only "find my booking" lookup (`bookingService
  .lookupByConfirmationCode`) — no mutating action reachable from it, and a
  crude audit-log-backed rate limit (new `countRecentAuditEvents`,
  `src/lib/audit.ts`) since no real rate-limiting infra exists yet. An
  earlier draft used a bare `bookingId` in wizard URLs as the guest's whole
  "session" — an adversarial review flagged that as a real leak vector
  (Referer headers, browser history, shared devices) for data this sensitive
  (passport numbers, disability/allergy info, payment status), which is why
  the anonymous-session design replaced it before any code was written.
  `e2e/guest-checkout.spec.ts` is the first real anonymous-session e2e
  journey in this repo, including a genuine Vercel Blob passport upload
  (OI-08's token, now actually exercised). Deliberately not built: new public
  `/api/v1` REST routes (Server Components call services directly, same as
  staff pages); a staff-facing package-management UI (still only the raw
  `/api/v1/catalog/*` routes — `prisma/seed.ts` now seeds a small demo
  catalog to cover it); a real DPO redirect (still stubbed, OI-01).
- **Phase 2 — Fleet + compliance (Increment 1) done 2026-07-10 (DR-017):** new
  `Vehicle` (plate/make/model/year/vehicleType/seatCapacity/status, optional
  `ownerId` -- null means operator-owned) and `DriverProfile` (1:1 with a
  `DRIVER`-role `User`) tables, plus `Document.expiresAt`/`vehicleId`/
  `driverProfileId` for vehicle registration/insurance/inspection and
  driver-license compliance docs. New `src/modules/fleet/` with a pure
  `complianceStatus` rule (`MISSING`/`VALID`/`EXPIRING_SOON`/`EXPIRED`).
  `documentsService.uploadPassport` is now a thin wrapper over a generalized
  `uploadDocument` (per-`kind` validation table). New `fleet.read`/
  `fleet.write` permissions -- `VEHICLE_OWNER`/`DRIVER` only ever see their
  own records (anti-BOLA, enforced in `fleet/service.ts`). New
  `/api/v1/fleet/*` routes + a staff dashboard fleet section. Chosen as
  Increment 1 because Assignments and GPS v1 both need vehicle/driver records
  to attach to first (`rbac.ts`'s pre-existing, previously-unused
  `assignment.write` permission anticipated this). Deliberately deferred:
  linking a vehicle/driver to a `Departure`/`Booking` (Assignments, next),
  GPS tracking, automated compliance-expiry notifications, guide compliance
  records.
- **Phase 2 — Assignments (Increment 2) done 2026-07-10 (DR-018):** new
  `Assignment` (`Departure` -> vehicle/driver/optional guide; several rows
  per departure once capacity exceeds one vehicle's `seatCapacity`) with a
  pure `departuresOverlap` double-booking rule (a vehicle/driver can't be on
  two date-overlapping departures) plus inactive-vehicle/driver and
  wrong-org-guide rejection. New `assignment.read`/`assignment.write`
  permissions (`assignment.write` existed since DR-011, unused until now) --
  `VEHICLE_OWNER`/`DRIVER`/`TOUR_GUIDE` only ever see their own assignments
  (`assignment/service.ts`). New `/api/v1/departures/{id}/assignments` +
  `/api/v1/assignments/{id}` routes and the first staff departures UI
  (`src/app/staff/(dashboard)/departures/...`) for browsing + assigning.
  Confirmed staff-managed only this increment -- `TOUR_GUIDE`/`DRIVER`/
  `VEHICLE_OWNER` have never had dashboard access (baseline layout gate
  requires `booking.confirm`); `GET /api/v1/assignments/mine` exists so
  their own schedule is queryable via the API, but a real self-service
  portal (widening that shared gate) is deferred to its own increment.
- **Phase 2 — Visa documents (Increment 3) done 2026-07-10 (DR-019):** new
  `VisaApplication` per `Traveler` (`SUBMITTED -> APPROVED/REJECTED`, no
  resubmission after a decision) -- first real use of both `visa.process`
  and `immigration.read`, reserved since Phase 0 and never exercised before.
  Traveler identity + destination country are snapshotted onto the
  application at submission time so `IMMIGRATION_OFFICER`'s country-scoped
  list (BR-10, via new `User.assignedCountry` + admin-only
  `authService.assignOfficerCountry`, first real `admin.all` use) never
  needs `booking.read` -- avoids widening that role's single-permission
  footprint. `documentsService` gains the `VISA` kind unchanged. New
  `/api/v1/bookings/{id}/travelers/{id}/visa/*`,
  `/api/v1/immigration/visa-applications`, and
  `/api/v1/users/{id}/assign-country` routes. `VISA_FACILITATOR`/
  `IMMIGRATION_OFFICER` get no staff UI this increment (no dashboard access,
  same gap as Assignments' guide/driver/vehicle-owner roles) -- API-only;
  `TOUR_OPERATOR` gets a small read-only "Visa" line per traveler on the
  existing booking-detail page.
- **Latest polish (2026-07-11):** guest site gained About / FAQ / Contact
  pages; the homepage now degrades gracefully when the DB is unreachable;
  staff-credential CLIs exist (`scripts/create-staff-user.ts`,
  `scripts/set-staff-password.ts` — see Gotchas). No schema/permission change,
  so no new DR. HEAD is `e3c0192` (also fixed an RLS bypass via Neon's default
  owner role — see Gotchas — and split `seed.ts` into per-package transactions).
- **Officer-management UI done 2026-07-11 (DR-020):** closes the gap DR-019
  explicitly deferred. New `/staff/immigration` (an `IMMIGRATION_OFFICER`'s
  own country-scoped visa queue, strictly read-only per BR-10 -- no decide
  action, that stays `VISA_FACILITATOR`'s job) and `/staff/admin/officers`
  (`admin.all`: assign/reassign an officer's country; creating the account
  itself stays CLI-only, `scripts/create-staff-user.ts`). Required widening
  the `(dashboard)` layout's baseline gate from a hardcoded `booking.confirm`
  to a new `rbac.ts` `isStaffRole(role)` ("any role except TOURIST") --
  `IMMIGRATION_OFFICER` had held a real permission (`immigration.read`)
  since DR-019 but was still redirected to `/staff/forbidden` before its own
  page's check ever ran, the same gap DR-018/019 flagged for
  `TOUR_GUIDE`/`DRIVER`/`VEHICLE_OWNER`/`VISA_FACILITATOR`. `StaffNav`
  became permission-aware (per-link `can(role, permission)`) since not every
  staff role can open every link now. Also closed two pre-existing gaps this
  increment's real dashboard usage made worth fixing: `visaService
  .listForCountry`'s officer reads were never audited despite `audit.ts`'s
  own docstring requiring it (BR-10), and `authService.assignOfficerCountry`
  (an `admin.all` action) was never audited either -- both now call
  `audit()`. One new route, `GET /api/v1/immigration/officers`
  (`admin.all`), added for API-level testability; the two dashboard pages
  themselves call `authService`/`visaService` directly, unchanged
  convention.
- **Phase 2 (remaining):** WhatsApp/SMS fallback real wiring (OI-05/06/07),
  GPS v1, CRM, reviews, a guide/driver/vehicle-owner self-service "my
  schedule" portal, and visa resubmission after rejection.
- **Phase 3:** AI assignment engine (operator-validated), analytics.
- **Phase 4:** native Android/iOS, more countries.

Full roadmap and testing strategy: Volume 10.

---

## Decision log — recent

Maintained in `docs/decisions/DECISION_LOG.md`. Current: DR-001 stack ·
DR-002 DPO locked · DR-003 brand polcotours · DR-004 Vercel · DR-005 Lam
superadmin · DR-006 per-country tax · DR-007 living-doc mandate · DR-008
Phase 0 scaffold · DR-009 dependency security bump (Next 15.5.20, better-auth
1.6.23, zod 4.4.3, playwright 1.61.1) · DR-010 object storage = Vercel Blob,
`fra1` (resolves OI-04) · DR-011 Phase 1 Increment 1: catalog + departures +
booking/holds, no payments yet · DR-012 Phase 1 Increment 2: invoicing +
40/60 deposit split + DPO stubbed behind `PaymentGateway` (OI-01 still open) ·
DR-013 Phase 1 Increment 3: notifications module (real, env-gated
Resend/WhatsApp Cloud/Africa's Talking adapters, OI-05/06/07 open) +
`profile.write` self-service + notification-template EN/FR · DR-014 staff
dashboard: first authenticated frontend, Better Auth HTTP route mounted,
staff can only book for already-registered tourists, new e2e CI job ·
DR-015 booking-setup wizard: `Traveler`/`Document`/`AddonService`/
`BookingAddon` tables, add-ons flow into the invoice via
`getBillableTotal`, first real Vercel Blob usage (`access: 'private'`,
resolves how DR-010 actually gets exercised), `TOUR_OPERATOR` gains
`documents.write`, OI-08 (`BLOB_READ_WRITE_TOKEN`) resolved — provisioned
on Vercel and set as a GitHub Actions secret, wired into the `e2e` job ·
DR-016 tourist self-serve site: guest checkout via better-auth's `anonymous`
plugin (no tourist accounts, ever), public browse/quiz need no session
(`getPrimaryOrgId`), `TourPackage.tags` + `scorePackagesForQuiz`,
`Booking.confirmationCode` + two-factor "find my booking" lookup with a
crude audit-log rate limit, first real anonymous-session e2e journey
including a genuine Blob passport upload · DR-017 Phase 2 Increment 1: fleet
+ compliance -- `Vehicle`/`DriverProfile` tables, `documentsService`
generalized to a `kind`-parameterized `uploadDocument` (passport upload now a
thin wrapper), pure `complianceStatus` rule, new `fleet.read`/`fleet.write`
permissions with anti-BOLA ownership scoping for `VEHICLE_OWNER`/`DRIVER`,
new `/api/v1/fleet/*` routes + staff dashboard fleet section -- sequenced
ahead of Assignments/GPS v1, which both need this data to attach to · DR-018
Phase 2 Increment 2: assignments -- new `Assignment` table linking a
`Departure` to vehicle/driver/optional guide (several per departure once
capacity exceeds one vehicle), pure `departuresOverlap` double-booking rule,
new `assignment.read` permission (`assignment.write` finally used, since
DR-011) with anti-BOLA scoping for `TOUR_GUIDE`/`DRIVER`/`VEHICLE_OWNER`, new
`/api/v1/departures/{id}/assignments` + `/api/v1/assignments/*` routes, and
the first staff departures UI -- staff-managed only, a guide/driver/
vehicle-owner self-service portal deliberately deferred (would need to widen
the staff layout's baseline permission gate) · DR-019 Phase 2 Increment 3:
visa documents -- `visa.process`/`immigration.read` finally used, since
Phase 0. New `VisaApplication` per traveler (`SUBMITTED -> APPROVED/
REJECTED`), traveler identity + destination country snapshotted onto it so
`IMMIGRATION_OFFICER`'s country-scoped list (new `User.assignedCountry`,
BR-10) never needs `booking.read`. New admin-only
`authService.assignOfficerCountry` (first real `admin.all` use). New
`/api/v1/bookings/{id}/travelers/{id}/visa/*` + `/api/v1/immigration/
visa-applications` + `/api/v1/users/{id}/assign-country` routes,
API-only for `VISA_FACILITATOR`/`IMMIGRATION_OFFICER` (no dashboard access,
same gap as Assignments), plus a small read-only Visa line for
`TOUR_OPERATOR` on the existing booking-detail page · DR-020 officer-
management UI: closes DR-019's deferred gap. New `/staff/immigration`
(`IMMIGRATION_OFFICER`'s own country-scoped visa queue, strictly read-only
per BR-10) and `/staff/admin/officers` (`admin.all`: assign/reassign an
officer's country; account creation stays CLI-only). Widened the
`(dashboard)` layout's baseline gate from hardcoded `booking.confirm` to new
`isStaffRole(role)` ("any role except TOURIST") so `IMMIGRATION_OFFICER`
(and future roles) can reach the shell at all -- `StaffNav` now filters
links per-role. Closed two pre-existing audit gaps surfaced by real UI
usage: `visaService.listForCountry`'s officer reads and
`authService.assignOfficerCountry` (`admin.all`) were never audited despite
both being required (BR-10 / STRIDE "Elevation"). One new route,
`GET /api/v1/immigration/officers` (`admin.all`), for API-level testability.

## Open items — cannot be decided in code (see log OI-01..03, 05..07; OI-04/08 resolved)

- **OI-01** DPO written commercial terms (fee %, EUR support, DRC/Namibia mobile
  money, settlement SLA, rolling-reserve %). Blocks Phase 1 finance.
- **OI-02** Trademark clearance for "polcotours"/"POLCO TOURS" in NA + DRC
  (existing Greek tourism brand + US "Polco"). Blocks public launch.
- **OI-03** Lam per-market legal registrations (Namibia NTB/BIPA/NamRA; DRC
  DARA/DGI/Ministry of Tourism). Blocks go-live.
- ~~**OI-04** Object-storage provider + EU region confirmation.~~ Resolved
  2026-07-08 — DR-010: Vercel Blob, `fra1`. Not yet wired up in code (no
  document upload feature exists until Phase 2); this just unblocks Phase 0
  close.
- **OI-05** Resend account + API key. Blocks real email notifications.
- **OI-06** WhatsApp Cloud API access (Meta Business verification, phone
  number). Blocks real WhatsApp notifications.
- **OI-07** Africa's Talking account + API key. Blocks real SMS notifications.
- ~~**OI-08** `BLOB_READ_WRITE_TOKEN` provisioning.~~ Resolved 2026-07-09:
  `polco-tours-documents` Blob store (`fra1`, private) created, connected to
  Production/Preview/Development on Vercel, and set as a `cyberpolco/
  polco-tours` GitHub Actions secret wired into the `e2e` job's `env:`
  (`.github/workflows/ci.yml`). Nothing exercises it yet -- tests still mock
  the Blob gateway boundary (`tests/api/booking-setup.api.test.ts`) and the
  Playwright e2e spec stops at the passport step's upload form rather than
  submitting a real file; a future increment can extend that spec without a
  second CI trip.

Surface OI-01..03/05..07 to the human — don't invent answers.

**Note:** `docs/design-package/` (the 11-volume spec DR-007 says every
structural/integration decision must update) does not exist in the repo yet —
only `docs/decisions/DECISION_LOG.md` is populated. DR-010's "Affects: V8, V9"
tag can't be made concrete until those volumes are added. Flag this to the
human rather than fabricating volume content.

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
- DB-backed tests (`tests/rls.cross-tenant.*`, `tests/api/*`, `tests/lib/tax.test.ts`)
  need a reachable Postgres via `DATABASE_URL`/`DIRECT_URL` (`.env`) — a
  sandbox with no `.env` and no passwordless local Postgres access (as of
  2026-07-09, this repo's dev sandbox has neither) can still run lint/
  typecheck/build/pure-domain-unit tests, but those DB-backed suites only get
  verified in CI (which provisions its own `postgres:16` service) or against
  a real local/Neon DB with credentials.
- better-auth needs `npx @better-auth/cli generate` to emit its tables into the
  schema before `db:push`.
- better-auth's default ID generator produces non-UUID strings and passes them
  explicitly on insert (bypassing Prisma's `@default(uuid())`) — every column
  it writes to (`User.id`, `Session.id`, `Account.id`, etc.) is `@db.Uuid`, so
  the very first real sign-in fails with "Error creating UUID, invalid
  character" on the `Session` insert. Fixed via `advanced.database.generateId:
  'uuid'` in `src/lib/auth.ts`'s `authConfig` — caught by the API tests
  (`tests/api/*.test.ts`) on 2026-07-08, not by hand; don't remove that option.
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
- `src/lib/audit.ts`'s `audit()` must use `withOrg(organizationId, ...)` when
  the entry has an `organizationId`, not the plain global `prisma` client.
  Prisma's `create()` does an implicit `RETURNING`, which acts as a SELECT on
  the just-inserted row; `audit_select`'s policy (`organizationId IS NULL OR
  matches app.org_id`) can't see a tenant-scoped row from an unscoped
  connection, so Postgres throws "new row violates row-level security policy"
  even though `audit_insert`'s `WITH CHECK (true)` allowed the insert itself.
  This bug existed since Phase 0 but nothing called `audit()` with a non-null
  organizationId until Phase 1's booking module did (2026-07-08).
- `audit_logs`' RLS policy (`audit_select`) protects **reads**, not just
  writes — a test/script querying it via the raw admin `PrismaClient` (no
  `withOrg`) sees zero rows for any tenant-scoped entry, same deny-by-default
  behavior as every other RLS table. Go through `withOrg(organizationId, tx
  => tx.auditLog.findFirst(...))` to actually see them (caught writing
  Increment 3's notification-wiring tests, 2026-07-09).
- Next.js 15's `after()` (from `next/server`) throws synchronously (`E468`)
  when called outside a request handled by Next's own pipeline — confirmed by
  reading `next/dist/server/after/after.js`. This repo's `tests/api/*.test.ts`
  call exported route handlers directly (bypassing that pipeline), so
  `after()` cannot be used inside any `src/modules/*/service.ts` without
  breaking every test that exercises the affected code path. Use a plain
  `await` for fire-and-forget side effects instead (Increment 3, DR-013) —
  there is no lighter-weight degrade-gracefully-outside-request-scope variant.
- No Better Auth HTTP route existed anywhere until DR-014 (`src/app/api/auth/
  [...all]/route.ts`) — `auth.api.getSession`/etc. worked fine for already-
  authenticated requests (nothing about session resolution needs the route),
  but there was no way to actually sign in over HTTP. If a future increment
  needs email verification or password reset to really work end-to-end, that
  also flows through this same mount, via `toNextJsHandler`.
- `prisma/seed.ts` seeds Lam with `emailVerified: true` but **no password**
  (no `Account`/credential row) — it also runs against real environments via
  `db:setup`, so never hardcode a test password there. For anything that
  needs a real credentialed login (e2e), create a throwaway user via
  `auth.api.signUpEmail` + a direct `prisma.user.update({emailVerified:true})`
  instead (see `e2e/helpers/staff-user.ts`, DR-014) — never touches Lam's row.
- **Route-group gate placement matters.** `src/app/staff/(dashboard)/layout.tsx`
  calls `requireStaffContext` (redirects to `/staff/login` if unauthenticated);
  `/staff/login` and `/staff/forbidden` are siblings OUTSIDE the `(dashboard)`
  group specifically so they never inherit that gate. Adding a
  `src/app/staff/layout.tsx` "for shared chrome" later would apply to
  login/forbidden too and reintroduce a redirect loop — don't.
- e2e fixtures for tenant-scoped tables (packages/departures/bookings/etc.)
  MUST be seeded through `withOrg(...)`, not a raw unscoped `prisma.create` —
  RLS is live for the app under test in CI (same non-superuser `polco_app`
  role as the `quality` job), so an unscoped insert is invisible to the app
  and fails the test confusingly rather than with a clear error (DR-014,
  `e2e/helpers/booking-fixture.ts`).
- `Account.id`/`Verification.id` had no `@default(uuid())` (unlike every
  other model, incl. `User`/`Session`) — `authConfig`'s `generateId: 'uuid'`
  (`src/lib/auth.ts`) tells better-auth's Postgres adapter to OMIT the id and
  let the database generate it (`gen_random_uuid()`), but nothing in
  `rls.sql`/`schema.prisma` ever added that as an actual column default —
  `User`/`Session` only ever "worked" because Prisma's own client-side
  `@default(uuid())` silently filled the gap when better-auth's adapter left
  `id` out. `Account`/`Verification` had no such fallback, so the very first
  real `signUpEmail` call (creating the credential `Account` row) threw
  "Argument `id` is missing" at the Prisma layer. Nothing had ever exercised
  real signup before — every existing test used `testUtils()`'s
  `ctx.test.login()` shortcut, which mints a `Session` directly and never
  touches `Account` at all. Caught by `e2e/staff-dashboard.spec.ts`'s
  real-credential-login test (DR-014, 2026-07-09), the first thing in this
  repo to call `auth.api.signUpEmail` for real. Fixed by adding
  `@default(uuid())` to both, matching `User`/`Session`'s pattern.
- That same first-ever real `signUpEmail` call surfaced a second, deeper bug:
  the new user's `organizationId` came back `null` even though
  `databaseHooks.user.create.before` (DR-011's "new tourists auto-join the
  primary org at signup") computed the right value and merged it into the
  create payload — confirmed by temporarily logging inside the hook in CI
  (it fired, `primaryOrgId` was correct). Root cause: `@better-auth/core`'s
  adapter factory (`transformInput` in `db/adapter/factory.mjs`) builds the
  actual create/update payload by iterating **its own schema** (core fields
  + whatever's declared via `user.additionalFields`), silently dropping any
  key it doesn't recognize — `organizationId` was never declared, so it was
  discarded AFTER the hook set it, right before the Prisma write. Any custom
  column on `User` that a hook (or the request body) tries to set will hit
  this same silent drop unless it's declared. Fixed by adding
  `user.additionalFields.organizationId` to `authConfig`
  (`{type: 'string', required: false, input: false}` — `input: false`
  means only the server-side hook can ever set it, never a client via the
  sign-up request body). This is a previously **completely untested**
  DR-011 business rule — every other test creates users via a raw
  `PrismaClient`, bypassing better-auth (and this hook) entirely, so nothing
  had ever exercised it before `tests/auth-signup-hook.test.ts` (DR-014,
  2026-07-09), which now guards it directly. `phone`/`preferredLocale`/
  `role` are also custom `User` columns not registered as
  `additionalFields` — fine today (nothing sets them via a better-auth hook
  or the sign-up body), but the same silent-drop trap applies if a future
  increment ever tries to.
- `@vercel/blob` (2.6.1) actually supports real `access: 'private'` storage
  (`put(..., { access: 'private' })`) plus an authenticated `get(pathname,
  { access: 'private' })` for retrieval — there is no bare public-URL-only
  limitation to work around. Don't assume Vercel Blob is public-only without
  checking `node_modules/@vercel/blob/dist/*.d.ts` first; `documents/gateway.ts`
  (DR-015) uses `access: 'private'` + `get()`, so a passport's Blob pathname
  genuinely has no public URL at all, not just an unguessable one.
- The RBAC matrix (`src/lib/rbac.ts`) had `TOUR_OPERATOR` with `documents.read`
  but **not** `documents.write` — fine while no feature exercised it, but
  DR-015's staff-uploaded passport needed it added. If a future increment adds
  a staff-facing write path for an existing resource, check the matrix
  actually grants that role the permission; it may have been scoped for a
  different (e.g. tourist-self-serve) caller than the one you're building.
- `invoicing/service.ts`'s `getOrCreateInvoiceForBooking` now calls
  `bookingService.getBillableTotal`, which throws (409) until the traveler
  manifest/passport/add-ons wizard steps are complete (DR-015) — this broke
  `tests/api/invoices.api.test.ts`'s fixture, which relied on the invoice
  being lazily created on a bare booking with no travelers. Fixed by seeding a
  complete manifest (one `Traveler` with `isTourLead: true` + a fixture
  `Document`) directly in that fixture's `beforeAll`, same as any other
  raw-fixture test. `tests/api/invoices.security.test.ts` and both
  `rls.cross-tenant.{invoices,payments}.test.ts` were unaffected because they
  create the `Invoice` row directly (bypassing the service's lazy-create path
  entirely) — check which pattern a given invoice fixture uses before assuming
  a service-layer gating change needs a fixture update.
- Adding `Booking.confirmationCode` as a required+unique column (DR-016)
  broke every raw-fixture `tx.booking.create(...)`/`admin.booking.create(...)`
  call across the repo (12 sites: `tests/api/*.test.ts`,
  `tests/rls.cross-tenant.*.test.ts`, `e2e/helpers/booking-fixture.ts`) --
  none of them go through `bookingService.createHold` (which sets it), they
  all construct the row directly. Fixed by exporting
  `generateConfirmationCode` from `@modules/booking`'s `index.ts` and calling
  it in every fixture. Any future required+unique column added to a
  frequently-raw-fixtured table (`Booking`, `TourPackage`, `User`...) will hit
  this same fan-out -- grep for `.create({` on that model across `tests/` and
  `e2e/` before assuming the schema change is done.
- better-auth's `anonymous` plugin needs registering on **both** sides:
  `plugins: [anonymous(...)]` in `src/lib/auth.ts` (server) AND `plugins:
  [anonymousClient()]` in `src/lib/auth-client.ts` (browser, from
  `better-auth/client/plugins`) -- without the client half,
  `authClient.signIn.anonymous` is simply missing/untyped, even though the
  server endpoint (`/sign-in/anonymous`) works fine. Same pairing pattern
  applies to any other better-auth plugin added later.
- `getPrimaryOrgId()` (`src/lib/primary-org.ts`, DR-016) throws when no
  org has `isPrimary: true` -- deliberately, since a guest-facing page with
  nothing to show is a real misconfiguration, not a graceful-degrade case
  like the signup hook (which still falls back to `organizationId: null`).
  Don't add a second `isPrimary: true` organization anywhere, including test
  fixtures -- `findFirst` would then non-deterministically pick between them.
  Tests needing "the" primary org must look up the real seeded one
  (`admin.organization.findFirstOrThrow({ where: { isPrimary: true } })`) and
  seed their own rows *into* it, never create a second primary org.
- `scripts/create-staff-user.ts` (DR-014 era) only works for a brand-new
  email — it calls `auth.api.signUpEmail`, which rejects an email that
  already has a `User` row, so it can't be used to give `prisma/seed.ts`'s
  Lam row (`lam@polcotours.com`, seeded `emailVerified: true`, no
  `Account`/credential row on purpose) a real password. Added
  `scripts/set-staff-password.ts` (`npm run staff:set-password -- <email>
  <password>`) for that case: hashes with `better-auth/crypto`'s
  `hashPassword` (same scrypt call `sign-up.mjs` uses) and links/updates a
  `providerId: "credential"` `Account` row directly via Prisma, matching
  `internalAdapter.linkAccount`'s shape (`accountId: user.id`) — no RLS
  policy exists on `users`/`accounts` (better-auth's own tables aren't
  tenant-scoped), so the raw `prisma` client is fine here, same as
  `create-staff-user.ts`.
- **Neon's default `neondb_owner` role has the `BYPASSRLS` attribute** (Neon
  grants it by default, alongside `CREATEDB`/`CREATEROLE`/`REPLICATION`) — the
  exact same bug class as the CI bootstrap-superuser gotcha above, just for
  our real Neon project instead of CI's ephemeral `postgres:16` service.
  Connecting the app/tests through `neondb_owner` silently no-ops every RLS
  policy (`FORCE ROW LEVEL SECURITY` does not help — `BYPASSRLS` overrides
  `FORCE` regardless). Caught 2026-07-10 finishing Neon DB setup: the first
  real cross-tenant test run against this Neon project showed exactly the
  leaky counts you'd expect from RLS being off. Fixed by creating a
  `polco_app` role (`NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE`) with
  direct `GRANT SELECT/INSERT/UPDATE/DELETE ON ALL TABLES/SEQUENCES IN SCHEMA
  public` (plus matching `ALTER DEFAULT PRIVILEGES FOR ROLE neondb_owner ...`
  so future `neondb_owner`-run migrations keep granting it access) and
  pointing `DATABASE_URL`/`DIRECT_URL` at that role instead. Note:
  `GRANT neondb_owner TO polco_app` (role membership, which would have been
  closer to CI's approach) is **not possible** — Neon itself blocks it
  (`permission denied to grant role "neondb_owner": only roles with the
  ADMIN option on role neondb_owner may grant this role`), so this uses
  direct object grants instead.
- Because `polco_app` isn't an owner (just granted DML privileges), it
  **cannot** run schema-owning DDL — `npm run db:push` and `npm run db:rls`
  both fail against existing tables with `must be owner of table ...` under
  `polco_app`. Those two commands still need `neondb_owner`'s connection
  string; `polco_app` is only for runtime/tests/seed. This is a real gap (no
  single credential currently does both, unlike CI's one-role-does-everything
  `polco_app`, which works there only because CI's role is created *before*
  its ephemeral Postgres has any tables, so it ends up owning everything it
  creates) — a future increment should decide whether to reassign table
  ownership to `polco_app` (so one role can do both) or keep the two-role
  split permanently and document it in `.env.example`.
- Prisma's default interactive-transaction timeout (5000ms) is measurably too
  short for this sandbox's real network path to Neon (`eu-central-1`) —
  several `tests/rls.cross-tenant.*`/`tests/api/*` fixtures that do multiple
  sequential creates inside one `withOrg`/`$transaction` block hit `Transaction
  API error: Transaction already closed` / `Unable to start a transaction in
  the given time` on this first-ever real run (2026-07-10). `prisma/seed.ts`
  hit the same wall (one giant `withOrg` around every package+departure) and
  was fixed by wrapping each package in its own `withOrg` call instead of one
  transaction for all of them — do the same (split into smaller transactions)
  rather than raising `withOrg`'s global timeout, since that function is
  shared by every request path, not just scripts/tests.
- **A failed test setup can silently wipe an entire table.** When a fixture's
  `beforeAll` throws partway through (e.g. the transaction-timeout gotcha
  above), some `afterAll` cleanups still run with an `undefined` id captured
  from the failed setup — e.g. `admin.user.deleteMany({ where: {
  organizationId: orgId } })` with `orgId` still `undefined`. Prisma's client
  drops keys with an `undefined` value before sending the query, silently
  turning that into `deleteMany({})` — an **unscoped delete of every row in
  the table**. `users` has no RLS policy (see the gotcha above on why), so
  nothing stopped this from deleting every seeded user (Lam + superadmin)
  during this session's first real test run against Neon; `db:seed` is
  idempotent and safely restored them. `deleteMany` calls in test cleanup
  should guard against an undefined id (e.g. skip cleanup or assert the id is
  defined first) rather than trusting Prisma to no-op — this is a latent bug
  in existing fixtures, not something introduced by the Neon setup, just
  never triggered before because these tests always ran against a fast local
  Postgres where the timeout gotcha above never fired.
- First-time local `.env`/`.env.local` setup for this Neon project was
  completed 2026-07-10 (`DATABASE_URL`/`DIRECT_URL` via `polco_app`,
  `BETTER_AUTH_SECRET` generated, `BLOB_READ_WRITE_TOKEN` carried over from
  the existing Vercel-CLI-managed `.env.local`). Both files are gitignored;
  `.env` exists because Prisma CLI and the `tsx` scripts (`seed.ts`,
  `apply-rls.mjs`) only auto-load `.env`, not `.env.local` — Next.js loads
  both, but the DB scripts don't, so both files carry the DB vars.
- **`.env.local` silently broke local staff sign-in** (found 2026-07-11): the
  Vercel-CLI-managed `.env.local` had `NEXT_PUBLIC_APP_URL` and
  `BETTER_AUTH_URL` both set to `http://polco-tours.vercel.app` — Vercel's
  Production value, pulled into the Development scope. Next.js loads
  `.env.local` with higher priority than `.env` (which correctly has
  `http://localhost:3000` for both), so the browser's `authClient` was
  issuing the sign-in `fetch` cross-origin against production. The request
  gets silently blocked (no CORS allowance from prod for a `localhost`
  origin) with no error surfaced by `src/app/staff/login/page.tsx`'s
  handler — the "Sign in" button just does nothing, no error text, no
  redirect. Fixed by pointing both vars in `.env.local` back at
  `http://localhost:3000`, matching `.env`. If local sign-in (staff or
  guest) ever silently no-ops again, check these two vars in `.env.local`
  first before suspecting the auth code itself.
