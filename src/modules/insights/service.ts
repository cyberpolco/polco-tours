// insights module — service. Business logic; composes other modules'
// public interfaces only -- this module owns no Prisma table of its own
// (no repository.ts, same shape as `notifications`). Every downstream call
// keeps its own existing permission check; `insights.read` is an
// additional top-level gate on this method, not a bypass of any of them.
import type { AuthContext } from '@modules/auth';
import { authService } from '@modules/auth';
import { analyticsService } from '@modules/analytics';
import { assignmentService } from '@modules/assignment';
import { bookingService } from '@modules/booking';
import { catalogService } from '@modules/catalog';
import { fleetService, type DriverProfileView, type GuideProfileView } from '@modules/fleet';
import { invoicingService } from '@modules/invoicing';
import { ratingsService } from '@modules/ratings';
import { visaService } from '@modules/visa';
import { audit } from '@lib/audit';
import { getCached, setCached } from '@lib/cache';
import { assertCan } from '@lib/rbac';
import { Errors } from '@lib/errors';
import {
  addToBucket,
  bucketByPeriod,
  bucketMoneyByPeriod,
  chooseGranularity,
  clampRangeToEpoch,
  computeBookingsSummary,
  computeFinanceExtras,
  computeGuestSummary,
  DASHBOARD_EPOCH,
  isInsightsViewer,
  isWithinRange,
  resolveBookingCountry,
  utilizationRatio,
} from './domain';
import type { DashboardSectionKey, DashboardSummary, DateRange, MoneyByCurrency, TopPerformer } from './domain';
import { renderInsightsPdf, type PdfLocale } from './insights-pdf';

function requireOrg(ctx: AuthContext): string {
  if (!ctx.organizationId) throw Errors.forbidden('No organization membership');
  return ctx.organizationId;
}

function formatRangeLabel(range: DateRange, locale: PdfLocale): string {
  const allTime = locale === 'fr' ? 'Depuis toujours' : 'All time';
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  if (!range.from && !range.to) return allTime;
  const from = range.from ? fmt(range.from) : allTime;
  const to = range.to ? fmt(range.to) : (locale === 'fr' ? "aujourd'hui" : 'today');
  return `${from} — ${to}`;
}

const TOP_PERFORMER_LIMIT = 5;
const MOST_BOOKED_DESTINATIONS_LIMIT = 5;
const SUMMARY_CACHE_TTL_SECONDS = 30; // matches the client's own poll interval

// Sequential, not Promise.all -- this sandbox's Neon connection pool has
// measurably choked ("Unable to start a transaction in the given time") on
// bursts of concurrent `withOrg` transactions, the same latency reality
// CLAUDE.md's Gotchas already documents for sequential-creates-in-one-
// transaction. A handful of small reads run one at a time instead of all at
// once; this is a low-traffic admin dashboard, not a hot path, so the
// modest wall-clock cost is worth the robustness (real Neon pooled
// connections aren't unlimited in production either).
async function topPerformers(
  profiles: Array<Pick<DriverProfileView, 'userId' | 'averageRating' | 'ratingCount'>> | Array<Pick<GuideProfileView, 'userId' | 'averageRating' | 'ratingCount'>>,
  fallbackLabel: string,
): Promise<TopPerformer[]> {
  const ranked = [...profiles]
    .filter((p) => p.ratingCount > 0 && p.averageRating != null)
    .sort((a, b) => (b.averageRating ?? 0) - (a.averageRating ?? 0))
    .slice(0, TOP_PERFORMER_LIMIT);
  const results: TopPerformer[] = [];
  for (const p of ranked) {
    const user = await authService.getUser(p.userId);
    results.push({ name: user?.name ?? user?.email ?? fallbackLabel, averageRating: p.averageRating ?? 0, ratingCount: p.ratingCount });
  }
  return results;
}

function rangeCacheKey(range: DateRange): string {
  return `${range.from?.toISOString() ?? 'all'}:${range.to?.toISOString() ?? 'all'}`;
}

