// booking module — service. Business logic; orchestrates repository + rbac.
// Callable by other modules ONLY through index.ts (module boundary rule).
import type { AddonCode, BookingStatus, CancellationRefundTier, Currency, FlightClass, Locale, PaymentKind } from '@prisma/client';
import { authService, type AuthContext } from '@modules/auth';
import { catalogService, type AddonServiceView } from '@modules/catalog';
import { notificationsService } from '@modules/notifications';
import { getEffectiveAddonRate } from '@lib/addon-rates';
import { audit, type AuditEntry } from '@lib/audit';
import { Errors } from '@lib/errors';
import { resolveGuestContact, type GuestContact } from '@lib/guest-contact';
import { getEffectiveEsimRate } from '@lib/esim-rate';
import { getEffectiveFlightFareRate } from '@lib/flight-fare-rate';
import { computeLateBookingSurchargeBp, getEffectiveLateBookingRate } from '@lib/late-booking-rate';
import { add, money, scale, type Money } from '@lib/money';
import { getPrimaryOrgId } from '@lib/primary-org';
import { assertLookupNotRateLimited, assertWriteNotRateLimited, recordLookupFailure } from '@lib/rate-limit';
import { assertCan, can } from '@lib/rbac';
import {
  CANCELLABLE_BOOKING_STATUSES,
  canAddTraveler,
  computeAvailability,
  emailMatches,
  isBookingConfirmer,
  isBookingDeleter,
  isBookingLocked,
  isDepartureDateChanger,
  isTravelerManifestComplete,
  lastNameMatches,
  requiresFullTravelerDetails,
  requiresGuestSetupTravelerDetails,
  resolveCancellationRefundTier,
  toTravelerDutyView,
  type AddTravelerInput,
  type BookingAddonView,
  type BookingLookupResult,
  type BookingView,
  type CreateBookingInput,
  type CreateBookingWithDatesInput,
  type CreateTailorMadeInput,
  type LookupBookingInput,
  type SendQuotationInput,
  type SetAddonsInput,
  type UpdateTripDatesInput,
  type TravelerDutyGroup,
  type TravelerView,
  type VisaCandidateTravelerView,
} from './domain';
import { bookingRepository, InvalidTransitionError, SoldOutError, type TransitionedDeparture } from './repository';

const LOOKUP_RATE_LIMIT_WINDOW_MINUTES = 15;
const LOOKUP_RATE_LIMIT_MAX_ATTEMPTS = 10;

// DR-207: tighter than the read-only lookup above -- this is a real write
// (cancels a booking), so a much lower ceiling.
const CANCEL_LOOKUP_RATE_LIMIT_WINDOW_MINUTES = 60;
const CANCEL_LOOKUP_RATE_LIMIT_MAX_ATTEMPTS = 5;

// DR-257: this one gates issuing the booking_setup credential, so it is at
// least as tight as the cancel bucket. Note assertWriteNotRateLimited is a
// no-op when Upstash is unconfigured (its own doc comment) -- the three
// factors themselves, not this counter, are the real defense.
const SETUP_VERIFY_RATE_LIMIT_WINDOW_MINUTES = 60;
const SETUP_VERIFY_RATE_LIMIT_MAX_ATTEMPTS = 5;

// A cancelled or refunded booking is done -- a dead end for the guest
// lookup flow and hidden from the staff dashboard's default list (see
// staff/bookings/page.tsx's own HIDDEN_BY_DEFAULT, kept in sync by hand).
const CLOSED_BOOKING_STATUSES: BookingStatus[] = ['CANCELLED', 'REFUNDED'];

function requireOrg(ctx: AuthContext): string {
  if (!ctx.organizationId) throw Errors.forbidden('No organization membership');
  return ctx.organizationId;
}

// TOURIST is the only "customer" role; every other role that reaches these
// checks already holds booking.confirm/cancel or is listing the org manifest
// (assertCan has already filtered out roles without the relevant grant).
function isStaff(ctx: AuthContext): boolean {
  return !ctx.roles.includes('TOURIST');
}

export interface Availability {
  capacity: number;
  seatsAvailable: number;
}

export interface BillableTotal {
  baseMinor: number;
  addonsMinor: number;
  totalMinor: number;
  currency: NonNullable<BookingView['currency']>;
}

/** Anti-BOLA: a tourist may only act on their own booking; staff act on any
 * booking in their org. Shared by every method below that resolves a booking
 * -- don't leak existence of another tourist's booking via a 403 vs 404
 * distinction. Factored out from getOwnedBooking so getByBookingReference
 * can reuse the same check against a reference-keyed lookup. */
function assertOwnedBooking(ctx: AuthContext, booking: BookingView | null): BookingView {
  if (!booking) throw Errors.notFound('Booking not found');
  if (!isStaff(ctx) && booking.touristUserId !== ctx.userId) {
    throw Errors.notFound('Booking not found');
  }
  return booking;
}

async function getOwnedBooking(ctx: AuthContext, organizationId: string, bookingId: string): Promise<BookingView> {
  const booking = await bookingRepository.findById(organizationId, bookingId);
  return assertOwnedBooking(ctx, booking);
}

/** See bookingService.getBookingCountry's own doc comment. */
async function resolveBookingCountry(ctx: AuthContext, booking: BookingView): Promise<string> {
  if (booking.departureId) {
    const { packageCountry } = await catalogService.getDepartureDetail(ctx, booking.departureId);
    return packageCountry;
  }
  if (booking.customCountry) return booking.customCountry;
  throw Errors.conflict('This booking has no destination country');
}

/** DR-257: resolveBookingCountry's no-session twin, for the guest
 * /complete-booking flow. Same precedence (departure's package country, then
 * the TAILOR_MADE booking's own customCountry), just read through catalog's
 * existing no-ctx *ForBookingLookup method instead of the ctx-gated
 * getDepartureDetail. */
async function resolveBookingCountryForLookup(organizationId: string, booking: BookingView): Promise<string> {
  if (booking.departureId) {
    const summary = await catalogService.getDepartureTripSummaryForBookingLookup(organizationId, booking.departureId);
    if (summary?.country) return summary.country;
  }
  if (booking.customCountry) return booking.customCountry;
  throw Errors.conflict('This booking has no destination country');
}

/** DR-180: which TourPackage this booking's add-ons step should curate
 * against. PREDEFINED_PACKAGE resolves it via the departure; TAILOR_MADE has
 * none until customizedPackageId is set post-quote (DR-108) -- null in that
 * case, meaning "no package to curate against yet." See
 * bookingService.getBookingPackageId's own doc comment. */
async function resolvePackageId(ctx: AuthContext, booking: BookingView): Promise<string | null> {
  if (booking.departureId) {
    const { departure } = await catalogService.getDepartureDetail(ctx, booking.departureId);
    return departure.tourPackageId;
  }
  return booking.customizedPackageId ?? null;
}

/** Every status-transitioning repository call (updateStatus/sendQuotation)
 * throws InvalidTransitionError when the FROM status can't reach the
 * requested TO status (domain.ts's canTransition) -- turns that into a
 * clean 409 instead of an unhandled 500, same SoldOutError -> Errors.conflict
 * pattern createHold already uses. */
async function transition<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof InvalidTransitionError) throw Errors.conflict(err.message);
    throw err;
  }
}

/** Sends a guest-facing notification to the guest's REAL email rather than
 * through notify()'s fallback chain.
 *
 * notify() resolves EMAIL from the recipient's `User.email`, but a guest
 * checkout has no real account -- better-auth's anonymous plugin fills that
 * column with an undeliverable `temp@<random>.com` placeholder, so anything
 * sent this way silently never arrives. The address the guest actually
 * typed lives on the booking (or on the tour lead's Traveler row) instead.
 *
 * Same resolution order and same "fall back to notify() only when there is
 * no real address at all" shape as invoicing's notifyPaymentSucceeded
 * (DR-215) and visa's contactTraveler (DR-209), which fixed this identical
 * bug for their own events. Kept as one helper here so booking's remaining
 * guest events can adopt it without re-deriving the chain each time.
 */
async function notifyGuest(
  event: Parameters<typeof notificationsService.notifyEmail>[0],
  organizationId: string,
  booking: BookingView,
  data: Parameters<typeof notificationsService.notifyEmail>[4],
): Promise<void> {
  const { email, locale } = await bookingService.resolveGuestContactForBooking(organizationId, booking);

  if (!email) {
    await notificationsService.notify(event, booking.touristUserId, organizationId, data);
    return;
  }
  await notificationsService.notifyEmail(event, email, locale, organizationId, data);
}

/** The three-factor check behind every no-session guest write: the booking
 * reference resolves, the tour lead's last name matches, and the tour lead's
 * on-file email matches. Last name alone is comparatively guessable/public,
 * which is why a write needs the email too (DR-207) while the read-only
 * lookup settles for two factors.
 *
 * Extracted from cancelForBookingLookup so the /complete-booking flow's own
 * writes can't drift from it. Every failure is the same generic notFound --
 * never reveal which factor was wrong (same anti-enumeration posture as
 * getOwnedBooking's 404-not-403 elsewhere in this module).
 *
 * `allowedStatuses` is the caller's own gate (cancellable vs quotable vs
 * still-in-setup); a booking outside it is treated as not found rather than
 * as a distinguishable "wrong state" answer.
 */
