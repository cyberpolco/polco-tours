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
(`polcotours.com`) — **but `polcotours.com` itself does not resolve yet**
(OI-02, trademark clearance still open). Production is currently reachable
on two real domains instead: the Vercel default
(`polco-tours.vercel.app`) and a second custom domain, `mufasasafaris.com`
/ `www.mufasasafaris.com` (added DR-072). This was, until DR-168, a
domain/infra state only, not a rebrand — the caution against renaming the
brand or module names off "Mufasa" without an explicit decision still
holds for everything **except** guest-facing display text: DR-168 (explicit
user request) renders every guest-site occurrence of "POLCO Tours" as
**"Mufasa Safaris & Tours"** (header brand link, footer eyebrow/copyright,
homepage partner-placeholder list, package-page `opengraph-image`,
`Footer.tagline`/`AboutPage.defaultTitle` in `en.json`/`fr.json`, and the
guest route group's own `metadata` title/description, scoped via a
`(guest)/layout.tsx` export so it doesn't touch the root layout). The
staff dashboard, transactional notification copy, the root `layout.tsx`
app metadata, the `polcotours.com` brand/domain itself, and every module/
internal identifier are unaffected and still say POLCO TOURS/polcotours —
this remains display-text-only, not a rename of the underlying brand.


Current through **DR-176** (2026-08-24). This file used to carry a running
narrative of every decision inline — that duplicated
`docs/decisions/DECISION_LOG.md` (the canonical, dated record) and made this
file balloon past its size limit. It was trimmed back to the charter's own
rule: describe current state, not history. The sections below (charter,
data & security rules, design system, repository layout, current
architecture summary, roadmap, open items, gotchas) are kept current with
every structural/integration change, per the DR-007 living-document
mandate. **Consult `docs/decisions/DECISION_LOG.md` for the *why* and the
full dated history behind any rule below** — every DR from DR-001 through
DR-160 is there, including the ones that shaped the sections that follow
(e.g. DR-159's RBAC reversal, DR-156's typography self-hosting, DR-155's
Insights rebuild, DR-113's Weather module).

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
| Auth | better-auth `1.6.23`, self-hosted (data in our DB). Multi-domain in production (DR-072) — `src/lib/auth-client.ts` has no hardcoded `baseURL` (falls back to `window.location.origin`); `src/lib/auth.ts`'s `trustedOrigins` allowlists every additional live custom domain beyond `BETTER_AUTH_URL`'s own origin, e.g. `mufasasafaris.com` |
| Validation | zod `4.4.3` |
| Object storage | Vercel Blob `2.6.1`, region `fra1` — **two separate stores**, since a Blob store is public-or-private store-wide, not per-object (DR-130). `polco-tours-documents` (the original store, ambient default `BLOB_READ_WRITE_TOKEN`): passports (private, authenticated streaming route); visa decision documents land in Phase 2. `polco-tours-public-images` (added DR-130, Production+Preview only so far — OI-15): About/FAQ images (DR-071), package images (DR-114), and Home hero images/videos (DR-163), passed its own explicit token (`PUBLIC_BLOB_READ_WRITE_TOKEN_READ_WRITE_TOKEN`, exported from `src/lib/public-image-blob.ts`) rather than relying on the ambient default. Every image upload through this token is compressed to webp server-side first (DR-163, via `sharp`, see below); video (25MB cap, mp4/webm) uploads directly from the browser to this store instead, via `@vercel/blob/client`'s `upload()`/`handleUpload` (`api/v1/cms/media-upload/route.ts`) — necessary because that exceeds Vercel serverless functions' ~4.5MB request-body limit. The `next.config.mjs` `images.remotePatterns` allowlist has one entry for Blob's public host, matching either store's public URL shape |
| Image processing | `sharp` `0.34.5` (DR-163) — was already an undeclared transitive dependency at this exact version; pinned explicitly per the version-pinning rule. Used only by `src/lib/public-image-blob.ts`'s `uploadPublicImage`, which now always recompresses every public image upload to webp (max edge 2560px, quality 80) before storing, regardless of caller/input format — the one shared primitive every public image upload (cms, catalog package images, Home hero) already goes through, so this applies uniformly rather than per-caller |
| Payments | DPO Pay (hosted page, v6, SAQ-A) — stubbed behind a `PaymentGateway` interface, commercial terms still open (OI-01) |
| Cache / rate limiting | Upstash Redis `@upstash/redis 1.38.0` — live in production (`src/lib/rate-limit.ts`) |
| Scheduled jobs | Upstash QStash `@upstash/qstash 2.11.2` — five schedules registered and live in production (`sweep-bookings` every 15 min; `sweep-fleet-availability`/DR-082 and `sweep-user-dormancy`/DR-084 both daily, registered 2026-08-10; `sweep-fleet-cooldowns`/DR-107 hourly and `purge-wizard-progress`/DR-155 daily, both registered 2026-08-19) |
| Email / WA / SMS | Resend · WhatsApp Cloud API · Africa's Talking — Resend + Africa's Talking have real, live credentials (see Open Items for delivery caveats); WhatsApp still unconfigured (OI-06) |
| Tests | Vitest (unit + RLS), Playwright `1.61.1` (E2E) |
| Observability | Sentry + Vercel Analytics + Axiom (structured logs) |
| Geo/map viz | `@visx/geo`+`@visx/responsive`+`@visx/tooltip`+`@visx/event` `4.0.0`, `topojson-client` `3.1.0`, `world-atlas` `2.0.2` — homepage Africa/Namibia/DRC map. Not `react-simple-maps` (no React 19 support) |
| Interactive maps | Google Maps JS API (DR-077) — loaded directly via `next/script`, no npm package (a hand-written type shim shared by `src/components/ui/MapLocationPicker.tsx` and `ItineraryCircuitMap.tsx`, `google-maps-types.ts`, not `@types/google.maps`). Powers the pickup-location picker (departure/Starlink-kit staff forms, ItineraryDay pickup/dropoff) and the read-only whole-circuit map on the staff Map tab (DR-089, whole-circuit since DR-150); `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` live in production (OI-13, resolved 2026-08-08) |
| Server-side maps/geocoding | Google Static Maps API + Geocoding API (DR-088/089) — `GOOGLE_MAPS_SERVER_API_KEY`, server-only, never `NEXT_PUBLIC_`-prefixed. `src/modules/itinerary/gateway.ts` (`StaticMapsGateway`) renders the Map tab's whole-circuit PDF map image (DR-150: every day in its own color, one call covering the whole itinerary instead of one per day); `scripts/backfill-coordinates.ts` is the Geocoding API's only consumer, run by hand |
| Weather data | Google Maps Platform Weather API (DR-113) — reuses the same server-only `GOOGLE_MAPS_SERVER_API_KEY`, not a new credential; that key's Google Cloud project still needs the Weather API product enabled + added to its restriction list (OI-14) before this serves live data (degrades gracefully to town/seasonal-notes-only until then). `src/modules/weather/gateway.ts` (`GoogleWeatherGateway`) calls `currentConditions:lookup`/`forecast/days:lookup`, one bounded retry on a genuine failure (never on timeout), no circuit breaker — call volume is bounded by `src/lib/weather-cache.ts` (Upstash Redis) instead |
| PDF generation | `@react-pdf/renderer` `4.5.1` (DR-089) — this repo's first PDF-generation capability; `src/modules/itinerary/map-pdf.tsx` lays out the Map tab's whole-circuit PDF (DR-150: one combined Static Maps image covering every day + a color-keyed, day-grouped stop list). Every generated PDF embeds the app's own Archivo/Special Elite type roles via `src/lib/pdf-fonts.ts` (DR-161), not Helvetica |
| i18n | `next-intl` `4.13.2` — cookie-based EN/FR locale, no URL prefixing. Full EN+FR chrome coverage across both the guest site and the staff dashboard (login, settings, every module page) — `NextIntlClientProvider` lives at the true root (`src/app/layout.tsx`), covering both trees with one instance. Deliberate exclusions, decided as chrome-vs-content: staff-authored prose (country-regulations text, package marketing copy/itinerary-day descriptions, About/FAQ body content) — only its surrounding labels are translated; raw permission slugs and `Role` enum values on the admin Permissions/Users pages; the exhaustive world country-name list (`COUNTRY_CODES`, nationality/citizenship/dial-code selects) and per-country province lists (`PROVINCES_BY_COUNTRY`) — both treated as large static reference datasets, out of scope. Message catalogs: `src/messages/en.json`/`fr.json`, flat per-page/shared namespaces (`Common`, `Countries`, `*StatusLabel` per enum, etc.) |
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
    api/jobs/sweep-fleet-availability/ # DR-082: daily inactivity-sweep endpoint, same shape
    api/jobs/sweep-user-dormancy/ # DR-084: daily 30-day-no-login sweep endpoint, same shape
    api/jobs/sweep-fleet-cooldowns/ # DR-107: hourly post-tour-cooldown resync endpoint, same shape
    api/jobs/purge-wizard-progress/ # DR-155: daily 30-day wizard-progress-tracking purge, same shape
    staff/
      login/, forbidden/       # outside the auth gate
      change-password/         # forced first-login flow (mustChangePassword) + voluntary visit
      (dashboard)/             # gated by requireStaffContext (isStaffRole baseline)
        layout.tsx, nav.tsx, back-button.tsx, sidebar-shell.tsx, settings-items.ts
        bookings/, departures/, itineraries/, hotels/, restaurants/, sites/,
        fleet/, schedule/, visa-queue/, country-regulations/,
        finance/, insights/, tracking/, ratings/, packages/, profile/,
        map/ (DR-089: booking-reference lookup -> whole-circuit map + PDF, DR-150),
        settings/ (finance hub -> tax-rates, platform-rate, coupons; DR-123),
        admin/ (users, clients)
    (guest)/                   # tourist self-serve site — NO ACCOUNTS, ever
      page.tsx, packages/, book-package/[packageId]/, book/[departureId]/,
      booking/[bookingId]/, plan-my-trip/, find-booking/, rate/, gallery/,
      about/, faq/, contact/, terms/, weather/ (footer-linked only, DR-113)
  lib/                        # shared kernel: db, auth, auth-client, rbac, errors,
                              #   money, audit, logger, route-guard, staff-guard,
                              #   guest-guard, primary-org, country-codes, provinces,
                              #   tax, platform-rate, coupons (DR-104), rate-limit, qstash, geo,
                              #   fleet-availability (DR-082 cross-module sync helper),
                              #   client-deletion (DR-085 cross-module delete guard),
                              #   provision-fleet-profiles-for-user (DR-138:
                              #   cross-module auto-provision helper — auth +
                              #   fleet, one level up from both),
                              #   directory-filters (DR-091: shared search/filter/
                              #   pagination helpers for the admin Users/Clients pages),
                              #   weather-towns (DR-113 static town config),
                              #   weather-cache (DR-113 Redis cache helper)
  modules/                    # feature modules — independent, reusable
    auth/          # User/Membership/Session, RBAC resolution, multi-role support
    catalog/       # TourPackage (slug, DR-118) + PackageTag + Departure +
                   #   AddonService + PackageItineraryDay (per-package
                   #   itinerary template; activityIds/hotelId/restaurantId,
                   #   DR-116/DR-119 — plain scalars, no FK into itinerary's
                   #   Activity/Hotel/Restaurant)
    booking/       # Booking (11-state lifecycle) + Traveler + BookingAddon;
                   #   bookingReference is the sole guest-facing lookup key
    invoicing/     # Invoice + Payment (DPO stubbed behind PaymentGateway);
                   #   Invoice.discountMinor/couponCode/discountBp (DR-104,
                   #   applied via a shared computeInvoiceAmounts helper);
                   #   DR-145: a TAILOR_MADE booking's tax rate is blended
                   #   across its linked customized package's Day Template
                   #   countries via financeService.resolveEffectiveTaxRateBp
                   #   (new invoicing -> finance dependency); invoice-pdf.tsx
                   #   (DR-169: downloadable invoice/receipt PDF, guest +
                   #   staff, once an invoice has a succeeded payment)
    notifications/ # WhatsApp→SMS→email fallback gateways, no repository.ts
    documents/     # Document metadata + Vercel Blob gateway (private access)
    fleet/         # Vehicle + DriverProfile + GuideProfile + StarlinkKit +
                   #   MaintenanceRecord, compliance-document tracking;
                   #   DR-082 adds availability/lastActiveAt (usage-recency,
                   #   independent of each entity's own operational status)
    assignment/    # Assignment (Departure -> vehicle/driver/guide), overlap rule
    visa/          # VisaApplication lifecycle, facilitator queue; DR-151:
                   #   SUPERADMIN can hard-delete an application
                   #   (isVisaDeleter), and deleteForBooking cascades that
                   #   delete when the traveler's booking is deleted. DR-154:
                   #   staff can now approve/reject + upload the granted
                   #   document from /staff/visa-queue (previously API-only),
                   #   and three new guest-safe methods
                   #   (getApplicationForGuest/resubmitApplicationForGuest/
                   #   streamDocumentForGuest) back the guest's own
                   #   /booking/[bookingId]/visa page (view status/rejection
                   #   reason, re-upload + resubmit, download once approved)
                   #   — no new permission, anti-BOLA via the existing
                   #   findTraveler/bookingService.listTravelers ownership
                   #   check, same convention as autoSubmitOnPassportUpload
    itinerary/     # Itinerary + ItineraryDay (per-day hotelId/restaurantId,
                   #   DR-083; pickup/dropoff lat-long, DR-088; activityIds,
                   #   DR-120, additive to the still-editable free-text
                   #   activities field) + ItineraryDaySite (staff-ordered
                   #   stops, DR-088, replacing the old free-text
                   #   plannedSites) + Hotel/Restaurant/Site reference
                   #   entities (all three geocoded, DR-088) + Activity (one
                   #   Site -> many, DR-116, hasEntranceFee flag; referenced
                   #   by finance's ActivityFee and, since DR-120, by
                   #   ItineraryDay.activityIds directly) +
                   #   HotelRating/RestaurantRating (staff + guide/driver) +
                   #   gateway.ts/map-pdf.tsx (Static Maps + PDF rendering
                   #   for the Map tab's whole-circuit view, DR-089/DR-150)
                   #   + itinerary-summary-pdf.tsx
                   #   (DR-137: staff "download detailed itinerary" PDF,
                   #   shown once APPROVED, no prices — none exist on this
                   #   module's own tables)
    immigration/   # CountryRegulation — platform-wide visa/entry reference data
    ratings/       # Tourist-facing driver/guide/agency reviews (RatingCode,
                   #   Review, ReviewSubjectRating) — distinct from itinerary's
                   #   staff-only hotel/restaurant ratings; DR-148: SUPERADMIN
                   #   can hard-delete an individual Review (isRatingDeleter),
                   #   cascading its subject ratings and recomputing every
                   #   affected aggregate
    insights/      # Live-polling (30s), Redis-cached executive dashboard
                   #   (DR-155), no repository.ts (owns no table) — composes
                   #   booking/invoicing/assignment/fleet/ratings/visa/auth
                   #   AND analytics (new dependency, confirmed acyclic).
                   #   Restricted beyond insights.read to SUPERADMIN/
                   #   TOUR_OPERATOR/PLATFORM_ADMIN via isInsightsViewer
    finance/       # Cost-plus pricing engine — 7 rate tables feed the cost
                   #   breakdown itself (StaffRate; HotelRate/ActivityFee
                   #   reference itinerary's Hotel/Activity by id, DR-116;
                   #   TransportRate; FoodBeverageRate; AdminCostRate, DR-126;
                   #   RestaurantRate, DR-132, referencing itinerary's
                   #   Restaurant by id) + AddonRate (DR-128, prices catalog's
                   #   AddonService by country+code, resolved via
                   #   src/lib/addon-rates.ts, not computeBaseCostMinor, so
                   #   it's a separate concept, not an 8th bucket) +
                   #   PackageCostBreakdown (TourPackage) / BookingCostBreakdown
                   #   (TAILOR_MADE Booking, DR-092) — DR-132: Accommodation/
                   #   Restaurant/Activity buckets on both are derived
                   #   automatically from the package's own Day Template, not
                   #   staff-picked, sharing one resolveRatesForCost helper.
                   #   DR-154 removed the 8th rate table, ImmigrationCostRate
                   #   (requiresVisa/immigrationCostRateId on both breakdown
                   #   tables) — visa cost is priced as a guest-facing
                   #   AddonService VISA_ASSISTANCE purchase (AddonRate)
                   #   instead, not a cost-plus bucket, same fix DR-147
                   #   already applied to Photographer/Videographer +
                   #   package-summary-pdf.tsx (DR-135: staff "download
                   #   summary PDF" on the package detail page, EN/FR,
                   #   @react-pdf/renderer mirroring itinerary/map-pdf.tsx;
                   #   DR-152: split into a staff version (full cost
                   #   breakdown) and a client-facing version (itinerary
                   #   only, total price per person, no internal cost
                   #   buckets) sharing header/table/footer chrome, each
                   #   downloaded with a dynamic filename built from the
                   #   package's own name + reference) —
                   #   DR-136: every rate table (Add-on Rate included) can
                   #   now be updated in place, not just deleted; updating
                   #   any of the 7 cost-plus rates triggers
                   #   reapplyRatesToAllCostBreakdowns, which replays every
                   #   existing package/tailor-made-booking cost breakdown
                   #   through saveCostBreakdown/saveBookingCostBreakdown so
                   #   TourPackage.priceMinor tracks the new price — DR-145:
                   #   a combo package/booking (Day Template hotels spanning
                   #   2+ countries) has its tax rate blended by night count
                   #   per country (computeBlendedTaxRate/blendedTaxRateBp),
                   #   not taxed at a single flat country rate; exposed
                   #   cross-module as financeService.resolveEffectiveTaxRateBp
    tracking/      # Fleet location + trip-progress composition, no repository.ts
    settings/      # TaxRate + PlatformRate + Coupon CRUD (DR-104: system-
                   #   generated discount codes, SUPERADMIN-only writes) —
                   #   DR-146: TaxRate/PlatformRate gain an in-place Update
                   #   (not just add-a-new-row/delete), same convention as
                   #   Coupon's own Update (DR-144); an update reapplies
                   #   every existing package/booking cost breakdown via
                   #   financeService.reapplyRatesToAllCostBreakdowns (new
                   #   settings -> finance module dependency)
    cms/           # CmsTextBlock (About page) + CmsFaqEntry CRUD (DR-071),
                   #   SUPERADMIN-only; public no-ctx read path powers the
                   #   guest /about and /faq pages, mirroring catalog's
                   #   listPublicPackages convention. Renamed from `content`
                   #   in DR-162. DR-163 (Phase 2) gives CmsMediaItem its
                   #   first real repository/service methods and wires it +
                   #   CmsTextBlock to the homepage hero carousel (dynamic,
                   #   staff-managed slides — text, image or video, per-slide
                   #   gradient overlay) — api/v1/cms/media-upload/route.ts
                   #   (this module's first REST route) mints client tokens
                   #   for direct browser-to-Blob video upload. DR-164
                   #   extends coverage to every guest page (nav+footer
                   #   order): reusable PageTextEditor/updatePageTextAction
                   #   for the "thin" eyebrow/title/body pages (Packages,
                   #   Plan my trip, Find booking, Contact incl. 2 office
                   #   blocks, Rate, Weather, Terms), and a real per-site
                   #   Gallery media grid (CmsMediaItem, page='gallery').
                   #   DR-165: /staff/cms is now tabbed (one section shown
                   #   at a time, `?tab=` query param + a real navigation,
                   #   no client JS) rather than one long scrolling page.
                   #   DR-167: Gallery sites (name/description/country) are
                   #   now fully dynamic/staff-editable (add/remove too) —
                   #   CmsMediaItem is the single source of truth, also read
                   #   by the plan-my-trip wizard's "sites to visit" step
                   #   (guest + staff); the old static DESTINATION_SITES
                   #   file is gone. `caption` renamed to `description`
    weather/       # Guest /weather pages (DR-113), no repository.ts (owns
                   #   no table — town list is src/lib/weather-towns.ts, a
                   #   static config). gateway.ts calls Google Maps
                   #   Platform's Weather API; service.ts is a fully public
                   #   no-ctx read path (mirrors cms's public methods) that
                   #   degrades to null current/forecast on any gateway
                   #   failure rather than throwing
    analytics/     # Plan-my-trip wizard-step-abandonment tracking (DR-155)
                   #   — owns WizardProgressEvent (RLS'd tenant table,
                   #   highest-step-reached only, no field values).
                   #   recordWizardStep is a public, no-ctx write (mirrors
                   #   ratings' submitRating shape) identified by a
                   #   lightweight cookie, not a real better-auth session;
                   #   purgeOldEvents backs the new daily QStash purge job
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
Action or route handler, not inside either module's service. `finance`
depends on `catalog` (package pricing), since DR-092, `booking` (booking
cost breakdowns), and since DR-116, `itinerary` (resolving/validating the
real Hotel/Activity a rate is priced for) — confirmed acyclic the same way
`invoicing`/`visa`/`itinerary` already depend on `booking`: `booking` itself
only imports `{auth, catalog, notifications}`, and `itinerary` only imports
`{auth, assignment, booking, catalog}`, neither reaching back into `finance`.
Since DR-145, `invoicing` also depends on `finance` (to blend a TAILOR_MADE
booking's tax rate the same way a package's own cost breakdown does) —
confirmed acyclic the same way: `finance` itself only imports
`{auth, catalog, booking, itinerary}`, never reaching back into `invoicing`.
Since DR-146, `settings` also depends on `finance` (so updating a TaxRate/
PlatformRate can reapply every existing package/booking cost breakdown, same
sweep DR-136 introduced for finance's own rate tables) — confirmed acyclic
the same way: `finance` never imports `settings`. Since DR-155, `insights`
also depends on `analytics` (to read the plan-my-trip wizard-step funnel) —
confirmed acyclic: `analytics` imports nothing from `insights` (it has no
module dependencies at all — its one public write, `recordWizardStep`, is
called directly from a Server Action, not through another module's service).

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
  What a role grants is a **hardcoded, in-code map** (`ROLE_PERMISSIONS`,
  DR-159 — reverses DR-035's runtime, DB-backed `RolePermission` table and
  its `/staff/admin/permissions` editor, both removed entirely). `SUPERADMIN`
  is the one hardcoded, unconditional wildcard (`can`/`assertCan`
  short-circuit true for it, never consulting the map) — every other role,
  including `PLATFORM_ADMIN`, only has what `ROLE_PERMISSIONS` lists for it,
  and nothing can change that at runtime anymore. `can`/`assertCan` take a
  `PermissionSource` (`{ roles, permissions }`); `permissions` is resolved
  once per request in `authService.resolveSession` via `rbac.ts`'s
  `resolvePermissionsForRoles` (a pure in-memory lookup against
  `ROLE_PERMISSIONS`, no DB query). Several permissions (`booking.delete`,
  `fleet.delete`, `country_regulation.write`, `finance_config.write`,
  `platform_settings.write`, `rating.delete`, `visa.delete`) are **never
  granted to any role** in `ROLE_PERMISSIONS`, gated instead by a hardcoded
  `SUPERADMIN`-only check one layer below the route/service permission gate
  (`isBookingDeleter`, `isFleetDeleter`, `isCountryRegulationWriter`,
  `isFinanceConfigWriter`, `requireSettingsWriter`, `isRatingDeleter`,
  `isVisaDeleter`) — this two-layer shape is now belt-and-suspenders rather
  than the real gate (nothing can grant the bare permission to a
  non-SUPERADMIN role at all anymore), kept for defense-in-depth and
  because it was already the convention.
  A handful of staff menu items are gated by a plain hardcoded role list
  instead of a `Permission` at all (`STAFF_PAGE_ACCESS` in `rbac.ts`, backed
  by `requireStaffRole`/`withRole` — siblings of `requireStaffContext`/
  `withAuth`) — used wherever the item's old gating permission is also
  load-bearing for an unrelated internal composition elsewhere, so it can't
  itself be narrowed (e.g. the general Bookings/Packages list pages, DR-159).
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
- **i18n:** full EN + FR parity for UI chrome (labels, buttons, headings,
  errors) across the guest site *and* the staff dashboard. Staff-authored
  prose (country-regulation text, package marketing copy, About/FAQ body
  content) and large static reference lists (world country names, provinces,
  permission slugs, `Role` values) are deliberately left untranslated — see
  the i18n row in the tech stack table. A future bilingual field on those
  content tables (rather than chrome-only translation) is a possible later
  enhancement, not yet decided.

---

## Domain & regulatory context (Namibia, DRC, Zambia & Zimbabwe)

Operator/fleet compliance, visa rules, DRC security zones (BR-07), and guest
health/logistics context — moved to the `regional-compliance` skill
(`.claude/skills/regional-compliance/SKILL.md`). Load it (or read the file
directly) whenever working on `fleet`, `visa`, `catalog` (destinations),
`immigration`, or booking-eligibility features.

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
  guest sessions are real sessions, not bare ids. A staff account itself
  (not just its session) locks after 30 days with no sign-in at all
  (DR-084, `User.inactiveAt`, staff roles only) — `databaseHooks.session
  .create.before` in `src/lib/auth.ts` rejects sign-in outright until an
  `admin.all` holder reactivates it.
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

Identity is **"Horizon"** (sunset palette, DR-068 — replaced the original
"Meridian Cartography" survey-line identity). Tokens in `tailwind.config.ts`:
navy `#3B1F3A` (dusk plum), amber `#D65B2E` (ember, primary CTA/accent),
forest `#2F6E4F` (dusk forest, secondary/success), gold `#F2B441` (low-sun
gold, gradients/badges/stars), bone `#F6EFE4` (warm sand), mist `#8C7D78`
(warm taupe-gray), ink `#211A1D`, rule `#E3D6C8`. Keep product surfaces
visually coherent with the design package.

**Typography (DR-156)** is a rugged/expedition register, not warm-editorial —
three faces, each its own Tailwind `fontFamily` key/CSS variable in
`src/app/layout.tsx`/`tailwind.config.ts`: **Big Shoulders Stencil Display**
(`--font-display`, `font-display`) for `h1`/`h2`/`h3` and hero figures — a
die-cut crate/signage stencil (weight 100-900, a true variable font;
legibility degrades below ~28px, so it's a headline face, not a body one).
Self-hosted via **`next/font/local`**, not `next/font/google` — a real
DR-156 follow-up incident: "Big Shoulders Stencil" and "Big Shoulders
Stencil Display" are two *separate* published Google Fonts families, and
`next/font/google` only bundles the base (non-Display) one, which has no
Bold/Black named instances and renders as a plain sans with no die-cut gaps
at all — confirmed by inspecting the file with fontTools and by a live
screenshot showing an ordinary bold sans. The real Display family's file
(fetched directly from Google's own CSS2 endpoint, OFL-licensed, Latin
subset) is vendored at `src/app/fonts/big-shoulders-stencil-display.woff2`.
**Archivo** (`--font-sans`, `font-sans`, the page default, `next/font/google`)
for body copy and UI chrome — an institutional grotesque built for
wayfinding signage, holding up in dense staff tables; **Special Elite**
(`--font-mono`, `font-mono`, `next/font/google`) for the `.eyebrow` label
pattern and booking/rating reference codes — a distressed field-dispatch
typewriter face, one weight only. Replaces the prior Fraunces/IBM Plex
Sans/IBM Plex Mono trio, which read as generic
"boutique DTC"/"dev-tool" defaults.

The headline stencil face (role 1) is guest-site-only (DR-161, explicit
user request): the staff dashboard, plus the pre-auth `/staff/login`,
`/staff/forbidden`, `/staff/change-password` pages, all carry a
`.staff-shell` wrapper class that opts their own `h1`/`h2`/`h3` back to
Archivo (`globals.css`), overriding the global `h1,h2,h3 { @apply
font-display }` rule.

Every downloadable PDF (`finance/package-summary-pdf.tsx`,
`itinerary/itinerary-summary-pdf.tsx`, `itinerary/map-pdf.tsx`) also embeds
roles 2 and 3 — Archivo for body copy, Special Elite for the one booking/
package-reference line each renders — via shared `src/lib/pdf-fonts.ts`
(DR-161), rather than `@react-pdf/renderer`'s built-in Helvetica default.
The two font files it embeds are **not** Google's own CSS2-served files —
those crashed `@react-pdf`'s fontkit subsetter on real (non-trivial) PDF
content; see DR-161 for the fontTools-instancing workaround.

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
  `confirmationCode` was removed entirely. Once a booking reaches
  `COMPLETED`/`CANCELLED`/`REFUNDED` (DR-105), travelers/add-ons/passport,
  itinerary days/sites, the cost breakdown, and coupon apply/remove are all
  hard-blocked (409, no SUPERADMIN override) — see `isBookingLocked` in
  `booking/domain.ts`. A `TAILOR_MADE` booking at `AWAITING_QUOTATION` can
  have a real, reusable DRAFT `TourPackage` created from it, prefilled from
  its plan-my-trip answers (`Booking.customizedPackageId`, DR-108, one per
  booking, never reassigned) — since DR-111 this fires automatically the
  moment that booking's traveler/passport setup wizard finishes, not just
  via the manual button. `Traveler.age`/`nationality`/`idOrPassportNumber`
  are nullable (DR-111) and only actually required for a
  `PREDEFINED_PACKAGE` booking (`requiresFullTravelerDetails` in
  `booking/domain.ts`) — a `TAILOR_MADE` request's wizard never collects
  real per-traveler values for these.
- **Guest site** (`(guest)/`) has no tourist accounts, ever — bookings ride
  better-auth's `anonymous` plugin. Every booking (from guest package
  browse, guest `/plan-my-trip`, or staff's own "New Booking" flow) shows up
  on `/staff/bookings`, filterable by status/origin — there is no separate
  "pending inquiry" or "quote request" queue.
- **Staff dashboard** (`staff/(dashboard)/`) is one shell with a Settings
  sidebar grouping the admin-facing pages (country regulations, sites,
  insights, users, clients, the Finance hub — SUPERADMIN-only since
  DR-159 — profile). There is no runtime permission-matrix editor anymore
  (removed DR-159, reverses DR-035) and no generic browser-history back
  button (removed DR-153) — every page's own back-navigation is either a
  page-specific "back to X" `BackLink`, or (for pages inside the Settings
  sidebar) the sidebar itself. The general Bookings and Packages tabs are
  themselves PLATFORM_ADMIN/TOUR_OPERATOR-only since DR-159 (`STAFF_PAGE_
  ACCESS` in `rbac.ts`) — TOUR_GUIDE/DRIVER/VISA_FACILITATOR keep their
  own narrower, ownership-scoped views (My Schedule, the visa-queue-linked
  booking detail) unaffected.
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
  `GuideProfile` (indefinite, no purge), a client (bare `TOURIST` contact
  record, DR-085 — additionally guarded by `src/lib/client-deletion.ts`:
  blocked unless every one of their bookings is `COMPLETED`-and-reviewed or
  already superadmin-deleted), and — since DR-141 — a **staff** account
  itself: `deletedAt` alone means Deactivated (reversible via
  `reactivateUser`); `deletedPermanently` (`User`, additive) also set means
  Deleted, permanent, `reactivateUser` refuses forever after. `StarlinkKit`
  is a genuine hard delete (confirmed no FK references it), and — since
  DR-148 — so is an individual `Review` (no soft-delete column exists or was
  added; its `ReviewSubjectRating` rows cascade away with it, and every
  driver/guide/org rating aggregate it had contributed to is recomputed).
  Since DR-151, a `VisaApplication` is a genuine hard delete too (same "no
  soft-delete column exists" reasoning as `Review`), reachable either
  manually from `/staff/visa-queue` or automatically when its traveler's
  booking is deleted (`visaService.deleteForBooking`, orchestrated by the
  same callers that already clean up an Itinerary, DR-059). All gated by a
  `SUPERADMIN`-only service-layer check beneath the route permission, never
  by the bare permission alone.
- **No generic job runner** — every scheduled job is its own QStash-
  signature-verified route + its own entry in
  `scripts/register-qstash-schedule.ts`'s schedule list, registered by
  re-running that script (idempotent — fixed `scheduleId`s update in place,
  never duplicate). Five exist today, all registered and live (confirmed via
  `npm run qstash:register-schedule`'s own console output):
  `/api/jobs/sweep-bookings` (every 15 minutes), `/api/jobs/sweep-fleet-availability`
  (DR-082, daily), `/api/jobs/sweep-user-dormancy` (DR-084, daily),
  `/api/jobs/sweep-fleet-cooldowns` (DR-107, hourly), and
  `/api/jobs/purge-wizard-progress` (DR-155, daily).

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
- **Deliberately deferred, not forgotten:** deduplicating the hand-copied
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
- **OI-12** (DR-069; partially resolved DR-073) `TourPackage.imageUrls`
  (renamed from the singular `imageUrl`, DR-172 — up to 3 now, not just 1)
  ships empty on every package except one real staff upload discovered
  during DR-172's migration (`PKG-00040`, "The Nomad Loop") — still
  effectively no systematic photography, and `/gallery` still uses
  `PackageImage`'s illustrated gradient fallback — don't fabricate or
  scrape images to fill the rest. DR-073 (2026-08-05) closes the
  narrower "nothing real exists anywhere" gap for the homepage hero only:
  three licensed stock photos (Sossusvlei/Namibia, Virunga/DRC, Victoria
  Falls/Zambia+Zimbabwe) now render in `HeroCarousel`. DR-071's `cms`
  module (renamed from `content`, DR-162) image-upload primitive (public
  Vercel Blob URL) remains unwired to `/gallery` or `TourPackage.imageUrls`
  — still nothing real to attach
  there; would need operator-supplied photos or a licensed stock budget
  for that broader scope.
- **OI-13 — RESOLVED 2026-08-08.** Google Cloud project + billing
  provisioned. Two keys, deliberately not one (a referrer-restricted key
  rejects server-to-server calls with no `Referer` header; an unrestricted
  key embedded in client JS is a public, freely-reusable credential — no
  single key can safely be both): a **browser key**
  (`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`, HTTP-referrer restricted to this
  app's domains, API-restricted to Maps JavaScript API) live in `.env` and
  in Vercel Production/Preview/Development, deployed; and a **server key**
  (`GOOGLE_MAPS_SERVER_API_KEY`, no application restriction, API-restricted
  to Static Maps API + Routes API + Geocoding API, never
  `NEXT_PUBLIC_`-prefixed) live in `.env` and Vercel — first consumed by
  DR-088's `scripts/backfill-coordinates.ts` (Geocoding API; decided:
  automatic backfill, not manual re-pin). Interactive pickup-location map
  on the departure/Starlink-kit staff pages is now live rather than
  degraded.
- **OI-14** (DR-113) The Google Cloud project behind `GOOGLE_MAPS_SERVER_API_KEY`
  needs the **Weather API** product enabled and added to that key's API
  restriction list before the guest `/weather` pages serve live current
  conditions/forecast data. Degrades gracefully until then (charter rule
  8) — towns still list with seasonal notes, just no live weather.
- **OI-15** (DR-130) `polco-tours-public-images` (the new public Blob store)
  is connected to the project for Production + Preview only — Development
  wasn't included in the one-time dashboard "Connect Project" step. Local
  `npm run dev` package/About/FAQ image upload will fail with the same
  "Something went wrong uploading the image" error until someone with
  dashboard access adds Development to that same connection.

**Resolved:** OI-04 (object storage → Vercel Blob), OI-08
(`BLOB_READ_WRITE_TOKEN` provisioned), OI-10 (Upstash Redis — real
credentials live in production since 2026-07-22), OI-11 (Upstash QStash —
real credentials + registered schedule live in production since 2026-07-22),
OI-13 (Google Maps browser + server keys provisioned and live since
2026-08-08). See `docs/decisions/DECISION_LOG.md` for how each was closed.

---

## Gotchas — persistent environment/process quirks

These are still-relevant patterns, not one-off incident reports. Full
incident history (including two production `users`-table wipes since fixed)
lives in `docs/decisions/DECISION_LOG.md` and git history.

- **`authService.resolveSession()` resolves whatever session cookie the
  browser carries, with no staff-vs-guest distinction** — a guest-facing page
  or Server Action that calls it directly (rather than through
  `requireStaffContext`/`requireGuestContext`) gets back a real staff
  account's `ctx` if that's who's actually signed in on that browser. DR-139
  (real production incident): three guest booking wizards
  (`(guest)/book/[departureId]`, `(guest)/book-package/[packageId]`,
  `(guest)/plan-my-trip`) called `authService.updateProfile(ctx, { name,
  phone })` with the wizard's own typed contact info and no check on whose
  session `ctx` actually was — a staff member opening one of these pages in
  the same browser they're signed into `/staff` with got their own account
  silently overwritten with a client's name. Any new guest-facing write that
  touches `ctx.userId`'s own data needs an explicit `isStaffRole(ctx.roles)`
  guard (`src/lib/rbac.ts`) before assuming `ctx` is a genuine anonymous
  tourist, not just "some session key existed."
- **A Vercel Blob store is public-or-private for its entire lifetime, not
  per-object** — passing `access: 'public'` to `put()` against a store that
  was provisioned private throws `Cannot use public access on a private
  store`, not a permissions warning. DR-130 (real production incident): every
  public image upload silently failed since DR-071 because `public-image-
  blob.ts` reused `documents/gateway.ts`'s private-only store. Any future
  Blob use needs its own store matching its access mode — check `vercel blob
  list-stores` before assuming an existing token can serve a different
  access level. Reproduce a suspected Blob failure locally first (`put()`
  against the real token in a throwaway script) before assuming it's a code
  bug — the actual error message names the real cause directly.
- **The Vercel CLI can only auto-connect a Blob store to a project under the
  default env var name** (`BLOB_READ_WRITE_TOKEN`) — `vercel blob
  create-store --yes` errors out if that name is already taken by another
  store, with no flag to pick a different name. Giving a second store a
  custom name is a dashboard-only action ("Connect Project" on the store's
  page) — and when you do, Vercel namespaces the connection's sub-values
  under your chosen prefix (`<name>_READ_WRITE_TOKEN`, `<name>_STORE_ID`,
  `<name>_WEBHOOK_PUBLIC_KEY`), not a single flat var of that exact name.
  Don't try to route around the dashboard step by shuffling the *existing*
  store's env var via `vercel env rm`/`env pull` instead — that requires
  pulling live production secrets (DB URL, auth secret, etc., not just the
  Blob token) to read/relocate one value, which is unsafe even with
  explicit permission; let a human do the one dashboard click instead.
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
- **A pre-write `SELECT` is not a reliable way to check global (cross-org)
  uniqueness against an RLS-`FORCE`d table when connected as `polco_app`**
  — a query run outside `withOrg` (no `app.org_id` GUC set) returns zero
  rows under deny-by-default, for every org, not just others' (real latent
  bug, DR-131: DR-118's original `nextUniqueSlug` used exactly this pattern
  to check package-slug collisions across orgs and had silently never
  worked under the correct role, only appearing to work locally under a
  `BYPASSRLS` role like `neondb_owner`). A unique index, unlike a `SELECT`,
  is **not** RLS-filtered — an `INSERT`/`UPDATE` still gets a real
  unique-constraint violation (`P2002`) against a row it can't see. For any
  value that must be unique across every org, detect the collision by
  attempting the write and retrying on `P2002` (see `withUniqueSlug` in
  `src/modules/catalog/repository.ts`), not by pre-checking visibility.
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
- **DR-159 reversed this**: a new/changed permission grant is just a code
  edit to `rbac.ts`'s `ROLE_PERMISSIONS` now, live the moment it deploys —
  no `db:seed` re-run, no DB write of any kind. (True until DR-035; DR-159
  reverses DR-035 back to this simpler shape.)
- **A destructive schema change (dropping/renaming a column or table) breaks
  the currently-*deployed* code the moment it's pushed to the shared Neon
  DB, if that deploy hasn't gone out yet** — real incident, 2026-08-08: DR-088
  dropped `ItineraryDay.plannedSites` right after `db push`, but the Vercel
  deployment carrying the matching code hadn't gone out yet (9+ hours stale;
  git push alone doesn't guarantee an immediate auto-deploy), so the
  still-live old build crashed on every itinerary-day query referencing the
  now-gone column. Fixed by an immediate `vercel deploy --prod`. For any
  future destructive schema change: confirm the matching code is actually
  live in production (`vercel ls --prod`, check deployment age) — ideally
  before or immediately after the `db push`, not "at some point after
  pushing to git."
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
- **A route segment with no `loading.tsx` (and no ancestor one that
  actually applies to that specific transition) makes a client-side
  navigation into it fully blocking** — Next's App Router defers the
  URL/history update itself until the destination page's *entire* server
  render resolves, with no interim state at all (DR-124, real incident: a
  recurring `guest-checkout.spec.ts` flake at the Add-ons→Travelers step).
  A layout-level `loading.tsx` far up the tree (e.g. `(guest)/loading.tsx`)
  does **not** re-fire for a same-group nested navigation — it only covers
  the *first* entry into that group. If a Playwright `waitForURL` after a
  `router.push()` (especially one following an awaited Server Action call)
  flakes intermittently with no visible error and the page just looks
  "stuck" on the old step, check for a missing `loading.tsx` at or below
  the changing segment before assuming it's random CI load — the fix
  (adding one) is also a genuine production UX improvement, not just a
  test workaround, since a real user on a slow connection hits the exact
  same frozen-looking wait.
- **A disposable local Postgres needs no sudo/Docker** for reproducing a
  CI-only e2e failure without touching the shared Neon DB: `initdb` into a
  scratch dir, `pg_ctl start` with a short `-k` socket dir (Unix socket path
  cap is 107 bytes), then run the same `db:push`/`db:sequences`/`db:rls`/
  `db:seed` sequence CI does. Re-running e2e against the same un-reset
  local DB across attempts accumulates fixture rows with no dedup — use
  `db push --force-reset` or a fresh `initdb` between attempts.
- **A top nav/sidebar with every link visible in the initial viewport turns
  Next.js's default `<Link>` prefetching into a real-load multiplier** —
  real incident, 2026-08-18 (user-reported: "website is too slow, and it
  kicks me out after a while"). `StaffNav` (up to 12 links) and
  `SidebarShell` (up to 7) render every destination in one always-visible
  row/column on **every** staff page (63 of them); none had
  `prefetch={false}`, so the App Router's default viewport-triggered
  prefetch fired a full server request — `requireStaffContext` (session
  lookup + non-SUPERADMIN permission resolution, 2-3 DB queries, memoized
  only *within* one request via `cache()`, never across separate ones) plus
  that page's own data queries — for every sibling link on every single
  page view, confirmed directly in `vercel logs` (visiting one settings
  page logged real λ invocations for every other sidebar item within the
  same second). That's a 10-20x multiplier on real DB load having nothing
  to do with what the user actually clicked; under enough concurrent
  traffic it's a plausible root cause for both generalized slowness and the
  30-minute inactivity session timeout (DR-063) lapsing early, since that
  timeout's own `updateAge` refresh is itself a DB write that can silently
  lose a race under connection-pool contention. Fixed by adding
  `prefetch={false}` to every `<Link>` in `nav.tsx`/`sidebar-shell.tsx`
  (both staff and guest) and `footer.tsx` — a click still navigates
  normally, only the eager background prefetch-on-viewport-entry is
  disabled. Apply this to any future always-visible link list (nav bars,
  sidebars, tab strips) rendered on a page that does real per-request DB
  work — a link list that's naturally below the fold or only a couple of
  items doesn't need it.
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
- **A `NEXT_PUBLIC_*` env var is inlined into the client JS bundle at build
  time, not read at request time** — one value gets baked in and served to
  every domain the deployment answers to. Adding a new custom domain in
  Vercel's Domains tab does nothing about this by itself; if any client
  code uses a `NEXT_PUBLIC_*` var to construct an absolute same-app URL
  (e.g. an API `baseURL`), every domain other than the one live at build
  time silently breaks (cross-origin call, no visible error — see DR-072,
  where this made sign-in spin forever from a second production domain).
  Prefer relative/same-origin URLs (or a runtime-read server value) over a
  baked-in absolute one for anything that must work across domains; if a
  `NEXT_PUBLIC_*` absolute URL is genuinely unavoidable, remember a Vercel
  env var change alone doesn't fix already-built output — it needs a fresh
  deploy.
- **A `page.tsx` can only export `default` plus Next's own well-known
  names** (`generateMetadata`, `generateStaticParams`, `dynamic`,
  `revalidate`, etc.) — any other named export (e.g. a shared constant a
  sibling route wants to import) fails `next build`'s own type-checking
  with "is not a valid Page export field," but plain `tsc --noEmit` does
  **not** catch it (real incident, DR-098/100: `FILTERABLE_STATUSES`
  exported from `bookings/page.tsx`, passed local `typecheck`/`lint`,
  broke CI's Build step). Put anything a page needs to share with a
  sibling route in `src/lib/` instead of exporting it from the page file.
  `npm run build` itself may not be runnable to completion in every
  sandbox (e.g. no network access to fetch Google Fonts for `next/font`)
  — that's an environment gap, not a signal the code is fine; CI's Build
  step is the real gate for this class of error.
- **A test fixture's "unique-enough" id must actually be unique across a
  full CI run, not just within one file** — `formatPackageReference(Date
  .now())`, used across ~40 test files (DR-103) as a shortcut to fabricate
  a throwaway package reference, collided for real once two test files
  running in parallel read the identical millisecond, tripping
  `packageReference @unique`. `formatPackageReference()` itself just
  stringifies+pads whatever's passed — it's meant to be called with a real
  DB sequence value (`nextval()`), not a timestamp. Use `tests/helpers/
  package-reference.ts`'s `testPackageReference()` (adds a random
  component) for any new fixture needing one instead of reintroducing the
  `Date.now()` shortcut.