function countBy<T, K extends string>(items: T[], selector: (item: T) => K): Partial<Record<K, number>> {
  const out: Partial<Record<K, number>> = {};
  for (const item of items) {
    const key = selector(item);
    out[key] = (out[key] ?? 0) + 1;
  }
  return out;
}

export const insightsService = {
  async getDashboardSummary(ctx: AuthContext, range: DateRange = { from: null, to: null }): Promise<DashboardSummary> {
    assertCan(ctx, 'insights.read');
    if (!isInsightsViewer(ctx.roles)) {
      throw Errors.forbidden('Only SUPERADMIN, TOUR_OPERATOR, or PLATFORM_ADMIN may view the Insights dashboard');
    }

    // DR-155: explicit user request -- stats "start fresh," never reaching
    // earlier than DASHBOARD_EPOCH even under "All time."
    range = clampRangeToEpoch(range);

    const cacheKey = `insights:summary:v2:${ctx.organizationId}:${rangeCacheKey(range)}`;
    const cached = await getCached<DashboardSummary>(cacheKey);
    if (cached) return cached;

    const summary = await computeDashboardSummary(ctx, range);
    await setCached(cacheKey, summary, SUMMARY_CACHE_TTL_SECONDS);
    return summary;
  },

  /** DR-193, explicit user request: an Export PDF button on the Insights
   * dashboard, letting staff choose which metric sections to include.
   * Reuses getDashboardSummary (same function/cache the live page polls) so
   * the exported figures can never disagree with what's on screen -- never
   * a separate re-derivation. `range` is the caller's original, pre-clamp
   * selection (so "All time" reads as "All time" in the printed date-range
   * line, not the clamped epoch date); the summary itself still clamps to
   * DASHBOARD_EPOCH exactly as the live dashboard does. */
  async generateDashboardPdf(
    ctx: AuthContext,
    range: DateRange,
    sections: DashboardSectionKey[],
    locale: PdfLocale,
  ): Promise<{ body: Buffer; contentType: string; filename: string }> {
    // Same two-layer gate as getDashboardSummary above -- insights.read is
    // DB-editable and broader than the hardcoded SUPERADMIN/TOUR_OPERATOR/
    // PLATFORM_ADMIN restriction DR-155 imposed on this dashboard; both
    // checks must run here too, not just inside getDashboardSummary, so a
    // future caller of this method alone can't skip the role check.
    assertCan(ctx, 'insights.read');
    if (!isInsightsViewer(ctx.roles)) {
      throw Errors.forbidden('Only SUPERADMIN, TOUR_OPERATOR, or PLATFORM_ADMIN may export the Insights dashboard');
    }
    const organizationId = requireOrg(ctx);

    const summary = await insightsService.getDashboardSummary(ctx, range);
    const generatedAtLabel = new Date(summary.generatedAt).toISOString().slice(0, 10);
    const body = await renderInsightsPdf({
      locale,
      sections,
      rangeLabel: formatRangeLabel(range, locale),
      generatedAtLabel,
      summary,
    });

    await audit({
      actorUserId: ctx.userId,
      actorRole: ctx.roles[0],
      action: 'insights.dashboard_pdf_exported',
      resourceType: 'Organization',
      resourceId: organizationId,
      organizationId,
      metadata: { sections },
    });

    return {
      body,
      contentType: 'application/pdf',
      filename: `insights-report-${generatedAtLabel}-${locale}.pdf`,
    };
  },
};