async function verifyGuestForBooking(
  organizationId: string,
  input: { bookingReference: string; lastName: string; email: string },
  allowedStatuses?: readonly BookingStatus[],
): Promise<BookingView> {
  const found = await bookingRepository.findByBookingReference(organizationId, input.bookingReference);
  const booking = found && (!allowedStatuses || allowedStatuses.includes(found.status)) ? found : null;
  const travelers = booking ? await bookingRepository.listTravelersForBooking(organizationId, booking.id) : [];
  const lead = travelers.find((t) => t.isTourLead);
  // Same DR-057 fallback as lookupByBookingReference: a TAILOR_MADE inquiry
  // still AWAITING_QUOTATION/QUOTATION_SENT has no Traveler manifest yet, so
  // name/email fall back to the booking's own guest-typed contact fields.
  const nameSource = lead ?? (booking?.contactLastName ? { lastName: booking.contactLastName } : null);
  const emailSource = lead?.email ?? booking?.contactEmail ?? null;

  const verified =
    !!booking &&
    !!nameSource &&
    lastNameMatches(nameSource, input.lastName) &&
    !!emailSource &&
    emailMatches(emailSource, input.email);

  if (!booking || !verified) throw Errors.notFound('No matching booking found');
  return booking;
}

/** DR-198: resolves the currently-effective LateBookingRate and applies it
 * against `travelDate` -- shared by finalizeHold (PREDEFINED_PACKAGE) and
 * createTailorMadeRequest (TAILOR_MADE) so both origins snapshot the
 * decision the same way, at the same "date is now known" moment. Missing
 * config is an operator gap, not a caller error -- same "no effective rate"
 * -> Errors.conflict treatment invoicingService gives getEffectivePlatformRate. */
async function resolveLateBookingSurchargeBp(travelDate: Date): Promise<number | null> {
  try {
    const rate = await getEffectiveLateBookingRate();
    return computeLateBookingSurchargeBp(travelDate, rate);
  } catch {
    throw Errors.conflict('No late-booking rate configured');
  }
}

/** Shared by createHold and createHoldWithDates -- prices, capacity-checks,
 * and persists the hold once a real (either pre-existing or just-created)
 * Departure id is known. */
async function finalizeHold(
  ctx: AuthContext,
  organizationId: string,
  touristUserId: string,
  departureId: string,
  seats: number,
  specialRequests: string | undefined,
): Promise<BookingView> {
  const detail = await catalogService.getDepartureDetail(ctx, departureId);
  if (!detail.bookable) throw Errors.conflict('This departure is not open for booking');
  // isBookable already requires a real price to exist (DR-039) -- this is
  // a defensive re-check, not a routine path (TS can't correlate the two
  // fields' nullability across the isBookable/effectivePrice boundary).
  if (!detail.effectiveUnitPrice) throw Errors.conflict('This package is not yet priced');

  const price = scale(detail.effectiveUnitPrice, seats);
  // DR-134: whole-booking (x seats) copy of the package's own tax+fee
  // composition, if any -- see DepartureDetail's own doc comment for when
  // this is null.
  const priceSubtotalMinor = detail.priceSubtotalMinor != null ? detail.priceSubtotalMinor * seats : null;
  const lateBookingSurchargeBp = await resolveLateBookingSurchargeBp(detail.departure.startDate);

  let booking: BookingView;
  try {
    booking = await bookingRepository.createHold(organizationId, {
      departureId,
      touristUserId,
      seats,
      capacity: detail.departure.capacity,
      priceMinor: price.minor,
      currency: price.currency,
      specialRequests,
      priceSubtotalMinor,
      priceTaxRateBp: detail.priceTaxRateBp,
      pricePlatformFeeRateBp: detail.pricePlatformFeeRateBp,
      lateBookingSurchargeBp,
    });
  } catch (err) {
    if (err instanceof SoldOutError) throw Errors.conflict(err.message);
    throw err;
  }

  await audit({
    actorUserId: ctx.userId,
    actorRole: ctx.roles[0],
    action: 'booking.hold_created',
    resourceType: 'Booking',
    resourceId: booking.id,
    organizationId,
  });
  return booking;
}

/** The add-on pricing + write shared by the session-gated setAddons and the
 * no-session setAddonsForBookingLookup (DR-257). Only three things differed
 * between them -- how the destination country is resolved, how the
 * AddonService rows are read, and who the audit actor is -- so those are
 * parameters and the pricing itself has exactly one definition. */
async function applyAddonSelection(
  organizationId: string,
  booking: BookingView,
  bookingId: string,
  input: SetAddonsInput,
  country: string,
  addons: (AddonServiceView | undefined)[],
  actor: Pick<AuditEntry, 'actorUserId' | 'actorRole' | 'metadata'>,
): Promise<BookingAddonView[]> {
  interface ResolvedAddonItem {
    addonServiceId: string;
    priceMinor: number;
    currency: Currency;
    flightClass?: FlightClass;
    airline?: string;
    originAirportCode?: string;
    destinationAirportCode?: string;
    dataAllowanceGb?: number;
  }

  const resolved = await Promise.all(
    input.addons.map(async (selection, i): Promise<{ code: AddonCode; item: ResolvedAddonItem }> => {
      const addon = addons[i];
      if (!addon) throw Errors.notFound('Add-on service not found');

      if (addon.code === 'FLIGHT_TICKET') {
        const { originAirportId, destinationAirportId, airline, flightClass } = selection;
        if (!originAirportId || !destinationAirportId || !airline || !flightClass) {
          throw Errors.validation('Flight ticket add-on requires an origin airport, destination airport, airline, and class');
        }
        const [origin, destination, rate] = await Promise.all([
          bookingRepository.getActiveAirport(originAirportId),
          bookingRepository.getActiveAirport(destinationAirportId),
          getEffectiveFlightFareRate(originAirportId, destinationAirportId, airline, flightClass),
        ]);
        if (!origin) throw Errors.notFound('Origin airport not found');
        if (!destination) throw Errors.notFound('Destination airport not found');
        if (!rate) throw Errors.conflict('No flight fare configured for this route, airline, and class');
        if (booking.currency && rate.currency !== booking.currency) {
          throw Errors.conflict('Add-on currency does not match the booking currency');
        }
        return {
          code: addon.code,
          item: {
            addonServiceId: addon.id,
            priceMinor: rate.priceMinor,
            currency: rate.currency,
            flightClass,
            airline,
            originAirportCode: origin.iataCode,
            destinationAirportCode: destination.iataCode,
          },
        };
      }

      if (addon.code === 'ESIM') {
        const { dataAllowanceGb } = selection;
        if (!dataAllowanceGb) throw Errors.validation('e-SIM add-on requires a data plan size');
        const rate = await getEffectiveEsimRate(country, dataAllowanceGb);
        if (!rate) throw Errors.conflict(`No e-SIM rate configured for ${dataAllowanceGb}GB in ${country}`);
        if (booking.currency && rate.currency !== booking.currency) {
          throw Errors.conflict('Add-on currency does not match the booking currency');
        }
        return {
          code: addon.code,
          item: { addonServiceId: addon.id, priceMinor: rate.priceMinor, currency: rate.currency, dataAllowanceGb },
        };
      }

      if (
        selection.flightClass ||
        selection.airline ||
        selection.originAirportId ||
        selection.destinationAirportId ||
        selection.dataAllowanceGb
      ) {
        throw Errors.validation(`${addon.code} does not accept a flight ticket or e-SIM selection`);
      }
      const rate = await getEffectiveAddonRate(country, addon.code);
      if (!rate) throw Errors.conflict(`No rate configured for ${addon.code} in ${country}`);
      if (booking.currency && rate.currency !== booking.currency) {
        throw Errors.conflict('Add-on currency does not match the booking currency');
      }
      return { code: addon.code, item: { addonServiceId: addon.id, priceMinor: rate.priceMinor, currency: rate.currency } };
    }),
  );

  const items = resolved.map((r) => r.item);
  const requiresPassportUpload = resolved.some((r) => r.code === 'VISA_ASSISTANCE');
  // Pre-quotation (booking.currency not set yet -- a TAILOR_MADE request
  // before staff have priced it), there's no fixed currency to check
  // against yet; the selection just needs to be internally consistent.
  if (!booking.currency) {
    const currencies = new Set(items.map((i) => i.currency));
    if (currencies.size > 1) throw Errors.conflict('Selected add-ons must share one currency');
  }

  await bookingRepository.replaceAddons(organizationId, bookingId, items, requiresPassportUpload);
  await audit({
    ...actor,
    action: 'booking.addons_finalized',
    resourceType: 'Booking',
    resourceId: bookingId,
    organizationId,
  });
  return bookingRepository.listAddonsForBooking(organizationId, bookingId);
}

