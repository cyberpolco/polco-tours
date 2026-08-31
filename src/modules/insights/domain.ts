// insights module — domain types & rules. Pure; no framework or DB imports.
// Insights & Decision Making (DR-038) -- a read-only executive dashboard
// composed entirely from data other modules already produce. No Prisma
// table of its own (same shape as the `notifications` module).
import type { AvailabilityStatus, BookingOrigin, BookingStatus, Currency, Role } from '@prisma/client';
import type { WizardFunnelStage } from '@modules/analytics';
import type { StaffRosterSummary } from '@modules/auth';

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
  // DR-155 additions -- all derived from data insights already fetches
  // (InvoiceView/PaymentView via invoicingService.listAllForOrg), no new
  // query needed.
  averageBookingValue: MoneyByCurrency; // mean Invoice.totalMinor per currency, invoices with >=1 succeeded payment
  taxCollected: MoneyByCurrency;
  platformFeeCollected: MoneyByCurrency;
  // Count of invoices whose succeeded payments include a DEPOSIT/BALANCE
  // pair vs. a single FULL payment -- there's no Invoice-level flag for
  // this (PaymentKind is the source of truth), see computeFinanceExtras.
  depositVsFullPaid: { depositPathCount: number; fullPathCount: number };
  totalDiscountGiven: MoneyByCurrency; // sum of Invoice.discountMinor
  couponRedemptionCount: number; // count of invoices with a non-null couponCode and discountMinor > 0
  // DR-207: bookings CANCELLED via the guest self-service /find-booking
  // flow (Invoice.refundAmountMinor set) that staff hasn't yet marked
  // REFUNDED -- clears the moment bookingService.refund runs. Not a
  // period-total ("refunds issued"), a current-state snapshot of what's
  // still owed back, same "outstanding" framing as the field above.
  pendingRefunds: MoneyByCurrency;
  pendingRefundsCount: number;
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

/** DR-155: known data-availability gap, not a bug -- Booking.countryOfResidence
 * only exists for a TAILOR_MADE booking (see Booking's own schema comment).
 * A PREDEFINED_PACKAGE booking never collects the guest's own country at the
 * booking level (only Traveler.nationality later, a different concept, not
 * fetched by insights) -- those bookings bucket under this key rather than
 * being guessed at or silently dropped. */
export const GUEST_GEOGRAPHY_NOT_COLLECTED = 'NOT_COLLECTED';

/** DR-155: an honest "current pipeline distribution," not a true historical
 * cumulative funnel -- this app has no booking-status-transition-history
 * table, only the current BookingStatus + createdAt/updatedAt, so this
 * counts how many TAILOR_MADE bookings are CURRENTLY sitting at each named
 * stage (not "how many ever reached it"). Scoped to TAILOR_MADE only --
 * a PREDEFINED_PACKAGE booking never passes through AWAITING_QUOTATION/
 * QUOTATION_SENT at all (see BookingOrigin's own domain). */
export interface BookingStageFunnelStage {
  stage: 'AWAITING_QUOTATION' | 'QUOTATION_SENT' | 'CONFIRMED_OR_LATER';
  count: number;
}

export interface GuestSummary {
  newGuestCount: number;
  returningGuestCount: number;
  originSplit: { predefinedPackage: number; tailorMade: number };
  /** ISO-3166 alpha-2 -> booking count; see GUEST_GEOGRAPHY_NOT_COLLECTED. */
  geography: Record<string, number>;
  bookingStageFunnel: BookingStageFunnelStage[];
  cancellationRate: number; // 0-1, of non-DRAFT bookings in range
}

export interface FleetAvailabilityBreakdown {
  vehicles: Partial<Record<AvailabilityStatus, number>>;
  drivers: Partial<Record<AvailabilityStatus, number>>;
  guides: Partial<Record<AvailabilityStatus, number>>;
}

export interface StaffSummary extends StaffRosterSummary {
  fleetAvailability: FleetAvailabilityBreakdown;
}

export interface DateRange {
  from: Date | null;
  to: Date | null;
}

export type TrendGranularity = 'day' | 'week' | 'month';

export interface TrendPoint {
  periodStart: string; // ISO date (yyyy-mm-dd), the bucket's start
  value: number;
}

