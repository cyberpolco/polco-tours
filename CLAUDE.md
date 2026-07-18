# CLAUDE.md — POLCO TOURS

Persistent brief for Claude Code. Read this first, every session. It encodes the
engineering charter, the current state, and the rules that must not be broken.

POLCO TOURS is a **Tourism Operating System** for **Namibia** and the
**Democratic Republic of Congo (DRC)** — tour package sales plus operations
management (tourists, operators, guides, drivers, vehicle owners, hotels,
restaurants, visa facilitators). Web platform first;
native apps later. Brand: **polcotours** (`polcotours.com`).

> Last updated: 2026-07-17, against repo HEAD `390f147` (DR-044,
> permission-matrix editor UX fixes, pushed — bundled the "Change
> password" Settings-sidebar move and the brand-link-to-home-page tweak
> from the DR-043 follow-up too). CI green on `0498891` (DR-043) already
> confirmed DR-042's three previously-unverified DB-backed test files:
> `settings.api`/`settings.security`/`invoices.api` all passed. **Not yet
> committed on top of `390f147`**: two more explicit-user-requested
> tweaks -- the permission matrix now uses a fixed-width `<colgroup>` (all
> 7 role columns the same width) with the checkbox centered via flex
> under each header, since the first pass's per-cell padding alone still
> left columns unevenly sized against auto table layout; and the brand
> link (previously pointed at `/staff/bookings`) now points at the public
> homepage `/` instead, same target as `/staff/login`'s own back-arrow --
> confirmed this is a plain client-side nav that never touches the
> session, so a staff member is still signed in on returning to
> `/staff/*`. `lint`/`typecheck`/`build` all green for both. Also records
> the DR-034 Immigration Module/Country
> Regulations/Zambia+Zimbabwe expansion, and a
> systemic test-fixture bug (undefined-id fixtures silently turning into
> unscoped `deleteMany({})` calls) that wiped the real `users` table twice
> this session — fixed across 51 files, see Gotchas.

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
| Geo/map viz | `@visx/geo`+`@visx/responsive`+`@visx/tooltip`+`@visx/event` `4.0.0`, `topojson-client` `3.1.0`, `world-atlas` `2.0.2` — homepage Africa/Namibia/DRC map (DR-022); not `react-simple-maps` (no React 19 support) |
| i18n | `next-intl` `4.13.2` — cookie-based EN/FR locale, no URL prefixing (DR-023); guest site only, partial coverage (Nav/Footer/HomePage so far) |

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
    api/v1/users(/[userId](/reset-password)) # admin user management (DR-026);
                                           #   PATCH /users/[userId] (edit
                                           #   name/email/phone/roles) +
                                           #   POST .../reset-password
                                           #   added DR-035
    api/v1/permissions                    # runtime permission-matrix editor
                                           #   (DR-035): route-level gate is
                                           #   admin.all (broad category),
                                           #   but GET/PATCH are both
                                           #   SUPERADMIN-only one layer
                                           #   down in authService --
                                           #   PLATFORM_ADMIN passes the
                                           #   route but 403s in the service
    api/v1/fleet/vehicles(/[vehicleId](/documents(/[documentId]))),
      api/v1/fleet/drivers(/[driverProfileId](/documents(/[documentId])))
                                           # fleet + compliance (DR-017)
    api/v1/fleet/guides(/[guideProfileId](/documents(/[documentId])))
                                           # Guides Module (DR-030), folded
                                           #   into fleet -- mirrors drivers
    api/v1/departures/[departureId]/assignments, api/v1/assignments/
      [assignmentId], api/v1/assignments/mine
                                           # assignments (DR-018)
    api/v1/bookings/[bookingId]/travelers/[travelerId]/visa(/submit,/decide,
      /document,/contact,/request-documents)
                                           # visa documents (DR-019);
                                           #   /contact + /request-documents
                                           #   are real notification-
                                           #   triggering actions (DR-034)
    api/v1/visa/queue                     # VISA_FACILITATOR's own whole-org
                                           #   queue (My Schedule, DR-031);
                                           #   the only visa-overview route
                                           #   left after DR-032 removed
                                           #   IMMIGRATION_OFFICER entirely;
                                           #   TOUR_OPERATOR also reaches it
                                           #   since DR-034
    api/v1/country-regulations(/[country]) # Immigration Module (DR-034):
                                           #   platform-wide reference data,
                                           #   read by anyone processing
                                           #   visas, write is SUPERADMIN-only
    api/v1/bookings/[bookingId]/rating-code, api/v1/ratings
                                           # Customer Ratings & Feedback
                                           #   (DR-037): rating.issue/
                                           #   rating.read. The guest
                                           #   lookup/submit flow itself is
                                           #   NOT a REST route -- Server
                                           #   Components call ratingsService
                                           #   directly, same DR-016
                                           #   convention as /find-booking
    api/v1/insights                       # Insights & Decision Making
                                           #   (DR-038): insights.read,
                                           #   read-only executive
                                           #   dashboard, no new tables
    api/v1/finance/rates/{staff,hotel,transport,food-beverage,activity,
      immigration-cost}(/[id]), api/v1/catalog/packages/[packageId]/
      cost-breakdown                      # Financial Management (DR-039):
                                           #   finance_config.read/write,
                                           #   cost-plus pricing engine --
                                           #   write is SUPERADMIN-only
                                           #   (isFinanceConfigWriter,
                                           #   PLATFORM_ADMIN passes the
                                           #   route but 403s in the
                                           #   service, same layering as
                                           #   country_regulation.write)
    api/v1/tracking                       # Tracking (DR-041): tracking.read,
                                           #   fleet last-known-location +
                                           #   departure-level trip
                                           #   progress, no new tables
    api/v1/settings/tax-rates(/[id]),
      api/v1/settings/platform-rates(/[id]) # Settings (DR-042):
                                           #   platform_settings.read/write,
                                           #   TaxRate + new PlatformRate
                                           #   CRUD -- write is
                                           #   SUPERADMIN-only (same
                                           #   layering as
                                           #   finance_config.write)
    api/v1/bookings/[bookingId]/itinerary, api/v1/itineraries(/mine|
      /[itineraryId](/review|/send-back|/approve|/days(/[dayId])|
      /hotels(/[hotelId])|/restaurants(/[restaurantId]))),
      api/v1/hotels(/[hotelId]), api/v1/restaurants(/[restaurantId])
                                           # Itinerary Management (DR-033):
                                           #   new itinerary module + Hotel/
                                           #   Restaurant reference entities
    api/auth/[...all]/                    # Better Auth's own mount (DR-014)
    staff/login, staff/forbidden          # outside the auth gate (DR-014)
    staff/change-password                 # forced first-login flow for
                                           #   admin-created accounts
                                           #   (mustChangePassword, DR-026),
                                           #   also outside the auth gate
    staff/(dashboard)/...                 # staff pilot dashboard (DR-014);
      baseline gate is "any staff role" (isStaffRole), not one hardcoded
      permission, since DR-020 -- StaffNav filters links per-role
      bookings/[bookingId]/{travelers/new,passport,addons} = setup wizard (DR-015)
      fleet(/vehicles(/new|/[vehicleId]),/drivers(/new|/[driverProfileId]),
        /guides(/new|/[guideProfileId]))
        = fleet + compliance (DR-017); guides folded in (DR-030)
      departures(/[departureId]) = manage vehicle/driver/guide assignments
        (DR-018/029) -- the list-browse page was removed in DR-033 (folded
        into itineraries/booking-detail links instead), this detail page
        itself is unchanged and still the only place assignments are made
      itineraries(/[itineraryId]), hotels(/[hotelId](/new)),
        restaurants(/[restaurantId](/new)) = Itinerary Management (DR-033):
        day-by-day schedule, hotel/restaurant assignment, DRAFT/IN_REVIEW/
        APPROVED workflow; the same itinerary detail page renders read-only
        for TOUR_GUIDE/DRIVER (itinerary.write/approve both false for them)
      schedule = TOUR_GUIDE/DRIVER/VEHICLE_OWNER's own assignment queue,
        read-only (DR-021; closes the gap DR-018/019/020 each deferred);
        TOUR_GUIDE and (since DR-031) DRIVER viewers additionally get a
        data-minimized client-list/daily-itinerary/emergency-contacts
        section (DR-030/031) and (since DR-033) a link into their own
        assigned itineraries
      visa-queue = VISA_FACILITATOR's own whole-org visa queue, read-only
        (My Schedule, DR-031; closes the gap DR-019/020/021/025 each
        re-flagged -- this role previously had zero staff UI at all);
        also reachable by TOUR_OPERATOR since DR-034, and now the one
        non-read-only surface here: contact-traveller/request-missing-
        documents action forms per row
      country-regulations(/new|/[country]) = Immigration Module (DR-034):
        read-only for anyone with country_regulation.read, write controls
        rendered only for SUPERADMIN (PLATFORM_ADMIN passes the route-level
        permission but would 403 in the service, so the UI hides rather
        than dangles those controls)
      admin/users(/[userId]) = user management (DR-026); edit form + reveal-
        once reset-password panel added to the detail page in DR-035
      admin/permissions = runtime permission-matrix editor (DR-035),
        SUPERADMIN-only -- explicit redirect to /staff/forbidden for anyone
        else, beyond the route's own admin.all gate; 168 checkboxes
        (EDITABLE_ROLES x ALL_PERMISSIONS) buffered client-side behind an
        explicit "Save changes" button (DR-044, reversing DR-035's original
        no-batch-step, auto-submit-per-click design)
      ratings = Customer Ratings & Feedback (DR-037) moderation/aggregate
        view, rating.read -- org-wide + per-driver/per-guide averages, plus
        every individual review with comments; "Generate Rating Code" itself
        lives on the booking-detail page instead (rating.issue, visible
        once the invoice is PAID)
      insights = Insights & Decision Making (DR-038), insights.read -- a
        read-only executive dashboard (Bookings/Revenue/Operations/Customer
        Experience/Immigration), composed live from other modules' data, no
        Prisma table of its own
      finance/rates = Financial Management (DR-039), finance_config.read
        for viewing the six rate tables, finance_config.write (SUPERADMIN-
        only, enforced in the service) for editing them
      packages/[packageId]/cost-breakdown = per-package cost-plus pricing
        form (DR-039) -- composes the six rate tables into
        computedBaseCostMinor/computedSellingPriceMinor, writes the
        per-seat result back onto TourPackage.priceMinor; override panel
        also SUPERADMIN-only
      tracking = Tracking (DR-041), tracking.read -- Fleet Locations
        (whole-org StarlinkKit last-known-position + freshness) and Active
        Trips (departures currently IN_PROGRESS per resolveTripProgress,
        with driver/guide/vehicle + day-X-of-Y); /staff/schedule also
        gained a small same-function "Day X of Y" badge for TOUR_GUIDE/
        DRIVER's own assignments, no new permission there
      settings/tax-rates, settings/platform-rate = Settings (DR-042),
        platform_settings.read for viewing, platform_settings.write
        (SUPERADMIN-only, enforced in the service) for adding/removing a
        rate row; reached via a new SidebarShell-based "Settings" StaffNav
        entry that also regroups country-regulations/finance/rates/
        insights/admin/users/admin/permissions under the same left sub-nav
        -- none of those five pages' own URLs/permissions changed
    (guest)/...                          # tourist self-serve site, NO ACCOUNTS
      (DR-016) -- /, /packages(/[packageId]), /quiz(/results), /book/[departureId]
      (anonymous sign-in), /booking/[bookingId]/{travelers/new,passport,addons}
      (same wizard as staff's, requireGuestContext instead), /find-booking(/result),
      /rate(/result) = Customer Ratings & Feedback (DR-037): same no-session,
      plain-GET-form pattern as /find-booking -- bookingReference + Rating
      Code instead of confirmationCode + last name
  lib/                 # shared kernel: db, auth, auth-client, rbac, errors,
                       #   money, audit (+countRecentAuditEvents, DR-016),
                       #   logger, route-guard (withAuth: HTTP routes),
                       #   staff-guard (requireStaffContext, DR-014),
                       #   guest-guard (requireGuestContext, DR-016),
                       #   primary-org (getPrimaryOrgId, DR-016),
                       #   country-codes (phone/flag + nationality picker
                       #   data, no dependency, DR-015),
                       #   platform-rate (getEffectivePlatformRate,
                       #   DR-042 -- mirrors tax.ts's getEffectiveTaxRate,
                       #   minus the per-country dimension)
  modules/             # feature modules — independent, reusable (Vol. 5 §5.2)
    auth/              # REFERENCE module: domain · repository · service · index
    catalog/           # TourPackage (+tags/PackageTag, DR-016) + Departure +
                       #   AddonService (DR-011, DR-015); public/quiz methods
                       #   need no ctx (DR-016)
    booking/           # Booking (11-value lifecycle, DRAFT->..., DR-027) +
                       #   confirmationCode/bookingReference (DR-016/027);
                       #   Traveler (+ emergency contact fields, DR-030) +
                       #   BookingAddon folded in (DR-011, DR-015);
                       #   listTravelersForDeparture = data-minimized guide/
                       #   driver client-list, internal only, no REST route
                       #   (DR-030/031); getBookingForTraveler = reverse
                       #   traveler->booking lookup, used by visa's
                       #   facilitator queue (DR-031)
    invoicing/         # Invoice + Payment (stubbed DPO gateway) (DR-012)
    notifications/     # WhatsApp→SMS→email fallback, no repository.ts (DR-013)
    documents/         # Document metadata + Vercel Blob gateway, access:
                       #   'private' (DR-015; first real DR-010 usage);
                       #   generalized uploadDocument (kind-based validation
                       #   table + expiresAt/vehicleId/driverProfileId/
                       #   guideProfileId, DR-017/030)
    fleet/             # Vehicle + DriverProfile + GuideProfile (compliance
                       #   docs via documents module), complianceStatus rule
                       #   (DR-017); linked to Departure via Assignment
                       #   (DR-018); GuideProfile folded in (DR-030) rather
                       #   than a standalone guides module -- reuses this
                       #   module's anti-BOLA/compliance-document plumbing
    assignment/        # Assignment (Departure -> vehicle/driver/guide),
                       #   departuresOverlap double-booking rule (DR-018),
                       #   now also enforced for guideUserId + a GuideProfile
                       #   ACTIVE-status gate when one exists (DR-030);
                       #   self-service portal (schedule page) since DR-021
    visa/              # VisaApplication (per Traveler, SUBMITTED ->
                       #   APPROVED/REJECTED), canDecide rule; traveler
                       #   identity snapshotted onto it (DR-019); listForFacilitator
                       #   = VISA_FACILITATOR's whole-org queue,
                       #   FacilitatorVisaView, travelStartDate resolved via
                       #   booking+catalog modules (DR-031) -- the sole
                       #   visa-overview surface since DR-032 removed
                       #   IMMIGRATION_OFFICER/OfficerVisaView/listForCountry
                       #   entirely; contactTraveler/requestMissingDocuments
                       #   (DR-034) resolve the notification recipient via
                       #   bookingService.getBookingForTraveler (a Traveler
                       #   isn't itself a User)
    itinerary/         # Itinerary (1:1 Booking, DRAFT/IN_REVIEW/APPROVED) +
                       #   ItineraryDay (per-day schedule) + Hotel/Restaurant
                       #   (lightweight reference entities) + join tables
                       #   (DR-033); composes booking/assignment/catalog's
                       #   public interfaces rather than duplicating vehicle/
                       #   driver/guide assignment data, which stays owned by
                       #   the assignment module
    immigration/       # CountryRegulation (DR-034) -- platform-wide
                       #   reference data (no organizationId, no RLS, same
                       #   precedent as TaxRate); write is SUPERADMIN-only
                       #   (isCountryRegulationWriter), the first real
                       #   behavioral gap between SUPERADMIN and
                       #   PLATFORM_ADMIN in this app -- see rbac.ts's
                       #   country_regulation.write comment for why the
                       #   permission matrix alone can't express it
    ratings/           # Customer Ratings & Feedback (DR-037) -- the first
                       #   reviews system in this codebase (DR-029/030
                       #   deliberately left DriverProfile/GuideProfile with
                       #   no rating field pending exactly this). RatingCode
                       #   (single-use, 30-day expiry) + Review +
                       #   ReviewSubjectRating (per-driver/per-guide);
                       #   averageRating/ratingCount live-recomputed onto
                       #   DriverProfile/GuideProfile/Organization on every
                       #   submission. Guest lookup/submit flow is no-ctx
                       #   (mirrors bookingService.lookupByConfirmationCode);
                       #   staff issue/read paths are rating.issue/
                       #   rating.read. fleetService.recordDriverRatingAggregate/
                       #   recordGuideRatingAggregateByUserId are this
                       #   codebase's first no-ctx cross-module WRITE (every
                       #   prior "caller already gates" method was a read)
    insights/          # Insights & Decision Making (DR-038) -- read-only
                       #   executive dashboard, NO repository.ts (owns no
                       #   table, same shape as notifications) -- composes
                       #   booking/invoicing/assignment/fleet/ratings/visa
                       #   through their public interfaces only.
                       #   getDashboardSummary deliberately serializes every
                       #   composed call + enrichment loop (sequential
                       #   await, not Promise.all) after a real
                       #   connection-pool-exhaustion finding during
                       #   testing -- bursting many concurrent withOrg
                       #   transactions choked this sandbox's Neon pool even
                       #   against an empty org, so this trades latency for
                       #   robustness on what's a low-traffic admin page
    finance/           # Financial Management (DR-039) -- cost-plus pricing
                       #   engine. Six platform-wide, effective-dated rate
                       #   tables (StaffRate/HotelRate/TransportRate/
                       #   FoodBeverageRate/ActivityFee/ImmigrationCostRate,
                       #   no organizationId/RLS, same precedent as
                       #   TaxRate/CountryRegulation/RolePermission) feed a
                       #   per-package PackageCostBreakdown + zero-or-more
                       #   PackageCostLineItem rows (these two ARE org-
                       #   scoped, real RLS) that compute
                       #   computedBaseCostMinor/computedSellingPriceMinor
                       #   and write the per-seat result back onto
                       #   TourPackage.priceMinor (now nullable -- a new
                       #   package starts unpriced until costed or
                       #   overridden). finance_config.write is never
                       #   seeded to any role including PLATFORM_ADMIN --
                       #   isFinanceConfigWriter blocks everyone but
                       #   SUPERADMIN at the service layer, same layering
                       #   as isCountryRegulationWriter (DR-034)
    tracking/          # Tracking (DR-041) -- no repository.ts, owns no
                       #   table, same shape as insights/notifications.
                       #   Two pure rules: resolveTripProgress (NOT_STARTED/
                       #   IN_PROGRESS/COMPLETED + day-number/percent,
                       #   computed at the Departure level only -- a shared
                       #   predefined-package departure can serve several
                       #   Bookings each with its own or no Itinerary, so
                       #   there's no canonical itinerary to resolve
                       #   day-by-day detail from) and locationFreshness
                       #   (FRESH/STALE/UNKNOWN, 24h threshold).
                       #   getFleetSnapshot composes fleet's StarlinkKit/
                       #   Vehicle lookups + assignment's listAllAssignments
                       #   + catalog's getDepartureDetail, sequential await
                       #   throughout (Insights' DR-038 connection-pool
                       #   precedent, not /staff/schedule's Promise.all)
    settings/          # Settings (DR-042) -- closes DR-035's parked
                       #   "Configure system settings" item. Owns TaxRate
                       #   (existed since Phase 0/DR-006, no CRUD/UI until
                       #   now) and new PlatformRate (the platform's own
                       #   commission on every online payment, seeded 5%).
                       #   Both platform-wide, effective-dated, no
                       #   organizationId/RLS, same precedent as
                       #   CountryRegulation/RolePermission.
                       #   platform_settings.write is never seeded to any
                       #   role including PLATFORM_ADMIN --
                       #   requireSettingsWriter blocks everyone but
                       #   SUPERADMIN at the service layer, same layering
                       #   as isFinanceConfigWriter/
                       #   isCountryRegulationWriter. invoicingService
                       #   snapshots the effective platform rate onto new
                       #   nullable Invoice.platformFeeMinor/
                       #   platformFeeRateBp -- an informational split of
                       #   totalMinor, never added to it
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
  **Since DR-035**, what a role grants is DB-backed (`RolePermission`, global
  table, no RLS — same precedent as `TaxRate`) and editable at runtime by
  SUPERADMIN via `/staff/admin/permissions`, not a static in-memory map.
  SUPERADMIN itself is the one hardcoded, permanently-uneditable wildcard
  exception (`can`/`assertCan` short-circuit true for it, never consulting
  the DB) — every other role, including PLATFORM_ADMIN, is fully editable.
  `can`/`assertCan` now take a `PermissionSource` (`{ roles, permissions }`)
  instead of a bare role list; the permission set is resolved once per
  request inside `authService.resolveSession` and attached to
  `AuthContext.permissions`, keeping both functions synchronous.
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

---

## Domain & regulatory context (Namibia, DRC, Zambia & Zimbabwe)

Why the app is shaped the way it is — and the real-world rules any feature
touching operators, vehicles, guides, visas, or destinations must respect.
**All figures are effective-dated and change often; never hardcode them —
verify against NTB/MEFT (Namibia), ICCN/Ministry of Tourism (DRC), and the
relevant Zambia/Zimbabwe authorities/embassies. Treat this as orientation,
not legal ground truth.**

**Four regimes, one platform.** Namibia, the DRC, Zambia, and Zimbabwe (the
last two added DR-034) have very different tourism governance. This is the
reason for per-country tax (DR-006), per-country operator compliance
(BR-12), country-scoped visa applications (`VisaApplication.country`,
DR-019), EN/FR bilingual content, and packages priced in one of four
currencies with **no FX conversion anywhere** (never rank/compare by price
across currencies — see `scorePackagesForQuiz`).

**Country Regulations (DR-034, `immigration` module) is the structured
source of truth going forward** for visa requirements, required documents,
processing times, entry conditions, immigration fees, embassy details,
health requirements, travel advisories, and special restrictions, one row
per country — staff-editable at `/staff/country-regulations`
(`SUPERADMIN`-only write). The bullets below (Namibia/DRC detail predating
DR-034) and the seeded Zambia/Zimbabwe rows are general-knowledge starting
points, not verified against each country's actual immigration authority —
correct them in the UI, not by hand-editing this file or `seed.ts`.

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
  `SUPERADMIN`/`admin.all` actions are audited. Since DR-035 the permission
  matrix itself is a runtime-editable, SUPERADMIN-only attack surface — a
  role-identity check (`isSuperAdmin`), not just a permission, gates who can
  write it, and SUPERADMIN's own access can never be edited away.

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
  no such capability exists yet (superseded 2026-07-16 by DR-036, once
  DR-016 established tourists never sign up at all). First real Playwright coverage + a new CI
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
- **Guest-site content/UX polish, Phase A of a 10-item batch (2026-07-11):**
  footer got a real tagline ("...for Visit Kasai & Mufasa Safaris and Tours"),
  a `© PolCo Tours, a Cyber PolCo Product` credit line, empty-href social
  icons, and new `Terms`/`Policies` placeholder pages next to Admin Access
  (same honest-placeholder convention as Contact, since OI-02/03 are still
  open); About page's lead paragraph now states the Visit Kasai & Mufasa
  Safaris framing directly; FAQ gained Namibia/DRC visa, safety, and
  yellow-fever entries, hedged per this doc's own "effective-dated, verify
  against NTB/DGM/embassies" framing rather than stated as fixed fact;
  Contact page is now a real two-office (Namibia/DRC) layout with clearly
  labeled "coming soon" placeholder details (not fabricated, per the same
  OI-02/03 reasoning); staff login page gained a back-arrow-to-`/`, a
  centered `BrandMark` (previously unused there), and a "contact your admin
  to reset your password" line; `/packages` gained a real search box
  (`?q=`), and `catalogService.listPublicPackages` now takes an optional
  `{ country?, search? }` filter (in-memory over the org's package list —
  deliberately not pushed into a Prisma `where` clause, since DR-005's
  single-tenant launch means this list is small; revisit if that changes).
  No schema/permission/integration change, so no new DR — three more phases
  (the map, i18n, and quotation-flow work below) are each large enough to
  need their own DR.
- **Homepage Africa/Namibia/DRC map, Phase B of the same batch (DR-022,
  2026-07-11):** new `src/components/AfricaMap.tsx` between the homepage's
  Featured and How-it-works sections. `react-simple-maps` (the originally
  scoped dependency) turned out not to support React 19 at all (`npm
  install` fails with `ERESOLVE`) — switched to `@visx/geo`+`@visx/
  responsive`+`@visx/tooltip`+`@visx/event`+`topojson-client`+`world-atlas`,
  all confirmed React-19-clean before installing. World map with Africa
  highlighted; a "Zoom into Namibia & DR Congo" button animates a CSS-
  transitioned `<g>` transform centered on the two countries' computed
  centroids and switches them to a second highlight color; hovering either
  shows a tooltip from new `src/lib/country-facts.ts` (capital/language/
  currency/population/area, labeled as estimates). New `src/lib/
  africa-country-ids.ts` holds the AU-member ISO-numeric-3 set used only for
  map coloring. Deliberately simple click-to-zoom (no `@visx/zoom` drag/
  scroll/pinch — avoids the common scroll-jacking problem on an embedded
  decorative map). Could not visually verify the rendered SVG/hover/zoom in
  this sandbox (no browser or screenshot tool available) — confirmed instead
  via a clean `tsc`/lint pass and an error-free dev-server SSR request (the
  topojson parse + conversion ran successfully); a human should click
  through it in a real browser before considering this fully verified.
- **Real i18n infrastructure + language switcher, Phase C of the same batch
  (DR-023, 2026-07-12):** new `next-intl` `4.13.2` (confirmed React 19/Next
  15-clean before installing, this time checked up front). Cookie-based
  locale (no `/en`/`/fr` URL prefix) -- completes scaffolding already sitting
  unused in `src/middleware.ts` (it resolved a candidate locale but only
  wrote a response header nothing read; now it seeds the actual `locale`
  cookie on first visit). New `src/i18n/request.ts` +
  `src/messages/{en,fr}.json` (only `Nav`/`Footer`/`HomePage` namespaces
  translated so far -- every other guest page is still plain English,
  deliberately incremental) + a hover-opening `language-switcher.tsx`
  (writes the cookie via a Server Action, then `router.refresh()`).
  `NextIntlClientProvider` wraps only the guest route group's layout, not
  the true root -- staff dashboard untouched. `User.preferredLocale`
  (notification-template language, DR-013) is a separate concept, not
  unified with this. Verified via dev-server curl requests with different
  `Cookie`/`Accept-Language` combinations (same no-browser-tool limitation
  as DR-022) -- all three scenarios rendered correctly with no errors.
- **Guided journey, sites dropdown, quote-request flow, pay-in-full -- final
  phase of the batch (DR-024, 2026-07-12):** `BookingStatus` gains
  `QUOTE_REQUESTED`, `PaymentKind` gains `FULL` -- both additive-only enum
  changes, applied directly to the shared dev/production Neon DB (no
  separate staging env, DR-005) with explicit user confirmation, using
  `neondb_owner` ephemerally (never written to `.env` -- an earlier attempt
  to stage it there was correctly blocked and reverted immediately). Key
  insight: "request a quotation" is just transitioning an existing `HELD`
  booking (already capacity-checked) to `QUOTE_REQUESTED`
  (`bookingService.requestQuotation`, reusing `booking.cancel`'s
  permission/ownership shape) -- no new creation path, no new capacity
  logic needed. Per explicit user choice, staff can confirm a quote
  directly with no automatic seat re-check (accepted risk, mitigated only
  by a UI caution, not a hard gate). New `PaymentKind.FULL` is mutually
  exclusive with the deposit/balance split; new `amountForPaymentKind`
  replaces a fragile ternary that would have silently mischarged a `FULL`
  payment. Both booking-detail pages gained a first-payment-decision fork
  (deposit / full / (guest only) quote) -- caught and fixed a real bug in
  review: the deposit/balance buttons had no `booking.status === 'HELD'`
  gate at all, so a quote-requested booking would still have shown "Pay
  deposit". New `/staff/quote-requests` queue page. `StepIndicator`
  (previously just the 4-page booking wizard) now spans the whole journey
  from `/quiz` through payment as one continuous progress bar, per the
  user's explicit "one merged wizard" choice -- implemented by extending
  the existing step-indicator/page-based flow rather than rewriting the
  already-tested traveler/passport/payment logic; `/packages/[packageId]`
  stays indicator-free (shared with plain browse traffic). New
  sites-to-visit quiz question (`src/lib/destination-sites.ts`, a static
  curated list -- no `Site` entity) scores additively on top of the
  existing tag score. This closes out the 10-item guest-site redesign
  batch started this session (Phase A had no DR; Phases B/C/D are DR-022
  through DR-024).
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
- **Self-service "my schedule" portal done 2026-07-11 (DR-021):** closes the
  gap DR-018/019/020 each independently deferred. No new permission (reuses
  `assignment.read`, held by `TOUR_GUIDE`/`DRIVER`/`VEHICLE_OWNER` since
  DR-018) and no schema change -- the dashboard-gate blocker DR-018 cited was
  already removed by DR-020's `isStaffRole` widening, so this increment was
  purely: enrich `GET /api/v1/assignments/mine`'s bare foreign keys into
  something displayable, and wire up a page. New `/staff/schedule` (read-only,
  no `actions.ts`) composes `assignmentService.listMyAssignments` +
  `catalogService.getDepartureDetail` + `authService.getUser` + two new
  `fleet` methods directly in the page -- same convention the manager-side
  departure-detail page already established, no new shared service method.
  The real design decision: `fleetService.getVehicle`/`getDriverProfile`'s
  anti-BOLA check only allows a fleet manager role or the record's own
  `ownerId`/`userId`, so a `DRIVER` viewing a vehicle they're assigned to but
  don't own would 404. New `fleetService.listVehiclesByIds`/
  `listDriverProfilesByIds` deliberately skip that filter (org-scoped only),
  mirroring `authService.getUser`'s existing "no internal permission check;
  caller already gates" convention -- safe since the caller only ever passes
  IDs drawn from their own `listMyAssignments` result. New `StaffNav` entry
  also surfaces for manager roles (they hold `assignment.read` too); harmless,
  renders the same empty state non-target roles already got from
  `listMyAssignments`. Two real bugs caught in review before this shipped, not
  by the (network-blocked) test run: (1) `catalogService.getDepartureDetail`
  404s for a non-operator role once a departure leaves `SCHEDULED`
  (`isDepartureVisible`) -- routine for a `COMPLETED` trip in someone's own
  history, so a plain `Promise.all` over departure lookups would 500 the
  whole page the first time any user had one; fixed with `Promise.allSettled`,
  dropping the rows it can't resolve. (2) `TOUR_GUIDE` holds `assignment.read`
  but not `fleet.read` (only `DRIVER`/`VEHICLE_OWNER` do) -- calling the two
  new fleet methods unconditionally would 403 for a guide; fixed by checking
  `can(ctx.role, 'fleet.read')` first and skipping straight to the page's
  existing "Unknown vehicle/driver" fallback text when it's false, rather
  than granting `TOUR_GUIDE` a permission it's never needed before.
- **Homepage rotating dot-globe tried and reverted (2026-07-14):** a
  `d3-geo`-based rotating dot-matrix globe (`WorldDotGlobe.tsx`, between Hero
  and Featured) was built, debugged (see the `ParentSize`-collapses-to-0-
  height Gotcha below, found while diagnosing it), and then removed at the
  user's request the same session. `d3-geo`/`@types/d3-geo` were reverted
  back out of `package.json` (no longer a direct dependency); the
  `ParentSize` fix itself stays, since it also fixed a real, independent bug
  in `AfricaMap`. Don't re-propose a rotating globe here without the user
  asking again.
- **Visa resubmission after rejection done 2026-07-14 (DR-025):** closes the
  DR-019-deferred dead end. Design call: mutate the SAME `VisaApplication`
  row back to `SUBMITTED` on resubmit rather than a history/versioning
  table -- `travelerId` is DB-enforced `@unique` (strict 1:1 with
  `Traveler`), so a history table would mean breaking that 1:1 or bolting on
  a child table, real complexity for a 3-state enum with one resubmission
  path; the durable "rejected once, for reason X, on date Y" record already
  lives forever in the append-only `audit_logs` table via
  `audit('visa.decided'/'visa.resubmitted', ...)`. Two new additive columns
  on `visa_applications`: `rejectionReason String? @db.VarChar(500)` (new
  optional `DecideVisaInput.reason`, persisted only while REJECTED -- without
  it resubmission would be meaningless, nobody could see what to fix) and
  `resubmissionCount Int @default(0)` (display-only counter). New
  `visaService.resubmitApplication`/`domain.canResubmit` (mirrors
  `canDecide`: true only for `REJECTED`) resets `status`/`decidedAt`/
  `rejectionReason`, **also nulls `documentId`** (a stale rejected document
  must stop 200'ing from `GET .../visa/document`), and **bumps
  `submittedAt`** (`listForCountry`/`listAll` order by `submittedAt desc`, so
  a resubmitted application needs to resurface for review, not sort as
  stale). New `POST .../visa/resubmit` route, same `visa.process` permission
  and anti-BOLA check as `submit`/`decide` -- no RBAC change. New
  `resubmissionCount` also on `OfficerVisaView` (bare count); `rejectionReason`
  deliberately kept off it to preserve that view's existing BR-10
  minimization posture. No `VisaStatus` enum change, no `rls.sql` change.
  Both new columns applied directly via `db push` to the shared
  dev/production Neon database with explicit user confirmation
  (`neondb_owner` used ephemerally, never written to `.env`) -- same
  precedent as DR-024. Small addition to the existing read-only
  `TOUR_OPERATOR` "Visa" line on the staff booking-detail page to surface
  the reason/count; still no dashboard UI for `VISA_FACILITATOR` (same gap
  DR-019/020/021 already flagged -- submit/decide/resubmit all stay
  API-only for it).
- **Superadmin user management + multi-role RBAC done 2026-07-15 (DR-026):**
  replaces CLI-only staff account creation with a real `/staff/admin/users`
  page + `/api/v1/users*` routes (`admin.all`, no new permission). **A user
  can now hold several simultaneous roles** -- repurposes the long-unused
  `Membership` model (widened `@@unique` to `[userId, organizationId, role]`)
  as the real role-set source of truth for admin-created accounts;
  `User.role` stays a single "primary" role for tourist/guest self-signup,
  unchanged. `AuthContext.role: Role` is now `AuthContext.roles: Role[]`
  (union semantics in `rbac.ts`'s `can`/`assertCan`/`isStaffRole`) -- a large
  mechanical refactor across every module's service, `route-guard.ts`/
  `staff-guard.ts`, `StaffNav`, and three staff-page `actions.ts` files that
  validate a target user's role (now checked against their full role set).
  `assignment/service.ts`'s `listMyAssignments` now unions a caller's
  assignments across every role they hold, not just the first match.
  Generated one-time passwords (`better-auth/crypto`'s
  `generateRandomString`) force a new `mustChangePassword` flag, gated by a
  new `/staff/change-password` page (sits outside `(dashboard)`, same
  redirect-loop-avoidance as `/staff/login`). Soft-delete (`deactivateUser`)
  turned out to need almost no new plumbing -- `User.deletedAt` and its
  read-side checks (`resolveSession`, `findUserByEmail/ById`, `listByRole`)
  already existed and already treated a deleted user as unauthenticated;
  only the write side was missing. New RLS policy for `organization_members`
  (`Membership`'s real table name) -- unused since Phase 0, so it never got
  one either; now load-bearing, it needed the same tenant isolation every
  other org-scoped table has. Per explicit user instruction, every existing
  `User` row was then deleted (`scripts/reset-all-users.ts`, cascading to
  `Membership`/`Session`/`Account`/`Booking`+everything hanging off a
  booking/`DriverProfile`; `Assignment.guideUserId`/`Vehicle.ownerId`
  survived `SET NULL`'d) and a single bootstrap `SUPERADMIN`
  (`cyberpolco@gmail.com`) created with a real, operator-chosen password (no
  `mustChangePassword`, unlike admin-created accounts).
- **Bookings module v2 done 2026-07-15 (DR-027):** reconciles an external
  spec against the existing booking system. `BookingStatus` fully replaced
  (not additive) with an 11-value lifecycle (`DRAFT` through `REFUNDED`) --
  `AWAITING_DEPOSIT` is the new hold (was `HELD`); no dedicated `EXPIRED`
  value, an expired hold lazily sweeps to `CANCELLED`. New `BookingOrigin`
  (`PREDEFINED_PACKAGE`/`TAILOR_MADE`) -- a tailor-made booking has no
  `Departure` (`departureId` now nullable), priced afterward by staff via
  new `sendQuotation`/`acceptQuotation`, with `customCountry` standing in
  for a departure's package country in tax/visa lookups. New
  `Booking.bookingReference` (`POL-2026-000154`-style, from a Postgres
  sequence) coexists with the unchanged, still-non-guessable
  `confirmationCode`. New `Booking.specialRequests`. Payment success now
  drives booking status (`invoicingService.resolvePayment` calls the new
  `bookingService.recordPaymentReceived` through the module's public
  interface) -- `confirm` now requires `DEPOSIT_PAID`/`FULLY_PAID` instead
  of being payment-agnostic. New staff-only `refund` (`CANCELLED ->
  REFUNDED`, status-only -- no real payment-reversal mechanism exists).
  Deposit split stays 40%/60% (spec's "60%" was confirmed-imprecise
  wording). `booking.create` RBAC unchanged (`TOUR_OPERATOR` keeps it,
  per explicit user direction, despite the spec's literal "Super Admin or
  Platform Admin" wording). New guest `/tailor-made` entry point + staff
  `?tailorMade=1` wizard branch; new routes `POST /bookings/tailor-made`,
  `.../quotation`, `.../quotation/accept`, `.../refund`. Fixed a real bug
  found mid-implementation: `prisma/seed.ts`'s `Membership` upsert
  (DR-026) used the raw unscoped client, which now 403s against DR-026's
  own RLS policy -- routed through `withOrg` like every other write there.
- **Packages module done 2026-07-15 (DR-028):** closes two related gaps
  against an external spec. **(1) First-ever staff package-management UI**
  -- `/staff/packages` (list/create) + `/staff/packages/[id]` (edit +
  archive/delete/duplicate), closing a gap CLAUDE.md had flagged since
  DR-016 (creation/editing was API-only). New `TourPackage.packageReference`
  (`PKG-00034`-style, coexists with the `id`, same pattern as
  `Booking.bookingReference`). New `deletePackage` (soft delete via the
  already-scaffolded `deletedAt` -- explicit user choice over a real hard
  DELETE, which would cascade to real Departures/Bookings) and
  `duplicatePackage` (package definition only, no departures, per explicit
  user choice). No RBAC change -- `catalog.write` already covers
  `TOUR_OPERATOR` + admins. **(2) Tailor-made booking -> operational
  itinerary** -- per explicit user confirmation, the same client-facing
  concept as DR-027's `TAILOR_MADE` booking, not a new package-level entity;
  "approved" (per explicit user choice) = the moment staff sends the
  quotation, not payment. Research confirmed a genuine, unsolved gap:
  `Assignment` requires a real `Departure`, which required a real
  `TourPackage` -- a `TAILOR_MADE` booking had neither, so no path to
  resource assignment existed. Fixed by making `Departure.tourPackageId`
  nullable too (mirroring `Booking.departureId`'s DR-027 precedent) for a
  new "bespoke" departure kind, with new `Departure.currency`/
  `customCountry` snapshotting what a package join would otherwise supply
  (the catalog module can't depend on the booking module -- new
  `catalogService.createBespokeDeparture` takes plain params, never a
  `Booking`). New `bookingService.convertToItinerary` (staff-only, reuses
  `booking.confirm`) creates the bespoke departure and attaches it via
  `Booking.departureId` -- from that point on the booking behaves like any
  other departure-having booking for invoicing, visa, and critically
  `assignmentService.createAssignment`, all completely unchanged. New
  routes: `DELETE .../packages/{id}`, `POST .../packages/{id}/duplicate`,
  `POST /bookings/{id}/convert-to-itinerary`.
- **Fleet Management expansion done 2026-07-15 (DR-029):** new Starlink kit
  resource (`kitId`/`status`/1:1 `vehicleId`/staff-entered
  `lastLatitude`/`lastLongitude` -- no live API feed yet, `OI-09`), vehicle
  `vin`, an append-only `MaintenanceRecord` log, and driver `languages`.
  Driver rating deliberately NOT built (no reviews system exists yet -- a
  staff-typed number with nothing backing it would mislead); "availability"
  needed no new field (computed from the existing `departuresOverlap`
  double-booking gate, DR-018). New `assignmentService.recommendAssignment`
  -- a simple, transparent, equal-weighted rules-based scorer (capacity fit,
  maintenance recency, distance-from-pickup via new `src/lib/geo.ts`
  haversine helper, no new external dependency), explicitly **not** the
  Phase 3 "AI assignment engine" and honest about that distinction
  throughout the code/docs; built now ahead of the roadmap line below per
  explicit user choice. New `Departure.pickupLatitude`/`pickupLongitude`
  (first mutable field on an existing departure, `PATCH
  /departures/{id}`). Staff UI: `/staff/fleet` gained a Starlink Kits
  section; the departure-detail assignment form pre-selects/reorders by
  recommendation but never narrows the pickable list, so a manual override
  always stays fully available.
- **Guides Module done 2026-07-15 (DR-030):** closes the "TOUR_GUIDE isn't a
  fleet concept" gap DR-017 explicitly parked. New `GuideProfile` (1:1 with a
  `TOUR_GUIDE`-role `User`, mirrors `DriverProfile`: `languages`,
  `specialties` (freeform), `status`) -- folded into the existing `fleet`
  module per explicit user choice, not a new standalone module.
  `Assignment.guideUserId` still points at `User` unchanged; `GuideProfile`
  is a satellite skills/compliance profile looked up by `userId`. New
  `Document.guideProfileId` FK + `GUIDE_CERTIFICATION` kind (expiry-tracked,
  same as `DRIVER_LICENSE`). New `Traveler.emergencyContactName`/
  `emergencyContactPhone`/`emergencyContactRelation` (genuinely new field).
  Rating deliberately deferred (no reviews system, same DR-029 precedent,
  applied again on explicit user confirmation); availability computed from
  the existing `departuresOverlap` data, no new field. `TOUR_GUIDE` gains
  `fleet.read` (self-view only, previously deliberately absent per DR-021).
  Closed a real pre-existing asymmetry while it was fresh:
  `assignmentService.createAssignment`'s `guideUserId` branch had no
  ACTIVE-status gate and no double-booking/overlap check at all (unlike
  vehicle/driver) -- now a `GuideProfile` that exists and is `SUSPENDED`
  blocks the assignment, and the same date-overlap check vehicles/drivers
  get now applies to guides too (a guide with no profile at all is still
  assignable -- profiles are new and shouldn't retroactively block anyone).
  Guide dashboard extends the existing `/staff/schedule` self-service page
  (DR-021) rather than a new route: a `TOUR_GUIDE`-only section shows daily
  itinerary (the existing assignment list, chronological, no new
  day-by-day-activity entity), pickup points (reuses `Departure
  .pickupLatitude`/`pickupLongitude`, DR-029, previously staff-only), and a
  client list. **The client list surfaced a real security finding**:
  `bookingService.list`'s `isStaff()` check treats `TOUR_GUIDE` identically
  to `TOUR_OPERATOR` and would leak the *entire org's* booking manifest if a
  guide-facing UI called it directly -- so the new
  `bookingService.listTravelersForDeparture` (+ data-minimized
  `TravelerDutyView`, excluding `idOrPassportNumber`/`passportDocumentId`) is
  deliberately NOT exposed as a public `/api/v1` route, unlike nearly every
  other capability this session -- it follows the "caller already gates"
  convention (`fleetService.listVehiclesByIds`, DR-021), safe only because
  its one caller (the schedule page) only ever passes a `departureId` drawn
  from the caller's own `listMyAssignments` result. Per explicit user choice,
  shows full duty-relevant detail (disabilities/allergies/drink preference/
  emergency contact), not a stripped subset -- still strictly scoped to the
  guide's own assigned departures. New `/staff/fleet/guides*` pages +
  `/api/v1/fleet/guides*` routes, mirroring the driver equivalents.
- **My Schedule done 2026-07-15 (DR-031):** personalizes the self-service
  dashboard per operational role. `DRIVER` now gets the same client-list/
  daily-itinerary/pickup-points section DR-030 built for `TOUR_GUIDE` --
  pure reuse, just widening the gate (`DRIVER` already held `booking.read`);
  `VEHICLE_OWNER` deliberately excluded, no operational reason to see a
  client manifest. "Tour notes" reuses `Booking.specialRequests` (already
  shown in the DR-030 client-list header), not a new field. The real new
  work: a first-ever `VISA_FACILITATOR` dashboard -- this role had zero
  staff UI at all (DR-019/020/021/025 each independently re-flagged the
  gap), despite already passing the `isStaffRole` baseline gate since
  DR-020; there was also no "list mine to process" query anywhere, only
  per-traveler actions. New `visaService.listForFacilitator` +
  `FacilitatorVisaView` (richer than the BR-10-minimized `OfficerVisaView`,
  since this role already holds unscoped `visa.process`) -- whole-org queue
  per explicit user choice (no per-facilitator assignment concept exists or
  was added); "missing documents" flags ANY status with no document
  attached, per explicit user choice (not an existing invariant --
  `uploadDocument` has no status gate anywhere); "visa deadlines" derived
  live via `Traveler -> Booking -> Departure.startDate` (or
  `Booking.customTravelStart` for a tailor-made trip), since
  `VisaApplication` has no date field of its own -- required a new reverse
  lookup, `bookingService.getBookingForTraveler`, same "caller already
  gates" convention as DR-030's `listTravelersForDeparture`. New
  `GET /api/v1/visa/queue` (a real public route this time -- no
  caller-supplied id, same safe shape as `listForCountry`) + `/staff/
  visa-queue` page, read-only (decide/resubmit/upload stay API-only).
  Fixed two stale `tests/rbac.test.ts` assertions left over from DR-030
  giving `TOUR_GUIDE` `fleet.read` (that test file wasn't run during
  DR-030's own verification).
- **Immigration/Officers removed 2026-07-16 (DR-032):** per explicit user
  instruction ("no longer needed"), a full teardown -- not just hiding the
  UI. `IMMIGRATION_OFFICER` dropped from the `Role` enum (the 2 accounts
  holding it were confirmed test fixtures and deleted first, then the enum
  swapped the same create-new-type/drop-old-type way DR-027 replaced
  `BookingStatus`); `User.assignedCountry` column dropped entirely;
  `immigration.read` removed from `rbac.ts`. Removed
  `authService.assignOfficerCountry`/`listOfficers`, `visaService
  .listForCountry`/`OfficerVisaView` (DR-031's `listForFacilitator` already
  gave admins a superset whole-org view, so nothing needed it once the
  officer's own use was gone), `/staff/immigration`, `/staff/admin/officers`,
  and their API routes. `/staff/visa-queue` (DR-031) is now the only
  visa-overview surface for staff.
- **Itinerary Management done 2026-07-16 (DR-033):** a first-class
  `Itinerary` entity (1:1 with a Booking, "the operational plan for the
  entire tour"), where "itinerary" previously only meant "a Departure with
  Assignments" (DR-028). New standalone `itinerary` module (mirrors DR-018's
  `assignment` precedent) with `Itinerary` (DRAFT/IN_REVIEW/APPROVED, notes,
  trip-level emergency contact), `ItineraryDay` (per-day schedule: times,
  pickup/drop-off, planned sites, activities, travel time), and lightweight
  `Hotel`/`Restaurant` reference entities (name/contact only, no compliance
  tracking) + join tables -- none of these existed in any form before this
  increment. Deliberately does NOT duplicate vehicle/driver/guide assignment
  data (stays owned by the `assignment` module, shared across every booking
  on a `PREDEFINED_PACKAGE` departure) -- composes it via
  `assignmentService`/`bookingService`/`catalogService` instead. Per
  explicit user choice, `SUPERADMIN`/`PLATFORM_ADMIN` stay undifferentiated
  (confirmed zero exceptions exist anywhere in this codebase before
  deciding) -- new `itinerary.read`/`write`/`approve` permissions all go to
  `TOUR_OPERATOR` too, matching the "Tour operator = platform admin"
  precedent; `TOUR_GUIDE`/`DRIVER` get `itinerary.read` only, anti-BOLA-
  scoped to their own assigned departures. Removed the redundant
  `/staff/departures` **nav tab** (a mid-session clarification -- NOT the
  `Departure` model or its shared-capacity-pooling role, which stay fully
  intact); the working assignment page at `/staff/departures/[id]` is
  unchanged, just reached via links from the new itinerary page and from
  the booking-detail page instead (widened from `TAILOR_MADE`-only to any
  booking with a `departureId`). Guide/driver read-only access needed no new
  page -- the same `/staff/itineraries/{id}` page already renders read-only
  once `itinerary.write`/`itinerary.approve` are both false for the viewer;
  `/staff/schedule` only gained a discovery link section.
- **Immigration Module + Country Regulations + Zambia/Zimbabwe expansion
  done 2026-07-16 (DR-034):** `TOUR_OPERATOR` gains `visa.process` (explicit
  user instruction: "the Tour Operator is by default also a Visa
  Facilitator role"). New `CountryRegulation` (platform-wide, no
  `organizationId`/RLS, same precedent as `TaxRate`) holds visa
  requirements/required documents/processing time/entry conditions/
  immigration fee (BR-02 money)/embassy contact/health requirements/travel
  advisories/special restrictions, one row per country. **The first real
  behavioral gap between `SUPERADMIN` and `PLATFORM_ADMIN` in this app**:
  country-regulation write is `SUPERADMIN`-only, enforced one layer below
  the permission matrix (both admin roles pass the route-level
  `country_regulation.write` gate via their `'*'` wildcard; a new
  `isCountryRegulationWriter` check inside `immigration/service.ts`
  actually excludes `PLATFORM_ADMIN`). New standalone `immigration` module;
  new `/staff/country-regulations` pages (read-only for
  `country_regulation.read` holders, write UI only for `SUPERADMIN`). New
  real notification-triggering `visaService.contactTraveler`/
  `requestMissingDocuments` (resolve the recipient via
  `bookingService.getBookingForTraveler`, since a `Traveler` isn't itself a
  `User`), surfaced on the existing `/staff/visa-queue` page. Full platform
  expansion to Zambia (ZM) and Zimbabwe (ZW) as real operable countries
  (explicit user choice) -- confirmed the schema/zod/tax layers were
  already country-agnostic, so this was a data/config/UI change: seed
  data, every guest/staff country dropdown, the homepage map's highlight
  set, and new (unverified, flagged for `SUPERADMIN` review) `FAQ`/`About`
  content. Packages in the new countries stay priced in `USD`/`EUR` (no new
  `Currency` enum value). Per explicit user choice, the guest Contact page
  was **not** extended with fabricated Zambia/Zimbabwe office entries.
- **User Management done 2026-07-16 (DR-035):** against an external spec
  giving `SUPERADMIN` "Add/Remove/Edit users, Reset passwords, Manage
  permissions, Configure system settings" and `TOUR_OPERATOR` only
  operational access. User picked the large reading of "Manage
  permissions" -- a full runtime permission-matrix editor, not just
  per-user role editing -- so this is the first change to how RBAC itself
  is sourced. New `RolePermission` table (global, no `organizationId`/RLS,
  same precedent as `TaxRate`/`CountryRegulation`) is now the live source
  of what a role grants; `rbac.ts`'s old static `MATRIX` is renamed
  `DEFAULT_PERMISSIONS` and only used once, to seed `RolePermission`.
  **`SUPERADMIN` stays a hardcoded, unconditional wildcard** (never gets
  `RolePermission` rows, can never be locked out) while **`PLATFORM_ADMIN`
  loses its own wildcard** and becomes the first fully DB-editable admin
  role (seeded with everything except `country_regulation.write`, which
  DR-034's `isCountryRegulationWriter` still blocks unconditionally). `can`/
  `assertCan` now take a `PermissionSource` (`{ roles, permissions }`)
  instead of a bare role list -- kept synchronous by resolving the
  permission set once per request inside `authService.resolveSession`,
  avoiding an async ripple into `StaffNav` (a client component) and
  `tests/rbac.test.ts`'s pure unit tests. New `authService.updateUser`/
  `resetPassword` (edit name/email/phone/roles; generate-and-reveal-once a
  new temporary password + force `mustChangePassword`, reusing
  `createUser`'s existing reveal-once UX) and `getPermissionMatrix`/
  `setRolePermission`, both `SUPERADMIN`-only via the same "RBAC decides
  the broad category, service does the narrower role-identity check"
  layering DR-034 established -- `PLATFORM_ADMIN` passes the route's
  `admin.all` gate but is rejected inside the service, and the staff page
  itself additionally redirects any non-`SUPERADMIN` caller so
  `PLATFORM_ADMIN` never sees a control that would 403. New
  `PATCH /users/{userId}`, `POST /users/{userId}/reset-password`,
  `GET/PATCH /permissions` routes; new `/staff/admin/users/{userId}` (edit
  + reset-password panel) and `/staff/admin/permissions` (168
  auto-submitting checkboxes, `EDITABLE_ROLES` x `ALL_PERMISSIONS`, no
  batch save step) pages. **"Configure system settings" is deliberately
  not built** -- the user chose "I have specific settings in mind" but
  never answered which ones (tax rates / notification toggles / branding /
  other); flagged as an open question, not guessed at. **This session also
  surfaced and fixed a systemic test-fixture bug**, twice triggered against
  the real production database: a `beforeAll` throwing partway through
  (transient Neon-pooler/transaction-timeout issues, both pre-existing
  sandbox gotchas) left a scoping variable `undefined`, and Prisma silently
  drops `undefined`-valued `where`-clause keys, turning a fixture's
  `afterAll` cleanup (`deleteMany({ where: { organizationId: orgId } })`)
  into an unscoped `deleteMany({})` that wiped the entire `users` table
  (which has no RLS policy) -- including both real `SUPERADMIN` accounts.
  Recovered both times via `db:seed` + `scripts/create-staff-user.ts` +
  `scripts/set-staff-password.ts`, each with explicit user confirmation.
  Fixed at the root across all 51 affected test files with an early-return
  guard against an undefined id before any `deleteMany` cleanup call.
- **Staff booking-for-client no-account-required done 2026-07-16 (DR-036):**
  closes the gap DR-014 explicitly deferred (staff could only book for a
  tourist who already had an account, found by email) -- inconsistent with
  DR-016 establishing that tourists never sign up at all, ever. New
  `authRepository.createBareTourist` (login-less `User` row, no `Account`
  row, can never sign in) + `authService.findOrCreateTouristByEmail`
  (lookup-then-create, `forbidden` if the caller has no `organizationId`).
  `bookings/new/actions.ts`'s two staff booking actions switched to it; the
  now-unreachable `client_not_found` error UI was removed from
  `bookings/new/page.tsx`. A client created this way is still findable via
  the existing `bookingService.lookupByConfirmationCode`, same as a guest
  checkout -- no new lookup path. The *other* `getUserByEmail` call sites
  (fleet guide/driver/vehicle-owner lookup, assignment guide lookup) are
  untouched -- those are real login-capable accounts, where "must already
  exist" is still correct. New `tests/auth-find-or-create-tourist.test.ts`.
  No schema/permission/RLS change.
- **Customer Ratings & Feedback done 2026-07-17 (DR-037):** the first
  reviews system in this codebase -- closes what DR-029/030 deliberately
  left open ("no rating field -- deferred until a real reviews system
  exists"). Staff generate a single-use, 30-day-expiring **Rating Code**
  once a booking's invoice reaches `PAID` (new `rating.issue`, checked via
  `Invoice.status`, never `Booking.status` -- a booking can reach
  `CONFIRMED`/`COMPLETED` off a deposit-only payment, DR-027); a client
  later rates the departure's actual driver(s)/guide(s) and the agency
  overall via a public, session-less `/rate` flow (`bookingReference` +
  Rating Code, mirrors `confirmationCode` + last-name "find my booking,"
  DR-016 -- no new public REST route). New standalone `src/modules/ratings/`
  module: `RatingCode`/`Review`/`ReviewSubjectRating`, plus additive
  `averageRating`/`ratingCount` on `DriverProfile`/`GuideProfile` (removing
  DR-029/030's stale "no rating field" comments) and, new here, on
  `Organization` itself (standing in for "the Tour Operator," DR-005).
  Averages are recomputed live via `AVG()`/`COUNT()` on every submission,
  not incrementally maintained. **Two deliberate new precedents**:
  `fleetService.recordDriverRatingAggregate`/
  `recordGuideRatingAggregateByUserId` are this codebase's first no-ctx
  cross-module *writes* (every prior "caller already gates" method was a
  read); `ratingsRepository.recomputeOrganizationAggregate` is the first
  time application code (not `seed.ts`) writes to `Organization` (no owning
  module, same precedent as `TaxRate` pre-DR-034). Per explicit user
  choice, the assignment-recommendation change went beyond the minimal
  hook: `assignmentService.recommendAssignment` (DR-029) now sorts drivers
  by rating (unrated sorts last, never excluded) **and** ranks guides in
  its output for the first time ever (`AssignmentRecommendation` gains
  `guides`/`recommendedGuideId`). New `rating.issue`/`rating.read`
  permissions (`PLATFORM_ADMIN`/`TOUR_OPERATOR`), new `/staff/ratings`
  moderation page, a "Generate Rating Code" panel on the booking-detail
  page, new `RATING_CODE_ISSUED` notification event, new RLS policies +
  3 cross-tenant test files, and a DB-backed full-flow test
  (`tests/ratings-lookup.test.ts`) mirroring `booking-lookup.test.ts`'s
  anti-enumeration/rate-limiting posture. This is Module 14 of a larger
  5-module spec (Insights/Finance/Tracking/Settings-CMS/Ratings) -- the
  user chose to build Ratings first as the smallest, most self-contained
  piece; the other four are separate future increments, not started.
- **Insights & Decision Making done 2026-07-17 (DR-038):** Module 10 of the
  same 5-module spec, picked next as "the easiest" -- confirmed by research
  before writing code: **no new Prisma tables at all**, every metric is
  composed live from `booking`/`invoicing`/`assignment`/`fleet`/`ratings`/
  `visa` data that already exists. New `src/modules/insights/` (no
  `repository.ts`, same shape as `notifications`) with a new `insights.read`
  permission (`PLATFORM_ADMIN`/`TOUR_OPERATOR`) gating the page/route --
  every composed call keeps its own existing permission check underneath,
  confirmed both roles already hold all of them. Two small additive methods
  elsewhere: `invoicingService.listAllForOrg` (staff-only check, since
  `invoice.read` is also held by `TOURIST`) and
  `assignmentService.listAllAssignments` (gated `assignment.write`, the
  existing manager-only permission). Metric definitions are explicit,
  flagged design calls, not spec-literal: "active tours" =
  `Booking.status === 'IN_PROGRESS'` (the only "currently running" concept
  in this schema); revenue/outstanding are reported **per currency, never
  combined** (BR-02, no FX conversion anywhere in this app); "utilization"
  is an honest plain ratio, explicitly not a real BI/scheduling-
  optimization engine, same posture as `recommendAssignment`'s DR-029
  disclaimer. **A real robustness finding, not just a test issue**: the
  first draft composed its ~9 data sources via one big `Promise.all` (plus
  nested per-package/per-assignment `Promise.all`/`allSettled` loops) --
  this sandbox's Neon connection pool measurably choked on the resulting
  burst of concurrent `withOrg` transactions, reproducing even against an
  *empty* org (pointing at concurrency itself, not query cost). Rewritten
  to serialize every composed call (sequential `await`) -- a deliberate
  latency-for-robustness tradeoff appropriate for a low-traffic admin page,
  and one that protects the real production Neon pool too, not just this
  sandbox. New `GET /insights` + `/staff/insights` (five sections matching
  the spec's own grouping). No RLS/schema change -- the first DR this
  session that didn't touch `prisma/schema.prisma`.
- **Financial Management done 2026-07-17 (DR-039):** Module 6 of the same
  5-module spec (after Ratings/DR-037 and Insights/DR-038). Replaces
  `TourPackage.priceMinor` as a plain staff-typed number with a cost-plus
  pricing engine: six new platform-wide, effective-dated rate tables
  (`StaffRate`, `HotelRate`, `TransportRate`, `FoodBeverageRate`,
  `ActivityFee`, `ImmigrationCostRate` -- no `organizationId`/RLS, same
  precedent as `TaxRate`/`CountryRegulation`) feed a per-package
  `PackageCostBreakdown` (+ zero-or-more `PackageCostLineItem` rows for
  extra drinks/meals/activities -- these two ARE org-scoped, real RLS) that
  computes `computedBaseCostMinor`/`computedSellingPriceMinor` and writes
  the per-seat result back onto `TourPackage.priceMinor`, now nullable (a
  brand-new package starts unpriced until costed or overridden;
  `isBookable` treats `null` as not-bookable; `bookingService.createHold`
  gained a defensive re-check since TS can't correlate that invariant
  across the isBookable/effectivePrice boundary). Admin price overrides
  carry `overridePriceMinor`/`overrideReason`/`overriddenByUserId`/
  `overriddenAt` (current-state only -- the durable audit trail is the
  existing append-only `audit_logs`, same precedent as DR-025). New
  `finance_config.read`/`finance_config.write` permissions (deliberately
  not the pre-existing `finance.read`, which is invoice/payment data held
  by `VEHICLE_OWNER` too); `finance_config.write` is never seeded to any
  role including `PLATFORM_ADMIN` -- a new `isFinanceConfigWriter` check
  blocks everyone but `SUPERADMIN` at the service layer, same "route
  passes via `'*'`, service still rejects" layering as
  `isCountryRegulationWriter` (DR-034). New standalone `src/modules/
  finance/` module, 12 new routes (`/api/v1/finance/rates/*` x 6 +
  `/api/v1/catalog/packages/{packageId}/cost-breakdown`), and
  `/staff/finance/rates` + `/staff/packages/{packageId}/cost-breakdown`
  pages. Schema pushed + RLS applied to the shared dev/production Neon DB
  via `neondb_owner` (ephemeral, never written to `.env`, explicit user
  confirmation), same precedent as every prior schema change this session.
  Full finance test suite (31 tests, 6 files) verified green post-migration,
  both standalone and inside the full `npm test` run.
- **Tracking done 2026-07-17 (DR-041):** the last of the two remaining
  modules from the 5-module spec (Ratings/Insights/Finance already shipped).
  Combines real-time-ish fleet location (building on DR-029's `StarlinkKit`,
  still staff-entered-only -- OI-09, no live feed) with booking/itinerary
  trip-progress ("where is this trip right now"). New standalone
  `src/modules/tracking/` -- no new Prisma tables at all, same "compose via
  existing public interfaces" shape as Insights. Two pure rule functions:
  `resolveTripProgress` (NOT_STARTED/IN_PROGRESS/COMPLETED + day-number/
  percent-complete, computed at the Departure level only -- a shared
  predefined-package departure can have several bookings, each with its own
  or no Itinerary, so there's no canonical itinerary to resolve day-by-day
  detail from) and `locationFreshness` (FRESH/STALE/UNKNOWN, 24h threshold).
  New `tracking.read` permission (`PLATFORM_ADMIN`/`TOUR_OPERATOR`, mirrors
  `insights.read`). New `GET /api/v1/tracking` + `/staff/tracking` page
  (Fleet Locations + Active Trips tables), plus a small "Day X of Y" badge
  added to the existing self-service `/staff/schedule` page for TOUR_GUIDE/
  DRIVER. A design-review pass before coding caught two real issues: (1)
  "active trips" must filter on the new `resolveTripProgress`'s own
  `IN_PROGRESS` status, not Insights' utilization-window definition (which
  deliberately includes not-yet-started departures -- fine for a
  utilization ratio, wrong for a page that would otherwise show a future
  trip as "active"); (2) the sequential-`await`-not-`Promise.all`
  discipline this composition follows is Insights' own documented
  connection-pool-exhaustion fix, not `/staff/schedule`'s (which still uses
  `Promise.all`/`allSettled` and was incorrectly assumed to be the
  precedent early in planning). No RLS/schema change -- the second DR this
  session (after DR-038) that didn't touch `prisma/schema.prisma`.
- **Settings done 2026-07-17 (DR-042):** the last of the original 5-module
  spec (Ratings/Insights/Finance/Tracking already shipped) -- closes
  DR-035's parked "Configure system settings" item. New standalone
  `src/modules/settings/` gives `TaxRate` (Phase 0/DR-006, previously
  read-only via `src/lib/tax.ts`, no UI) a real staff CRUD UI, and adds a
  new platform-wide `PlatformRate` table -- the platform's own commission
  on every online payment ("the cost to maintain the platform," seeded
  5%). `invoicingService.getOrCreateInvoiceForBooking` now also snapshots
  `getEffectivePlatformRate()` onto new nullable `Invoice.platformFeeMinor`/
  `platformFeeRateBp` columns -- an informational split of the existing
  `totalMinor`, never added on top of it; shown staff-only on the
  booking-detail invoice card. New `platform_settings.read`/`.write`
  permissions, `.write` never seeded to any role including
  `PLATFORM_ADMIN` (same `isFinanceConfigWriter`/`isCountryRegulationWriter`
  layering). Nav reorganized: a new `SidebarShell` groups the two new
  Settings pages with five pre-existing tabs (Country Regulations,
  Operational Rates, Insights, Users, Permissions) behind one "Settings"
  entry in `StaffNav` -- none of those five pages' URLs/permissions changed.
  **The same migration also added `SiteContent`/`FaqEntry` schema
  scaffolding for a future Content module (replacing the hardcoded guest
  About/FAQ pages) -- deliberately left unbuilt (no module/routes/UI/tests)
  and undocumented as its own DR per explicit user instruction this
  session; don't mistake their presence in `schema.prisma` for a shipped
  feature.** `lint`/`typecheck`/`build` all green; pure-domain tests
  (`tests/settings.domain.test.ts`, `tests/rbac.test.ts`) green. The
  DB-backed suites (`tests/api/settings.api.test.ts`,
  `tests/api/settings.security.test.ts`, `tests/api/invoices.api.test.ts`)
  could not be verified to completion in-session (the documented
  intermittent Prisma-to-Neon connectivity gotcha, see Gotchas) but all
  passed cleanly once CI ran them on the DR-043 push below (10/6/2 tests
  respectively) -- this increment is now fully verified.
- **Password-management hardening done 2026-07-17 (DR-043, pushed —
  commit `0498891`, CI green):** closes two small gaps left in
  DR-026/DR-035's password work. `scripts/set-staff-password.ts` now
  unconditionally forces `mustChangePassword: true` (previously only
  conditionally touched `emailVerified`) -- matches
  `authService.createUser`/`resetPassword`'s existing precedent, so
  **every** path that sets a password on someone else's behalf forces a
  change on next sign-in; `scripts/create-staff-user.ts` stays the one
  deliberate exception (the operator-chosen, permanent bootstrap-account
  password, DR-026). Exercised for real this session: regenerated
  `cyberpolco@gmail.com`'s (the bootstrap SUPERADMIN) password via this
  script, confirming `mustChangePassword` is now set on that account.
  New voluntary self-service password change: `/staff/change-password`
  (DR-026, previously reachable only via the forced `mustChangePassword`
  redirect) now also accepts a voluntary visit from any signed-in staff
  session, via the same no-permission-gate `requireAnyStaffSession` escape
  hatch, closing the real gap that `SUPERADMIN`'s own row is unreachable
  through `/staff/admin/users/{userId}` (self-edit/self-reset both
  blocked) -- a `SUPERADMIN` had no in-app way to change an already-real
  password at all. New `forced` flag on the extracted
  `ChangePasswordForm` component only changes copy/Cancel-button
  visibility; the underlying `authClient.changePassword` call is
  identical either way. No schema/permission/RLS change --
  `mustChangePassword`/`requireAnyStaffSession` both already existed.
  `lint`/`typecheck`/`build` green; `tests/staff-guard.test.ts`/
  `tests/rbac.test.ts` green (both pure, no DB); CI confirmed the full
  suite (including the DR-042 DB-backed tests above) green on push.
  **Small same-day follow-up (uncommitted), per explicit user
  direction:** the "Change password" entry point moved from a standalone
  dashboard top-nav link into the Settings sidebar instead
  (`settings-items.ts`'s `SETTINGS_ITEMS`, no `permission` field -- new
  convention on `SidebarItem`/`SidebarShell` where an omitted permission
  means "visible to any staff role," since this is the one Settings entry
  every role needs regardless of what else they can configure); and the
  "Polco Tours · Staff" brand text in the dashboard top bar is now a link
  back to the public homepage (`/`, same target as `/staff/login`'s own
  back-arrow) -- a plain client-side navigation, doesn't touch the
  session, so a staff member returning to `/staff/*` afterward is still
  signed in. No DR needed for either -- pure UI relocation, no
  schema/permission/business-rule
  change.
- **Permission-matrix editor UX fixes done 2026-07-17 (DR-044):** two
  explicit user-requested fixes to `/staff/admin/permissions`. Column
  headers (`EDITABLE_ROLES`, some long) get real horizontal spacing now
  (`whitespace-nowrap px-3`, scoped to this page only -- the shared
  `Table`/`Th` components stay untouched since every other table relies on
  their current tight spacing). More substantively, **reverses DR-035's
  original "168 auto-submitting checkboxes, no batch save step" design**:
  all matrix state now lives in one new client component
  (`permission-matrix-form.tsx`, replacing the old
  `permission-checkbox.tsx`) buffered locally until an explicit "Save
  changes" button is pressed, with a dirty-count label and a "Discard
  changes" escape back to the last-saved state. `actions.ts`'s
  single-cell `toggleRolePermissionAction` replaced with
  `saveRolePermissionChangesAction(changes[])`, which loops the exact same
  per-cell `authService.setRolePermission` call as before (every changed
  cell still gets its own audit row) -- only the commit point moved from
  onChange to a deliberate click. UI-layer only: no `authService`/
  `rbac.ts`/API route change, existing `GET/PATCH /permissions` tests
  untouched. `lint`/`typecheck`/`build` all green.
  **Uncommitted follow-up, same day, per further user feedback**: the
  first pass's per-cell `px-3` padding still left columns unevenly sized
  (auto table layout sizes each column to its own longest content, so
  `DRIVER` and `VISA_FACILITATOR` ended up different widths despite
  identical padding) -- switched to `table-fixed` with an explicit
  `<colgroup>` (permission column `w-56`, every role column the same
  `w-28`) and centers each checkbox with a `flex justify-center` wrapper
  `div` rather than relying on `text-align` alone, so it sits dead-center
  under the header text regardless of role-name length. Role headers no
  longer force `whitespace-nowrap` -- a long name like
  `VISA_FACILITATOR` wraps onto two lines within its fixed-width column
  instead of overflowing into the neighboring one.
- **Phase 2 (remaining):** WhatsApp/SMS fallback real wiring (OI-05/06/07),
  real Starlink API integration (OI-09), and CRM.
- **Phase 3:** a first rules-based assignment recommendation shipped early
  (DR-029, explicit user choice) -- real ML/AI-driven assignment and
  analytics remain open.
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
`GET /api/v1/immigration/officers` (`admin.all`), for API-level testability ·
DR-021 self-service "my schedule" portal: closes the gap DR-018/019/020 each
deferred, no new permission (`assignment.read`, already held) and no schema
change since DR-020 already removed the dashboard-gate blocker DR-018 cited.
New `/staff/schedule`, read-only, composes `assignmentService
.listMyAssignments` + `catalogService.getDepartureDetail` +
`authService.getUser` + new `fleetService.listVehiclesByIds`/
`listDriverProfilesByIds` directly in the page, same convention as the
manager-side departure-detail page. The two new fleet methods deliberately
skip the ownership check `getVehicle`/`getDriverProfile` enforce (a `DRIVER`
viewing their assigned-but-not-owned vehicle would otherwise 404), mirroring
`authService.getUser`'s "caller already gates" convention -- safe since IDs
only ever come from the caller's own assignments · DR-025 visa resubmission
after rejection: closes the DR-019-deferred dead end by mutating the SAME
`VisaApplication` row `REJECTED -> SUBMITTED` (not a history table --
`travelerId` is DB-unique, and `audit_logs` is already the durable history)
via new `resubmitApplication`/`canResubmit`, new `rejectionReason`/
`resubmissionCount` columns, and a new `POST .../visa/resubmit` route
reusing the existing `visa.process` permission · DR-026 superadmin user
management + multi-role RBAC: `Membership` (unused since Phase 0) widened
to `[userId, organizationId, role]` and made the real multi-role source of
truth; `AuthContext.role` renamed to `roles: Role[]` (union semantics
throughout `rbac.ts` and every service); new `authService.listUsers/
createUser/deactivateUser` (`admin.all`) + `/staff/admin/users` +
`/api/v1/users*`; generated one-time passwords force a new
`mustChangePassword` gate (`/staff/change-password`); soft-delete reused
the already-existing `deletedAt` read-side checks; new RLS policy for
`organization_members`; every existing `User` deleted and a single
bootstrap `SUPERADMIN` created per explicit user instruction · DR-027
bookings module v2: `BookingStatus` fully replaced (not additive) with an
11-value lifecycle reconciling an external spec against the existing
system; new `BookingOrigin` (`TAILOR_MADE` bookings have no `Departure`,
priced afterward via new `sendQuotation`/`acceptQuotation`); new
`bookingReference` (coexists with `confirmationCode`) and
`specialRequests`; payment success now drives booking status via new
`recordPaymentReceived` (invoicing calls it through booking's public
interface); new staff-only `refund`; deposit split stays 40/60;
`booking.create` RBAC unchanged per explicit user direction · DR-028
packages module: first-ever staff package-management UI (`/staff/packages*`)
+ new `packageReference`; `deletePackage` (soft delete) and
`duplicatePackage` (definition only, no departures); `Departure
.tourPackageId` made nullable (mirroring DR-027's `Booking.departureId`) for
a new bespoke-departure kind so an approved `TAILOR_MADE` booking can
finally get a real operational itinerary via new
`bookingService.convertToItinerary` -- the existing `Assignment` module
then works completely unchanged · DR-029 fleet management expansion: new
`StarlinkKit` (staff-entered location, no live API yet -- `OI-09`),
`Vehicle.vin`, `MaintenanceRecord` log, `DriverProfile.languages`; driver
rating deliberately skipped (no reviews system to back it); availability
computed from the existing overlap check, no new field. New
`assignmentService.recommendAssignment` -- an honest, simple rules-based
scorer (capacity fit + maintenance recency + haversine distance-from-pickup
via new `src/lib/geo.ts`, no new external dependency), explicitly not real
AI, built ahead of the Phase 3 roadmap line per explicit user choice; the
staff assignment form pre-selects/reorders by it but never narrows the
pickable list · DR-030 Guides Module: closes DR-017's parked "TOUR_GUIDE
isn't a fleet concept" gap. New `GuideProfile` (languages/specialties/status,
mirrors `DriverProfile`) folded into the `fleet` module per explicit user
choice, not a new module; new `GUIDE_CERTIFICATION` document kind + new
`Traveler` emergency-contact fields. Rating deferred and availability
computed from existing data, same DR-029 precedent, confirmed again. Closed a
pre-existing gap: `createAssignment`'s `guideUserId` branch gained an
ACTIVE-status gate (when a profile exists) and the same overlap/double-
booking check vehicles/drivers already had. `TOUR_GUIDE` gains `fleet.read`
(self-view only). Guide dashboard extends `/staff/schedule` (DR-021) with a
data-minimized client list/daily itinerary/pickup points/emergency contacts
section -- new `bookingService.listTravelersForDeparture` is deliberately
NOT a public route (would otherwise leak the org's full booking manifest
through `bookingService.list`'s `TOUR_GUIDE`-treated-as-staff gap), following
the same "caller already gates" convention as `listVehiclesByIds` · DR-031 My
Schedule: personalizes the self-service dashboard per role. `DRIVER` gets
DR-030's client-list/itinerary/pickup-points section too (pure gate widen,
`VEHICLE_OWNER` excluded); "tour notes" reuses `Booking.specialRequests`.
First-ever `VISA_FACILITATOR` dashboard (previously zero staff UI, a gap
DR-019/020/021/025 each re-flagged) -- new `visaService.listForFacilitator` +
`FacilitatorVisaView` (whole-org queue, no per-facilitator assignment
concept, explicit user choice), "missing documents" = any status with no
document (explicit user choice, not an existing invariant), "visa deadlines"
resolved live via `Traveler -> Booking -> Departure.startDate` (or
`customTravelStart`) through a new `bookingService.getBookingForTraveler`
reverse lookup, same "caller already gates" convention as DR-030. New
`GET /api/v1/visa/queue` (a real public route -- no caller-supplied id,
unlike DR-030's `listTravelersForDeparture`) + `/staff/visa-queue` page,
read-only. Fixed two `tests/rbac.test.ts` assertions left stale since DR-030
gave `TOUR_GUIDE` `fleet.read` · DR-032 Immigration/Officers removal: full
teardown per explicit user instruction, not a UI hide. `IMMIGRATION_OFFICER`
dropped from the `Role` enum (2 confirmed test-fixture accounts deleted
first, then the same enum-swap migration technique DR-027 used for
`BookingStatus`); `User.assignedCountry` column dropped; `immigration.read`
removed from `rbac.ts`. Removed `authService.assignOfficerCountry`/
`listOfficers`, `visaService.listForCountry`/`OfficerVisaView` (superseded
by DR-031's `listForFacilitator`), `/staff/immigration`, `/staff/admin
/officers`, and their routes -- `/staff/visa-queue` is now the sole
visa-overview surface for staff · DR-033 Itinerary Management: new
standalone `itinerary` module -- `Itinerary` (1:1 Booking, DRAFT/IN_REVIEW/
APPROVED, trip-level emergency contact), `ItineraryDay` (per-day schedule),
`Hotel`/`Restaurant` (lightweight reference entities, no compliance
tracking) + join tables, none of which existed before. Composes
`assignment`/`booking`/`catalog` rather than duplicating vehicle/driver/
guide assignment data. Per explicit user choice, `SUPERADMIN`/
`PLATFORM_ADMIN` stay undifferentiated (verified zero prior exceptions) --
new `itinerary.read`/`write`/`approve` all go to `TOUR_OPERATOR` too;
`TOUR_GUIDE`/`DRIVER` get `itinerary.read` only, anti-BOLA-scoped to their
own assigned departures. "Remove Departure" clarified mid-session to mean
the redundant `/staff/departures` nav tab, not the `Departure` model --
`/staff/departures/[id]` (vehicle/driver/guide assignment) stays unchanged,
linked from the new itinerary page and a widened booking-detail link
instead. Guide/driver read-only access reuses the same itinerary detail
page (renders read-only once `itinerary.write`/`approve` are both false) ·
DR-034 Immigration Module + Country Regulations + Zambia/Zimbabwe
expansion: `TOUR_OPERATOR` gains `visa.process` (explicit user choice: "the
Tour Operator is by default also a Visa Facilitator role"). New
platform-wide `CountryRegulation` (no `organizationId`/RLS, same precedent
as `TaxRate`) in a new `immigration` module. **First real behavioral gap
between `SUPERADMIN` and `PLATFORM_ADMIN`**: country-regulation write is
`SUPERADMIN`-only, enforced via a new `isCountryRegulationWriter` check
inside `immigration/service.ts` (not expressible in `rbac.ts`'s MATRIX
alone, since both admin roles hold `'*'`). New real notification-triggering
`visaService.contactTraveler`/`requestMissingDocuments`, resolving the
recipient via `bookingService.getBookingForTraveler`. Full platform
expansion to Zambia/Zimbabwe (explicit user choice) -- confirmed
country-acceptance needed no schema/zod change (already plain strings), so
this was seed data + UI dropdowns + map/FAQ/About content; no new
`Currency` enum value (priced in USD/EUR); the guest Contact page
deliberately not extended with fabricated offices there. · DR-035 User
Management: the first change to how RBAC itself is sourced. New
`RolePermission` table (global, no RLS, same precedent as `TaxRate`/
`CountryRegulation`) becomes the live source of what a role grants;
`rbac.ts`'s static `MATRIX` is renamed `DEFAULT_PERMISSIONS` and demoted to
a one-time seed source. `SUPERADMIN` stays a hardcoded, permanently
unlockable wildcard; `PLATFORM_ADMIN` loses its own wildcard and becomes
the first fully DB-editable admin role. `can`/`assertCan` now take a
`PermissionSource` (`{ roles, permissions }`) instead of a bare role list,
kept synchronous by resolving the set once per request in
`authService.resolveSession`. New `authService.updateUser`/`resetPassword`
(reveal-once temporary password + forced `mustChangePassword`) and
`getPermissionMatrix`/`setRolePermission` (`SUPERADMIN`-only, same
route-gate/service-check layering as DR-034's `isCountryRegulationWriter`).
New `PATCH /users/{userId}`, `POST /users/{userId}/reset-password`,
`GET/PATCH /permissions` + `/staff/admin/users/{userId}` and
`/staff/admin/permissions` (168-checkbox matrix) pages. "Configure system
settings" deliberately not built -- user never specified which settings.
Also fixed a systemic test-fixture bug (undefined-id fixtures silently
becoming unscoped `deleteMany({})` calls) across 51 files, root-caused
after it wiped the real `users` table twice this session · DR-036 staff
booking-for-client no-account-required: closes the gap DR-014 explicitly
deferred, inconsistent with DR-016's "tourists never sign up." New
`authRepository.createBareTourist` (login-less `User` row) +
`authService.findOrCreateTouristByEmail` (lookup-then-create); the two
staff booking actions use it instead of erroring on an unknown email; a
client created this way is still findable via the existing
`lookupByConfirmationCode`. No schema/permission/RLS change · DR-037
Customer Ratings & Feedback: the first reviews system in this codebase,
closing what DR-029/030 deliberately left open. New standalone `ratings`
module (`RatingCode`/`Review`/`ReviewSubjectRating`) -- staff issue a
single-use, 30-day Rating Code once a booking's invoice is `PAID` (new
`rating.issue`, checked via `Invoice.status` not `Booking.status`); a
client rates the departure's actual driver(s)/guide(s) + the agency
overall via a public, session-less `/rate` flow mirroring `find-booking`'s
two-factor pattern. Additive `averageRating`/`ratingCount` on
`DriverProfile`/`GuideProfile`/`Organization`, recomputed live via
`AVG()`/`COUNT()` on every submission. Two new precedents:
`fleetService.recordDriverRatingAggregate`/
`recordGuideRatingAggregateByUserId` are the first no-ctx cross-module
*writes* in this codebase (every prior one was a read); writing
`Organization`'s aggregate is the first time application code (not
`seed.ts`) touches that table. Per explicit user choice,
`assignmentService.recommendAssignment` now sorts drivers by rating and
ranks guides for the first time ever. New `rating.issue`/`rating.read`
permissions, `/staff/ratings` page, booking-detail "Generate Rating Code"
panel, `RATING_CODE_ISSUED` notification. This is Module 14 of a
larger 5-module spec (Insights/Finance/Tracking/Settings-CMS/Ratings) --
built first as the smallest, most self-contained piece; the other four
are separate future increments · DR-038 Insights & Decision Making
(Module 10 of the same spec, picked next as "the easiest"): new
`src/modules/insights/` (no `repository.ts`, owns no table) composing
`booking`/`invoicing`/`assignment`/`fleet`/`ratings`/`visa` data live --
**no new Prisma tables at all**. New `insights.read` permission plus two
small additive methods (`invoicingService.listAllForOrg`,
`assignmentService.listAllAssignments`). Metric definitions (active
tours = `IN_PROGRESS`, per-currency revenue never combined, utilization =
a plain honest ratio) are explicit flagged design calls. Found and fixed a
real concurrency issue during testing: composing via one big `Promise.all`
burst exhausted this sandbox's Neon connection pool even against an empty
org; rewritten to serialize every composed call, trading latency for
robustness (also protects the real production pool). New `GET /insights`
+ `/staff/insights`. First DR this session with no schema/RLS change ·
DR-039 Financial Management (Module 6 of the same spec): replaces
`TourPackage.priceMinor`'s plain staff-typed number with a cost-plus
pricing engine -- six new platform-wide effective-dated rate tables
(`StaffRate`/`HotelRate`/`TransportRate`/`FoodBeverageRate`/`ActivityFee`/
`ImmigrationCostRate`, no RLS, same precedent as `TaxRate`) feed a new
org-scoped `PackageCostBreakdown`/`PackageCostLineItem` (real RLS) that
computes and writes back a per-seat price; `priceMinor` is now nullable
(unpriced until costed or overridden), `isBookable`/`createHold` updated
accordingly. Admin overrides carry current-state columns only, durable
history stays in `audit_logs` (DR-025 precedent). New
`finance_config.read`/`finance_config.write` permissions -- write is
never seeded to any role including `PLATFORM_ADMIN`, blocked at the
service layer by a new `isFinanceConfigWriter` (`SUPERADMIN`-only), same
layering as `isCountryRegulationWriter` (DR-034). New standalone
`finance` module, 12 routes, 2 staff pages. Schema pushed + RLS applied
to the shared Neon DB via `neondb_owner` (ephemeral, explicit user
confirmation); full new finance test suite (31 tests, 6 files) verified
green both standalone and inside the full suite · DR-040 fixes a real
CI/disaster-recovery gap found checking CI status right after DR-039's
push: `booking_reference_seq`/`package_reference_seq` were hand-created
against the shared Neon DB and never scripted, so every fresh Postgres
(CI, or a future `db:setup`) was missing them -- new `prisma/sequences.sql`
+ `scripts/apply-sequences.mjs` + a `db:sequences` step wired into
`db:setup` and both CI jobs fixes it. Also fixed a cascade of stale tests
(API and e2e) the sequence bug had been masking for several pushes,
including one genuine e2e-suite bug (a `.click()`/navigation race in
`fleet.spec.ts`, unrelated to the product) · DR-041 Tracking (the last of
the two remaining spec modules): combines fleet last-known-location
(DR-029's `StarlinkKit`, still staff-entered-only, OI-09) with
departure-level trip progress. New `src/modules/tracking/` -- no new
Prisma tables, same composing shape as Insights. New `tracking.read`
permission, `GET /api/v1/tracking` + `/staff/tracking` page, small
`/staff/schedule` enrichment. A pre-implementation design-review pass
caught two issues: "active trips" needed its own `IN_PROGRESS` filter
rather than reusing Insights' utilization-window definition, and the
sequential-composition precedent to follow was Insights' (not
`/staff/schedule`'s, which still uses `Promise.all`). No schema/RLS
change · DR-042 Settings (last of the 5-module spec): new standalone
`src/modules/settings/` gives the Phase-0-era `TaxRate` a real CRUD UI and
adds a new platform-wide `PlatformRate` (the platform's own commission,
seeded 5%) -- new nullable `Invoice.platformFeeMinor`/`platformFeeRateBp`
snapshot it as an informational split of `totalMinor`, never added to it.
New `platform_settings.read`/`.write` (`.write` never seeded to any role,
same `isFinanceConfigWriter` layering). New `SidebarShell` +
`settings-items.ts` regroup the two new pages with five pre-existing tabs
(Country Regulations/Operational Rates/Insights/Users/Permissions) behind
one "Settings" `StaffNav` entry, no URL/permission changes to those five.
Same migration also scaffolded `SiteContent`/`FaqEntry` for a future
Content module -- deliberately left unbuilt and undocumented as its own
DR per explicit user instruction. DB-backed API/security tests
(`settings.api`/`settings.security`/`invoices.api`) could not be verified
this session (20+ minutes of the Prisma-to-Neon connectivity gotcha,
`psql` unaffected) -- confirmed schema/data state directly via `psql`
instead; re-run those files before fully trusting this increment · DR-043
password-management hardening: `scripts/set-staff-password.ts` now
unconditionally forces `mustChangePassword`, matching
`authService.createUser`/`resetPassword`'s existing DR-026/DR-035
precedent (`scripts/create-staff-user.ts`'s operator-chosen bootstrap
password stays the one deliberate exception); new voluntary self-service
visit to `/staff/change-password` (previously forced-only) closes the gap
where `SUPERADMIN` had no in-app way to change their own already-real
password, since the admin edit/reset-password panel blocks self-service.
No schema/permission/RLS change · DR-044 permission-matrix editor UX
fixes: real column-header spacing on `/staff/admin/permissions`
(`whitespace-nowrap px-3`, scoped to this page, not the shared `Table`
component), and reverses DR-035's original "auto-submit per checkbox, no
batch step" design -- all 168 checkboxes now buffer locally in one new
`permission-matrix-form.tsx` client component and only commit via an
explicit "Save changes" button (with a "Discard changes" escape),
looping the same existing per-cell `authService.setRolePermission` call
so every changed cell still gets its own audit row. UI-layer only, no
`authService`/`rbac.ts`/API-route change.

## Open items — cannot be decided in code (see log OI-01..03, 05..07, 09; OI-04/08 resolved)

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
- **OI-09** Real Starlink API/account access (live kit location feed).
  `StarlinkKit.lastLatitude`/`lastLongitude` is staff-entered for now
  (DR-029). Blocks real-time fleet location tracking.

Surface OI-01..03/05..07/09 to the human — don't invent answers.

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
- **A failed test setup can silently wipe an entire table -- fixed 2026-07-16
  across every affected file, after it hit real production data twice.**
  When a fixture's `beforeAll` throws partway through (e.g. the
  transaction-timeout gotcha above, or the transient Neon-pooler
  connectivity gotcha below), some `afterAll` cleanups still ran with an
  `undefined` id captured from the failed setup — e.g. `admin.user
  .deleteMany({ where: { organizationId: orgId } })` with `orgId` still
  `undefined`. Prisma's client drops keys with an `undefined` value before
  sending the query, silently turning that into `deleteMany({})` — an
  **unscoped delete of every row in the table**. `users` has no RLS policy
  (see the gotcha above on why), so nothing stopped this from deleting
  every real user (Lam + superadmin) not once but **twice** in the same
  session (2026-07-16) — the second time wiping the two accounts that had
  just been recovered from the first wipe. Both incidents were recovered
  via `db:seed` (idempotent, restores Lam) + `scripts/create-staff-user.ts`
  (recreates the superadmin) + `scripts/set-staff-password.ts` (fresh
  generated passwords, `mustChangePassword: true` forced). **Root cause
  fixed** across all 51 affected files: every `afterAll` that scopes a
  delete by a `beforeAll`-assigned id now guards with `if (!id) { await
  admin.$disconnect(); await prisma.$disconnect(); return; }` (or the
  equivalent for a two-org RLS fixture's `orgA`/`orgB` pair) before running
  any scoped `deleteMany`/`delete` — skipping cleanup entirely is safe;
  leftover fixture rows are cheap, a wiped production table is not. Any
  *new* test file added after 2026-07-16 must follow this same guard
  convention, not just the old "trust Prisma to no-op" assumption.
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
- ~~**Production staff sign-in is currently broken with `INVALID_ORIGIN`**~~
  Resolved by 2026-07-11 (someone with Vercel dashboard access fixed
  Production's `BETTER_AUTH_URL`/`NEXT_PUBLIC_APP_URL` and redeployed, per
  the fix path this gotcha originally prescribed) — re-verified same day via
  the same curl-with-and-without-`Origin` test against
  `https://polco-tours.vercel.app/api/auth/sign-in/email`: both now return a
  clean `401 {"code":"INVALID_EMAIL_OR_PASSWORD"}` instead of `403
  INVALID_ORIGIN`. If Production sign-in ever silently 403s again, check
  these two Vercel env vars before re-deriving this from scratch.
- **"Incorrect password" in Production was a missing-credential problem, not
  a bug** (found 2026-07-11, after the `INVALID_ORIGIN` fix above landed):
  querying the single production Neon DB directly showed only **one** `User`
  row anywhere in the system had a `providerId: "credential"` `Account` row
  at all (`cyberpolco@gmail.com`). Every other user, including
  `lam@polcotours.com`, has zero credential rows — per the existing gotcha
  below, `prisma/seed.ts` deliberately seeds Lam with no password — so *any*
  password typed for those emails will always return
  `INVALID_EMAIL_OR_PASSWORD`. There is no separate bug to fix here; the fix
  is running `scripts/set-staff-password.ts <email> <password>` for whichever
  account needs to sign in. As of this session both `cyberpolco@gmail.com`
  and `lam@polcotours.com` have real passwords set. If a staff member reports
  "incorrect password" again, check whether their `User` row has a
  `credential` `Account` at all before assuming the password itself is wrong.
- **Prisma's query engine (not `psql`) intermittently can't reach the Neon
  pooler from this sandbox**, independent of the two gotchas above — running
  `scripts/set-staff-password.ts` failed twice in a row with "Can't reach
  database server at `...-pooler.c-4.eu-central-1.aws.neon.tech:5432`" while
  a direct `psql "$DATABASE_URL"` against the exact same connection string
  succeeded immediately, then the identical `tsx` command succeeded on a
  later retry with no code change. Cause not fully isolated (looked like a
  sandboxed-network policy difference between allowed CLI tools and Prisma's
  compiled query-engine binary at first, but persisted even with the Bash
  tool's sandbox override on, then resolved on its own) — treat it as
  transient and retry rather than assuming a real outage or a regression in
  this repo. **Refined observation (2026-07-15, DR-027 session):** this can
  persist for 15+ minutes straight (many retries, `--dangerouslyDisableSandbox`
  made no difference) while specifically failing only *inside `vitest run`* --
  a plain `npx tsx` script instantiating the exact same `PrismaClient` against
  the exact same `DATABASE_URL` connected immediately, every time, throughout.
  Root cause still not isolated (something about vitest's process/worker
  setup specifically, not a real Neon-side or credential problem) — if a test
  run is stuck failing at the DB-connection step, sanity-check with a bare
  `tsx` script hitting the same Prisma client before assuming the code (or
  the database) is actually broken.
- **`@visx/responsive`'s `ParentSize` silently collapses to 0 height if you
  only give it a Tailwind height class.** `ParentSize` renders its own outer
  div with an inline `style={{width:'100%', height:'100%', position:
  'relative'}}` by default; a `className="h-[420px]"` on that same element
  sets `height` via a CSS class, which loses to the inline style regardless
  of specificity tricks (inline always wins over a class). Since its actual
  measurement child is `position: absolute`, the outer div's real height
  resolves to 0 once the inline `height:100%` shadows the class -- and
  `AfricaMap.tsx` (DR-022) had exactly this bug from the day it was written,
  unnoticed because DR-022's own note already flagged "could not visually
  verify the rendered SVG ... in this sandbox." Found 2026-07-14 building a
  (since-reverted, see Phase status) rotating dot-globe experiment, whose own
  `requestAnimationFrame` loop had a `height === 0` guard that was silently
  short-circuiting every frame -- a real headless-Chromium check (Playwright,
  already a project dependency) showed its `<canvas>` rendering at `height:
  0px` in the live DOM, not just a static-vs-reduced-motion question. Fixed
  `AfricaMap` (the part of this that's still shipped) by passing a
  `style={{ height: 420 }}` prop to `ParentSize` instead of a class (the prop
  the component actually spreads over its own default), and by checking
  `height === 0` (not just `width === 0`) before rendering the SVG.
  Anywhere else `ParentSize` gets used, pass `style`, not a height utility
  class, and check both dimensions before rendering the measured content.
- **A `vi.fn()` mock's return value bypasses `tsc` entirely, even for a type
  as central as `AuthContext`.** Renaming `AuthContext.role: Role` to
  `roles: Role[]` (DR-026) and re-running `tsc --noEmit` caught every real
  call site across `src/` and most test fixtures -- except
  `tests/staff-guard.test.ts`, which mocks `authService.resolveSession` via
  `vi.fn()` and feeds it fixture objects through `.mockResolvedValue({...})`.
  Since `vi.fn()` is untyped by default, TypeScript never checked those
  literals against the real `AuthContext` shape, so three fixtures with a
  stale `role: 'X'` field compiled cleanly and would have silently kept
  testing the *old* single-role code path forever. Found by grepping
  `tests/` directly for `role: '[A-Z_]+'` after `tsc` reported zero errors --
  don't trust a clean `tsc --noEmit` alone to catch every fixture affected by
  a type rename when a test mocks the function whose return type changed;
  grep for the old field name across `tests/` too.
- **`Membership` (`organization_members`) existed since Phase 0 but was
  never queried anywhere in `src/` until DR-026 -- and, being unused, it
  also never got an RLS policy**, unlike every other tenant-scoped table.
  Making it load-bearing for real multi-role authorization data required
  adding that policy for the first time (`prisma/rls.sql` + `npm run
  db:rls`) in the same increment that started actually querying it. If a
  future increment starts using another long-scaffolded-but-unused table,
  check `prisma/rls.sql` for its policy before assuming one already exists
  just because the table itself is old.
- **`bookingService.list`'s `isStaff()` check treats every non-TOURIST role
  identically** -- `TOUR_GUIDE`/`DRIVER`/`VEHICLE_OWNER` get the exact same
  full-org booking manifest (`bookingRepository.listForOrg`) a `TOUR_OPERATOR`
  does, since `isStaff` only distinguishes TOURIST from everyone else (unlike
  `assignment.read`, which IS properly scoped per-role in
  `listMyAssignments`). Found building the Guides Module's "client list"
  (DR-030) -- don't wire any future guide/driver/vehicle-owner-facing UI
  straight to `bookingService.list`/`getById` expecting it to be
  self-scoped; it isn't. Use a narrowly-scoped method instead (see
  `bookingService.listTravelersForDeparture`'s "caller already gates"
  convention) and never expose that kind of method as a public `/api/v1`
  route unless it re-verifies the caller's ownership of the id itself.
- **A pure-domain unit test suite can go stale silently after an `rbac.ts`
  change, with nothing catching it until it's actually run.** DR-030 added
  `fleet.read` to `TOUR_GUIDE` but `tests/rbac.test.ts` (a plain, fast,
  no-DB unit test -- nothing about running it is hard or slow) wasn't run as
  part of that increment's verification, so two hardcoded `.toBe(false)`
  assertions about `TOUR_GUIDE`'s fleet permission sat wrong for a full
  session until DR-031 happened to touch `rbac.ts` again and someone ran
  the file. `tsc`/lint don't catch this class of bug (the assertions are
  perfectly well-typed, just factually wrong) -- after any `rbac.ts` edit,
  run `tests/rbac.test.ts` specifically (it's fast, no DB needed), not just
  the DB-backed tests for whatever module prompted the change.
- **CI-only failures don't show up in local runs when local dev always talks
  to the same already-provisioned Neon DB.** `booking_reference_seq` (DR-027)
  and `package_reference_seq` (DR-028) were created by hand directly against
  the shared dev/production database when those DRs shipped, but never
  captured in any script (`prisma db push` can't express a custom formatted
  sequence default). Every fresh Postgres -- CI's ephemeral service on every
  run, or a new environment via `npm run db:setup` -- was silently missing
  them, so `packages-v2`/`invoices`/`bookings`/`bookings-v2` API tests 500'd
  in CI with `relation "booking_reference_seq" does not exist` for at least
  three consecutive pushes (DR-037, DR-038, DR-039) before anyone ran
  `gh run list` to notice `main`'s CI was red. **Check CI status after every
  push, not just local `npm test`** -- a passing local run only proves the
  code works against whatever DB you happen to be pointed at, which for this
  project's daily workflow is always the one Neon database that's had every
  historical fix applied to it by hand at least once. Fixed (DR-040) with
  `prisma/sequences.sql` + `scripts/apply-sequences.mjs` (mirrors
  `apply-rls.mjs`) + a new `db:sequences` step wired into `db:setup` and both
  CI jobs, between `db:push` and `db:rls`. This was also a live production
  disaster-recovery gap, not just a CI annoyance -- rebuilding the production
  database from schema alone would have hit the same failure.
- **Same class of bug as the `tests/rbac.test.ts` gotcha above, just in an
  API test this time.** DR-040's CI run also surfaced
  `tests/api/visa-facilitator-queue.api.test.ts` asserting `TOUR_OPERATOR`
  gets 403 from `GET /api/v1/visa/queue` -- true when that test was written
  (DR-031) but stale since DR-034 explicitly granted `TOUR_OPERATOR`
  `visa.process`. Nobody had actually run this specific CI job to green
  since DR-034 landed (masked entirely by the DR-040 sequence bug in the
  interim), so it sat wrong for three DRs. Fixed by flipping the assertion
  to expect 200 (the now-correct, intentional behavior), not by reverting
  the permission. After granting/revoking any permission in `rbac.ts`, grep
  `tests/` for the role name against the changed permission's route, not
  just `tests/rbac.test.ts` -- API-level security tests assert the same
  facts and go stale exactly the same way.
- **A disposable local Postgres needs no sudo and no Docker.** To safely
  reproduce a CI-only e2e failure without risking the shared dev/production
  Neon database (running Playwright locally would otherwise seed real-looking
  fixture rows into Lam's real primary org, since e2e fixtures reuse the
  existing primary org rather than creating their own), initialize a
  throwaway cluster into a scratch dir: `/usr/lib/postgresql/16/bin/initdb -D
  <dir> -U postgres --auth=trust`, then start it with
  `pg_ctl -D <dir> -o "-p <port> -k <short-socket-dir>" -l <logfile> start` --
  the `-k` socket directory MUST be short (Unix socket paths cap at 107
  bytes; a `/tmp/claude-*/.../scratchpad/...` path is too long, use something
  like `/tmp/pg_e2e_sock`). From there, run the exact same `db:push` /
  `db:sequences` / `db:rls` / `db:seed` sequence CI does, then
  `npm run build && npm run start` (or let Playwright's own `webServer` start
  it) against `DATABASE_URL`/`DIRECT_URL` pointed at that instance. Tear down
  with `pg_ctl -D <dir> stop`. **Re-running e2e specs against the same
  un-reset local DB across multiple manual attempts pollutes it** -- several
  of this repo's e2e fixtures hardcode literal values with no dedup (e.g.
  `fleet.spec.ts`'s vehicle plate `'E2E-PLATE-1'`, no unique suffix, no DB
  constraint stopping duplicates) that accumulate across runs and can produce
  confusing, run-dependent failures that look like flakiness but are really
  just leftover data; `db push --force-reset` (or a fresh `initdb`) between
  investigation attempts avoids chasing a self-inflicted ghost.
- **A bare `.click()` on a Next.js Server Action form, immediately followed
  by an assertion, can race the navigation and abort it.** Found investigating
  a real (not flaky -- 100% reproducible with a clean DB) e2e failure in
  `fleet.spec.ts`'s driver-profile-creation test: the redirect's own POST
  request showed `net::ERR_ABORTED` in the Playwright trace's network log
  (`unzip trace.zip` -- `*-trace.network` has one JSON object per request;
  filter for `method":"POST"` and check `response.status`/`_failureText`),
  and the driver profile was never actually created in the DB, confirmed via
  a temporary `console.log(await prisma.driverProfile.findMany())` in the
  test. Root cause: Playwright's own next assertion running against the
  still-loading document can trigger Chromium to cancel the in-flight
  navigation's fetch. Fixed by explicitly awaiting the navigation instead of
  trusting default auto-wait to cover it:
  `await Promise.all([page.waitForURL(/pattern/), button.click()])`. Any
  e2e test that does `.click()` on a form whose action redirects, then
  immediately asserts something that ISN'T itself a `toHaveURL`/heading-text
  check tied to the destination page, is at risk of this same race -- prefer
  the `Promise.all` pattern over a bare click whenever the next assertion
  doesn't already retry-until-navigated on its own.