export const bookingService = {
  /** DR-067: no-ctx, deliberately -- there is no user/permission concept for
   * "the platform's own scheduler." Call only from the QStash-signature-
   * verified job route (src/app/api/jobs/sweep-bookings/route.ts), never
   * from user-facing code. Turns the existing lazy "sweep on next read"
   * sweepLifecycle convention into a real periodic job that runs even for
   * an organization nobody happens to be actively using right now.
   * DR-094: `transitionedDepartures` lets that same route resync fleet
   * availability afterward -- see sweepAllOrganizations's own comment. */
  async runScheduledSweep(): Promise<{ organizationsSwept: number; transitionedDepartures: TransitionedDeparture[] }> {
    return bookingRepository.sweepAllOrganizations();
  },

  async getAvailability(ctx: AuthContext, departureId: string): Promise<Availability> {
    assertCan(ctx, 'catalog.read');
    const organizationId = requireOrg(ctx);
    const { departure } = await catalogService.getDepartureDetail(ctx, departureId);
    const seatsTaken = await bookingRepository.seatsTakenFor(organizationId, departureId);
    return { capacity: departure.capacity, seatsAvailable: computeAvailability(departure.capacity, seatsTaken) };
  },

  /** No-ctx (DR-082): backs the fleet-availability sync helper
   * (src/lib/fleet-availability.ts), which already has organizationId in
   * hand from the assignment/booking mutation that triggered it -- same
   * "caller already has authority" convention as the *ForBookingLookup
   * methods elsewhere in this module. */
  async hasActiveBookingForDeparture(organizationId: string, departureId: string): Promise<boolean> {
    return bookingRepository.hasActiveBookingForDeparture(organizationId, departureId);
  },

  async createHold(ctx: AuthContext, input: CreateBookingInput): Promise<BookingView> {
    assertCan(ctx, 'booking.create');
    const organizationId = requireOrg(ctx);

    // Anti-BOLA: a tourist can only ever book for themselves. Only staff
    // (operators) may set touristUserId to someone else's account, for
    // phone/walk-in bookings entered on a tourist's behalf.
    const touristUserId = isStaff(ctx) && input.touristUserId ? input.touristUserId : ctx.userId;

    return finalizeHold(ctx, organizationId, touristUserId, input.departureId, input.seats, input.specialRequests);
  },

  /** DR-054 (revised same session): a guest-chosen start date replaces
   * picking a pre-existing, staff-scheduled Departure -- trip length comes
   * from the package's own staff-set durationDays, not the guest, so only
   * startDate is passed through. Creates a fresh Departure scoped to exactly
   * this booking (via catalogService.createDepartureForBooking, capacity ==
   * seats) and then holds it exactly like createHold. Only ever reachable
   * for a real, PUBLISHED, priced, duration-set TourPackage --
   * createDepartureForBooking itself enforces that. */
  async createHoldWithDates(ctx: AuthContext, input: CreateBookingWithDatesInput): Promise<BookingView> {
    assertCan(ctx, 'booking.create');
    const organizationId = requireOrg(ctx);
    const touristUserId = isStaff(ctx) && input.touristUserId ? input.touristUserId : ctx.userId;

    const departure = await catalogService.createDepartureForBooking(ctx, input.packageId, {
      startDate: input.startDate,
      capacity: input.seats,
    });

    return finalizeHold(ctx, organizationId, touristUserId, departure.id, input.seats, input.specialRequests);
  },

  /** A bespoke trip request with no pre-existing Departure -- no capacity
   * check applies (there's nothing to reserve yet). Staff price it manually
   * afterward via sendQuotation. */
  /** `locale` (default EN) picks the confirmation email's language -- passed
   * in by the caller (e.g. the guest site's own `locale` cookie, DR-023),
   * never inferred here; this module has no session/cookie access of its
   * own. */
  async createTailorMadeRequest(
    ctx: AuthContext,
    input: CreateTailorMadeInput,
    locale: Locale = 'EN',
  ): Promise<BookingView> {
    assertCan(ctx, 'booking.create');
    const organizationId = requireOrg(ctx);
    const touristUserId = isStaff(ctx) && input.touristUserId ? input.touristUserId : ctx.userId;
    // DR-198: locked in at wizard-submission time, not re-evaluated later
    // when staff sends the quote (see resolveLateBookingSurchargeBp's own
    // comment).
    const lateBookingSurchargeBp = await resolveLateBookingSurchargeBp(input.customTravelStart);

    const booking = await bookingRepository.createTailorMadeRequest(organizationId, {
      touristUserId,
      seats: input.seats,
      countries: input.countries,
      customTravelStart: input.customTravelStart,
      customTravelEnd: input.customTravelEnd,
      lateBookingSurchargeBp,
      customDescription: input.customDescription,
      specialRequests: input.specialRequests,
      preferredTags: input.preferredTags,
      preferredSites: input.preferredSites,
      email: input.email,
      firstName: input.firstName,
      lastName: input.lastName,
      preferredAddons: input.preferredAddons,
      countryOfResidence: input.countryOfResidence,
      citizenship: input.citizenship,
    });

    await audit({
      actorUserId: ctx.userId,
      actorRole: ctx.roles[0],
      action: 'booking.tailor_made_requested',
      resourceType: 'Booking',
      resourceId: booking.id,
      organizationId,
    });

    // DR-055: confirm the request by email straight away -- sent to
    // Booking.contactEmail (input.email), not the tourist's User.email
    // (synthetic for an anonymous guest session), so this always uses
    // notifyEmail rather than notify(). Fire-and-forget, never throws --
    // a channel outage must never fail the booking itself (charter rule 8).
    const notificationData = {
      bookingId: booking.bookingReference,
      countries: input.countries,
      seats: input.seats,
      travelStart: input.customTravelStart,
      travelEnd: input.customTravelEnd,
    };
    await notificationsService.notifyEmail('TAILOR_MADE_REQUEST_RECEIVED', input.email, locale, organizationId, notificationData);

    // DR-056: same confirmation, by SMS -- unlike contactEmail (booking-
    // scoped, since an anonymous session's User.email is synthetic),
    // User.phone IS the guest's real number (the wizard's contact step
    // writes it via authService.updateProfile before this call), so no
    // Booking.contactPhone column was needed. Best-effort: silently
    // skipped if the tourist has no phone on file.
    const tourist = await authService.getUser(touristUserId);
    if (tourist?.phone) {
      await notificationsService.notifySms('TAILOR_MADE_REQUEST_RECEIVED', tourist.phone, locale, organizationId, notificationData);
    }

    return booking;
  },

  /** Staff-only: prices a booking currently AWAITING_QUOTATION -- in
   * practice always a TAILOR_MADE request (the only origin that ever
   * reaches that status; a PREDEFINED_PACKAGE booking's old "request a
   * quotation instead of paying" escape hatch was removed). */
  async sendQuotation(ctx: AuthContext, bookingId: string, input: SendQuotationInput): Promise<BookingView> {
    assertCan(ctx, 'booking.confirm');
    const organizationId = requireOrg(ctx);
    await getOwnedBooking(ctx, organizationId, bookingId);

    const updated = await transition(() => bookingRepository.sendQuotation(organizationId, bookingId, input));
    if (!updated) throw Errors.notFound('Booking not found');
    // DR-128: sendQuotationAction (the caller) sets overrideReason only when
    // the submitted price deviates from the booking's own cost breakdown --
    // a distinct, searchable audit action for "this quote didn't come
    // straight from Operational Rates," same spirit as
    // finance.price_overridden for a package's cost breakdown.
    await audit({
      actorUserId: ctx.userId,
      actorRole: ctx.roles[0],
      action: input.overrideReason ? 'booking.quotation_price_overridden' : 'booking.quotation_sent',
      resourceType: 'Booking',
      resourceId: updated.id,
      organizationId,
      ...(input.overrideReason ? { metadata: { priceMinor: input.priceMinor, currency: input.currency, reason: input.overrideReason } } : {}),
    });
    await notifyGuest('QUOTATION_SENT', organizationId, updated, {
      bookingId: updated.bookingReference,
      amountMinor: updated.priceMinor ?? undefined,
      currency: updated.currency ?? undefined,
    });
    return updated;
  },

  /** Client accepts a sent quotation and proceeds toward payment
   * (QUOTATION_SENT -> AWAITING_DEPOSIT). Same accepted-risk posture as the
   * rest of the quote flow (DR-024): no fresh capacity re-check, no new hold
   * timer -- there's nothing shared/contended to protect for a quote that
   * already skipped (or released) its capacity reservation. */
  async acceptQuotation(ctx: AuthContext, bookingId: string): Promise<BookingView> {
    assertCan(ctx, 'booking.create');
    const organizationId = requireOrg(ctx);
    await getOwnedBooking(ctx, organizationId, bookingId);

    const updated = await transition(() => bookingRepository.updateStatus(organizationId, bookingId, 'AWAITING_DEPOSIT'));
    if (!updated) throw Errors.notFound('Booking not found');
    await audit({
      actorUserId: ctx.userId,
      actorRole: ctx.roles[0],
      action: 'booking.quotation_accepted',
      resourceType: 'Booking',
      resourceId: updated.id,
      organizationId,
    });
    await notifyGuest('QUOTATION_ACCEPTED', organizationId, updated, {
      bookingId: updated.bookingReference,
    });
    return updated;
  },

  // DR-159: booking.confirm alone isn't narrow enough here -- PLATFORM_ADMIN
  // still holds it (needed for refund/quotation/convert-to-itinerary/cost
  // breakdown), but the Confirm action itself is TOUR_OPERATOR-only. See
  // isBookingConfirmer's own comment.
  async confirm(ctx: AuthContext, bookingId: string): Promise<BookingView> {
    assertCan(ctx, 'booking.confirm');
    if (!isBookingConfirmer(ctx.roles)) {
      throw Errors.forbidden('Only SUPERADMIN or TOUR_OPERATOR may confirm a booking');
    }
    const organizationId = requireOrg(ctx);
    const updated = await transition(() => bookingRepository.updateStatus(organizationId, bookingId, 'CONFIRMED'));
    if (!updated) throw Errors.notFound('Booking not found');
    await audit({
      actorUserId: ctx.userId,
      actorRole: ctx.roles[0],
      action: 'booking.confirmed',
      resourceType: 'Booking',
      resourceId: updated.id,
      organizationId,
    });
    await notifyGuest('BOOKING_CONFIRMED', organizationId, updated, {
      bookingId: updated.bookingReference,
    });
    return updated;
  },

  /** DR-219: lets staff reschedule a booking's trip date -- previously not
   * editable at all after creation. `booking.confirm` is the route/service
   * permission passed through (same base permission `confirm` above uses);
   * `isDepartureDateChanger` beneath it is the real gate, at every status
   * short of the terminal ones `isBookingLocked` already blocks -- same
   * "route passes the broader permission, this hardcoded check narrows it"
   * layering as `confirm`'s own `isBookingConfirmer` check. A
   * PREDEFINED_PACKAGE booking's date lives on its Departure
   * (catalogService.updateDepartureDate); a not-yet-converted TAILOR_MADE
   * request has no Departure yet, so it's Booking.customTravelStart/
   * customTravelEnd directly -- once convertToItinerary attaches a bespoke
   * Departure (DR-028), that Departure becomes the source of truth instead,
   * same branch staff/itineraries/[itineraryId]/page.tsx already reads.
   * Refuses outright when the Departure is shared with another live booking
   * (bookingRepository.hasActiveBookingForDeparture's own comment: "a
   * departure can have several bookings") -- rescheduling would silently
   * move someone else's trip too, which needs its own dedicated flow, not
   * this one. */
  async updateTripDates(ctx: AuthContext, bookingId: string, input: UpdateTripDatesInput): Promise<BookingView> {
    assertCan(ctx, 'booking.confirm');
    if (!isDepartureDateChanger(ctx.roles)) {
      throw Errors.forbidden("Only SUPERADMIN or TOUR_OPERATOR may change a booking's trip date");
    }
    const organizationId = requireOrg(ctx);
    const booking = await getOwnedBooking(ctx, organizationId, bookingId);
    if (isBookingLocked(booking.status)) {
      throw Errors.conflict(`This booking is ${booking.status} and can no longer be edited`);
    }

    if (booking.departureId) {
      const otherBookings = await bookingRepository.countBookingsForDeparture(organizationId, booking.departureId, bookingId);
      if (otherBookings > 0) {
        throw Errors.conflict('This departure is shared with other bookings and cannot be rescheduled from a single booking');
      }
      await catalogService.updateDepartureDate(ctx, booking.departureId, input.startDate);
    } else {
      if (!booking.customTravelStart) throw Errors.conflict('This booking has no trip date to change');
      const spanMs = booking.customTravelEnd ? booking.customTravelEnd.getTime() - booking.customTravelStart.getTime() : 0;
      const newEnd = booking.customTravelEnd ? new Date(input.startDate.getTime() + spanMs) : null;
      await bookingRepository.updateTravelDates(organizationId, bookingId, {
        customTravelStart: input.startDate,
        customTravelEnd: newEnd,
      });
    }

    await audit({
      actorUserId: ctx.userId,
      actorRole: ctx.roles[0],
      action: 'booking.trip_dates_changed',
      resourceType: 'Booking',
      resourceId: bookingId,
      organizationId,
      metadata: { newStartDate: input.startDate.toISOString() },
    });
    return getOwnedBooking(ctx, organizationId, bookingId);
  },

  async cancel(ctx: AuthContext, bookingId: string): Promise<BookingView> {
    assertCan(ctx, 'booking.cancel');
    const organizationId = requireOrg(ctx);

    await getOwnedBooking(ctx, organizationId, bookingId);
    // Cancelling also retires this booking's bookingReference (freeing it
    // for reuse by a future booking) -- see
    // bookingRepository.cancelAndReleaseReference. The notification below
    // deliberately uses `previousReference`, the code the guest actually
    // knows, not the freshly regenerated one now sitting on the row.
    const result = await transition(() => bookingRepository.cancelAndReleaseReference(organizationId, bookingId));
    if (!result) throw Errors.notFound('Booking not found');
    const { booking: updated, previousReference } = result;
    await audit({
      actorUserId: ctx.userId,
      actorRole: ctx.roles[0],
      action: 'booking.cancelled',
      resourceType: 'Booking',
      resourceId: updated.id,
      organizationId,
      metadata: { previousBookingReference: previousReference },
    });
    await notifyGuest('BOOKING_CANCELLED', organizationId, updated, {
      bookingId: previousReference,
    });
    return updated;
  },

  /** Staff-only, mirrors payment.resolve's fraud-prevention posture (a
   * tourist self-marking their own refund would be exactly the same fraud
   * vector). Status-only: no real payment-reversal exists yet (no refund
   * concept in the invoicing module's Payment/PaymentStatus) -- issuing the
   * actual money back is a future Payments-module concern. */
  async refund(ctx: AuthContext, bookingId: string): Promise<BookingView> {
    assertCan(ctx, 'booking.confirm');
    const organizationId = requireOrg(ctx);
    await getOwnedBooking(ctx, organizationId, bookingId);

    const updated = await transition(() => bookingRepository.updateStatus(organizationId, bookingId, 'REFUNDED'));
    if (!updated) throw Errors.notFound('Booking not found');
    await audit({
      actorUserId: ctx.userId,
      actorRole: ctx.roles[0],
      action: 'booking.refunded',
      resourceType: 'Booking',
      resourceId: updated.id,
      organizationId,
    });
    await notifyGuest('BOOKING_REFUNDED', organizationId, updated, {
      bookingId: updated.bookingReference,
      amountMinor: updated.priceMinor ?? undefined,
      currency: updated.currency ?? undefined,
    });
    return updated;
  },

  /** DR-058: genuinely destructive, unlike every other method here -- no
   * status-transition table entry, no way back once the retention window
   * (BOOKING_DELETION_RETENTION_DAYS) passes and sweepLifecycle's purge
   * runs. SUPERADMIN-only: `assertCan` alone isn't enough, since
   * `booking.delete` is never granted to any role in rbac.ts's
   * ROLE_PERMISSIONS -- the `isBookingDeleter` check below is the real
   * gate, same "hardcoded role check beneath the permission gate" layering
   * as isCountryRegulationWriter/isFinanceConfigWriter. Any booking, any
   * status -- explicit user choice, not limited to CANCELLED. */
  async deleteBooking(ctx: AuthContext, bookingId: string): Promise<void> {
    assertCan(ctx, 'booking.delete');
    if (!isBookingDeleter(ctx.roles)) {
      throw Errors.forbidden('Only SUPERADMIN may delete a booking');
    }
    const organizationId = requireOrg(ctx);
    const booking = await getOwnedBooking(ctx, organizationId, bookingId);

    // DR-241: audit BEFORE deleting -- hardDelete cascades immediately, so
    // there's no post-delete row left to read bookingReference/status from.
    await audit({
      actorUserId: ctx.userId,
      actorRole: ctx.roles[0],
      action: 'booking.deleted',
      resourceType: 'Booking',
      resourceId: bookingId,
      organizationId,
      metadata: { bookingReference: booking.bookingReference, statusAtDeletion: booking.status },
    });

    const deleted = await bookingRepository.hardDelete(organizationId, bookingId);
    if (!deleted) throw Errors.notFound('Booking not found');
  },

  /** DR-028: the "Super Admin converts it into an operational itinerary"
   * step for an approved TAILOR_MADE booking -- unlocks once it's priced
   * (QUOTATION_SENT or later; sending the quotation IS the approval gate,
   * not payment) since that's when staff have enough to start planning
   * logistics. Creates a bespoke (package-less) Departure via catalogService
   * and attaches it, after which the existing Assignment module works
   * completely unchanged -- see assignmentService.createAssignment. */
  async convertToItinerary(ctx: AuthContext, bookingId: string): Promise<BookingView> {
    assertCan(ctx, 'booking.confirm');
    const organizationId = requireOrg(ctx);
    const booking = await getOwnedBooking(ctx, organizationId, bookingId);

    if (booking.origin !== 'TAILOR_MADE') {
      throw Errors.conflict('Only a tailor-made booking can be converted into an operational itinerary');
    }
    if (booking.departureId) {
      throw Errors.conflict('This booking already has an operational itinerary');
    }
    if (booking.priceMinor == null || booking.currency == null) {
      throw Errors.conflict('Send a quotation before converting this booking into an itinerary');
    }
    if (!booking.customCountry || !booking.customTravelStart || !booking.customTravelEnd) {
      throw Errors.conflict('This booking is missing trip details');
    }

    const departure = await catalogService.createBespokeDeparture(ctx, {
      customCountry: booking.customCountry,
      startDate: booking.customTravelStart,
      endDate: booking.customTravelEnd,
      capacity: booking.seats,
      priceMinor: booking.priceMinor,
      currency: booking.currency,
    });

    const updated = await bookingRepository.attachDeparture(organizationId, bookingId, departure.id);
    if (!updated) throw Errors.notFound('Booking not found');

    await audit({
      actorUserId: ctx.userId,
      actorRole: ctx.roles[0],
      action: 'booking.converted_to_itinerary',
      resourceType: 'Booking',
      resourceId: updated.id,
      organizationId,
      metadata: { departureId: departure.id },
    });
    return updated;
  },

  /** The cross-module entry point invoicing calls once a payment succeeds --
   * keeps the module boundary intact (invoicing never writes Booking.status
   * directly). DEPOSIT stays AWAITING_DEPOSIT -> DEPOSIT_PAID; BALANCE/FULL
   * both land on FULLY_PAID (BALANCE only ever follows an already-paid
   * deposit). Reached either by staff resolving a payment, or (DR-074) by a
   * tourist's own payment auto-succeeding through the stub gateway. */
  async recordPaymentReceived(ctx: AuthContext, bookingId: string, kind: PaymentKind): Promise<BookingView> {
    // Staff resolving a payment (`booking.confirm`) or a tourist's own
    // payment auto-succeeding through the stub gateway (`payment.initiate`,
    // DR-074) -- invoicingService.initiatePayment already re-checked
    // invoice/booking ownership before ever reaching here, so no further
    // ownership check is needed on this path.
    if (!can(ctx, 'booking.confirm') && !can(ctx, 'payment.initiate')) {
      throw Errors.forbidden('Not permitted to record a payment on this booking');
    }
    const organizationId = requireOrg(ctx);
    const to = kind === 'DEPOSIT' ? 'DEPOSIT_PAID' : 'FULLY_PAID';
    const updated = await transition(() => bookingRepository.updateStatus(organizationId, bookingId, to));
    if (!updated) throw Errors.notFound('Booking not found');
    await audit({
      actorUserId: ctx.userId,
      actorRole: ctx.roles[0],
      action: 'booking.payment_received',
      resourceType: 'Booking',
      resourceId: updated.id,
      organizationId,
      metadata: { kind },
    });
    return updated;
  },

  async getById(ctx: AuthContext, bookingId: string): Promise<BookingView> {
    assertCan(ctx, 'booking.read');
    const organizationId = requireOrg(ctx);
    return getOwnedBooking(ctx, organizationId, bookingId);
  },

  /** Staff-authenticated counterpart to getById, keyed by the human-facing
   * bookingReference instead of the raw uuid (DR-089: powers the Map tab's
   * "enter a booking reference" lookup) -- same ctx-checked
   * assertOwnedBooking anti-BOLA as every other lookup in this module.
   * Every *other* bookingReference-keyed lookup in this codebase
   * (lookupByBookingReference, getBookingForRating) is deliberately a
   * no-ctx public/guest path with its own rate-limiting and second-factor
   * check -- this is the first staff-authenticated one, not a copy of
   * those. */
  async getByBookingReference(ctx: AuthContext, bookingReference: string): Promise<BookingView> {
    assertCan(ctx, 'booking.read');
    const organizationId = requireOrg(ctx);
    const booking = await bookingRepository.findByBookingReference(organizationId, bookingReference);
    return assertOwnedBooking(ctx, booking);
  },

  /** Tourist -> their own bookings only. Staff -> the full org manifest. */
  async list(ctx: AuthContext): Promise<BookingView[]> {
    assertCan(ctx, 'booking.read');
    const organizationId = requireOrg(ctx);
    return isStaff(ctx)
      ? bookingRepository.listForOrg(organizationId)
      : bookingRepository.listMine(organizationId, ctx.userId);
  },

  /** Staff-only: every non-deleted booking for an arbitrary tourist, not
   * just the caller's own -- backs the Clients directory's delete-guard
   * (src/lib/client-deletion.ts). Same repository call listMine already
   * uses for a tourist's self-service view, just for someone else's id. */
  async listForTourist(ctx: AuthContext, touristUserId: string): Promise<BookingView[]> {
    assertCan(ctx, 'booking.read');
    if (!isStaff(ctx)) throw Errors.forbidden("Only staff may list another tourist's bookings");
    const organizationId = requireOrg(ctx);
    return bookingRepository.listMine(organizationId, touristUserId);
  },

  /** Staff-only, batched: backs the Clients directory showing each client's
   * real, guest-typed email (Booking.contactEmail for TAILOR_MADE, or,
   * DR-194, the tour lead Traveler's own email for PREDEFINED_PACKAGE)
   * instead of their anonymous User.email placeholder. Same permission
   * shape as listForTourist above, just one (well, two -- see the
   * repository) query for the whole directory. */
  async listLatestContactEmailsForTourists(ctx: AuthContext, touristUserIds: string[]): Promise<Map<string, string>> {
    assertCan(ctx, 'booking.read');
    if (!isStaff(ctx)) throw Errors.forbidden('Only staff may look up other tourists\' contact emails');
    const organizationId = requireOrg(ctx);
    return bookingRepository.listLatestContactEmailsForTourists(organizationId, touristUserIds);
  },

  async addTraveler(ctx: AuthContext, bookingId: string, input: AddTravelerInput): Promise<TravelerView> {
    assertCan(ctx, 'booking.create');
    const organizationId = requireOrg(ctx);
    const booking = await getOwnedBooking(ctx, organizationId, bookingId);
    if (isBookingLocked(booking.status)) {
      throw Errors.conflict(`This booking is ${booking.status} and can no longer be edited`);
    }

    const existing = await bookingRepository.listTravelersForBooking(organizationId, bookingId);
    if (!canAddTraveler(existing.length, booking.seats)) {
      throw Errors.conflict('This booking already has a traveler for every seat');
    }
    if (input.isTourLead && existing.some((t) => t.isTourLead)) {
      throw Errors.conflict('This booking already has a tour lead');
    }
    if (requiresFullTravelerDetails(booking.origin) && (input.age == null || !input.nationality || !input.idOrPassportNumber)) {
      throw Errors.validation('Age, nationality, and ID/passport number are required for this booking');
    }

    const traveler = await bookingRepository.createTraveler(organizationId, bookingId, input);
    await audit({
      actorUserId: ctx.userId,
      actorRole: ctx.roles[0],
      action: 'booking.traveler_added',
      resourceType: 'Traveler',
      resourceId: traveler.id,
      organizationId,
    });
    return traveler;
  },

  async listTravelers(ctx: AuthContext, bookingId: string): Promise<TravelerView[]> {
    assertCan(ctx, 'booking.read');
    const organizationId = requireOrg(ctx);
    await getOwnedBooking(ctx, organizationId, bookingId);
    return bookingRepository.listTravelersForBooking(organizationId, bookingId);
  },

  /** Reverse lookup: given only a travelerId (no bookingId in hand), resolves
   * the booking it belongs to. Org-scoped only, no further ownership check --
   * same "caller already gates" convention as fleetService.listVehiclesByIds
   * (DR-021) and bookingService.listTravelersForDeparture (DR-030). Built for
   * visaService.listForFacilitator (DR-031), whose caller already holds the
   * broad visa.process permission (any traveler in the org), so this adds no
   * new exposure beyond what that role can already reach via the visa routes. */
  async getBookingForTraveler(ctx: AuthContext, travelerId: string): Promise<BookingView | null> {
    assertCan(ctx, 'booking.read');
    const organizationId = requireOrg(ctx);
    const traveler = await bookingRepository.findTravelerById(organizationId, travelerId);
    if (!traveler) return null;
    return bookingRepository.findById(organizationId, traveler.bookingId);
  },

  /** Reverse lookup by travelerId alone, same "caller already gates"
   * convention as getBookingForTraveler above -- built for
   * visaService.listForFacilitator to resolve whether a traveler's passport
   * has been uploaded (Traveler.passportDocumentId), so the facilitator
   * queue can offer a "view passport" link only when one actually exists. */
  async getTravelerById(ctx: AuthContext, travelerId: string): Promise<TravelerView | null> {
    assertCan(ctx, 'booking.read');
    const organizationId = requireOrg(ctx);
    return bookingRepository.findTravelerById(organizationId, travelerId);
  },

  /** DR-060: feeds the visa module's "needs application" reconciliation
   * view -- gated on visa.process directly (not booking.read), matching
   * assignmentService.listAllAssignments' precedent of checking the calling
   * module's own permission rather than a narrower booking-specific one. */
  async listTravelersRequiringVisa(ctx: AuthContext): Promise<VisaCandidateTravelerView[]> {
    assertCan(ctx, 'visa.process');
    const organizationId = requireOrg(ctx);
    return bookingRepository.listTravelersRequiringVisa(organizationId);
  },

  /** Attaches an uploaded passport Document to the booking's tour lead. The
   * Document itself is created by documentsService -- this just records the
   * link, keeping the module boundary intact (booking never touches Blob). */
  async setTravelerPassport(ctx: AuthContext, bookingId: string, travelerId: string, documentId: string): Promise<void> {
    assertCan(ctx, 'booking.create');
    const organizationId = requireOrg(ctx);
    const booking = await getOwnedBooking(ctx, organizationId, bookingId);
    if (isBookingLocked(booking.status)) {
      throw Errors.conflict(`This booking is ${booking.status} and can no longer be edited`);
    }
    const travelers = await bookingRepository.listTravelersForBooking(organizationId, bookingId);
    const traveler = travelers.find((t) => t.id === travelerId);
    if (!traveler) throw Errors.notFound('Traveler not found');
    // Passports are only collected when the booking's finalized add-ons
    // included Visa Assistance (Booking.requiresPassportUpload) -- and when
    // they are, EVERY traveler needs one, not just the tour lead (a change
    // from the original tour-lead-only rule).
    if (!booking.requiresPassportUpload) {
      throw Errors.conflict('This booking does not require any passport uploads');
    }
    await bookingRepository.setTravelerPassport(organizationId, travelerId, documentId);
    await audit({
      actorUserId: ctx.userId,
      actorRole: ctx.roles[0],
      action: 'booking.traveler_passport_set',
      resourceType: 'Traveler',
      resourceId: travelerId,
      organizationId,
    });
  },

  /** A PREDEFINED_PACKAGE booking's country comes from its departure's
   * package; a TAILOR_MADE booking has no departure at all, so it carries
   * its own customCountry instead (set at creation). Shared by setAddons
   * (resolving country-specific AddonRate pricing, DR-128) and the guest/
   * staff add-ons picker pages (filtering/displaying those same resolved
   * prices) -- invoicing/service.ts has its own inline copy of this same
   * lookup for tax purposes, predating this shared version. */
  async getBookingCountry(ctx: AuthContext, bookingId: string): Promise<string> {
    assertCan(ctx, 'booking.read');
    const organizationId = requireOrg(ctx);
    const booking = await getOwnedBooking(ctx, organizationId, bookingId);
    return resolveBookingCountry(ctx, booking);
  },

  /** DR-180: the guest add-ons step's package-curation lookup -- null means
   * "no package resolved yet" (a TAILOR_MADE request pre-quote), in which
   * case the caller falls back to the org-wide add-on list. */
  async getBookingPackageId(ctx: AuthContext, bookingId: string): Promise<string | null> {
    assertCan(ctx, 'booking.read');
    const organizationId = requireOrg(ctx);
    const booking = await getOwnedBooking(ctx, organizationId, bookingId);
    return resolvePackageId(ctx, booking);
  },

  /** Replace-all: the add-ons wizard step is meant to be finalized once,
   * including choosing none -- stamps addonsFinalizedAt either way, which is
   * what gates invoicing (see getBillableTotal). Requires a priced booking --
   * a TAILOR_MADE booking has no currency to match against until quoted.
   * DR-128: each add-on's price is resolved from AddonRate (country + code
   * + effective date, src/lib/addon-rates.ts), never from AddonService's own
   * flat priceMinor/currency -- an add-on with no rate configured for this
   * booking's country can't be selected at all (the picker pages already
   * hide it; reaching here anyway is a stale/tampered request, not a
   * routine path).
   * DR-222: FLIGHT_TICKET/ESIM are priced by a variant selection instead of
   * a flat (country, code) rate -- FLIGHT_TICKET via src/lib/flight-fare-
   * rate.ts (route + airline + class) and ESIM via src/lib/esim-rate.ts
   * (country + data-plan tier). Every other AddonCode keeps the original
   * flat-rate path unchanged, and now explicitly rejects a selection that
   * smuggles in flight/e-SIM-only fields (a stale/tampered request, same
   * reasoning as the missing-rate case above). One flight-ticket and one
   * e-SIM selection per booking, not per traveler -- matches BookingAddon's
   * existing one-row-per-addon-code-per-booking shape. */
  async setAddons(ctx: AuthContext, bookingId: string, input: SetAddonsInput): Promise<BookingAddonView[]> {
    assertCan(ctx, 'booking.create');
    const organizationId = requireOrg(ctx);
    const booking = await getOwnedBooking(ctx, organizationId, bookingId);
    if (isBookingLocked(booking.status)) {
      throw Errors.conflict(`This booking is ${booking.status} and can no longer be edited`);
    }
    // Country resolution and each addon's own catalog lookup are mutually
    // independent -- run them concurrently rather than sequentially (this
    // used to be a single round trip per addon before DR-128 added country
    // resolution + a rate lookup on top; staying sequential here would
    // triple this step's latency for no reason).
    const [country, addons] = await Promise.all([
      resolveBookingCountry(ctx, booking),
      Promise.all(input.addons.map((sel) => catalogService.getAddonService(ctx, sel.addonServiceId))),
    ]);
    return applyAddonSelection(organizationId, booking, bookingId, input, country, addons, {
      actorUserId: ctx.userId,
      actorRole: ctx.roles[0],
    });
  },

  /** Read-only -- lets the Add-ons wizard step show what's already selected
   * when revisited after being finalized once (so "back" from Travelers can
   * re-open it for editing instead of just bouncing forward again). */
  async listAddons(ctx: AuthContext, bookingId: string): Promise<BookingAddonView[]> {
    assertCan(ctx, 'booking.read');
    const organizationId = requireOrg(ctx);
    await getOwnedBooking(ctx, organizationId, bookingId);
    return bookingRepository.listAddonsForBooking(organizationId, bookingId);
  },

  /** DR-108: turns an AWAITING_QUOTATION TAILOR_MADE request into a real,
   * reusable DRAFT TourPackage -- one per booking, never reassigned. Only
   * records the link; building the CreatePackageInput from this booking's
   * plan-my-trip answers and calling catalogService.createPackage happens
   * one level up (the Server Action), same "cross-module orchestration
   * doesn't live inside either module's service" convention as
   * itineraryService composing booking/catalog directly. */
  async setCustomizedPackage(ctx: AuthContext, bookingId: string, packageId: string): Promise<BookingView> {
    assertCan(ctx, 'booking.confirm');
    const organizationId = requireOrg(ctx);
    const booking = await getOwnedBooking(ctx, organizationId, bookingId);
    if (booking.origin !== 'TAILOR_MADE') {
      throw Errors.conflict('Only a tailor-made request can have a customized package created from it');
    }
    if (isBookingLocked(booking.status)) {
      throw Errors.conflict(`This booking is ${booking.status} and can no longer be edited`);
    }
    if (booking.customizedPackageId) {
      throw Errors.conflict('This booking already has a customized package');
    }
    const updated = await bookingRepository.setCustomizedPackage(organizationId, bookingId, packageId);
    await audit({
      actorUserId: ctx.userId,
      actorRole: ctx.roles[0],
      action: 'booking.customized_package_created',
      resourceType: 'Booking',
      resourceId: bookingId,
      organizationId,
      metadata: { packageId },
    });
    return updated;
  },

  /** Read-only reverse lookup for the package detail page's back-link to
   * whichever booking it was created from, if any -- same "caller already
   * gates" shape as getBookingForTraveler. */
  async getByCustomizedPackageId(ctx: AuthContext, packageId: string): Promise<BookingView | null> {
    assertCan(ctx, 'booking.read');
    const organizationId = requireOrg(ctx);
    return bookingRepository.findByCustomizedPackageId(organizationId, packageId);
  },

  /** The cross-module entry point invoicing calls instead of reading
   * Booking.priceMinor directly -- combines the seat price with the
   * finalized add-on selection. Throws until the booking is priced (a
   * TAILOR_MADE booking needs a sent quotation) and the traveler manifest +
   * add-ons step are both complete (see domain.isTravelerManifestComplete). */
  async getBillableTotal(ctx: AuthContext, bookingId: string): Promise<BillableTotal> {
    assertCan(ctx, 'booking.read');
    const organizationId = requireOrg(ctx);
    const booking = await getOwnedBooking(ctx, organizationId, bookingId);

    const priceMinor = booking.priceMinor;
    const currency = booking.currency;
    if (priceMinor == null || currency == null) {
      throw Errors.conflict('This booking has no price yet -- it needs a quotation before it can be invoiced');
    }

    const travelers = await bookingRepository.listTravelersForBooking(organizationId, bookingId);
    if (!isTravelerManifestComplete(travelers, booking.seats, booking.requiresPassportUpload) || !booking.addonsFinalizedAt) {
      throw Errors.conflict('Complete add-ons, travelers, and passports (if required) before invoicing');
    }

    const addons = await bookingRepository.listAddonsForBooking(organizationId, bookingId);
    const base = money(priceMinor, currency);
    const total = addons.reduce<Money>((sum, a) => add(sum, money(a.priceMinor, a.currency)), base);

    return {
      baseMinor: base.minor,
      addonsMinor: total.minor - base.minor,
      totalMinor: total.minor,
      currency: total.currency,
    };
  },

  /** Guides Module (DR-030): a guide's "client list" for one of their own
   * assigned departures. Gated only on booking.read, with NO further
   * ownership/assignment check inside this module -- same "caller already
   * gates" convention as fleetService.listVehiclesByIds/
   * listDriverProfilesByIds (DR-021) and authService.getUser. The one and
   * only caller (the guide-dashboard page) only ever passes a departureId
   * drawn from the caller's own assignmentService.listMyAssignments result,
   * so booking module doesn't need to depend on the assignment module to
   * re-verify that. Returns duty-relevant traveler detail only (see
   * TravelerDutyView) -- never idOrPassportNumber or passport document refs. */
  async listTravelersForDeparture(ctx: AuthContext, departureId: string): Promise<TravelerDutyGroup[]> {
    assertCan(ctx, 'booking.read');
    const organizationId = requireOrg(ctx);
    const rows = await bookingRepository.listBookingsWithTravelersForDeparture(organizationId, departureId);
    return rows.map(({ booking, travelers }) => ({
      booking: {
        id: booking.id,
        bookingReference: booking.bookingReference,
        specialRequests: booking.specialRequests,
      },
      travelers: travelers.map(toTravelerDutyView),
    }));
  },

  /** Public "find my booking" lookup (DR-016, DR-052) -- deliberately NOT
   * ctx-gated, there is no session for this caller. `bookingReference` +
   * the tour lead's last name together are a *light* anti-enumeration
   * check, not a real secret -- DR-052 removed the separate confirmationCode
   * this used to pair with (per explicit user direction: it was confusing
   * to show two same-format codes with different rules for what's "safe" to
   * share, so this consolidated onto the one code that was already shown
   * non-privately everywhere -- staff pages, invoices, this same page).
   * Practical effect: anyone who's seen a booking's reference (e.g. on a
   * shared screen, an emailed receipt) and can guess/know the tour lead's
   * last name can pull up the manifest here. The rate limit below (real
   * Redis-backed once Upstash is configured, DR-066; the original
   * audit-log-backed counter otherwise) is the only remaining defense
   * against automated guessing. Read-only by design regardless -- no
   * mutating action reachable from here (staff handle guest-requested
   * changes from the staff dashboard). */
  async lookupByBookingReference(input: LookupBookingInput, ip: string | undefined): Promise<BookingLookupResult> {
    const organizationId = await getPrimaryOrgId();

    if (ip) {
      await assertLookupNotRateLimited({
        organizationId,
        action: 'booking.lookup_failed',
        ip,
        windowMinutes: LOOKUP_RATE_LIMIT_WINDOW_MINUTES,
        maxAttempts: LOOKUP_RATE_LIMIT_MAX_ATTEMPTS,
      });
    }

    const found = await bookingRepository.findByBookingReference(organizationId, input.bookingReference);
    // A cancelled/refunded booking is a dead end -- excluded here the same
    // way as the staff dashboard's default list, and for the same
    // "reference number can be reused" reason: once hidden, nothing
    // depends on this exact code still resolving to this exact booking
    // (see bookingRepository.createBookingWithUniqueReference).
    const booking = found && !CLOSED_BOOKING_STATUSES.includes(found.status) ? found : null;
    const travelers = booking ? await bookingRepository.listTravelersForBooking(organizationId, booking.id) : [];
    const lead = travelers.find((t) => t.isTourLead);
    // DR-057: a TAILOR_MADE booking still AWAITING_QUOTATION/QUOTATION_SENT
    // has no Traveler manifest at all yet (the setup wizard only starts
    // once a quotation is accepted) -- `lead` is always undefined for one,
    // which made this lookup unconditionally fail for every fresh
    // /plan-my-trip request. Fall back to the guest-provided
    // Booking.contactLastName (same shape lastNameMatches already expects)
    // in that case; a booking with a real Traveler manifest keeps matching
    // against the tour lead exactly as before.
    const nameSource = lead ?? (booking?.contactLastName ? { lastName: booking.contactLastName } : null);

    if (!booking || !nameSource || !lastNameMatches(nameSource, input.lastName)) {
      // Never reveal which part was wrong -- same anti-enumeration posture
      // as getOwnedBooking's 404-not-403 elsewhere in this module.
      await audit({ action: 'booking.lookup_failed', resourceType: 'Booking', organizationId, ip });
      if (ip) {
        await recordLookupFailure({
          organizationId,
          action: 'booking.lookup_failed',
          ip,
          windowMinutes: LOOKUP_RATE_LIMIT_WINDOW_MINUTES,
        });
      }
      throw Errors.notFound('No matching booking found');
    }

    return { booking, travelers };
  },

  /** Guest self-service cancellation via /find-booking (DR-207) -- no ctx,
   * same two-factor-no-session trust boundary as lookupByBookingReference
   * above, but a real write this time, so the second factor is tightened:
   * the guest must also supply the tour lead's own on-file email, not just
   * their last name (last name alone is comparatively guessable/public
   * knowledge). Never reveals which factor was wrong -- same
   * anti-enumeration posture as the lookup, and its own tighter
   * rate-limit bucket (this is a write, not a read). Returns the cancelled
   * booking plus the refund tier just snapshotted; turning that into an
   * actual currency amount needs invoicing data this module may not depend
   * on (see CLAUDE.md's "module dependency direction" section) -- that
   * composition happens one level up, in the find-booking Server Action. */
  async cancelForBookingLookup(input: {
    bookingReference: string;
    lastName: string;
    email: string;
    reason: string;
    ip: string | undefined;
  }): Promise<{ booking: BookingView; refundTier: CancellationRefundTier }> {
    const organizationId = await getPrimaryOrgId();

    if (input.ip) {
      await assertWriteNotRateLimited({
        organizationId,
        action: 'booking.cancel_via_lookup',
        ip: input.ip,
        windowMinutes: CANCEL_LOOKUP_RATE_LIMIT_WINDOW_MINUTES,
        maxAttempts: CANCEL_LOOKUP_RATE_LIMIT_MAX_ATTEMPTS,
      });
    }

    const booking = await verifyGuestForBooking(organizationId, input, CANCELLABLE_BOOKING_STATUSES);

    // The reference date to weigh the refund tier against: a real
    // Departure.startDate for PREDEFINED_PACKAGE, or the booking's own
    // customTravelStart for TAILOR_MADE (null until quoted -- resolves to
    // the most generous tier via resolveCancellationRefundTier).
    let referenceDate: Date | null = booking.customTravelStart;
    if (booking.origin === 'PREDEFINED_PACKAGE' && booking.departureId) {
      const tripSummary = await catalogService.getDepartureTripSummaryForBookingLookup(organizationId, booking.departureId);
      referenceDate = tripSummary?.startDate ?? null;
    }
    const refundTier = resolveCancellationRefundTier(referenceDate);

    const result = await transition(() =>
      bookingRepository.cancelAndReleaseReference(organizationId, booking.id, {
        reason: input.reason.trim().slice(0, 1000),
        contactEmail: input.email.trim(),
        refundTier,
      }),
    );
    if (!result) throw Errors.notFound('Booking not found');
    const { booking: updated, previousReference } = result;

    await audit({
      action: 'booking.cancelled',
      resourceType: 'Booking',
      resourceId: updated.id,
      organizationId,
      ip: input.ip,
      metadata: { previousBookingReference: previousReference, channel: 'guest_self_service', refundTier },
    });
    await notifyGuest('BOOKING_CANCELLED', organizationId, updated, {
      bookingId: previousReference,
    });

    return { booking: updated, refundTier };
  },

  // ------------------------------------- guest booking setup (DR-257)
  // The /complete-booking flow, reached from the quotation email. Before
  // this, a guest whose 30-minute anonymous session had lapsed could not
  // accept their own quotation at all -- acceptQuotation existed only as a
  // ctx-gated action on the session-gated /booking/[bookingId], and
  // signIn.anonymous() only ever mints a NEW user, so there was no way back
  // in. These are the no-session twins.
  //
  // verifyForBookingSetup does the one full three-factor check and is what
  // the caller turns into a booking_setup cookie (src/lib/booking-setup-token.ts);
  // every method below trusts that cookie's bookingId and re-resolves the
  // booking itself rather than taking anything else from the client.

  /** Three-factor check + its own strict rate-limit bucket. Deliberately
   * separate from lookupByBookingReference's read bucket: this one gates a
   * credential that unlocks writes. */
  async verifyForBookingSetup(input: {
    bookingReference: string;
    lastName: string;
    email: string;
    ip: string | undefined;
  }): Promise<BookingView> {
    const organizationId = await getPrimaryOrgId();

    if (input.ip) {
      await assertWriteNotRateLimited({
        organizationId,
        action: 'booking.setup_verify',
        ip: input.ip,
        windowMinutes: SETUP_VERIFY_RATE_LIMIT_WINDOW_MINUTES,
        maxAttempts: SETUP_VERIFY_RATE_LIMIT_MAX_ATTEMPTS,
      });
    }

    const booking = await verifyGuestForBooking(organizationId, input);
    // A cancelled/refunded booking is a dead end -- same generic notFound as
    // a wrong last name, so this never becomes a status oracle.
    if (CLOSED_BOOKING_STATUSES.includes(booking.status)) {
      throw Errors.notFound('No matching booking found');
    }

    await audit({
      action: 'booking.setup_verified',
      resourceType: 'Booking',
      resourceId: booking.id,
      organizationId,
      ip: input.ip,
      metadata: { channel: 'guest_self_service' },
    });
    return booking;
  },

  /** Re-resolves the booking named by the setup cookie. Every write below
   * starts here rather than trusting an id from the request body. */
  async getForBookingSetup(bookingId: string): Promise<BookingView> {
    const organizationId = await getPrimaryOrgId();
    const booking = await bookingRepository.findById(organizationId, bookingId);
    if (!booking || CLOSED_BOOKING_STATUSES.includes(booking.status)) {
      throw Errors.notFound('No matching booking found');
    }
    return booking;
  },

  async acceptQuotationForBookingLookup(bookingId: string): Promise<BookingView> {
    const organizationId = await getPrimaryOrgId();
    const booking = await this.getForBookingSetup(bookingId);
    // The state machine is the real gate -- transition() turns an illegal
    // FROM status into a 409 rather than silently no-oping.
    if (booking.status !== 'QUOTATION_SENT') {
      throw Errors.conflict('This booking has no quotation awaiting acceptance');
    }

    const updated = await transition(() => bookingRepository.updateStatus(organizationId, bookingId, 'AWAITING_DEPOSIT'));
    if (!updated) throw Errors.notFound('Booking not found');
    await audit({
      actorUserId: updated.touristUserId,
      action: 'booking.quotation_accepted',
      resourceType: 'Booking',
      resourceId: updated.id,
      organizationId,
      metadata: { channel: 'guest_self_service' },
    });
    await notifyGuest('QUOTATION_ACCEPTED', organizationId, updated, {
      bookingId: updated.bookingReference,
    });
    return updated;
  },

  async addTravelerForBookingLookup(bookingId: string, input: AddTravelerInput): Promise<TravelerView> {
    const organizationId = await getPrimaryOrgId();
    const booking = await this.getForBookingSetup(bookingId);
    if (isBookingLocked(booking.status)) {
      throw Errors.conflict(`This booking is ${booking.status} and can no longer be edited`);
    }

    const existing = await bookingRepository.listTravelersForBooking(organizationId, bookingId);
    if (!canAddTraveler(existing.length, booking.seats)) {
      throw Errors.conflict('This booking already has a traveler for every seat');
    }
    if (input.isTourLead && existing.some((t) => t.isTourLead)) {
      throw Errors.conflict('This booking already has a tour lead');
    }
    // Same completeness rule as the session-gated addTraveler -- a booking
    // reaching this flow is past its quotation, so it needs the operational
    // detail a predefined booking collects (see requiresFullTravelerDetails).
    if (requiresGuestSetupTravelerDetails(booking) && (input.age == null || !input.nationality || !input.idOrPassportNumber)) {
      throw Errors.validation('Age, nationality, and ID/passport number are required for this booking');
    }

    const traveler = await bookingRepository.createTraveler(organizationId, bookingId, input);
    await audit({
      actorUserId: booking.touristUserId,
      action: 'booking.traveler_added',
      resourceType: 'Traveler',
      resourceId: traveler.id,
      organizationId,
      metadata: { channel: 'guest_self_service' },
    });
    return traveler;
  },

  /** The manifest as the /complete-booking checklist needs it. Keyed off the
   * booking the setup credential already named, so it needs no ctx and
   * reveals nothing the guest hasn't already proved they may see. */
  async listTravelersForBookingSetup(bookingId: string): Promise<TravelerView[]> {
    const organizationId = await getPrimaryOrgId();
    await this.getForBookingSetup(bookingId);
    return bookingRepository.listTravelersForBooking(organizationId, bookingId);
  },

  /** DR-180's packageId, resolved without a session -- which package's
   * curated add-on list the /complete-booking add-ons step should show. */
  async getBookingPackageIdForBookingSetup(bookingId: string): Promise<string | null> {
    const organizationId = await getPrimaryOrgId();
    const booking = await this.getForBookingSetup(bookingId);
    if (booking.departureId) {
      return catalogService.getDeparturePackageIdForBookingLookup(organizationId, booking.departureId);
    }
    return booking.customizedPackageId ?? null;
  },

  /** resolveBookingCountry without a session, for the /complete-booking
   * add-ons step (its rates are country-scoped). */
  async getBookingCountryForBookingSetup(bookingId: string): Promise<string> {
    const organizationId = await getPrimaryOrgId();
    const booking = await this.getForBookingSetup(bookingId);
    return resolveBookingCountryForLookup(organizationId, booking);
  },

  async setAddonsForBookingLookup(bookingId: string, input: SetAddonsInput): Promise<BookingAddonView[]> {
    const organizationId = await getPrimaryOrgId();
    const booking = await this.getForBookingSetup(bookingId);
    if (isBookingLocked(booking.status)) {
      throw Errors.conflict(`This booking is ${booking.status} and can no longer be edited`);
    }

    const [country, rows] = await Promise.all([
      resolveBookingCountryForLookup(organizationId, booking),
      catalogService.listAddonServicesForBookingLookup(
        organizationId,
        input.addons.map((sel) => sel.addonServiceId),
      ),
    ]);
    // That bulk read returns rows in DB order, but applyAddonSelection pairs
    // addons[i] with input.addons[i] -- so realign by id rather than trusting
    // the order, and drop inactive rows so they surface as the same
    // "Add-on service not found" the ctx-gated getAddonService raises.
    const byId = new Map(rows.filter((row) => row.active).map((row) => [row.id, row]));
    const addons = input.addons.map((sel) => byId.get(sel.addonServiceId));

    return applyAddonSelection(organizationId, booking, bookingId, input, country, addons, {
      actorUserId: booking.touristUserId,
      metadata: { channel: 'guest_self_service' },
    });
  },

  async setTravelerPassportForBookingLookup(bookingId: string, travelerId: string, documentId: string): Promise<void> {
    const organizationId = await getPrimaryOrgId();
    const booking = await this.getForBookingSetup(bookingId);
    if (isBookingLocked(booking.status)) {
      throw Errors.conflict(`This booking is ${booking.status} and can no longer be edited`);
    }
    // Anti-BOLA: the credential names a booking, so the traveler must be on
    // THAT booking -- never attach a document to someone else's manifest.
    const travelers = await bookingRepository.listTravelersForBooking(organizationId, bookingId);
    if (!travelers.some((t) => t.id === travelerId)) throw Errors.notFound('Traveler not found');
    if (!booking.requiresPassportUpload) {
      throw Errors.conflict('This booking does not require any passport uploads');
    }

    await bookingRepository.setTravelerPassport(organizationId, travelerId, documentId);
    await audit({
      actorUserId: booking.touristUserId,
      action: 'booking.traveler_passport_set',
      resourceType: 'Traveler',
      resourceId: travelerId,
      organizationId,
      metadata: { channel: 'guest_self_service' },
    });
  },

  /** Ratings module (DR-037): resolves a booking by its bookingReference for
   * the guest rating flow -- no ctx, since there is no session for this
   * caller either. Deliberately named for its one caller, same convention as
   * getBookingForTraveler (visa)/listTravelersForDeparture (guides): the
   * ratings service pairs this with its own RatingCode check for the real
   * two-factor secret (RatingCode is single-use and 30-day-expiring, unlike
   * bookingReference), so this alone reveals nothing sensitive. */
  /** No-ctx: the guest's real, deliverable contact details for a booking.
   * Exposed because ratings' RATING_THANK_YOU is sent from submitRating --
   * a public, guest-invoked write with no session to authorize a ctx-gated
   * traveler read, same reason getBookingForRating below is no-ctx. See
   * src/lib/guest-contact.ts for why User.email alone is not enough. */
  async resolveGuestContactForBooking(organizationId: string, booking: BookingView): Promise<GuestContact> {
    const travelers = await bookingRepository.listTravelersForBooking(organizationId, booking.id);
    const tourist = await authService.getUser(booking.touristUserId);
    return resolveGuestContact({ booking, travelers, tourist });
  },

  async getBookingForRating(organizationId: string, bookingReference: string): Promise<BookingView | null> {
    return bookingRepository.findByBookingReference(organizationId, bookingReference);
  },

  /** Guest "find my booking" add-ons list (no-ctx) -- mirrors
   * getBookingForRating's "*ForBookingLookup" convention above. No name
   * resolution here (BookingAddonView has no human-readable name); the
   * caller joins against catalogService.listAddonServicesForBookingLookup
   * itself. */
  async listAddonsForBookingLookup(organizationId: string, bookingId: string): Promise<BookingAddonView[]> {
    return bookingRepository.listAddonsForBooking(organizationId, bookingId);
  },
};
