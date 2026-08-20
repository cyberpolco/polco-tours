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

> Current through DR-159 — see `docs/decisions/DECISION_LOG.md` for full
> history. **DR-159** (explicit user request, walked through the
> permission review tab-by-tab with the user before any code, per their
> own "ask questions, don't assume" instruction) reverses DR-035's
> runtime, DB-backed permission-matrix editor: what each role grants is a
> hardcoded, in-code map again (`src/lib/rbac.ts`'s `ROLE_PERMISSIONS`) —
> `/staff/admin/permissions` (page, route, and every `RolePermission`-
> backed method in `authService`/`authRepository`) is deleted outright,
> and `RolePermission` itself is dropped from the schema — **applied to
> the shared Neon DB, verified via `psql`** (the `role_permissions` table,
> 108 pre-existing rows, is gone; `to_regclass('public.role_permissions')`
> now returns null), same "explicit confirmation before a destructive
> change" convention as every other one. SUPERADMIN is unchanged: still the one hardcoded, unconditional
> wildcard. Per the user's own per-item decisions: PLATFORM_ADMIN is
> narrowed off `catalog.write`, `itinerary.approve`, `visa.process`,
> `documents.read`/`.write`, `invoice.read`, `payment.initiate`/
> `.resolve`, and `booking.cancel` (TOUR_OPERATOR is the operational role
> for all of these now); both PLATFORM_ADMIN and TOUR_OPERATOR lose
> `finance_config.*`/`platform_settings.*` entirely (Finance Settings is
> now SUPERADMIN-only end to end); TOUR_GUIDE loses `documents.read`; the
> Clients directory gains PLATFORM_ADMIN alongside SUPERADMIN/
> TOUR_OPERATOR (`isClientDirectoryViewer`, `auth/domain.ts`). A new
> mechanism, `STAFF_PAGE_ACCESS` (`rbac.ts`) plus `requireStaffRole`/
> `withRole` (siblings of `requireStaffContext`/`withAuth`), gates a menu
> item by a plain hardcoded role list wherever its old gating `Permission`
> is also load-bearing for an unrelated internal composition that can't
> itself be narrowed: the general **Bookings** tab/list/detail pages
> (`booking.read` stays broadly granted for VISA_FACILITATOR's
> `findTraveler` and TOUR_GUIDE/DRIVER's own-assignment-scoped My Schedule
> view — the general pages narrow to PLATFORM_ADMIN/TOUR_OPERATOR, plus
> VISA_FACILITATOR on the detail page specifically since `/staff/
> visa-queue` links directly into it) and the **Packages** tab/list/
> detail-view pages (`catalog.read` stays broadly granted; the tab itself
> narrows to PLATFORM_ADMIN/TOUR_OPERATOR). Narrower still: the "Confirm"
> booking action is TOUR_OPERATOR-only even though PLATFORM_ADMIN keeps
> the broader `booking.confirm` permission (also gates Refund/Send
> Quotation/Convert-to-Itinerary/link Customized Package/the cost-
> breakdown editor, all kept for PLATFORM_ADMIN) — a new
> `isBookingConfirmer` (`booking/domain.ts`), same "hardcoded role check
> beneath the permission gate" layering as `isBookingDeleter`. Every new
> denial redirects to `/staff/forbidden` or returns a structured
> `problem+json` 403, never a raw 404 or crash — confirmed as an explicit
> requirement; the Confirm action also gets a same-page
> `?error=notAuthorized` Alert since its button is additionally hidden
> from anyone but SUPERADMIN/TOUR_OPERATOR. **DR-158/157/156** (directly
> below, all 2026-08-19, committed by concurrent sessions) are a guest
> package-card layout fix, an Insights revenue-after-delete bug fix, and a
> site-wide typography swap — unrelated to this permission work; DR-159
> was assigned to avoid colliding with those already-taken numbers, the
> same class of collision DR-154/155 hit before.
>
> **DR-155** (explicit user request, discussed in depth first —
> several rounds of clarifying questions before any code, given the
> request's scope: "totally review Insights, live-updating dashboard
> covering finance/guest/staff/visa stats") rebuilds `/staff/insights` in
> place as a live-polling, richly-visualized executive dashboard.
> **Live mechanism**: the client polls the existing `GET /api/v1/insights`
> route every 30s; the route now also accepts an optional `?from=&to=`
> date-range filter (`DateRange`, `null` on either side meaning unbounded/
> all-time, matching the original snapshot when neither is given), and the
> whole computed summary is cached in Upstash Redis for 30s
> (`src/lib/cache.ts`, same env-gated graceful-degradation shape as
> `rate-limit.ts` — always recomputes fresh when Redis isn't configured) so
> N staff members with the dashboard open concurrently cost at most one
> recompute per 30s window, not N. **Access restricted** beyond the
> existing `insights.read` permission to SUPERADMIN/TOUR_OPERATOR/
> PLATFORM_ADMIN only via a new hardcoded `isInsightsViewer` check
> (`insights/domain.ts`), same "hardcoded role check beneath the
> permission gate" convention as `isBookingDeleter`/`isFleetDeleter`/
> `isVisaDeleter` — the page itself redirects to `/staff/forbidden` on its
> own hardcoded check, while `/api/v1/insights` 403s via the same check
> inside the service. **New
> Staff-stats section**: headcount by role + active/deactivated/dormant
> breakdown, via a new `authService.getStaffRosterSummary` gated by a
> brand-new `staff_roster.read` permission (seeded to PLATFORM_ADMIN +
> TOUR_OPERATOR) — deliberately NOT `admin.all` (confirmed with the user
> first): TOUR_OPERATOR doesn't hold `admin.all`, and granting it just to
> see a headcount stat would also unlock full user CRUD + the permissions
> matrix, far beyond what this needed; `insightsService` degrades this one
> section to zeros (never fails the whole dashboard) if the permission
> isn't yet seeded live. Fleet availability (AVAILABLE/BOOKED/INACTIVE)
> breakdown reuses data insights already fetches, no new query. **New
> Guest-stats section**: new-vs-returning guests (by each tourist's
> earliest-ever booking, not just ones inside the selected range),
> PREDEFINED_PACKAGE-vs-TAILOR_MADE origin split, a TAILOR_MADE-only
> booking-stage funnel (Awaiting Quotation → Quotation Sent →
> Confirmed-or-later — an honest *current pipeline distribution*, not a
> true historical funnel, since this app has no booking-status-transition-
> history table) + cancellation/refund rate, and a guest geography
> breakdown that surfaces a real, deliberately-not-papered-over data gap:
> `Booking.countryOfResidence` only exists for a TAILOR_MADE booking, so a
> PREDEFINED_PACKAGE booking's geography buckets under a new
> `GUEST_GEOGRAPHY_NOT_COLLECTED` constant instead of being guessed at.
> **New Finance-stats additions** (extending the existing Revenue section):
> average booking value, tax/platform-fee collected, deposit-vs-full-paid
> split (derived from each invoice's own `payments[]` `PaymentKind`, since
> `Invoice` itself has no such flag), and total-discount-given +
> coupon-redemption count — all derived from `InvoiceView`/`PaymentView`
> fields insights already fetches (`invoicingService.listAllForOrg`),
> needing **no new `insights -> settings` module dependency**.
> **Genuinely new infrastructure — wizard-step-abandonment tracking**:
> previously nothing was written to the DB until a guest's final "Request
> quotation" submit on the 9-step `plan-my-trip` wizard; steps 0-7 were
> pure client React state. Confirmed via explicit clarifying questions
> before building (session-identification mechanism, what to record,
> granularity, retention): a new `analytics` module (no `insights`-owned
> table, following the `auth`-shape convention) owns a new tenant table,
> `WizardProgressEvent` (RLS'd like every other tenant table), tracking
> only the *highest step reached* per session (never actual field values,
> and never lowered by a "Back" click — a raw parameterized `INSERT ... ON
> CONFLICT ... DO UPDATE SET "highestStep" = GREATEST(...)` keeps this
> race-free) — identified by a lightweight opaque cookie (`wizard_session`,
> set client-side the moment the wizard loads) rather than establishing a
> real better-auth anonymous session/User row (a materially heavier privacy
> footprint the user explicitly rejected). `analyticsService
> .recordWizardStep` is a public, no-`AuthContext` write (mirrors
> `ratingsService.submitRating`'s shape exactly: resolves
> `getPrimaryOrgId()`, never a caller-supplied org), rate-limited via a new,
> more general `assertWriteNotRateLimited` (`src/lib/rate-limit.ts`,
> extending the existing failure-gated `assertLookupNotRateLimited` with a
> plain per-call-volume throttle instead, since a tracking write has no
> pass/fail concept to gate on) and wrapped so any failure is silently
> swallowed — this must never affect the wizard. Rows auto-purge after 30
> days via a new QStash job, `/api/jobs/purge-wizard-progress` — **coded,
> added to `scripts/register-qstash-schedule.ts`'s schedule list, and
> registered against the live deployment** (`npm run
> qstash:register-schedule`, confirmed via its own console output). New
> **`insights -> analytics`
> module dependency** (confirmed acyclic: `analytics` imports nothing from
> `insights`). **Trend charts** (revenue per-currency, bookings,
> visa-application volume, new-guest signups) bucket already-fetched
> timestamped rows by day/week/month, the bucket size chosen from the
> selected date range's span (`chooseGranularity`) — no new queries, no
> stored time-series table. **Visual design**: built per the `dataviz`
> skill's form-then-color procedure using this app's own "Horizon"
> design-system tokens (not a generic palette) — circular ring meters for
> the three utilization percentages + conversion rate, donut charts for
> part-to-whole breakdowns with enough categories to earn one (revenue by
> country/package, staff headcount by role, guest geography), split-meter
> bars (not 2-slice pies, per the skill's own guidance) for new-vs-
> returning/origin splits, horizontal funnel bars for the two funnels, and
> line/area trend charts with a hover crosshair+tooltip — all hand-rolled
> inline SVG/CSS rather than a new charting dependency (this app's own
> `@visx` family is still used only for the homepage map; no new package
> was added). The categorical palette was run through the skill's
> `scripts/validate_palette.js` (`--mode light --surface "#F6EFE4"`, this
> app's own "bone" background) together with the user — the raw named
> Horizon tokens (amber/forest/gold/navy.line, plus mist as a 5th slot)
> **FAILED**: gold was too light and too low-contrast, and forest/navy.line/
> mist all read as gray (chroma below the floor — mist especially, since
> it's a text/neutral token, never meant to carry hue identity). Fixed by
> stepping three of the four hue families to a chroma/lightness that
> actually clears the checks (amber unchanged, forest → `#1B8F5A`, gold →
> `#B8860B`, navy/dusk-plum → `#8B3F82`) and dropping mist from the
> categorical set entirely — `CHART_CATEGORICAL` in `chart-colors.ts` is now
> exactly these 4 validated hues, `ALL CHECKS PASS` (two WARNs — gold/forest
> CVD separation in the 6-8 floor band, gold's contrast at 2.85:1 — both
> legal only because every chart here already ships direct labels + a
> legend, never color alone). Fixing this surfaced a real bug: dropping from
> 5 hues to 4 left `DonutChart`'s fold-into-"Other" threshold hardcoded at
> 6, meaning a 5th/6th real category (e.g. staff headcount by role) would
> have silently repeated an already-assigned color instead of folding —
> fixed by deriving that default from `CHART_CATEGORICAL.length` directly so
> it can't drift out of sync again. This app has no dark theme anywhere, so
> the charts don't attempt one either. New EN/FR message keys throughout
> `StaffInsights`. **Schema change (one new table, `wizard_progress_events`,
> purely additive, plus its RLS policy) applied by hand to the shared Neon
> DB** — verified via `psql` (`relrowsecurity`/`relforcerowsecurity` both
> `t`, the `tenant_isolation` policy present); `db:seed` re-run afterward,
> confirmed via `psql` that `role_permissions` now has `staff_roster.read`
> for both `PLATFORM_ADMIN` and `TOUR_OPERATOR`. **Follow-up, same DR-155**:
> explicit user request — "stats should start fresh with only current
> figures" — added a fixed floor, `DASHBOARD_EPOCH` (`insights/domain.ts`,
> the day this rebuild shipped), that every booking/invoice/visa
> application must be created on or after to count in ANY computation this
> dashboard does, even under "All time" (`clampRangeToEpoch` clamps the
> resolved range's `from` up to the epoch before anything else runs, and
> the three fetched arrays are filtered to epoch-onward once, immediately
> after fetching, in `insightsService`). This is a display floor for this
> one composition only — it never touches, hides, or deletes the
> underlying rows anywhere else in the app (booking/invoice/visa-queue
> pages are completely unaffected). The custom date-range inputs get a
> matching `min` attribute so a user can't even try to pick an earlier
> date, and the page shows an explicit "figures start from {date}" note.
> **DR-154** (explicit user request, walked through several rounds
> of clarifying questions before implementing) makes the visa workflow fully
> operational end-to-end from the guest side, and retires a duplicate/
> disconnected internal cost bucket for visa handling. `ImmigrationCostRate`
> (the 4-fee staff-only cost-plus bucket, `requiresVisa`/
> `immigrationCostRateId` on both `PackageCostBreakdown`/
> `BookingCostBreakdown`) is removed entirely — it had nothing to do with
> whether a guest actually bought the guest-facing "Visa Assistance"
> `AddonService` (priced via `AddonRate`, DR-128, already additive to the
> invoice total), the same base-inclusion/add-on-purchase duplication DR-147
> already closed for Photographer/Videographer; `computeCostBuckets`/
> `computeBaseCostMinor` now sum seven buckets, not eight. **Schema change
> (drops the `immigration_cost_rates` table + two columns on both
> cost-breakdown tables) applied by hand to the shared Neon DB** — verified
> via `psql` first that zero `PackageCostBreakdown`/`BookingCostBreakdown`
> rows had `requiresVisa = true` (the two `immigration_cost_rates` rows
> themselves were unused config, safe to lose), then dropped via scoped raw
> SQL rather than a blanket `db push` — a second, uncommitted, unrelated
> feature (also self-labeled "DR-154": a `WizardProgressEvent`/analytics
> table + `staff_roster.read` permission) was mid-flight in the same working
> tree at the time, so `db push`'s file-on-disk diff would have picked up
> its schema changes too. **DR number collision, not yet resolved**: that
> other feature needs to renumber to DR-155 (or later) once it's committed,
> since this DR-154 was committed and pushed to `main` first. Three new
> guest-safe `visaService` methods
> (`getApplicationForGuest`/`resubmitApplicationForGuest`/
> `streamDocumentForGuest`) let the booking's tour lead (the only session
> that can ever reach a booking's travelers at all) see a rejection reason,
> re-upload a passport and resubmit, or download an approved visa document
> from a new `/booking/[bookingId]/visa` guest page and a new guest-only
> download route — all deliberately without the staff `visa.process`/
> `documents.read` permission assertions (TOURIST holds neither), relying
> instead on the existing `findTraveler` → `bookingService.listTravelers`
> ownership check for anti-BOLA, same "caller-context already gates it"
> convention as `autoSubmitOnPassportUpload`. Two new notification events,
> `VISA_APPROVED`/`VISA_REJECTED`, fire from `decideApplication`. Staff can
> now approve/reject an application and upload its granted document directly
> from `/staff/visa-queue` (new `decideApplicationAction`/
> `uploadVisaDocumentAction`), closing that page's own former "decide/
> resubmit/upload stay API-only" scope note. No new permission — every new
> capability rides on an existing permission or ownership check. **DR-153** (explicit user request) removes the generic "Back"
> browser-history button (`back-button.tsx`, rendered on every staff
> dashboard page via `layout.tsx`) — redundant on any page that already had
> its own page-specific "back to X" `BackLink`, and less predictable
> (plain `router.back()`) than an explicit destination everywhere else.
> `back-button.tsx` and its `NO_BACK_ROUTES` hub-page suppression list are
> deleted outright. Of the pages that had no other back-navigation: 10
> already had their own `BackLink`; 10 sit inside the Settings
> `SidebarShell`, whose persistent sub-nav already covers it; the remaining
> 9 leaf pages (`admin/users/[userId]`, `country-regulations/new` +
> `[country]`, `hotels/[hotelId]` + `new`, `restaurants/[restaurantId]` +
> `new`, `itineraries/[itineraryId]`, `departures/[departureId]`) each got a
> real `BackLink` added to a real destination — the departure page's link to
> its parent package is conditional, since a bespoke `TAILOR_MADE`
> departure has no parent package to link to. Six new EN/FR message keys.
> No schema/permission/module-dependency change. **DR-152** (explicit user request) splits the staff package-detail
> "download summary PDF" (DR-135) into two documents: the existing staff
> version (full cost breakdown, per-day accommodation rates) is unchanged,
> and a new client-facing version drops every internal cost bucket, showing
> only the day-by-day itinerary and the one total a guest is actually
> charged (participant count + `TourPackage.priceMinor` per person).
> `finance/package-summary-pdf.tsx`'s header/itinerary-table/footer chrome is
> now three shared components (`DocumentHeader`/`ItineraryTable`/
> `DocumentFooter`) so the two documents can't visually drift apart outside
> the pricing section, the one place they differ; a new
> `ClientPackageSummaryPdfInput`/`renderClientPackageSummaryPdf` backs a new
> `financeService.generateClientPackageSummaryPdf` (same `catalog.write`
> gate, still staff-triggered — there's no guest-facing download route, this
> produces a document meant to be forwarded to a guest) and a new route `GET
> /api/v1/catalog/packages/[packageId]/client-summary-pdf`. Deliberately more
> permissive than the staff version's precondition (only needs
> `pkg.priceMinor` + the breakdown's `referenceGroupSize`, not every
> `computed*Minor` bucket, and skips the per-day hotel-rate resolution
> entirely) so a package whose breakdown predates the current pricing model
> can still produce a client document as long as it has a real price. Both
> downloads now also carry a dynamic filename (this app's first — every PDF
> route before this shipped a fixed literal) built from `slugify(title)`
> (DR-118's existing helper, already ASCII-safe) + `packageReference` (the
> human "PKG-00034" id, not the raw UUID) + a `staff`/`client` tag + locale,
> e.g. `sossusvlei-explorer-PKG-00034-staff-summary-en.pdf`. No schema/
> permission/module-dependency change. **DR-151** (explicit user request)
> lets SUPERADMIN hard-delete an individual `VisaApplication` from
> `/staff/visa-queue`, and makes deleting a booking automatically delete any
> visa application(s) belonging to its travelers — the same regression class
> DR-059 already closed for Itinerary (a dangling reference the deleted-
> booking read paths would otherwise keep surfacing as if nothing had
> happened). `VisaApplication` has no soft-delete column, so this is a
> genuine `tx.visaApplication.delete`, same "no column exists, the audit log
> is the record" precedent as DR-148's `Review` delete. New `visa.delete`
> permission (never seeded to any role) plus a new `isVisaDeleter` boolean
> helper (`visa/domain.ts`) gate `visaService.deleteApplication` beneath
> `assertCan`, same two-layer convention as `isBookingDeleter`/
> `isFleetDeleter`/`isRatingDeleter`. The cascade (`visaService
> .deleteForBooking`) is deliberately NOT called from
> `bookingService.deleteBooking` itself — visa already depends on booking,
> so the reverse would be circular — instead it's orchestrated by the caller
> exactly like `itineraryService.deleteForBooking` (DR-059), added to both
> the staff `deleteBookingAction` Server Action and the `DELETE
> /api/v1/bookings/[bookingId]` route (the pre-existing itinerary cleanup
> only lives in the former; the new visa cleanup was added to both, so a
> stale visa application can't survive either deletion path). New `DELETE
> /api/v1/visa/[applicationId]` route + a matching `deleteApplicationAction`
> power a per-row Delete button, visible only when
> `ctx.roles.includes('SUPERADMIN')`, using the standard `SubmitButton`/
> `confirmMessage` destructive-action pattern (DR-086/109). No blob-deletion
> attempted for a deleted application's referenced decision `Document` —
> same accepted "orphaned blob" tradeoff every delete path in this app
> already carries. No schema/module-dependency change. **DR-150** (explicit user request) replaces the staff Map tab's
> (DR-089) one-day-at-a-time map + per-day PDF with a single whole-circuit
> view: every day's stops plotted on one map, each day its own color, and
> one PDF download for the entire itinerary. New shared, framework-free
> `src/lib/circuit-colors.ts` (`circuitColorForDayIndex`, a cycling 12-color
> palette) is the one source of truth for a day's color, read by both the
> client Google Maps JS widget (`ItineraryCircuitMap.tsx`, replacing
> `ItineraryDayMap.tsx`) and the server Static Maps image + PDF, so the
> interactive map, the PDF's map image, and its stop-list swatches always
> agree. `itinerary/gateway.ts`'s `StaticMapsGateway.renderMap` (one day,
> one color) is replaced by `renderCircuitMap`, emitting one Static Maps
> `markers=color:0x...`/`path=color:0x...|weight:3|...` pair per day —
> Google's API already supports this natively, so it's a wider query
> string, not a new endpoint. Newly handled: Google's ~8192-char Static Maps
> URL limit, realistically reachable by a long circuit — `renderCircuitMap`
> degrades in stages (drop per-stop markers, then thin each day's path
> points) rather than ever sending a URL `fetch()` would reject.
> `itineraryService.streamDayMapPdf` is replaced by `streamItineraryMapPdf`
> (audited as `itinerary_map.downloaded`), deliberately ungated by
> `Itinerary.status` (unlike the detailed summary PDF's APPROVED-only gate)
> since this stays staff's own working tool for checking geocoding/circuit
> sanity while still building the itinerary. Route `GET /api/v1/itineraries/
> {itineraryId}/days/{dayId}/map-pdf` is replaced by `GET /api/v1/
> itineraries/{itineraryId}/map-pdf`. The hand-written `google-maps-types.ts`
> shim gains `LatLngBounds`/`fitBounds`/`Marker.icon`/`SymbolPath.CIRCLE`
> (additive; `MapLocationPicker.tsx` is unaffected). No schema/permission/
> module-dependency change. **DR-149 was a real, user-reported gap**: a vehicle/driver/guide
> stayed marked BOOKED after the departure it was assigned to no longer had
> any active booking, in two cases the DR-082 sync hook never actually
> covered. (1) SUPERADMIN hard-deleting a booking (`bookingService
> .deleteBooking`, DR-058) never called `syncFleetAvailabilityForDeparture`
> at all — fixed by having both call sites (the staff `deleteBookingAction`
> and the `DELETE /api/v1/bookings/[bookingId]` route) read the booking's
> `departureId`/`organizationId` *before* deleting (the row is invisible to
> every read path immediately after) and sync afterward, same as the
> pre-existing confirm/cancel/refund call sites. (2) Even where the hook
> *was* already wired up (cancel/refund/the COMPLETED sweep), a genuinely
> latent bug meant a soft-deleted booking could still count as "active":
> `bookingRepository.hasActiveBookingForDeparture` filtered only on
> `status: { in: ['CONFIRMED', 'IN_PROGRESS'] }`, with no `deletedAt: null`
> — `softDelete` never touches `status`, so a deleted CONFIRMED/IN_PROGRESS
> booking still matched. Fixed by adding `deletedAt: null` to that query.
> `COMPLETED`/`CANCELLED`/`REFUNDED` were never affected by either bug (both
> already excluded by the status filter, and both already had a working
> sync call site) — this closes the one remaining path (delete) and the one
> latent correctness gap (soft-delete visibility) in an otherwise-working
> DR-082 feature, not a new sync mechanism. One-off
> `scripts/backfill-fleet-availability.ts` (`npm run
> fleet-availability:backfill`) re-syncs every departure that has ever had
> an Assignment, across every organization, to correct any resource already
> stuck stale from these two gaps — safe to re-run, since
> `syncFleetAvailabilityForDeparture` always recomputes fresh from current
> state. New test case in `tests/fleet-availability-sync.test.ts` covers the
> soft-delete fix directly. No schema/permission/module-dependency change.
> **DR-148** (explicit user request) lets SUPERADMIN genuinely
> (hard) delete an individual guest review from `/staff/ratings`'s
> "Individual reviews" table — `Review` has no soft-delete column and none
> was added; a deleted row is just gone, an audit log entry
> (`rating.review_deleted`) is the record. New `rating.delete` permission
> (never seeded to any role) plus a new `isRatingDeleter` boolean helper
> (`ratings/domain.ts`) gate `ratingsService.deleteReview` beneath
> `assertCan`, same two-layer "route passes the base permission, the
> service's hardcoded SUPERADMIN check is the real gate" convention as
> `isBookingDeleter`/`isFleetDeleter`/`isCountryRegulationWriter`/
> `isFinanceConfigWriter`. `ratingsRepository.deleteReview` (a genuine
> `tx.review.delete`, still scoped through `withOrg`) cascades away that
> review's `ReviewSubjectRating` rows via the existing schema FK; the
> service then recomputes every driver/guide aggregate the deleted review
> had contributed to (from its own pre-delete `subjectRatings` snapshot)
> plus the org-wide aggregate, reusing `submitRating`'s own
> `recomputeDriverAggregate`/`recomputeGuideAggregate`/
> `recomputeOrganizationAggregate` calls, so a deleted review's score never
> lingers in an average. New `DELETE /api/v1/ratings/[reviewId]` route +
> `deleteReviewAction` Server Action back a per-row Delete button, visible
> only when `ctx.roles.includes('SUPERADMIN')`, using the standard
> `SubmitButton`/`confirmMessage` destructive-action pattern (DR-086/109).
> `Review.ratingCodeId` cascades *from* `Review` to `RatingCode`, not the
> reverse, so the review's own `RatingCode` row survives deletion, still
> marked used — deleting a review does not free up a fresh rating attempt
> on that booking. No schema/module-dependency change. **DR-147** (explicit user request) removes `PHOTOGRAPHER`/
> `VIDEOGRAPHER` from `StaffRateRole` and drops `photographerDays`/
> `videographerDays` from both `PackageCostBreakdown` and
> `BookingCostBreakdown` — a photographer/videographer is priced as a
> guest-facing `AddonService` `PHOTOGRAPHY`/`VIDEOGRAPHY` purchase (an
> `AddonRate`, DR-128), not an operational Staff cost-plus bucket line item;
> the two were a base-inclusion/add-on-purchase duplication of the same
> concept. `resolveRatesForCost`/`computeCostBuckets` (`finance/service.ts`/
> `domain.ts`) no longer resolve or sum a photographer/videographer rate;
> `CreateStaffRateInput`'s `role` enum narrows to `DRIVER`/`GUIDE`; both cost
> breakdown forms (package and booking) drop the two input fields, and their
> now-orphaned EN/FR message keys are removed. **Schema change (drops two
> `StaffRateRole` enum values + two `Int` columns) applied to the shared Neon
> DB** — verified via `psql` (2026-08-19) that the live `StaffRateRole` enum
> now has only `DRIVER`/`GUIDE` and neither cost-breakdown table has a
> `photographerDays`/`videographerDays` column; the two blocking `StaffRate`
> rows are gone. Separately
> noted, not part of this change's scope: no `AddonRate` row exists yet for
> `PHOTOGRAPHY`/`VIDEOGRAPHY` in any country, so per DR-128's "hide an add-on
> with no rate configured for the booking's country" rule, both add-ons are
> currently invisible to every guest everywhere until staff configure one on
> `/staff/finance/rates`. No permission/module-dependency change. **DR-146** (explicit user request) lets Tax Rates and Platform
> Rate be updated in place, not just added-as-a-new-row/deleted — same
> convention as `financeService`'s `updateXRate` family (DR-136) and
> Coupon's own Update (DR-144). New `UpdateTaxRateInput`/
> `UpdatePlatformRateInput` (both alias their `CreateXInput` schema) back
> new `settingsService.updateTaxRate`/`updatePlatformRate`
> (`requireSettingsWriter`-gated, unchanged) and a new `PATCH
> /api/v1/settings/tax-rates/[id]` / `platform-rates/[id]`. Since a
> package/booking's stored price/tax snapshot (DR-134/DR-145) only refreshes
> when its own cost breakdown is re-saved, both update paths also call
> `financeService.reapplyRatesToAllCostBreakdowns` (DR-136's own sweep,
> reused as-is) — a **new `settings` → `finance` module dependency**
> (confirmed acyclic: `finance` never imports `settings`) — surfaced as the
> same `?reapplied=1&packagesUpdated=&...` banner DR-136 introduced.
> `/staff/settings/tax-rates`/`platform-rate` each gain a per-row Edit
> disclosure, same local `EditDisclosure` convention as `finance/rates/
> page.tsx`/`coupons/page.tsx`. Batches one small unrelated cosmetic fix:
> the "Valid to" column is also dropped from the Tax Rates table —
> `TaxRate.validTo`, like `PlatformRate.validTo` before it (DR-143), has
> never been settable by any create/edit path, so it only ever rendered
> "—"; the schema field is untouched. No schema/permission change. **DR-145** (explicit user request, confirmed via three clarifying
> questions first) taxes a combo package/booking (its Day Template's hotels
> spanning 2+ countries) per country instead of at one flat rate. Scope,
> confirmed with the user: tax only — Staff/Transport/Admin Cost/
> Immigration/Add-on rates still resolve from the package's single primary
> `country` unchanged, since Accommodation/Restaurant/Activity costs were
> already location-correct (`HotelRate`/`RestaurantRate`/`ActivityFee`
> resolve by the specific hotel/restaurant/activity id, DR-131, never by the
> package's `country`); attribution is derived (each Day Template night's
> country comes from its assigned hotel's own `HotelRate.country`, not the
> staff-typed `TourPackage.country`/`countries[]`, DR-114), weighted by
> night count; applies to both standard packages and TAILOR_MADE bookings.
> New pure `finance/domain.ts`'s `blendedTaxRateBp` backs a new async
> `computeBlendedTaxRate` (`finance/service.ts`), collapsing to a single
> plain `getEffectiveTaxRate` lookup — identical to prior behavior — for a
> single-country package or one with no hotel-tagged Day Template yet.
> `financeService.saveCostBreakdown` uses it in place of a direct
> `pkg.country` lookup; the result still flows through the unchanged DR-134
> snapshot (`TourPackage.priceTaxRateBp`), so no schema change was needed.
> Exposed cross-module as `financeService.resolveEffectiveTaxRateBp` for a
> **new `invoicing` → `finance` module dependency** (confirmed acyclic):
> `invoicingService.getOrCreateInvoiceForBooking`'s live tax-resolution
> branch now blends using a TAILOR_MADE booking's linked
> `Booking.customizedPackageId` Day Template when one exists, instead of
> taxing the whole trip at just its single `customCountry`.
> `financeService.saveBookingCostBreakdown` is untouched — it never
> computed/snapshotted a tax rate itself; TAILOR_MADE tax has always
> resolved live at invoicing time, which is exactly where this plugs in. No
> schema/permission change. **DR-144** (explicit user request, reverses DR-104's original
> design) replaces Coupon's soft-deactivate-only lifecycle with a genuine
> Delete plus a new Update — confirmed via two clarifying questions since
> DR-104 deliberately avoided a hard delete (`CouponRedemption` has a real
> FK to `Coupon`, needed for the redemption cap count). Per explicit
> instruction: Delete always works, cascading away that coupon's redemption
> history too (`CouponRedemption.coupon` now `onDelete: Cascade` — a
> confirmed trade-off, the audit trail is the `settings.coupon_deleted`
> log entry instead), and Deactivate is gone entirely, not kept alongside
> Delete. `Coupon.deactivatedAt` is dropped (0 of 10 existing coupons had it
> set); `CouponUnavailableReason` loses its `INACTIVE` member — a deleted
> coupon's row is just gone, so the pre-existing `NOT_FOUND` reason already
> covers it. New `settingsService.updateCoupon` (full replace of
> discountBp/maxRedemptions/expiresAt, code/id immutable, reusing
> `CreateCouponInput` as `UpdateCouponInput` per DR-136's own precedent) and
> `deleteCoupon` back a new `PATCH`/`DELETE /api/v1/settings/coupons/[id]`
> route (replacing the old `POST .../deactivate`) and an Edit disclosure +
> Delete button on `/staff/settings/coupons`. **Schema change (drops
> `Coupon.deactivatedAt`, changes the `CouponRedemption` FK to cascade)
> applied by hand to the shared Neon DB** — verified via `psql`. No
> permission/module-dependency change. **DR-143** (explicit user request) removes the "Valid to" column
> from `/staff/settings/platform-rate`'s rate table — purely cosmetic:
> `PlatformRate.validTo` has never been settable by any create/edit path (every
> row is `null`, so the column only ever rendered "—"). The schema field
> itself, and its no-op read in `src/lib/platform-rate.ts`'s effective-rate
> resolution, are untouched; only the display column and its now-unused
> `StaffPlatformRate.validTo` EN/FR message key are gone. No schema/
> permission/module-dependency change. **DR-142** (explicit user request, follow-up to DR-141; batches
> in one unrelated small UI change, same precedent as DR-086) stops a
> permanently Deleted staff account from appearing on `/staff/admin/users`
> at all — `authRepository.listStaff` now excludes `deletedPermanently:
> true` at the query level, rather than returning it for the page to badge
> as "Deleted" (that fourth status/filter/badge state, and the
> `deletedPermanently` guards on the row actions, were removed as dead code
> once such a row can never appear here). A Deactivated account is
> unaffected, still listed and manageable. Also: `/staff/sites`'s page size
> raised 10 → 15, and a Province filter added alongside the existing
> Search + Country filter. No schema/permission/module-dependency change.
> **DR-141** (explicit user request) adds a genuinely permanent,
> SUPERADMIN-only "Delete" for a staff account, distinct from the existing
> reversible "Deactivate" (DR-026) — new `User.deletedPermanently` (additive,
> default `false`) distinguishes the two on the same `deletedAt` column both
> write to; `authService.deleteUser` (`isSuperAdmin`-gated, same hardcoded-
> role-under-`admin.all` layering as `isFleetDeleter`/`isBookingDeleter`)
> blocks self-delete and re-deleting an already-deleted user, and
> `reactivateUser` now throws once `deletedPermanently` is true instead of
> silently succeeding. Building this surfaced a real gap: `reactivateUser`
> calling the existing `findUserById` (which excludes any `deletedAt`-set
> row, by design, for every other caller) meant it could never actually
> resolve the very Deactivated account it exists to restore — nothing had
> exercised that path before, since dormancy (DR-084) doesn't set
> `deletedAt`. Fixed with a new `authRepository.findUserByIdIncludingDeleted`,
> used only by `reactivateUser`/`deleteUser`; `reactivateUser` itself now
> also clears a plain Deactivate, not just dormancy. `/staff/admin/users`
> gains a fourth status ("Deleted") and a SUPERADMIN-only Delete row action;
> `isSuperAdmin` (pre-existing in `auth/domain.ts`) is now exported through
> `auth/index.ts` for that UI check. **Schema change (one additive,
> defaulted-`false` column on `User`, no destructive step) applied by hand
> to the shared Neon DB** — verified via `psql` that all 698 pre-existing
> rows read `false`. No permission-matrix or module-dependency change.
> **DR-140** (explicit user request, follow-up to DR-139) rejects a
> guest booking wizard's contact email when it already belongs to a real
> staff account (any non-`TOURIST` role) — checked in both
> `(guest)/plan-my-trip/actions.ts` and `(guest)/booking/[bookingId]/
> travelers/new/actions.ts` (the only two guest-facing points that actually
> collect a real email) via `authService.getUserByEmail` +
> `isStaffRole(user.roles)`. A match returns `{ error }` (plan-my-trip's
> existing `useActionState` convention) or redirects with
> `?error=email_in_use` (travelers/new, new — same `?error=` convention as
> the Passport step). A returning guest re-using their own email is
> untouched — only a staff-owned email is blocked. No schema/permission/
> module-dependency change. **DR-139 was a live production incident** (user-reported: the
> SUPERADMIN's own `User.name` kept changing to whatever client name was
> most recently typed into a guest booking wizard, e.g. "it changed to
> Hanna") — `authService.resolveSession()` resolves whatever session cookie
> the browser carries with no staff-vs-guest check, so a staff member
> opening a guest booking page (`/book/[departureId]`, `/book-package/
> [packageId]`, `/plan-my-trip`) in the same browser they're signed into
> `/staff` with gets their own account back as `ctx`, and the wizard's
> contact-step name/phone then overwrote it via `authService.updateProfile`.
> Fixed by skipping that call in all three actions whenever
> `isStaffRole(ctx.roles)` is true — covers any staff role, not just
> SUPERADMIN, per explicit user direction. The booking itself still proceeds
> under that same session afterward (unchanged, out of scope). New
> `tests/guest-actions-staff-guard.test.ts` covers all three actions. No
> schema/permission/module-dependency change. **DR-138** auto-provisions a starter fleet record when a staff
> account is created or later edited to hold DRIVER/TOUR_GUIDE/
> VEHICLE_OWNER — explicit user request, confirmed via three clarifying
> questions first. New `src/lib/provision-fleet-profiles-for-user.ts`
> (`provisionFleetProfilesForUser`) composes `auth` + `fleet` one level up
> from both modules, called right after `authService.createUser`/
> `updateUser` resolves in both the staff Server Actions
> (`admin/users/actions.ts`/`admin/users/[userId]/actions.ts`) and the
> matching `POST`/`PATCH /api/v1/users` REST routes — on an edit, only when
> that edit's payload actually includes `roles`. DRIVER/TOUR_GUIDE get their
> 1:1 `DriverProfile`/`GuideProfile` (skipped if one already exists, via new
> manager-gated `fleetService.findDriverProfileByUserId`/the pre-existing
> `findGuideProfileByUserId`); `DriverProfile.licenseNumber` (required, no
> fallback available from `User`) gets a `"PENDING"` placeholder rather than
> a schema change. VEHICLE_OWNER gets one placeholder `Vehicle`
> (`plateNumber`/`make`/`model`/`vehicleType: "PENDING"`, `seatCapacity: 1`)
> only if they don't already own one (new `fleetService
> .findVehiclesByOwnerId`/`fleetRepository.findVehiclesByOwnerId`) — `Vehicle`
> isn't a 1:1 profile like the other two, so this is an existence guard, not
> a unique-constraint one, and it's what stops toggling the role on/off/on
> from piling up placeholder vehicles. Best-effort throughout: wrapped in a
> bare try/catch (same "never fail X creation over a Y issue" precedent as
> `itineraryService.createItinerary`'s template-copy step) so a
> fleet-provisioning failure can never fail the user create/edit action
> itself; a successful auto-provision is audited
> (`fleet.profile_auto_provisioned`). No schema/permission/module-dependency
> change. **DR-137** adds a staff-only "download detailed itinerary" PDF on
> `/staff/itineraries/[itineraryId]`, shown once the itinerary reaches
> `APPROVED` (there is no separate `CONFIRMED` status on `Itinerary` — this
> maps onto that existing terminal state) — explicit user request. New
> `itineraryService.streamItinerarySummaryPdf` (gated `itinerary.read`, same
> permission as the existing per-day Map-tab PDF) 409s if the itinerary
> isn't yet `APPROVED`, then composes every day's date/times, pickup/
> drop-off, hotel, restaurant, ordered planned sites, resolved activities,
> estimated travel time, and notes, plus the itinerary's own top-level notes
> and emergency contact, into one document via new
> `src/modules/itinerary/itinerary-summary-pdf.tsx`
> (`@react-pdf/renderer`) — deliberately mirroring `map-pdf.tsx`'s plain,
> letterhead-free, English-only layout rather than `finance/
> package-summary-pdf.tsx`'s branded EN/FR one, since this is an internal
> operational document, not a client-facing proposal. Neither `Itinerary`
> nor `ItineraryDay` has ever had a price/money field, so "without the
> prices" needed no stripping logic. New route `api/v1/itineraries/
> [itineraryId]/summary-pdf` is a thin pass-through, same convention as the
> existing day map-pdf route. The download link is visible to anyone who
> can view the detail page at all (not gated to `itinerary.write`/`.approve`
> holders) once approved — a TOUR_GUIDE/DRIVER assigned to the trip is
> exactly who most needs this document. No schema/permission/module-
> dependency change. **DR-136** lets SUPERADMIN update an Operational Rate in place
> (all eight cost-plus rate tables — Staff/Hotel/Restaurant/Transport/
> Food & Beverage/Activity Fee/Immigration Cost/Admin Cost — plus Add-on
> Rate for UI consistency), not just delete-and-recreate it, on
> `/staff/finance/rates` (an inline `<details>`-based Edit form per row) and
> via a matching `PATCH /api/v1/finance/rates/*/:id` on every existing rate
> route — explicit user request. For the eight rates that feed the
> cost-plus engine, saving an update immediately triggers new
> `financeService.reapplyRatesToAllCostBreakdowns`: every existing
> `PackageCostBreakdown` and `BookingCostBreakdown` (any TAILOR_MADE booking
> that already has one) is replayed through the same `saveCostBreakdown`/
> `saveBookingCostBreakdown` path the staff form itself uses — re-resolving
> every referenced rate at its now-current price and re-saving, so
> `TourPackage.priceMinor` (and a booking's suggested total) reflects the
> new price immediately rather than staying pinned to whatever was
> effective when the breakdown was last saved. Confirmed via clarifying
> questions first: the sweep covers packages *and* tailor-made booking
> breakdowns; a breakdown carrying a staff price override
> (`overridePriceMinor`) has its display-only `computed*Minor` bucket
> snapshots refreshed but the override itself — and therefore
> `TourPackage.priceMinor` — is deliberately left untouched (an override is
> a deliberate final word); and one breakdown failing to recompute (an
> unresolved rate, a booking gone terminal since its breakdown was saved, a
> package no longer visible) is skipped, not fatal to the sweep or the rate
> update itself — the caller sees exact counts plus a per-item skip reason,
> surfaced to staff as a banner on `/staff/finance/rates`
> (`?reapplied=1&packagesUpdated=&packagesSkipped=&bookingsUpdated=&bookingsSkipped=`,
> same query-string-summary convention as the existing `?error=&detail=`
> one). Deliberately global rather than scoped to just the rate that
> changed — most rates resolve by (country, effective date) rather than a
> stored FK on the breakdown, so replaying every breakdown is the only
> reliable way to find out which ones a given rate actually feeds.
> `AddonRate`'s update has no reapply step — it is resolved live at
> add-on-selection time (`src/lib/addon-rates.ts`), never snapshotted into
> a cost breakdown. No schema/permission/module-dependency change —
> `updateXRate` reuses each rate's own `CreateXInput` zod schema (full
> replace of every field except identity via the URL id) and the same
> ownership re-validation/`requireRateWriter` SUPERADMIN-only gate each
> rate's create path already has. **DR-135** adds a staff-only "download summary PDF" (English or
> French) on `/staff/packages/[packageId]`, combining a plain-language cost
> summary with the package's day-by-day itinerary Day Template — explicit
> user request, content/layout nailed down across several rounds of
> clarifying questions per the user's own "do not assume" instruction, not
> guessed. New `financeService.generatePackageSummaryPdf` (gated
> `catalog.write`, same as `getCostBreakdown`) composes
> `catalogService.getPackage`/`listTemplateDays` and `itineraryService
> .listHotelsByIds`/`listRestaurantsByIds`/`listActivitiesByIds` (no new
> module dependency — finance already depends on both), plus a fresh
> per-day `HotelRate` resolution for an itemized accommodation table
> (day-by-day hotel/rate attribution was never persisted, DR-132 only
> persists the summed bucket, so this one part of the document is resolved
> live rather than from a snapshot — a day whose rate can no longer be
> resolved shows as such instead of failing the document). New
> `src/modules/finance/package-summary-pdf.tsx` renders it via
> `@react-pdf/renderer`, mirroring `itinerary/map-pdf.tsx`'s existing shape
> exactly, including the site's own `BrandMark` placeholder mark (no real
> logo file exists anywhere in this repo) reproduced in SVG. New route
> `api/v1/catalog/packages/[packageId]/summary-pdf` is a thin pass-through,
> same convention as the existing map-pdf route. Every cost row is labeled
> with its basis (per-person vs. whole-group total) and the Grand Total is
> always `TourPackage.priceMinor` directly, never a hand-recomputed sum, so
> the document can never disagree with what a guest is actually charged.
> Company/footer details are fixed user-supplied constants in that one
> file (not a staff-editable CRUD screen). Two real bugs found and fixed
> while building this: (1) `PackageCostBreakdown` never individually
> persisted its Transport/Admin buckets (only Accommodation/Restaurant/
> Activities got that treatment in DR-132) — fixed with two additive
> columns, `computedTransportMinor`/`computedAdminMinor`, persisted at
> save time like the other three, never recomputed live. (2) The
> French-language PDF initially corrupted every currency amount (react-pdf's
> built-in Helvetica font lacks the glyph for the narrow no-break space
> French locale data uses as a thousands separator) — fixed with a
> PDF-local, ASCII-only `formatMoneyForPdf` helper; the app-wide
> `src/lib/money.ts` `format` helper is untouched and still correct
> everywhere else, which renders in real browsers with full Unicode font
> support. Also surfaced (not fixed, out of scope — this PDF's own
> hardcoded EN/FR label dictionary works around it): `src/i18n/request.ts`'s
> `getRequestConfig` ignores any explicit `locale` passed to
> `getTranslations`, always deriving from the cookie instead — a latent gap
> for any future feature wanting a genuine per-request locale override.
> **Schema change (two new nullable columns on `PackageCostBreakdown`, no
> destructive step) applied by hand to the shared Neon DB.** No permission/
> module-dependency change. **DR-134** folds tax and the platform fee into the stored
> `TourPackage.priceMinor` — explicit user request, walked through a
> concrete numeric example first (base cost → agency margin → subtotal →
> tax → platform fee → total) and confirmed via two clarifying questions
> before implementing, since the natural implementation collided with a
> real double-charging bug: `TourPackage.priceMinor` flows straight through
> to `Booking.priceMinor` (scaled by seats, snapshotted at hold time) and
> then into `invoicingService.getOrCreateInvoiceForBooking`, which calls
> `computeInvoiceAmounts` to add tax + platform fee **again, fresh** — so
> baking them into `priceMinor` unconditionally would have double-charged
> every `PREDEFINED_PACKAGE` guest at checkout. Resolved by snapshotting the
> tax-exclusive subtotal and the two rates that produced a package's price
> (`TourPackage.priceSubtotalMinor`/`priceTaxRateBp`/
> `pricePlatformFeeRateBp`, all additive/nullable) onto both the package and,
> at hold-creation time, the booking itself (`Booking` gains the same three
> fields, whole-booking) — `invoicingService` trusts this snapshot instead of
> re-resolving tax/platform fee live when it's present, so a guest is never
> taxed twice. Explicit, accepted trade-off: a booking now reflects whichever
> tax/platform rate was effective when its package's cost breakdown was last
> saved, not a rate that changes afterward (a deliberate, confirmed
> narrowing of DR-006/DR-127's "always resolve tax fresh" guarantee for this
> one flow). The snapshot is only ever populated when a departure is
> actually using its package's own computed price — a manual
> `priceOverrideMinor`, a bespoke departure, and every `TAILOR_MADE` booking
> (still priced via `sendQuotation`, untouched) keep resolving tax/platform
> fee live exactly as before. New shared pure helper `src/lib/pricing.ts`
> (`applyTaxAndPlatformFee`, `impliedSubtotalMinor` for decomposing a staff
> override back into a consistent subtotal+rate pair) is deliberately kept
> independent of invoicing's own `computeInvoiceAmounts`, so this carries
> zero regression risk to the existing, tested invoicing/coupon formula —
> `applyCoupon`/`removeCoupon` needed no changes at all, since they already
> recompute purely from the persisted `Invoice` row. `PackageCostBreakdown`
> gains five display/audit-trail snapshot columns
> (`computedTaxMinor`/`computedPlatformFeeMinor`/`computedTotalMinor`/
> `taxRateBpSnapshot`/`platformFeeRateBpSnapshot`, whole-group, mirroring the
> existing `computedBaseCostMinor`/`computedSellingPriceMinor` precedent).
> **Schema change (nine new nullable columns across `TourPackage`/
> `PackageCostBreakdown`/`Booking`, no destructive step) applied by hand to
> the shared Neon DB** — verified via `psql` that every new column is null
> on every pre-existing row; CI is green. No permission/module-dependency
> change. **DR-133 was a live production incident** (user-reported:
> "Application error: a server-side exception has occurred" when assigning
> a driver, guide, or vehicle) — root-caused via `vercel logs --prod` plus a
> direct repro script against the shared Neon DB. A `TourPackage` had been
> soft-deleted while its `Departure` still carried a live `Assignment`;
> soft-deleting a package doesn't cascade to its Departure/Assignment rows,
> so `catalogService.getDepartureDetail` 404s on that departure forever
> after. `assignmentService`'s shared `hasOverlappingAssignment` helper
> (used by both `recommendAssignment`, the departure-detail page's data
> source, and `createAssignment` itself) called `getDepartureDetail` on
> every *other* departure a candidate vehicle/driver/guide had ever been
> assigned to, with no error handling — so one such orphaned departure
> crashed assignment viewing/creation for *any* unrelated departure
> involving that same resource. Fixed by treating a 404 from that lookup as
> "no conflict" rather than letting it escape. No schema/permission/
> module-dependency change; no data was altered — the orphaned departure/
> assignment behind an already-soft-deleted package are left as-is.
> **DR-120's additive schema change (`ItineraryDay.activityIds`),
> DR-117's enum migration, and DR-116/118/119's additive schema changes are
> all applied to the shared Neon DB** (verified via `psql`; CI is green).
> **DR-132** makes Accommodation, Restaurant, and Activity cost-breakdown
> buckets fully automatic — explicit user request, confirmed via four
> clarifying questions first since each had a materially different
> financial-outcome answer. Both `PackageCostBreakdown` and
> `BookingCostBreakdown` now derive these three buckets from a package's own
> Day Template (`PackageItineraryDay.hotelId`/`restaurantId`/`activityIds`)
> instead of staff-typed inputs — `hotelRateId`/`roomsNeeded`/
> `breakfastCount`/`lunchCount`/`dinnerCount` are gone from both tables
> (verified zero rows had any value in them before dropping), replaced by
> read-only `computedAccommodationMinor`/`computedRestaurantMinor`/
> `computedActivitiesMinor` snapshot columns. Accommodation is per-traveler
> now (sum of each Day Template day's hotel's effective `HotelRate`, ×
> `referenceGroupSize`) rather than the old whole-group `nights × roomsNeeded`
> figure. A new 9th Operational Rate, `RestaurantRate` (one flat per-day rate
> per restaurant, since a Day Template only ever assigns one restaurant per
> day) replaces the old flat `FoodBeverageRate` BREAKFAST/LUNCH/DINNER
> categories for restaurant costing — those three enum values stay in the
> schema for historical rows but are no longer read by `computeBaseCostMinor`
> or offered on the Operational Rates create form. Activities resolve every
> `activityId` across the Day Template automatically (no more manual
> line-item picking); `PackageCostLineItem`/`BookingCostLineItem` are
> drinks-only now (`activityFeeId` dropped, `foodBeverageRateId` required).
> For a `BookingCostBreakdown`, these three buckets derive from the linked
> customized package's Day Template (`Booking.customizedPackageId`) — 0, not
> an error, if none is linked yet. `finance/domain.ts` gained
> `computeCostBuckets` (all eight buckets individually) alongside the
> existing `computeBaseCostMinor` (now just sums them) so the total and the
> persisted per-bucket display snapshots can never drift apart. **Schema
> change (new `RestaurantRate` table + additive/destructive columns on both
> cost-breakdown tables) applied to the shared Neon DB** after confirming via
> `psql` that zero rows anywhere had data in any column being dropped.
> **DR-131** re-derives `TourPackage.slug` from the title at first publish
> (DRAFT → a `PUBLISHED_*` status) instead of leaving it frozen at whatever
> it was called at creation (DR-118) — explicit user request, confirmed via
> a clarifying question since it partially reverses DR-118's "generated
> once, never reassigned" rule. `catalogService.updatePackage` calls a new
> `catalogRepository.regeneratePackageSlug` only when the *pre*-update
> status was `DRAFT` and the incoming status is published; a title edited
> while still `DRAFT` no longer ships with a stale slug, and the slug stays
> frozen across any later `PUBLISHED_AVAILABLE` ↔ `PUBLISHED_UNAVAILABLE`
> toggle, matching DR-118's original link-rot intent for anything already
> public. Building this surfaced a real latent bug in DR-118 itself:
> `nextUniqueSlug`'s cross-org uniqueness check was a pre-write `SELECT` run
> through the plain unscoped `prisma` client (no `app.org_id` GUC set) —
> `tour_packages` has `FORCE ROW LEVEL SECURITY`, so under the correct
> least-privilege `polco_app` role that query silently returns zero rows
> **for every org, not just others'** (deny-by-default), meaning the "is
> this slug already taken" check has never actually worked when connected
> through the intended production role (a `BYPASSRLS` role like
> `neondb_owner` masks this locally). Replaced with `withUniqueSlug`, which
> detects a real collision by attempting the write and retrying `-2`, `-3`,
> ... on an actual unique-constraint violation (`P2002`) instead of a
> SELECT — a unique index is enforced independent of RLS visibility, so
> this works regardless of which role is connected. Both `createPackage`
> and `regeneratePackageSlug` now go through it. No schema/permission/
> module-dependency change.
> **DR-130** fixes a real live-production bug (user-reported: "Something went
> wrong uploading the image" on the staff package edit page) — root cause was
> that `src/lib/public-image-blob.ts`'s `uploadPublicImage` (DR-071, reused by
> DR-114 for package images) calls Vercel Blob's `put()` with `access:
> 'public'`, but the project's one and only Blob store, `polco-tours-
> documents`, was provisioned private-only (`documents/gateway.ts`'s passport
> uploads) — Blob stores are public-or-private **store-wide**, not
> per-object, so every public image upload (About/FAQ images too, not just
> packages) has silently failed since DR-071, previously swallowed by a bare
> `catch {}` with no server-side trace at all. Fixed at two layers: the catch
> block now logs the real error before still throwing the same generic
> client-facing message (charter rule 8); and a second Blob store,
> `polco-tours-public-images` (`fra1`, same region as the original), is
> provisioned and connected to the project under `PUBLIC_BLOB_READ_WRITE_
> TOKEN_READ_WRITE_TOKEN` (Vercel's dashboard "Connect Project" flow
> namespaces a custom-named connection's sub-values under that prefix — it's
> not a single flat env var), which `uploadPublicImage` now passes to `put()`
> explicitly. `documents/gateway.ts` is untouched — it still uses the ambient
> default `BLOB_READ_WRITE_TOKEN`, unchanged. **Connected for Production +
> Preview only** — Development wasn't included when the store was linked via
> the dashboard, so local `npm run dev` package/About/FAQ image upload will
> still hit the same error until that's added too (see Open Items, OI-15).
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
> `BookingCostBreakdown`) applied to the shared Neon DB** — verified via
> `psql` (2026-08-19) that `admin_cost_rates` exists and both cost-breakdown
> tables have the two columns; the Operational Rates card and both
> cost-breakdown forms' Admin Costs sections work end-to-end. **DR-125** is two UX improvements, no schema/
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
> (`/api/jobs/sweep-fleet-cooldowns`, registered and live as of DR-155's
> `npm run qstash:register-schedule` run) since nothing else re-evaluates a
> resource once the window naturally elapses. Vehicle/DriverProfile/GuideProfile only — `StarlinkKit`
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
| Object storage | Vercel Blob `2.6.1`, region `fra1` — **two separate stores**, since a Blob store is public-or-private store-wide, not per-object (DR-130). `polco-tours-documents` (the original store, ambient default `BLOB_READ_WRITE_TOKEN`): passports (private, authenticated streaming route); visa decision documents land in Phase 2. `polco-tours-public-images` (added DR-130, Production+Preview only so far — OI-15): About/FAQ images (DR-071) and package images (DR-114), passed its own explicit token (`PUBLIC_BLOB_READ_WRITE_TOKEN_READ_WRITE_TOKEN`) by `src/lib/public-image-blob.ts` rather than relying on the ambient default. The `next.config.mjs` `images.remotePatterns` allowlist has one entry for Blob's public host, matching either store's public URL shape |
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
| PDF generation | `@react-pdf/renderer` `4.5.1` (DR-089) — this repo's first PDF-generation capability; `src/modules/itinerary/map-pdf.tsx` lays out the Map tab's whole-circuit PDF (DR-150: one combined Static Maps image covering every day + a color-keyed, day-grouped stop list) |
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
                   #   (new invoicing -> finance dependency)
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
