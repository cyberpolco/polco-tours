// insights module — service. Business logic; composes other modules'
// public interfaces only -- this module owns no Prisma table of its own
// (no repository.ts, same shape as `notifications`). Every downstream call
// keeps its own existing permission check; `insights.read` is an
// additional top-level gate on this method, not a bypass of any of them.
import type { AuthContext } from '@modules/auth';
import { authService } from '@modules/auth';
import { assignmentService } from '@modules/assignment';
import { bookingService } from '@modules/booking';
import { catalogService } from '@modules/catalog';
import { fleetService, type DriverProfileView, type GuideProfileView } from '@modules/fleet';
import { invoicingService } from '@modules/invoicing';
import { ratingsService } from '@modules/ratings';
import { visaService } from '@modules/visa';
import { assertCan } from '@lib/rbac';
import { addToBucket, computeBookingsSummary, resolveBookingCountry, utilizationRatio } from './domain';
import type { DashboardSummary, MoneyByCurrency, TopPerformer } from './domain';

const TOP_PERFORMER_LIMIT = 5;
const MOST_BOOKED_DESTINATIONS_LIMIT = 5;

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

export const insightsService = {
  async getDashboardSummary(ctx: AuthContext): Promise<DashboardSummary> {
    assertCan(ctx, 'insights.read');

    // Sequential, not Promise.all -- see topPerformers' comment above on
    // why this dashboard deliberately avoids bursting many concurrent
    // `withOrg` transactions against the connection pool.
    const bookings = await bookingService.list(ctx);
    const invoiceRows = await invoicingService.listAllForOrg(ctx);
    const assignments = await assignmentService.listAllAssignments(ctx);
    const vehicles = await fleetService.listVehicles(ctx);
    const driverProfiles = await fleetService.listDriverProfiles(ctx);
    const guideProfiles = await fleetService.listGuideProfiles(ctx);
    const ratingSummary = await ratingsService.getAggregateSummary(ctx);
    const visaApplications = await visaService.listForFacilitator(ctx);
    const packages = await catalogService.listPackages(ctx);

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

    // ---- Bookings ----
    const bookingsSummary = computeBookingsSummary(bookings.map((b) => b.status));

    // ---- Revenue (per-currency; never summed across currencies, BR-02) ----
    const revenue: MoneyByCurrency = {};
    const outstanding: MoneyByCurrency = {};
    const revenueByCountry: Record<string, MoneyByCurrency> = {};
    const revenueByPackage: Record<string, MoneyByCurrency> = {};
    const bookingById = new Map(bookings.map((b) => [b.id, b]));

    for (const { invoice, bookingId, payments } of invoiceRows) {
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
    for (const b of bookings) {
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

    // ---- Immigration ----
    const pendingVisas = visaApplications.filter((v) => v.status === 'SUBMITTED').length;
    const approvedVisas = visaApplications.filter((v) => v.status === 'APPROVED').length;
    const rejectedVisas = visaApplications.filter((v) => v.status === 'REJECTED').length;
    const missingDocuments = visaApplications.filter((v) => !v.hasDocument).length;

    return {
      bookings: bookingsSummary,
      revenue: { revenue, revenueByCountry, revenueByPackage, outstanding },
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
    };
  },
};