export interface MoneyTrendPoint {
  periodStart: string;
  amountMinor: number;
}

export interface MoneyTrendSeries {
  currency: Currency;
  points: MoneyTrendPoint[];
}

export interface TrendData {
  granularity: TrendGranularity;
  revenue: MoneyTrendSeries[];
  bookings: TrendPoint[];
  visaApplications: TrendPoint[];
  newGuests: TrendPoint[];
}

export interface DashboardSummary {
  bookings: BookingsSummary;
  revenue: RevenueSummary;
  operations: OperationsSummary;
  customerExperience: CustomerExperienceSummary;
  immigration: ImmigrationSummary;
  guest: GuestSummary;
  staff: StaffSummary;
  wizardFunnel: WizardFunnelStage[];
  trends: TrendData;
  generatedAt: string; // ISO timestamp -- powers the dashboard's "last updated" display
}

// "Currently running" reading -- DepartureStatus has no IN_PROGRESS value,
// only Booking does (DR-027's 11-value lifecycle).
const ACTIVE_TOUR_STATUSES: BookingStatus[] = ['IN_PROGRESS'];
const PENDING_QUOTATION_STATUSES: BookingStatus[] = ['AWAITING_QUOTATION', 'QUOTATION_SENT'];
const CONFIRMED_OR_FURTHER: BookingStatus[] = ['CONFIRMED', 'IN_PROGRESS', 'COMPLETED'];
const TERMINAL_CANCEL_STATUSES: BookingStatus[] = ['CANCELLED', 'REFUNDED'];

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

/** DR-193: the exportable PDF's opt-in metric groups -- one per visual
 * section on the live dashboard (InsightsDashboardClient.tsx), so the
 * checkbox list staff sees for "which metrics" always matches what they
 * already see on screen. `wizardFunnel`/per-section trends aren't their own
 * checkbox -- each rides along with the section it's displayed under there
 * (wizardFunnel with `guest`, the bookings/revenue/newGuests/visa trends
 * with their own section) rather than fragmenting the choice further. */
export const DASHBOARD_SECTION_KEYS = [
  'bookings',
  'revenue',
  'operations',
  'staff',
  'guest',
  'customerExperience',
  'immigration',
] as const;
export type DashboardSectionKey = (typeof DASHBOARD_SECTION_KEYS)[number];

export function isDashboardSectionKey(value: string): value is DashboardSectionKey {
  return (DASHBOARD_SECTION_KEYS as readonly string[]).includes(value);
}

/** DR-155: restricts the Insights dashboard beneath its own insights.read
 * permission check, same "hardcoded role check beneath the DB-editable
 * permission gate" convention as isBookingDeleter/isFleetDeleter/
 * isVisaDeleter -- a broader financial/staff/guest picture than the
 * original dashboard warrants tighter access than "whatever insights.read
 * happens to be granted to" alone. */
export function isInsightsViewer(roles: Role[]): boolean {
  return roles.some((role) => role === 'SUPERADMIN' || role === 'TOUR_OPERATOR' || role === 'PLATFORM_ADMIN');
}

/** DR-155: explicit user request -- this dashboard's stats "start fresh
 * with only current figures." A fixed floor, not a rolling "N days ago"
 * window: the day this rebuild shipped. Every booking/invoice/visa
 * application created before this date is excluded from every computation
 * below, even under "All time" -- this is a display floor for the
 * dashboard only, it does not touch, hide, or delete the underlying rows
 * anywhere else in the app (booking detail pages, invoices, visa queue,
 * etc. are all completely unaffected). */
export const DASHBOARD_EPOCH = new Date('2026-08-19T00:00:00.000Z');

/** Clamps a caller-supplied range so its lower bound is never earlier than
 * DASHBOARD_EPOCH -- applies whether the caller passed an explicit `from`
 * (e.g. someone crafts ?from=2020-01-01) or omitted it entirely
 * ("All time"). `to` is left untouched. */
