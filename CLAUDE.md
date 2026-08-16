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
/ `www.mufasasafaris.com` (added DR-072). This is a domain/infra state, not
a rebrand — don't rename the brand or module names off "Mufasa" without an
explicit decision to do so.

> Current through DR-129 — see `docs/decisions/DECISION_LOG.md` for full
> history. **DR-120's additive schema change (`ItineraryDay.activityIds`),
> DR-117's enum migration, and DR-116/118/119's additive schema changes are
> all applied to the shared Neon DB** (verified via `psql`; CI is green).
> **DR-129** lets staff bulk-generate a package's itinerary template instead
> of adding every day one at a time: a new "Generate {N} days" button on
> `/staff/packages/[packageId]` (`catalogService.generateTemplateDays`, gated
> `catalog.write`) reads the package's own `durationDays` and bare-creates
> any missing `PackageItineraryDay` row for day numbers `1..durationDays`
> (`catalogRepository.generateMissingTemplateDays`, `createMany({
> skipDuplicates: true })` against the existing `@@unique([tourPackageId,
> dayNumber])` constraint) — idempotent, so re-running it only fills gaps and
> never touches or duplicates a day staff already edited. Each generated day
> starts bare (day number only) and is then filled in through the existing
> per-day edit form, unchanged. Throws `Errors.conflict` (same `?error=&
> detail=` convention as DR-115) if `durationDays` isn't set yet. No schema/
> permission/module-dependency change.
> **DR-128** closes three real gaps found by an explicit user-requested audit
> ("all prices must be pulled from Operational Rates") — the core 7-bucket
> cost-plus engine, tax, coupons, and the platform rate were already
> correctly rate-table-sourced. (1) `sendQuotation` had no enforced link to
> a TAILOR_MADE booking's own cost breakdown — staff could freely overwrite
> the pre-filled `suggestedTotalMinor` with zero audit trail. `SendQuotationInput`
> gains an optional `overrideReason`; `sendQuotationAction` (the Server
> Action layer, not `bookingService` itself — `booking` can't import
> `financeService` without a cycle) fetches the breakdown and requires a
> reason whenever the submitted price/currency deviates from it;
> `bookingService.sendQuotation` logs a distinct `booking
> .quotation_price_overridden` audit action when one is supplied, mirroring
> `PackageCostBreakdown`'s own override-reason precedent (no new column —
> the audit log is the record). (2) `TourPackage.priceMinor` was still
> technically settable via a direct API call to `updatePackage`, even though
> no UI had exposed it since DR-039. Removed from `CreatePackageInput`/
> `UpdatePackageInput` entirely; `saveCostBreakdown`'s write now goes
> through a new dedicated `catalogService.setComputedPrice` (backed by a new
> `catalogRepository.updatePackagePrice`), so no path other than a computed
> cost breakdown can ever set a package's price. (3) Add-on prices
> (`AddonService.priceMinor`/`currency`) were flat, staff-typed, org-wide
> figures with no country dimension or Operational Rate backing at all (and
> no create/edit UI ever existed for `AddonService` in the first place).
> New 8th Operational Rate, `AddonRate` (country + `AddonCode` + price +
> currency, effective-dated, resolved by (country, code, date) with no id —
> same "no dropdown" precedent as `StaffRate`/`AdminCostRate`), on
> `/staff/finance/rates` + matching REST routes. Resolution lives in new
> `src/lib/addon-rates.ts` (`getEffectiveAddonRate`), a plain ungated
> helper — same "guest checkout has no staff permissions" precedent as
> `src/lib/tax.ts` — not behind `financeService`'s RBAC gate. New shared
> `bookingService.getBookingCountry` (factoring out the same
> PREDEFINED_PACKAGE-departure/TAILOR_MADE-customCountry resolution
> `invoicing/service.ts` already had inline) feeds both `setAddons` (now
> resolving each addon's real chargeable price from `AddonRate`, never
> `AddonService`'s own flat fields, its country/rate lookups run
> concurrently rather than sequentially — a genuine latency fix alongside
> the correctness one) and the guest/staff add-ons picker pages (now hiding
> any add-on with no rate configured for the booking's country — explicit
> user decision, never falling back to the old flat price). No permission
> or module-dependency change.
> **DR-127** makes the platform rate a real customer-facing charge (explicit
> user request, confirmed via a clarifying question first since it reverses
> a deliberate prior design choice) — the invoice total guests actually pay
> is now exactly **package price (subtotal) + tax (per-country, DR-006) +
> platform rate (DR-042)**, payable as a 40% deposit or in full (both
> pre-existing, DR-012/DR-024, untouched). Previously `platformFeeMinor` was
> computed but deliberately *not* added to `totalMinor` — an informational
> commission split the platform absorbed, never charged to the customer.
> `computeInvoiceAmounts` (`invoicing/domain.ts`, the one shared formula
> `getOrCreateInvoiceForBooking`/`applyCoupon`/`removeCoupon` all use) now
> takes `platformFeeRateBp` as a required input, computes the fee on
> (discounted subtotal + tax) same as before, and folds it into `totalMinor`
> ahead of the deposit/balance split; `applyCoupon`/`removeCoupon`
> (`invoicing/repository.ts`) re-resolve the fee from the invoice's own
> snapshotted `platformFeeRateBp` (falling back to 0 for a rare grandfathered
> null) every recompute. Both the guest checkout page and the staff booking-
> detail page now show explicit "Platform fee" and "Total" line items on the
> invoice card. No schema change (the two fields already existed, DR-042);
> no permission/module-dependency change — formula + display only.
> **DR-126** adds a seventh Operational Rate table, `AdminCostRate` (explicit
> user request) — a flat per-day administrative-overhead fee, per-country
> and effective-dated exactly like the existing six rate tables (DR-039),
> configured on the same `/staff/finance/rates` page. Resolved by country +
> effective date at compute time (`financeRepository.findEffectiveAdminCostRate`),
> same "no id staff-picks from a dropdown" precedent as `StaffRate` — there's
> only ever one active rate per country. New enum `AdminCostBasis`
> (`PER_PERSON` / `PER_GROUP`, default `PER_GROUP`) is a **per cost-breakdown**
> choice, not part of the rate itself: staff pick it (plus a plain
> `adminDays` count) when setting up a package's or booking's cost
> breakdown, deciding whether the resolved daily rate is charged once for
> the whole group (`PER_GROUP`, like the existing Staff/Transport buckets)
> or multiplied by the reference group size (`PER_PERSON`, like the
> existing Restaurant/Visa buckets). `PackageCostBreakdown`/
> `BookingCostBreakdown` both gain `adminDays`/`adminCostBasis` (additive,
> same "applies to both cost-breakdown flows" precedent every other bucket
> already follows); `computeBaseCostMinor` gains one more summed bucket.
> Full stack mirrors the existing six rate tables: domain/repository/
> service CRUD (same `requireRateWriter` SUPERADMIN-only gate + `audit()`
> calls), a new Operational Rates card, and a matching REST pair
> (`/api/v1/finance/rates/admin-cost` + `[id]`). No permission or
> module-dependency change. **Schema change (new `AdminCostRate` table +
> `adminDays`/`adminCostBasis` on `PackageCostBreakdown`/
> `BookingCostBreakdown`) — not yet applied to the shared Neon DB as of this
> writing; needs a `db push` (all-additive, no destructive step) before the
> Operational Rates card or either cost-breakdown form's new section will
> actually work end-to-end.** **DR-125** is two UX improvements, no schema/
> permission change: the Sites list (`/staff/settings/sites`) gains an
> Activities column (grouped from `itineraryService.listActivities` by
> `siteId`, not a new `SiteView` field) plus the same search/filter/
> pagination convention DR-091/095/097/098/099/100/101 already established;
> and every staff-portal search field (17 pages) now updates results live
> as the user types instead of requiring a manual "Filter" click — new
> `src/components/ui/SearchField.tsx` debounces each keystroke (300ms) into
> a `router.replace` carrying the rest of the query string across. Still a
> plain input inside the existing GET `<form>` — all filtering logic stays
> server-side (charter rule 1/2); only *when* navigation fires changed.
> **DR-124** root-causes a `guest-checkout.spec.ts` CI flake that had failed
> on essentially every run regardless of the actual commit — the guest
> booking wizard (`(guest)/booking/[bookingId]/`) had no `loading.tsx` of
> its own, so a client-side step-to-step navigation (Add-ons → Travelers)
> blocked the URL/history update on the destination page's *entire* server
> render finishing, with zero interim state — indistinguishable from frozen
> until the moment it either completes or the test's timeout wins the race.
> New `booking/[bookingId]/loading.tsx` gives the whole wizard its own
> Suspense boundary — a real production UX fix (every guest on a slow
> connection hit the same "frozen step" experience), not just a test
> patch. Also parallelizes `/travelers/new/page.tsx`'s conditional
> `authService.getUser` call into its initial `Promise.all`. See the
> Gotchas section below for the reusable pattern. **DR-123** merges Tax Rates, Platform Rate, Coupons (Settings module), and
> Operational Rates (Finance module) into one "Finance" card hub at
> `/staff/settings/finance` — same card-hub-plus-still-independent-pages
> shape as DR-095/097/098. Each destination page keeps its own route/
> permission gate unchanged, just swaps its `SidebarShell`/`SETTINGS_ITEMS`
> wrapper for a `BackLink` back to the hub; `settings-items.ts` collapses
> the 4 separate sidebar entries into one. `SidebarItem` gains a new
> `anyPermission?: Permission[]` field (visible if the caller holds ANY one)
> since the merged entry spans both `platform_settings.read` and
> `finance_config.read`. The hub itself, unlike Fleet/Packages/Bookings'
> hubs, keeps the `SidebarShell` wrapper — it's `nav.tsx`'s top-level
> "Settings" link's landing page, so it must keep the rest of Settings
> (Country Regulations, Sites, Insights, etc.) one click away; that nav
> link now points at `/staff/settings/finance` instead of the no-longer-
> valid `/staff/settings/tax-rates`. No schema/permission/module-dependency
> change.
> **DR-122** relabels the Site detail page's per-activity "Has an entrance
> fee" checkbox/indicator to just "Fee"/"Free" (`Activity.hasEntranceFee`
> itself unchanged, still purely informational) and fixes a real bug in
> Operational Rates' Activity Fee picker (`finance/rates/page.tsx`), which
> had been filtering its options to only `hasEntranceFee`-flagged activities
> — contradicting that flag's own documented "informational only" intent,
> and inconsistent with `financeService.createActivityFee` itself, which
> never gated on it. Every `Activity` is now listed/searchable there
> regardless of its Fee flag. **DR-121** backfills the DR-119/DR-120 template-copy behavior onto
> itineraries created before those two DRs shipped (explicit user request) —
> new `scripts/backfill-itinerary-day-templates.ts` (`npm run
> itinerary-day-templates:backfill`) fills a pre-existing `ItineraryDay`'s
> `hotelId`/`restaurantId`/`activityIds` in from its package's matching
> `PackageItineraryDay` template row **only where that field is still
> null/empty** — never overwrites a value staff already set. Run once
> against the shared DB: 13 of 15 inspected pre-existing itinerary days
> backfilled (all `hotelId`; no inspected template day had a
> `restaurantId`/`activityIds` to backfill from). **DR-120** closes a real DR-116 gap found while
> auditing "does the package Day Template survive itinerary creation":
> `PackageItineraryDay.activityIds` (DR-116's structured Activity picker,
> which supersedes the legacy free-text `activities` for any template day
> edited since) had no counterpart column on `ItineraryDay` at all, so
> `itineraryService.createItinerary`'s template-copy step silently dropped
> it. `ItineraryDay` gains its own `activityIds` (String[] @default([]),
> additive to the still-editable free-text `activities` field — unlike the
> package template, the real day form keeps both), the same
> `MultiSearchableSelect` picker as the package template's form (reusing
> `itineraryService.listActivities`/`listActivitiesByIds`), and a new
> `requireActivitiesExist` anti-BOLA existence check on `addDay`/`updateDay`
> (possible here, unlike catalog's un-FK'd `activityIds`, since `Activity`
> is native to this module). The template-copy step now carries
> `activityIds` across the same way `hotelId`/`restaurantId` already do.
> **DR-116** reorganizes Operational Rates into
> cards and links three "typed name" fields to real reference-list records
> instead: `HotelRate.hotelId` (-> itinerary's `Hotel`), a new `Activity`
> model (one Site -> many Activities, `hasEntranceFee` flag, managed from
> the Site detail page), and `ActivityFee.activityId` (-> that new
> `Activity`, `name` now a creation-time snapshot rather than staff-typed).
> New tenant table `site_activities` (RLS'd, same shape as `sites`). New
> module dependency `finance` -> `itinerary` (confirmed acyclic). **DR-118**
> gives every `TourPackage` a personalized public URL slug (`TourPackage
> .slug`, generated once from `title` at creation, never regenerated on a
> later edit) — `scripts/backfill-package-slugs.ts` handles any pre-DR-118
> row (run by hand); the guest package card links via `slug ?? id`.
> **DR-119** adds `PackageItineraryDay.hotelId`/`restaurantId` (plain
> scalars, single-select `SearchableSelect` on the staff day form, same
> "no cross-module FK" precedent as DR-116's `activityIds`) and removes
> `PackageItineraryDay.plannedSites`/`estimatedTravelMinutes` entirely
> (explicit user direction, destructive — any existing values in those two
> columns are gone). `itineraryService.createItinerary`'s template-copy
> step now carries the new `hotelId`/`restaurantId` across onto the fresh
> `ItineraryDay`, same as every other plain field it already copies.
> **All schema changes through
> DR-092 are applied to the shared
> Neon database** (fleet availability, itinerary hotel/restaurant/site,
> user dormancy, site province/city, geo-data foundation, booking cost
> breakdowns — nothing schema-related is pending; DR-090/091/093/094/095/
> 096/097/098/099/100/101/102/103 needed no schema changes at all; DR-103
> touched test infrastructure only, no production code).
> DR-089 (the staff Map tab — booking-reference lookup, per-day interactive
> map, per-day PDF download) is fully deployed on top of DR-088. DR-090
> re-anchors Rating Code validity to the tour's own last day (usable the day
> after it ends, expires 5 days after that) instead
> of to whenever staff happen to issue the code.
> DR-082 adds `Vehicle`/`DriverProfile`/`GuideProfile.availability`
> (`AVAILABLE`/`BOOKED`/`INACTIVE`, independent of the existing
> `VehicleStatus`/`DriverStatus`/`GuideStatus` operational-hold dimension)
> plus `lastActiveAt` — hook-driven (assignment create/remove, booking
> confirm/cancel/refund, **and, since DR-094, the booking lifecycle sweep's
> own CONFIRMED->IN_PROGRESS->COMPLETED transitions** — all via
> `src/lib/fleet-availability.ts`) with a daily QStash sweep
> (`/api/jobs/sweep-fleet-availability`) as the only path to `INACTIVE`.
> DR-083 moved itinerary hotel/restaurant assignment to
> per-day (`ItineraryDay.hotelId`/`restaurantId`, replacing the removed
> `ItineraryHotel`/`ItineraryRestaurant` join tables), added a staff-managed
> `Site` reference list, auto-computed `dayNumber`, defaulted the emergency
> contact from the tour lead's own `Traveler` data, and moved hotel/
> restaurant rating onto `/staff/hotels/[hotelId]`/`/staff/restaurants/
> [restaurantId]`, now open to TOUR_GUIDE/DRIVER scoped to a place they've
> actually toured. DR-084 adds `User.inactiveAt`: a staff account is
> flagged inactive after 30 days without signing in (TOURIST/SUPERADMIN
> excluded, daily QStash sweep), and — the more involved option, not just
> an informational badge — **sign-in is actually blocked**
> (`databaseHooks.session.create.before` in `src/lib/auth.ts`) until an
> `admin.all` holder clicks Reactivate on `/staff/admin/users`. DR-085 lets
> SUPERADMIN delete a client (bare/anonymous `TOURIST` contact record) from
> `/staff/admin/clients`, guarded by `src/lib/client-deletion.ts`: blocked
> unless every one of their bookings is `COMPLETED`-and-reviewed or already
> superadmin-deleted. DR-086 batches smaller changes: a `confirmMessage`
> confirm-dialog on every destructive delete/deactivate button platform-wide;
> `Site` gained `province` (country-dependent dropdown, `src/lib/
> provinces.ts`) and optional `city`; Sites moved into the Settings sidebar;
> Budget/Luxury trip preferences are now mutually exclusive
> (client + server); and a real bug fix — the Fleet Locations "Update" link
> on `/staff/tracking` was using `StarlinkKit.kitId` (the display label)
> instead of its real row id, so it always 404'd. DR-087 restricted Site's
> country to just these 4 operating countries (with matching server-side
> province-belongs-to-country validation) and fixed a real CI-caught e2e
> regression DR-086 introduced — Playwright auto-dismisses
> `window.confirm()` unless a test explicitly accepts it, so any e2e test
> clicking a now-confirm-gated button needs `page.once('dialog', d =>
> d.accept())` first. DR-088 is the shared geo-data groundwork for two
> discussed-but-not-yet-built features (a staff "Map" tab, and route
> optimization) — `Hotel`/`Restaurant`/`Site` gain `latitude`/`longitude`;
> `Site` gains `deletedAt` (soft-delete, matching `Hotel`/`Restaurant`);
> `ItineraryDay` gains `pickupLatitude`/`pickupLongitude`/`dropoffLatitude`/
> `dropoffLongitude` and **loses `plannedSites`**, replaced by a new
> staff-ordered join table `ItineraryDaySite` (`sequence`, reorderable via
> ▲/▼ buttons on the itinerary day edit form) — `catalog.
> PackageItineraryDay.plannedSites` is deliberately left untouched (still
> free text; module dependency direction won't allow catalog to reference
> itinerary's `Site` table). New `scripts/backfill-coordinates.ts` is
> `GOOGLE_MAPS_SERVER_API_KEY`'s first real consumer (Geocoding API). DR-089
> is the Map tab itself, built on that foundation: staff enter a booking
> reference on `/staff/map`, see each day's stops on a read-only map
> (`ItineraryDayMap.tsx`, plain markers + a straight-line polyline — no
> Directions/Routes API call, this feature only needs "where," not a
> road-snapped route) and download a day as a PDF (new `StaticMapsGateway`
> + first-ever `@react-pdf/renderer` use). Scoped the same as everywhere
> else: SUPERADMIN/TOUR_OPERATOR unrestricted, TOUR_GUIDE/DRIVER limited to
> a booking on their own assigned departure. DR-090 re-anchors Rating Code
> validity to the tour's own last day instead of issuance date — usable
> starting the day after the tour ends, expires exactly 5 days after that
> (`ratingCodeExpiryFromTourEnd`, replacing the old flat 30-days-from-
> issuance window). DR-091 adds search/filter/pagination to the staff admin
> Users and Clients directories (`src/lib/directory-filters.ts` +
> `src/components/ui/Pagination.tsx`, both shared by the two pages) — the
> first pagination anywhere in this app; Users' Status filter can now
> surface Deactivated accounts, previously hard-excluded at the query level
> and unreachable via any UI state. DR-092 closes a real sequencing dead end
> in the TAILOR_MADE booking journey — the booking detail page pushed staff
> toward add-ons before a price existed, but `setAddons` required a price to
> already exist to currency-match against. New `BookingCostBreakdown`/
> `BookingCostLineItem` (owned by `finance`, reusing DR-039's cost-plus rate
> tables/math via a new shared `resolveRatesForCost` helper) let staff build
> a line-item cost breakdown for a bespoke request; `currency` is *derived*
> from whichever resolved rate/add-on actually has one, never staff-picked.
> New `financeService.saveBookingCostBreakdown`/`getBookingCostBreakdown`
> (gated `booking.confirm`, same as `sendQuotation`) fold the booking's
> already-selected add-ons into a `suggestedTotalMinor` that pre-fills (but
> doesn't replace) the "Send quotation" amount field — this step never
> writes `Booking.priceMinor`/`currency` itself; `sendQuotation` stays the
> only commit path. `bookingService.setAddons`'s currency check is now
> branched: unchanged once `booking.currency` is set, relaxed to
> "internally consistent" pre-quotation — closing the dead end without
> weakening the existing already-priced-booking protection. This is a new
> `finance` → `booking` module dependency (confirmed acyclic). DR-093 stops
> the add-ons/first-traveler booking-setup pages from re-asking staff for
> what `/plan-my-trip` already collected: `/staff/bookings/[bookingId]/
> addons` pre-checks any add-on matching `Booking.preferredAddons` (labelled
> "Guest requested," only before the first finalize) and `/travelers/new`
> shows the tour lead's known name/email/country of residence/phone
> (`authService.getUser(booking.touristUserId)` + `parseE164`) as a
> read-only summary wired to hidden inputs, each falling back to its normal
> editable field independently if that piece of data is missing (a legacy
> booking, or no phone on file); nationality stays editable (only
> `defaultValue`-preselected from `Booking.citizenship`), since citizenship
> isn't guaranteed to equal passport nationality. No schema/permission/
> module-dependency change. DR-094 closes a real DR-082 gap found from a
> live staff report: a booking only ever travels `CONFIRMED` ->
> `IN_PROGRESS` -> `COMPLETED` via `bookingRepository.sweepLifecycle`'s
> raw-SQL sweep (the QStash `/api/jobs/sweep-bookings` job), which had no
> way to call `syncFleetAvailabilityForDeparture` — so a vehicle/driver/
> guide whose booking only ever advanced through that sweep (the normal
> case) sat at stale availability indefinitely, not just until "the next
> assignment/status change" as the hook's own comment promised.
> `sweepLifecycle` now captures the departures its `CONFIRMED->IN_PROGRESS`/
> `IN_PROGRESS->COMPLETED` statements touched (`$queryRaw`+`RETURNING`
> instead of `$executeRaw`) and returns them up through
> `bookingService.runScheduledSweep`; the route resyncs each one — same
> "one level up from both modules" convention `fleet-availability.ts`
> itself already follows. Deliberately scoped to the QStash cron path only,
> not `seatsTakenFor`'s lazy on-read sweep (a hot guest-facing path where a
> missed resync self-corrects at the next real sweep/action anyway).
> DR-095 splits the fleet dashboard (previously one page, every Vehicle/
> Driver/Guide/Starlink-Kit table rendered end to end, unpaginated) into a
> card hub (`/staff/fleet`, count-only cards linking onward) plus one
> dedicated list page per type (`/staff/fleet/vehicles`, `/drivers`,
> `/guides`, `/starlink-kits`), each with its own search/filter/pagination —
> same query-param/GET-driven, `PER_PAGE = 10` convention DR-091 already
> established for the admin Users/Clients directories, reusing that DR's
> generic `paginate`/`Pagination` but with fleet-specific search/filter
> logic kept local to each page (not folded into `directory-filters.ts`,
> which stays Users/Clients-shaped). Filters per type are drawn from each
> type's own displayed columns: Vehicles get Status/Availability/Type
> (Type derived from the data, like DR-091's email-domain filter); Drivers
> and Guides get Status/Availability (Guides also get a derived Specialty
> filter); Starlink Kits get Status/Assignment. The four delete actions now
> redirect to their own type's list page instead of the old combined route,
> and every detail/new-form page gained a `BackLink` back to its list page.
> DR-096 replaces the vehicle Make/Model/Type plain text inputs with a
> curated `<Select>` + "Other (type your own)" free-text escape hatch —
> `src/lib/vehicle-catalog.ts` (`VEHICLE_TYPES`/`VEHICLE_MAKES`/
> `VEHICLE_MODELS_BY_MAKE`), scoped to a realistic Southern/Central-African
> tourism fleet, not an exhaustive global catalog; `Vehicle.make`/`model`/
> `vehicleType` stay free-text in the schema, unchanged — this is a UI
> suggestion layer only, never a constraint, so a value not in the curated
> list is never blocked. New generic `SelectOrOther` component
> (`src/components/ui/SelectOrOther.tsx`) backs one hidden input under the
> field's real `name`, so no server action changed. `VehicleMakeModelFields`
> couples Make and Model (Model's suggestions follow the chosen Make,
> remounting via `key={make}` on every Make change so a stale Other-typed
> model never carries over as a misleading default). DR-097 gives the
> Packages dashboard the same card-hub-plus-list-pages shape as DR-095's
> fleet dashboard — `/staff/packages` is now a card hub (Public Packages /
> Customized Packages counts), backed by `/staff/packages/public`
> (`status = PUBLISHED`, the only one guests ever see) and `/staff/packages/
> customized` (`DRAFT`/`ARCHIVED`, staff-only — and where "New package"
> now lives, since a fresh package always starts `DRAFT`), each with search/
> filter/pagination via the same DR-091/095 convention. No schema change —
> `TourPackage.status` already had exactly these three values. The package
> detail page's back link is now dynamic (reflects the package's live
> status), not a fixed hub link. DR-098 gives Bookings the same shape —
> `/staff/bookings` is a card hub (All + one card per filterable
> `BookingStatus`, DRAFT still omitted), backed by `/staff/bookings/all`
> and the dynamic `/staff/bookings/status/[status]`, both with Status/
> Source filters + search + pagination. Unlike the old pill row, a
> zero-count status still gets its own card (CANCELLED/REFUNDED are no
> longer hidden-by-default). `/staff/bookings/new` also gained an explicit
> top-level two-card chooser (existing-package vs. tailor-made), replacing
> a default view that silently favored the package list. DR-099 adds
> search/filter/pagination directly to the Hotels and Restaurants lists
> (no card-hub split — neither has a natural sub-category) — a Country
> filter plus name/address/contact search, applied after each page's
> existing anti-BOLA access-scoping (TOUR_GUIDE/DRIVER still only ever see
> what they're allowed to rate), never widening it. DR-100 gives the
> Itineraries list the same treatment (search + Itinerary-status + the
> joined Booking's own status, no hub — `ItineraryStatus` is only three
> values). DR-101 gives "My schedule" (self-service TOUR_GUIDE/DRIVER/
> VEHICLE_OWNER assignments) the same card-hub-plus-lists shape — Past/
> In Progress/Future cards, each a list page with search + a Departure-
> status filter + pagination. Row-building/table markup moved out of the
> page into `schedule/build-schedule-rows.ts`/`assignments-section.tsx`
> (plain modules, not `page.tsx`/`route.ts`, so the DR-100 export
> restriction doesn't apply) so the hub and all three list pages share one
> implementation. DR-102 makes the staff Ratings page's "Agency overall"
> show 5 grey stars (`RatingStars` at `rating={0}`, not a new empty-state
> variant) plus a jump-link to the page's own "Individual reviews" section
> when there are zero reviews yet — deliberately unlike the guest homepage
> `TrustSummary` (DR-068), which hides itself entirely at zero reviews;
> that no-fake-social-proof concern doesn't apply to this staff-only view.
> DR-103 is a test-infrastructure-only fix (see Gotchas below for the
> pattern) — no production code touched. DR-104 adds percentage-discount
> Coupons: SUPERADMIN sets a discount % (50% hard cap) and an optional
> redemption cap/expiry on `/staff/settings/coupons`; the code is always
> system-generated (`generateCouponCode`, an exact user-specified format —
> `CPC-{YY}-{6 digits, never '3'}-{2 letters, never "AK"}`), never staff-
> typed. Both the guest booking page and the staff booking-detail page get
> an identical optional coupon field (shared `CouponForm` client component)
> right above the existing Pay-deposit/Pay-in-full buttons — applying a
> valid code recomputes and persists `Invoice.discountMinor`/`taxMinor`/
> `totalMinor`/`depositMinor`/`balanceMinor` in place (tax computed on the
> *discounted* subtotal), so the existing payment path charges the
> discounted amount with no changes to `initiatePayment` itself. New
> platform-wide `Coupon`/`CouponRedemption` tables (third entity in the
> `settings` module, alongside `TaxRate`/`PlatformRate`) — a redemption is
> counted at apply time, not payment time, and a `SELECT ... FOR UPDATE`
> lock on the `Coupon` row (inside `withOrg`'s transaction) makes the
> `maxRedemptions` cap race-safe under concurrent applies. No new
> permission: apply/remove reuses `payment.initiate` (the same permission
> `initiatePayment` itself already uses, not `invoice.read`), and coupon
> CRUD reuses `platform_settings.read`/`.write` + the existing
> `requireSettingsWriter` SUPERADMIN gate. DR-105 hard-blocks edits on a
> terminal-status booking (`COMPLETED`/`CANCELLED`/`REFUNDED`, no SUPERADMIN
> override): `bookingService.addTraveler`/`setTravelerPassport`/`setAddons`,
> `itineraryService.updateItinerary`/`addDay`/`updateDay`/`removeDay`/
> `addDaySite`/`removeDaySite`/`moveDaySite`, `financeService
> .saveBookingCostBreakdown`, and `invoicingService.applyCoupon`/
> `removeCoupon` all now 409 once the parent booking is terminal — governed
> by one shared `isBookingLocked`/`TERMINAL_BOOKING_STATUSES` predicate in
> `booking/domain.ts`, exported through `booking/index.ts` for `itinerary`/
> `finance`/`invoicing` to reuse. Itinerary's own workflow transitions
> (submit/send-back/approve) and hotel/restaurant ratings are deliberately
> untouched, and assignment (vehicle/driver/guide, keyed by `Departure`
> rather than a single `Booking`) is out of scope. DR-106 closes that
> assignment gap on its own terms: `assignmentService.createAssignment`/
> `removeAssignment` now 409 once the departure's own `hasDepartureEnded`
> check (`endDate < now`, `catalog/domain.ts` — `Departure.status` is dead
> for this purpose, never programmatically set past `SCHEDULED`) is true,
> hard-blocked with no override; `/staff/departures/[departureId]` hides
> both the remove buttons and the create-assignment form once locked.
> DR-107 adds a 24-hour post-tour cooldown before a vehicle/driver/guide
> reads AVAILABLE again (previously immediate) — `fleet/domain.ts`'s
> `isWithinPostTourCooldown`, factored into `syncFleetAvailabilityForDeparture`
> (`src/lib/fleet-availability.ts`), plus a new hourly QStash job
> (`/api/jobs/sweep-fleet-cooldowns`, **not yet registered against the live
> deployment**) since nothing else re-evaluates a resource once the window
> naturally elapses. Vehicle/DriverProfile/GuideProfile only — `StarlinkKit`
> has no parallel `availability` field, left out of scope. DR-108 lets staff
> turn an `AWAITING_QUOTATION` `TAILOR_MADE` request into a real DRAFT
> `TourPackage` prefilled from the guest's plan-my-trip answers — new
> `Booking.customizedPackageId` (`@unique`, one package per booking, never
> reassigned), gated `booking.confirm`; only 4 of the wizard's 9 steps map
> onto a real `TourPackage` field (description/country/tags/durationDays),
> the rest fold into the new package's description text. DR-109 replaces
> the native `window.confirm()` destructive-action dialog (DR-086) with an
> in-app `ConfirmDialog` modal — a single choke point (`SubmitButton`), so
> the mechanism changed in exactly one place; retires the
> `page.once('dialog', ...)` Playwright pattern DR-087 introduced entirely —
> no native dialog exists to auto-dismiss anymore. DR-110 adds a homepage
> "Trusted by" partners/clients section (`PartnersMarquee`, continuous
> hover-pausing scroll) between How it works and the closing CTA band —
> placeholder data only for now (no real partner names/logos yet). DR-111
> makes `Traveler.age`/`nationality`/`idOrPassportNumber` nullable — a
> `TAILOR_MADE` booking's plan-my-trip wizard never collects real
> per-traveler data for these (only the tour lead's own citizenship/country
> of residence, and a bare seat count for everyone else), so staff setting
> up its travelers on `/staff/bookings/[bookingId]/travelers/new` no longer
> have to assume/fabricate a value; a `PREDEFINED_PACKAGE` booking (real,
> immediate travel) still requires all three, enforced in
> `bookingService.addTraveler` via new `requiresFullTravelerDetails(origin)`,
> not the DB or the zod shape schema. `visaService.submitApplication`/
> `autoSubmitOnPassportUpload` both guard against a null nationality/
> idOrPassportNumber (manual path throws, auto-submit-on-upload just skips,
> leaving the traveler on the "needs application" reconciliation view).
> DR-108's package-creation composition moved into a shared
> `src/lib/create-customized-package.ts` helper and now **auto-fires**
> (once — `setCustomizedPackage` itself rejects a second one) the moment a
> `TAILOR_MADE` booking's traveler/passport setup wizard reaches its true
> last step, redirecting straight to the new package; the manual
> "Create customized package" button stays as a fallback for bookings whose
> setup completed before this change. **DR-112 was a live production
> incident caused by DR-111**: the staff booking-detail page
> unconditionally built an invoice once traveler/passport setup was
> complete, which throws until a `TAILOR_MADE` booking's quotation is sent
> — DR-111's own auto-redirect made that exact "setup done, still awaiting
> quotation" state routine, turning a previously near-unreachable bug into
> a real crash on `www.mufasasafaris.com`, confirmed via `vercel logs
> --level error`. Fixed by gating the invoice/payments/rating-code sections
> on `booking.priceMinor != null` rather than just setup-completeness, with
> a new e2e regression test seeding exactly that state. DR-113 adds a
> guest-facing Weather page, footer-linked only (not top nav) — `/weather`
> lists current conditions for 26 towns across the 4 operating countries,
> grouped by country; `/weather/[town]` adds a 7-day forecast and
> staff-authored seasonal/travel notes. New `weather` module (no
> `repository.ts` — same shape as `insights`/`tracking`, nothing here is
> tenant-scoped) calls Google Maps Platform's Weather API through a new
> `GoogleWeatherGateway`, reusing the existing `GOOGLE_MAPS_SERVER_API_KEY`
> rather than a new credential — that key's Google Cloud project still
> needs the Weather API product enabled and added to its restriction list
> (OI-14) before this serves live data. Town list is a static config
> (`src/lib/weather-towns.ts`, mirrors `destination-sites.ts`), not a DB
> table. `weatherService` never throws to the page — a gateway failure
> degrades to `current`/`forecast: null` (town + seasonal notes still
> render), backed by a new Redis cache (`src/lib/weather-cache.ts`) that is
> this feature's real defense against hammering a billed third-party API,
> not IP-based rate-limiting. See DR-082 through DR-113 for full detail.
> **DR-080/081 were a live production incident** (guide-mandatory,
> DR-079, crashed real staff traffic because `deactivateUser` never
> cascades to suspend a `GuideProfile`) — root-caused, fixed at both the
> defensive (`createAssignmentAction` catches every `ApiError`) and root
> (`recommendAssignment` re-validates each guide candidate) layers, and
> confirmed against real production data. **Not yet decided**: whether
> `deactivateUser` should itself cascade to suspend `DriverProfile`/
> `GuideProfile` (would fix this at the data layer for good; the analogous
> driver-side gap is flagged but not yet fixed). **Process gap owned**: CI
> was red on every push this session and never checked until this incident
> — one real CI-caught bug (DR-076's `getDepartureTripSummaryForBookingLookup`
> resolving the wrong org via `getPrimaryOrgId()` instead of taking
> `organizationId` as a parameter like its siblings) was fixed alongside.
> Turning CI back on also surfaced two pre-existing e2e gaps, both fixed,
> neither a DR-007 trigger (test-only, no production code changed):
> `e2e/helpers/assignment-fixture.ts`'s guide fixture had no `GuideProfile`
> row, so it could never appear as a selectable option in DR-078's
> `SearchableSelect` picker; and `guest-checkout.spec.ts` had a bare
> click-then-URL-assertion race already documented as a known gotcha below,
> just never hit before. Payments now auto-succeed on initiation rather than staying
> staff-`PENDING` (DR-074, stub-gateway only, OI-01);
> `countryOfResidence`/`citizenship` are mandatory on a `TAILOR_MADE`
> request (DR-075); Find My Booking shows real trip/price/add-on detail
> (DR-076); the departure/Starlink pickup-location forms have an
> interactive Google Maps picker layered over the existing plain lat/long
> inputs, degrading gracefully to those alone until
> `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` is provisioned (DR-077, OI-13); guide
> assignment has a real searchable picker pre-filled to the top-rated
> eligible guide (DR-078) and is now a **mandatory** field, enforced at the
> application layer only — `Assignment.guideUserId` stays nullable in the
> DB (DR-079).
> DR-117 splits `TourPackage`'s single `PUBLISHED` status into
> `PUBLISHED_AVAILABLE`/`PUBLISHED_UNAVAILABLE` (explicit user request) — a
> real enum split, not a side boolean, so "status" stays one field. Both
> sub-statuses stay guest-visible exactly like the old single `PUBLISHED`
> (`isPackageVisible`); only `PUBLISHED_AVAILABLE` is bookable (`isBookable`,
> `createDepartureForBooking`, `/book-package/[packageId]`, the staff manual
> package-booking path) — `PUBLISHED_UNAVAILABLE` is "still listed, booking
> disabled," not hidden like `DRAFT`. New `catalog/domain.ts`'s
> `isPublishedStatus(status)` is the one shared "is this either published
> sub-status" check every caller uses. DR-097's Public list page
> (`/staff/packages/public`) gained an Available/Unavailable Status filter;
> the Customized list's DRAFT/ARCHIVED partition is unaffected. **Schema
> change applied by hand to the shared Neon DB, coordinated with a
> concurrent session also editing this repo** (its own in-progress,
> not-yet-logged schema work — see Gotchas below on concurrent-session
> coordination) — requires `ALTER TYPE "PackageStatus" RENAME VALUE
> 'PUBLISHED' TO 'PUBLISHED_AVAILABLE'` then `ADD VALUE
> 'PUBLISHED_UNAVAILABLE'` *before* `db push`, since a plain `db push` can't
> itself rename an enum value already in use by existing rows.

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
| Object storage | Vercel Blob `2.6.1`, region `fra1` — passports (private, authenticated streaming route); visa decision documents land in Phase 2. DR-071 adds a second, `access: 'public'` variant (`content` module) for staff-uploaded guest-site images — the `next.config.mjs` `images.remotePatterns` allowlist now has one entry for Blob's public host to match |
| Payments | DPO Pay (hosted page, v6, SAQ-A) — stubbed behind a `PaymentGateway` interface, commercial terms still open (OI-01) |
| Cache / rate limiting | Upstash Redis `@upstash/redis 1.38.0` — live in production (`src/lib/rate-limit.ts`) |
| Scheduled jobs | Upstash QStash `@upstash/qstash 2.11.2` — three schedules registered and live in production (`sweep-bookings` every 15 min, `sweep-fleet-availability`/DR-082 and `sweep-user-dormancy`/DR-084 both daily, registered 2026-08-10); a fourth, `sweep-fleet-cooldowns`/DR-107 (hourly), is coded and added to `scripts/register-qstash-schedule.ts` but **not yet registered against the live deployment** — run `npm run qstash:register-schedule` to activate it |
| Email / WA / SMS | Resend · WhatsApp Cloud API · Africa's Talking — Resend + Africa's Talking have real, live credentials (see Open Items for delivery caveats); WhatsApp still unconfigured (OI-06) |
| Tests | Vitest (unit + RLS), Playwright `1.61.1` (E2E) |
| Observability | Sentry + Vercel Analytics + Axiom (structured logs) |
| Geo/map viz | `@visx/geo`+`@visx/responsive`+`@visx/tooltip`+`@visx/event` `4.0.0`, `topojson-client` `3.1.0`, `world-atlas` `2.0.2` — homepage Africa/Namibia/DRC map. Not `react-simple-maps` (no React 19 support) |
| Interactive maps | Google Maps JS API (DR-077) — loaded directly via `next/script`, no npm package (a hand-written type shim shared by `src/components/ui/MapLocationPicker.tsx` and `ItineraryDayMap.tsx`, `google-maps-types.ts`, not `@types/google.maps`). Powers the pickup-location picker (departure/Starlink-kit staff forms, ItineraryDay pickup/dropoff) and the read-only per-day map on the staff Map tab (DR-089); `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` live in production (OI-13, resolved 2026-08-08) |
| Server-side maps/geocoding | Google Static Maps API + Geocoding API (DR-088/089) — `GOOGLE_MAPS_SERVER_API_KEY`, server-only, never `NEXT_PUBLIC_`-prefixed. `src/modules/itinerary/gateway.ts` (`StaticMapsGateway`) renders the Map tab's per-day PDF map image; `scripts/backfill-coordinates.ts` is the Geocoding API's only consumer, run by hand |
| Weather data | Google Maps Platform Weather API (DR-113) — reuses the same server-only `GOOGLE_MAPS_SERVER_API_KEY`, not a new credential; that key's Google Cloud project still needs the Weather API product enabled + added to its restriction list (OI-14) before this serves live data (degrades gracefully to town/seasonal-notes-only until then). `src/modules/weather/gateway.ts` (`GoogleWeatherGateway`) calls `currentConditions:lookup`/`forecast/days:lookup`, one bounded retry on a genuine failure (never on timeout), no circuit breaker — call volume is bounded by `src/lib/weather-cache.ts` (Upstash Redis) instead |
| PDF generation | `@react-pdf/renderer` `4.5.1` (DR-089) — this repo's first PDF-generation capability; `src/modules/itinerary/map-pdf.tsx` lays out the Map tab's per-day PDF (Static Maps image + stop list) |
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
    staff/
      login/, forbidden/       # outside the auth gate
      change-password/         # forced first-login flow (mustChangePassword) + voluntary visit
      (dashboard)/             # gated by requireStaffContext (isStaffRole baseline)
        layout.tsx, nav.tsx, back-button.tsx, sidebar-shell.tsx, settings-items.ts
        bookings/, departures/, itineraries/, hotels/, restaurants/, sites/,
        fleet/, schedule/, visa-queue/, country-regulations/,
        finance/, insights/, tracking/, ratings/, packages/, profile/,
        map/ (DR-089: booking-reference lookup -> per-day map + PDF),
        settings/ (finance hub -> tax-rates, platform-rate, coupons; DR-123),
        admin/ (users, clients, permissions)
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
                   #   applied via a shared computeInvoiceAmounts helper)
    notifications/ # WhatsApp→SMS→email fallback gateways, no repository.ts
    documents/     # Document metadata + Vercel Blob gateway (private access)
    fleet/         # Vehicle + DriverProfile + GuideProfile + StarlinkKit +
                   #   MaintenanceRecord, compliance-document tracking;
                   #   DR-082 adds availability/lastActiveAt (usage-recency,
                   #   independent of each entity's own operational status)
    assignment/    # Assignment (Departure -> vehicle/driver/guide), overlap rule
    visa/          # VisaApplication lifecycle, facilitator queue
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
                   #   for the Map tab, DR-089)
    immigration/   # CountryRegulation — platform-wide visa/entry reference data
    ratings/       # Tourist-facing driver/guide/agency reviews (RatingCode,
                   #   Review, ReviewSubjectRating) — distinct from itinerary's
                   #   staff-only hotel/restaurant ratings
    insights/      # Read-only executive dashboard, no repository.ts (owns no table)
    finance/       # Cost-plus pricing engine — 7 rate tables feeding the
                   #   cost breakdown itself (HotelRate/ActivityFee reference
                   #   itinerary's Hotel/Activity by id, DR-116; AdminCostRate,
                   #   DR-126, is the 7th) + an 8th, AddonRate (DR-128, prices
                   #   catalog's AddonService by country+code, resolved via
                   #   src/lib/addon-rates.ts, not computeBaseCostMinor) +
                   #   PackageCostBreakdown (TourPackage) /
                   #   BookingCostBreakdown (TAILOR_MADE Booking, DR-092)
                   #   sharing one resolveRatesForCost helper
    tracking/      # Fleet location + trip-progress composition, no repository.ts
    settings/      # TaxRate + PlatformRate + Coupon CRUD (DR-104: system-
                   #   generated discount codes, SUPERADMIN-only writes)
    content/       # SiteContent (About page) + FaqEntry CRUD (DR-071),
                   #   SUPERADMIN-only; public no-ctx read path powers the
                   #   guest /about and /faq pages, mirroring catalog's
                   #   listPublicPackages convention
    weather/       # Guest /weather pages (DR-113), no repository.ts (owns
                   #   no table — town list is src/lib/weather-towns.ts, a
                   #   static config). gateway.ts calls Google Maps
                   #   Platform's Weather API; service.ts is a fully public
                   #   no-ctx read path (mirrors content's public methods)
                   #   that degrades to null current/forecast on any
                   #   gateway failure rather than throwing
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
  `GuideProfile` (indefinite, no purge), a client (bare `TOURIST` contact
  record, DR-085 — additionally guarded by `src/lib/client-deletion.ts`:
  blocked unless every one of their bookings is `COMPLETED`-and-reviewed or
  already superadmin-deleted). `StarlinkKit` is a genuine hard delete
  (confirmed no FK references it). All gated by a `SUPERADMIN`-only
  service-layer check beneath the route permission, never by the bare
  permission alone.
- **No generic job runner** — every scheduled job is its own QStash-
  signature-verified route + its own entry in
  `scripts/register-qstash-schedule.ts`'s schedule list, registered by
  re-running that script (idempotent — fixed `scheduleId`s update in place,
  never duplicate). Four exist today: `/api/jobs/sweep-bookings` (every 15
  minutes), `/api/jobs/sweep-fleet-availability` (DR-082, daily), and
  `/api/jobs/sweep-user-dormancy` (DR-084, daily) are registered and live;
  `/api/jobs/sweep-fleet-cooldowns` (DR-107, hourly) is coded and in the
  script's schedule list but **not yet registered against the live
  deployment** — run `npm run qstash:register-schedule` to activate it.

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
- **OI-12** (DR-069; partially resolved DR-073) `TourPackage.imageUrl`
  still ships `null` on every package, and `/gallery` still uses
  `PackageImage`'s illustrated gradient fallback — no real photos, don't
  fabricate or scrape images to fill this. DR-073 (2026-08-05) closes the
  narrower "nothing real exists anywhere" gap for the homepage hero only:
  three licensed stock photos (Sossusvlei/Namibia, Virunga/DRC, Victoria
  Falls/Zambia+Zimbabwe) now render in `HeroCarousel`. DR-071's `content`
  module image-upload primitive (public Vercel Blob URL) remains unwired
  to `/gallery` or `TourPackage.imageUrl` — still nothing real to attach
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