async function computeDashboardSummary(ctx: AuthContext, range: DateRange): Promise<DashboardSummary> {
  // Sequential, not Promise.all -- see topPerformers' comment above on
  // why this dashboard deliberately avoids bursting many concurrent
  // `withOrg` transactions against the connection pool.
  // DR-155: every countable event stream (bookings/invoices/visa
  // applications) is filtered to DASHBOARD_EPOCH-onward immediately after
  // fetching, ONCE -- everything downstream (repeat-customer detection,
  // new-vs-returning classification, per-country/per-package aggregation,
  // trends) treats pre-epoch data as if it simply doesn't exist for this
  // dashboard. This never touches the underlying rows anywhere else in the
  // app -- only what this one composition reads.
  // bookingService.list already excludes a soft-deleted booking (deletedAt:
  // null enforced in the repository) -- kept unfiltered-by-epoch here so
  // `activeBookingIds`/`bookingById` below can tell "deleted" apart from
  // "predates DASHBOARD_EPOCH." invoicingService.listAllForOrg has no
  // equivalent join back to Booking (Invoice carries no deletedAt of its
  // own), so without this an invoice's revenue/tax/deposit/discount figures
  // kept counting toward every finance stat forever, even after its booking
  // was deleted -- the same dangling-reference-after-delete class of bug as
  // DR-133/DR-149.
  const allBookings = await bookingService.list(ctx);
  const bookings = allBookings.filter((b) => b.createdAt >= DASHBOARD_EPOCH);
  const activeBookingIds = new Set(allBookings.map((b) => b.id));
  const invoiceRows = (await invoicingService.listAllForOrg(ctx)).filter(
    ({ invoice, bookingId }) => invoice.createdAt >= DASHBOARD_EPOCH && activeBookingIds.has(bookingId),
  );
  const assignments = await assignmentService.listAllAssignments(ctx);
  const vehicles = await fleetService.listVehicles(ctx);
  const driverProfiles = await fleetService.listDriverProfiles(ctx);
  const guideProfiles = await fleetService.listGuideProfiles(ctx);
  const ratingSummary = await ratingsService.getAggregateSummary(ctx);
  const visaApplications = (await visaService.listForFacilitator(ctx)).filter((v) => v.submittedAt >= DASHBOARD_EPOCH);
  const packages = await catalogService.listPackages(ctx);
  // staff_roster.read is a brand-new permission (DR-155) -- until a fresh
  // `db:seed` run actually grants it to whichever roles need it, a caller
  // who otherwise passes isInsightsViewer would see the *entire* dashboard
  // fail rather than just the Staff stats section. Degrading to zeros here
  // (never a hard failure) matches this module's existing "one section's
  // gap shouldn't sink the whole page" posture (see the departure-lookup
  // try/catch below).
  const staffRoster = await authService.getStaffRosterSummary(ctx).catch(() => ({
    byRole: {},
    activeCount: 0,
    deactivatedCount: 0,
    inactiveCount: 0,
  }));
  const wizardFunnel = await analyticsService.getWizardFunnel(ctx);

  // departureId -> { country, packageLabel } -- built from every real
  // package's departures. Small org (DR-005 single-tenant launch), so this
  // N+1 is fine -- same justification quote-requests/listPublicPackages
  // already use for in-memory joins at this scale. A bespoke departure
  // (no TourPackage) is deliberately absent from this map -- its booking's
  // own customCountry (snapshotted at TAILOR_MADE creation, survives
  // conversion) covers it instead, via resolveBookingCountry.
  const departureInfo = new Map<string, { country: string; packageLabel: string }>();
  for (const pkg of packages) {
    const departures = await catalogService.listDepartures(ctx, pkg.id);
    for (const departure of departures) {
      departureInfo.set(departure.id, { country: pkg.country, packageLabel: pkg.title });
    }
  }

  // ---- Bookings (range-filtered by createdAt) ----
  const bookingsInRange = bookings.filter((b) => isWithinRange(b.createdAt, range));
  const bookingsSummary = computeBookingsSummary(bookingsInRange.map((b) => b.status));

  // ---- Revenue (per-currency; never summed across currencies, BR-02) ----
  const revenue: MoneyByCurrency = {};
  const outstanding: MoneyByCurrency = {};
  const revenueByCountry: Record<string, MoneyByCurrency> = {};
  const revenueByPackage: Record<string, MoneyByCurrency> = {};
  const bookingById = new Map(allBookings.map((b) => [b.id, b]));

  for (const { invoice, bookingId, payments } of invoiceRows) {
    if (!isWithinRange(invoice.createdAt, range)) continue;
    const succeededMinor = payments.filter((p) => p.status === 'SUCCEEDED').reduce((sum, p) => sum + p.amountMinor, 0);
    addToBucket(revenue, invoice.currency, succeededMinor);
    if (invoice.status !== 'PAID' && invoice.status !== 'VOID') {
      addToBucket(outstanding, invoice.currency, Math.max(0, invoice.totalMinor - succeededMinor));
    }
    if (succeededMinor <= 0) continue;

    const booking = bookingById.get(bookingId);
    const departureCountry = booking?.departureId ? departureInfo.get(booking.departureId)?.country : undefined;
    const country = resolveBookingCountry(booking?.customCountry ?? null, departureCountry);
    const packageLabel = (booking?.departureId && departureInfo.get(booking.departureId)?.packageLabel) || 'Tailor-made';

    revenueByCountry[country] ??= {};
    addToBucket(revenueByCountry[country], invoice.currency, succeededMinor);
    revenueByPackage[packageLabel] ??= {};
    addToBucket(revenueByPackage[packageLabel], invoice.currency, succeededMinor);
  }

  const financeExtras = computeFinanceExtras(
    invoiceRows.map(({ invoice, payments }) => ({
      currency: invoice.currency,
      totalMinor: invoice.totalMinor,
      taxMinor: invoice.taxMinor,
      platformFeeMinor: invoice.platformFeeMinor,
      discountMinor: invoice.discountMinor,
      couponCode: invoice.couponCode,
      createdAt: invoice.createdAt,
      payments: payments.map((p) => ({ kind: p.kind, status: p.status, amountMinor: p.amountMinor })),
    })),
    range,
  );

  // ---- Operations ----
  const now = new Date();
  const assignmentDepartureIds = [...new Set(assignments.map((a) => a.departureId))];
  const departureWindowById = new Map<string, { status: string; startDate: Date; endDate: Date | null }>();
  for (const id of assignmentDepartureIds) {
    try {
      const { departure } = await catalogService.getDepartureDetail(ctx, id);
      departureWindowById.set(id, { status: departure.status, startDate: departure.startDate, endDate: departure.endDate });
    } catch {
      // Not found/visible -- excluded from utilization, same tolerance
      // Promise.allSettled would have given a rejected entry.
    }
  }

  const activeVehicleIds = new Set<string>();
  const activeDriverProfileIds = new Set<string>();
  const activeGuideUserIds = new Set<string>();
  for (const a of assignments) {
    const window = departureWindowById.get(a.departureId);
    if (!window || window.status !== 'SCHEDULED') continue;
    if ((window.endDate ?? window.startDate) < now) continue;
    activeVehicleIds.add(a.vehicleId);
    activeDriverProfileIds.add(a.driverProfileId);
    if (a.guideUserId) activeGuideUserIds.add(a.guideUserId);
  }

  const destinationCounts = new Map<string, number>();
  for (const b of bookingsInRange) {
    if (b.status === 'DRAFT') continue;
    const departureCountry = b.departureId ? departureInfo.get(b.departureId)?.country : undefined;
    const country = resolveBookingCountry(b.customCountry, departureCountry);
    destinationCounts.set(country, (destinationCounts.get(country) ?? 0) + 1);
  }
  const mostBookedDestinations = [...destinationCounts.entries()]
    .map(([country, count]) => ({ country, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, MOST_BOOKED_DESTINATIONS_LIMIT);

  // ---- Customer Experience ----
  const bookingCountByTourist = new Map<string, number>();
  for (const b of bookings) {
    bookingCountByTourist.set(b.touristUserId, (bookingCountByTourist.get(b.touristUserId) ?? 0) + 1);
  }
  const repeatCustomers = [...bookingCountByTourist.values()].filter((count) => count >= 2).length;

  const topDrivers = await topPerformers(driverProfiles, 'Driver');
  const topGuides = await topPerformers(guideProfiles, 'Guide');

  // ---- Immigration (range-filtered by submittedAt) ----
  const visaApplicationsInRange = visaApplications.filter((v) => isWithinRange(v.submittedAt, range));
  const pendingVisas = visaApplicationsInRange.filter((v) => v.status === 'SUBMITTED').length;
  const approvedVisas = visaApplicationsInRange.filter((v) => v.status === 'APPROVED').length;
  const rejectedVisas = visaApplicationsInRange.filter((v) => v.status === 'REJECTED').length;
  const missingDocuments = visaApplicationsInRange.filter((v) => !v.hasDocument).length;

  // ---- Guest (DR-155) ----
  const guest = computeGuestSummary(
    bookings.map((b) => ({
      touristUserId: b.touristUserId,
      createdAt: b.createdAt,
      status: b.status,
      origin: b.origin,
      countryOfResidence: b.countryOfResidence,
    })),
    range,
  );

  // ---- Staff (DR-155) -- fleet availability reuses the arrays already
  // fetched above (VehicleView/DriverProfileView/GuideProfileView all
  // already carry `availability`, no new query). ----
  const staff = {
    ...staffRoster,
    fleetAvailability: {
      vehicles: countBy(vehicles, (v) => v.availability),
      drivers: countBy(driverProfiles, (d) => d.availability),
      guides: countBy(guideProfiles, (g) => g.availability),
    },
  };

  // ---- Trends (DR-155) ----
  const granularity = chooseGranularity(range);
  const paidInvoicesInRange = invoiceRows.filter(
    ({ invoice, payments }) => isWithinRange(invoice.createdAt, range) && payments.some((p) => p.status === 'SUCCEEDED'),
  );
  const trends = {
    granularity,
    revenue: bucketMoneyByPeriod(
      paidInvoicesInRange.map(({ invoice }) => ({ date: invoice.createdAt, currency: invoice.currency, amountMinor: invoice.totalMinor })),
      granularity,
    ),
    bookings: bucketByPeriod(
      bookingsInRange.filter((b) => b.status !== 'DRAFT').map((b) => b.createdAt),
      granularity,
    ),
    visaApplications: bucketByPeriod(
      visaApplicationsInRange.map((v) => v.submittedAt),
      granularity,
    ),
    newGuests: bucketByPeriod(
      [...new Set(bookingsInRange.map((b) => b.touristUserId))]
        .map((touristId) => bookings.filter((b) => b.touristUserId === touristId).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0]?.createdAt)
        .filter((d): d is Date => d !== undefined && isWithinRange(d, range)),
      granularity,
    ),
  };

  return {
    bookings: bookingsSummary,
    revenue: { revenue, revenueByCountry, revenueByPackage, outstanding, ...financeExtras },
    operations: {
      fleetUtilization: utilizationRatio(activeVehicleIds.size, vehicles.filter((v) => v.status === 'ACTIVE').length),
      driverUtilization: utilizationRatio(
        activeDriverProfileIds.size,
        driverProfiles.filter((d) => d.status === 'ACTIVE').length,
      ),
      guideUtilization: utilizationRatio(activeGuideUserIds.size, guideProfiles.filter((g) => g.status === 'ACTIVE').length),
      mostBookedDestinations,
    },
    customerExperience: {
      // ratingsRepository coerces a null average to 0 for its own internal
      // storage convenience -- re-derive "no ratings yet" here so the
      // dashboard doesn't misreport a genuine 0/5 average.
      averageRating: ratingSummary.organization.ratingCount > 0 ? ratingSummary.organization.averageRating : null,
      ratingCount: ratingSummary.organization.ratingCount,
      topDrivers,
      topGuides,
      repeatCustomers,
    },
    immigration: { pendingVisas, approvedVisas, rejectedVisas, missingDocuments },
    guest,
    staff,
    wizardFunnel,
    trends,
    generatedAt: new Date().toISOString(),
  };
}