export function clampRangeToEpoch(range: DateRange): DateRange {
  const from = range.from && range.from > DASHBOARD_EPOCH ? range.from : DASHBOARD_EPOCH;
  return { from, to: range.to };
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

export function isWithinRange(date: Date, range: DateRange): boolean {
  if (range.from && date < range.from) return false;
  if (range.to && date > range.to) return false;
  return true;
}

/** Picks a bucket size from the selected range's span -- a day-by-day trend
 * over an all-time range would be unreadable (and expensive to render), a
 * month-by-month trend over one week would be a flat line. */
export function chooseGranularity(range: DateRange): TrendGranularity {
  if (!range.from) return 'month'; // all-time
  const to = range.to ?? new Date();
  const days = (to.getTime() - range.from.getTime()) / (1000 * 60 * 60 * 24);
  if (days <= 31) return 'day';
  if (days <= 180) return 'week';
  return 'month';
}

function bucketKey(date: Date, granularity: TrendGranularity): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  if (granularity === 'month') {
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
  }
  if (granularity === 'week') {
    const isoDay = (d.getUTCDay() + 6) % 7; // Monday = 0
    d.setUTCDate(d.getUTCDate() - isoDay);
  }
  return d.toISOString().slice(0, 10);
}

/** Pure aggregation -- takes a flat array of dates so this stays testable
 * with no fixture data beyond Date instances. Used for booking-count,
 * visa-volume, and new-guest-signup trends. */
export function bucketByPeriod(dates: Date[], granularity: TrendGranularity): TrendPoint[] {
  const counts = new Map<string, number>();
  for (const date of dates) {
    const key = bucketKey(date, granularity);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([periodStart, value]) => ({ periodStart, value }))
    .sort((a, b) => a.periodStart.localeCompare(b.periodStart));
}

/** Same idea as bucketByPeriod but sums a money amount per currency instead
 * of counting -- one series per currency (BR-02: never summed across
 * currencies, and never plotted on a shared/dual axis either). */
export function bucketMoneyByPeriod(
  items: Array<{ date: Date; currency: Currency; amountMinor: number }>,
  granularity: TrendGranularity,
): MoneyTrendSeries[] {
  const byCurrency = new Map<Currency, Map<string, number>>();
  for (const item of items) {
    const key = bucketKey(item.date, granularity);
    if (!byCurrency.has(item.currency)) byCurrency.set(item.currency, new Map());
    const bucket = byCurrency.get(item.currency)!;
    bucket.set(key, (bucket.get(key) ?? 0) + item.amountMinor);
  }
  return [...byCurrency.entries()].map(([currency, bucket]) => ({
    currency,
    points: [...bucket.entries()]
      .map(([periodStart, amountMinor]) => ({ periodStart, amountMinor }))
      .sort((a, b) => a.periodStart.localeCompare(b.periodStart)),
  }));
}

export interface GuestBookingFacts {
  touristUserId: string;
  createdAt: Date;
  status: BookingStatus;
  origin: BookingOrigin;
  countryOfResidence: string | null;
}

/** Pure aggregation over plain booking facts (not full BookingView[]),
 * testable with fixture arrays. `allBookings` must be the FULL, unfiltered
 * list (not range-filtered) so a guest's earliest-ever booking can be found
 * even when it falls outside the selected range -- that's what makes
 * new-vs-returning classification correct for bookings inside the range. */
