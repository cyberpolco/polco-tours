// insights module — domain types & rules. Pure; no framework or DB imports.
// Insights & Decision Making (DR-038) -- a read-only executive dashboard
// composed entirely from data other modules already produce. No Prisma
// table of its own (same shape as the `notifications` module).
import type { BookingStatus, Currency } from '@prisma/client';

/** One bucket per currency, minor units -- never summed across currencies
 * (BR-02, no FX conversion anywhere in this app; @lib/money's add() throws
 * on a currency mismatch on purpose). */
export type MoneyByCurrency = Partial<Record<Currency, number>>;

export interface BookingsSummary {
  totalBookings: number;
  activeTours: number;
  pendingQuotations: number;
  conversionRate: number; // 0-1
}

export interface RevenueSummary {
  revenue: MoneyByCurrency;
  revenueByCountry: Record<string, MoneyByCurrency>;
  revenueByPackage: Record<string, MoneyByCurrency>;
  outstanding: MoneyByCurrency;
}

export interface OperationsSummary {
  fleetUtilization: number; // 0-1
  guideUtilization: number; // 0-1
  driverUtilization: number; // 0-1
  mostBookedDestinations: Array<{ country: string; count: number }>;
}

export interface TopPerformer {
  name: string;
  averageRating: number;
  ratingCount: number;
}

export interface CustomerExperienceSummary {
  averageRating: number | null;
  ratingCount: number;
  topGuides: TopPerformer[];
  topDrivers: TopPerformer[];
  repeatCustomers: number;
}

export interface ImmigrationSummary {
  pendingVisas: number;
  approvedVisas: number;
  rejectedVisas: number;
  missingDocuments: number;
}

export interface DashboardSummary {
  bookings: BookingsSummary;
  revenue: RevenueSummary;
  operations: OperationsSummary;
  customerExperience: CustomerExperienceSummary;
  immigration: ImmigrationSummary;
}

// "Currently running" reading -- DepartureStatus has no IN_PROGRESS value,
// only Booking does (DR-027's 11-value lifecycle).
const ACTIVE_TOUR_STATUSES: BookingStatus[] = ['IN_PROGRESS'];
const PENDING_QUOTATION_STATUSES: BookingStatus[] = ['AWAITING_QUOTATION', 'QUOTATION_SENT'];
const CONFIRMED_OR_FURTHER: BookingStatus[] = ['CONFIRMED', 'IN_PROGRESS', 'COMPLETED'];

/** Pure aggregation over a flat list of booking statuses -- deliberately
 * takes just the statuses (not full BookingView[]) so this stays testable
 * with no fixture data beyond an array of enum values. */
export function computeBookingsSummary(statuses: BookingStatus[]): BookingsSummary {
  const totalBookings = statuses.length;
  const activeTours = statuses.filter((s) => ACTIVE_TOUR_STATUSES.includes(s)).length;
  const pendingQuotations = statuses.filter((s) => PENDING_QUOTATION_STATUSES.includes(s)).length;
  // "Of everyone who got past a bare draft, how many got confirmed" --
  // DRAFT bookings never really started, so they're excluded from the
  // denominator rather than counting against conversion.
  const nonDraft = statuses.filter((s) => s !== 'DRAFT');
  const confirmedOrFurther = nonDraft.filter((s) => CONFIRMED_OR_FURTHER.includes(s)).length;
  const conversionRate = nonDraft.length === 0 ? 0 : confirmedOrFurther / nonDraft.length;
  return { totalBookings, activeTours, pendingQuotations, conversionRate };
}

/** Simple ratio, honestly not a real scheduling-optimization/BI metric --
 * same "simple, transparent" posture as assignment/domain.ts's DR-029
 * recommendation scorer. 0 when there's nothing to divide by (no ACTIVE
 * fleet at all), capped at 1 (a candidate assigned twice shouldn't read as
 * >100% utilized). */
export function utilizationRatio(activeCount: number, totalActiveCount: number): number {
  if (totalActiveCount <= 0) return 0;
  return Math.min(1, activeCount / totalActiveCount);
}

export function addToBucket(bucket: MoneyByCurrency, currency: Currency, minor: number): void {
  bucket[currency] = (bucket[currency] ?? 0) + minor;
}

/** A PREDEFINED_PACKAGE booking's country comes from its departure's
 * package; a TAILOR_MADE booking carries its own customCountry (set at
 * creation, survives conversion to a bespoke Departure, DR-027/028) --
 * customCountry always wins when present. */
export function resolveBookingCountry(customCountry: string | null, departureCountry: string | undefined): string {
  return customCountry ?? departureCountry ?? 'Unknown';
}