export function computeGuestSummary(allBookings: GuestBookingFacts[], range: DateRange): GuestSummary {
  const earliestByTourist = new Map<string, number>();
  for (const b of allBookings) {
    const t = b.createdAt.getTime();
    const cur = earliestByTourist.get(b.touristUserId);
    if (cur === undefined || t < cur) earliestByTourist.set(b.touristUserId, t);
  }

  const inRange = allBookings.filter((b) => isWithinRange(b.createdAt, range) && b.status !== 'DRAFT');

  const originSplit = { predefinedPackage: 0, tailorMade: 0 };
  const geography: Record<string, number> = {};
  for (const b of inRange) {
    if (b.origin === 'PREDEFINED_PACKAGE') originSplit.predefinedPackage++;
    else originSplit.tailorMade++;
    const country = b.countryOfResidence ?? GUEST_GEOGRAPHY_NOT_COLLECTED;
    geography[country] = (geography[country] ?? 0) + 1;
  }

  const touristsInRange = new Set(inRange.map((b) => b.touristUserId));
  let newGuestCount = 0;
  let returningGuestCount = 0;
  for (const touristId of touristsInRange) {
    const earliest = earliestByTourist.get(touristId);
    if (earliest !== undefined && isWithinRange(new Date(earliest), range)) newGuestCount++;
    else returningGuestCount++;
  }

  const tailorMadeInRange = inRange.filter((b) => b.origin === 'TAILOR_MADE');
  const bookingStageFunnel: BookingStageFunnelStage[] = [
    { stage: 'AWAITING_QUOTATION', count: tailorMadeInRange.filter((b) => b.status === 'AWAITING_QUOTATION').length },
    { stage: 'QUOTATION_SENT', count: tailorMadeInRange.filter((b) => b.status === 'QUOTATION_SENT').length },
    { stage: 'CONFIRMED_OR_LATER', count: tailorMadeInRange.filter((b) => CONFIRMED_OR_FURTHER.includes(b.status)).length },
  ];

  const cancellationRate =
    inRange.length === 0 ? 0 : inRange.filter((b) => TERMINAL_CANCEL_STATUSES.includes(b.status)).length / inRange.length;

  return { newGuestCount, returningGuestCount, originSplit, geography, bookingStageFunnel, cancellationRate };
}

export interface InvoicePaymentFacts {
  currency: Currency;
  totalMinor: number;
  taxMinor: number;
  platformFeeMinor: number | null;
  discountMinor: number;
  couponCode: string | null;
  createdAt: Date;
  payments: Array<{ kind: 'DEPOSIT' | 'BALANCE' | 'FULL'; status: string; amountMinor: number }>;
}

/** Pure aggregation over plain invoice+payment facts, range-filtered by
 * invoice createdAt. Deliberately re-derives averages/sums from data
 * insights already fetches (InvoiceView/PaymentView) rather than a new
 * query -- see insights/service.ts. */
export function computeFinanceExtras(
  invoices: InvoicePaymentFacts[],
  range: DateRange,
): Pick<
  RevenueSummary,
  'averageBookingValue' | 'taxCollected' | 'platformFeeCollected' | 'depositVsFullPaid' | 'totalDiscountGiven' | 'couponRedemptionCount'
> {
  const inRange = invoices.filter((inv) => isWithinRange(inv.createdAt, range));
  const paidInRange = inRange.filter((inv) => inv.payments.some((p) => p.status === 'SUCCEEDED'));

  const totalByCurrency: MoneyByCurrency = {};
  const countByCurrency: Partial<Record<Currency, number>> = {};
  const taxCollected: MoneyByCurrency = {};
  const platformFeeCollected: MoneyByCurrency = {};
  const totalDiscountGiven: MoneyByCurrency = {};
  let couponRedemptionCount = 0;
  let depositPathCount = 0;
  let fullPathCount = 0;

  for (const inv of paidInRange) {
    addToBucket(totalByCurrency, inv.currency, inv.totalMinor);
    countByCurrency[inv.currency] = (countByCurrency[inv.currency] ?? 0) + 1;
    addToBucket(taxCollected, inv.currency, inv.taxMinor);
    if (inv.platformFeeMinor) addToBucket(platformFeeCollected, inv.currency, inv.platformFeeMinor);
    if (inv.discountMinor > 0) addToBucket(totalDiscountGiven, inv.currency, inv.discountMinor);
    if (inv.couponCode && inv.discountMinor > 0) couponRedemptionCount++;

    const succeeded = inv.payments.filter((p) => p.status === 'SUCCEEDED');
    if (succeeded.some((p) => p.kind === 'FULL')) fullPathCount++;
    else if (succeeded.some((p) => p.kind === 'DEPOSIT' || p.kind === 'BALANCE')) depositPathCount++;
  }

  const averageBookingValue: MoneyByCurrency = {};
  for (const [currency, total] of Object.entries(totalByCurrency) as [Currency, number][]) {
    const count = countByCurrency[currency] ?? 0;
    if (count > 0) averageBookingValue[currency] = Math.round(total / count);
  }

  return {
    averageBookingValue,
    taxCollected,
    platformFeeCollected,
    depositVsFullPaid: { depositPathCount, fullPathCount },
    totalDiscountGiven,
    couponRedemptionCount,
  };
}
