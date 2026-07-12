// booking module — service. Business logic; orchestrates repository + rbac.
// Callable by other modules ONLY through index.ts (module boundary rule).
import type { AuthContext } from '@modules/auth';
import { catalogService } from '@modules/catalog';
import { notificationsService } from '@modules/notifications';
import { audit, countRecentAuditEvents } from '@lib/audit';
import { Errors } from '@lib/errors';
import { add, money, scale, type Money } from '@lib/money';
import { getPrimaryOrgId } from '@lib/primary-org';
import { assertCan } from '@lib/rbac';
import {
  canAddTraveler,
  computeAvailability,
  isTravelerManifestComplete,
  lastNameMatches,
  type AddTravelerInput,
  type BookingAddonView,
  type BookingLookupResult,
  type BookingView,
  type CreateBookingInput,
  type LookupBookingInput,
  type SetAddonsInput,
  type TravelerView,
} from './domain';
import { bookingRepository, SoldOutError } from './repository';

const LOOKUP_RATE_LIMIT_WINDOW_MINUTES = 15;
const LOOKUP_RATE_LIMIT_MAX_ATTEMPTS = 10;

function requireOrg(ctx: AuthContext): string {
  if (!ctx.organizationId) throw Errors.forbidden('No organization membership');
  return ctx.organizationId;
}

// TOURIST is the only "customer" role; every other role that reaches these
// checks already holds booking.confirm/cancel or is listing the org manifest
// (assertCan has already filtered out roles without the relevant grant).
function isStaff(ctx: AuthContext): boolean {
  return ctx.role !== 'TOURIST';
}

export interface Availability {
  capacity: number;
  seatsAvailable: number;
}

export interface BillableTotal {
  baseMinor: number;
  addonsMinor: number;
  totalMinor: number;
  currency: BookingView['currency'];
}

/** Anti-BOLA: a tourist may only act on their own booking; staff act on any
 * booking in their org. Shared by every method below that resolves a booking
 * by id -- don't leak existence of another tourist's booking via a 403 vs
 * 404 distinction. */
async function getOwnedBooking(ctx: AuthContext, organizationId: string, bookingId: string): Promise<BookingView> {
  const booking = await bookingRepository.findById(organizationId, bookingId);
  if (!booking) throw Errors.notFound('Booking not found');
  if (!isStaff(ctx) && booking.touristUserId !== ctx.userId) {
    throw Errors.notFound('Booking not found');
  }
  return booking;
}

export const bookingService = {
  async getAvailability(ctx: AuthContext, departureId: string): Promise<Availability> {
    assertCan(ctx.role, 'catalog.read');
    const organizationId = requireOrg(ctx);
    const { departure } = await catalogService.getDepartureDetail(ctx, departureId);
    const seatsTaken = await bookingRepository.seatsTakenFor(organizationId, departureId);
    return { capacity: departure.capacity, seatsAvailable: computeAvailability(departure.capacity, seatsTaken) };
  },

  async createHold(ctx: AuthContext, input: CreateBookingInput): Promise<BookingView> {
    assertCan(ctx.role, 'booking.create');
    const organizationId = requireOrg(ctx);

    // Anti-BOLA: a tourist can only ever book for themselves. Only staff
    // (operators) may set touristUserId to someone else's account, for
    // phone/walk-in bookings entered on a tourist's behalf.
    const touristUserId = isStaff(ctx) && input.touristUserId ? input.touristUserId : ctx.userId;

    const detail = await catalogService.getDepartureDetail(ctx, input.departureId);
    if (!detail.bookable) throw Errors.conflict('This departure is not open for booking');

    const price = scale(detail.effectiveUnitPrice, input.seats);

    let booking: BookingView;
    try {
      booking = await bookingRepository.createHold(organizationId, {
        departureId: input.departureId,
        touristUserId,
        seats: input.seats,
        capacity: detail.departure.capacity,
        priceMinor: price.minor,
        currency: price.currency,
      });
    } catch (err) {
      if (err instanceof SoldOutError) throw Errors.conflict(err.message);
      throw err;
    }

    await audit({
      actorUserId: ctx.userId,
      actorRole: ctx.role,
      action: 'booking.hold_created',
      resourceType: 'Booking',
      resourceId: booking.id,
      organizationId,
    });
    return booking;
  },

  async confirm(ctx: AuthContext, bookingId: string): Promise<BookingView> {
    assertCan(ctx.role, 'booking.confirm');
    const organizationId = requireOrg(ctx);
    const updated = await bookingRepository.updateStatus(organizationId, bookingId, 'CONFIRMED');
    if (!updated) throw Errors.notFound('Booking not found');
    await audit({
      actorUserId: ctx.userId,
      actorRole: ctx.role,
      action: 'booking.confirmed',
      resourceType: 'Booking',
      resourceId: updated.id,
      organizationId,
    });
    await notificationsService.notify('BOOKING_CONFIRMED', updated.touristUserId, organizationId, {
      bookingId: updated.id,
    });
    return updated;
  },

  async cancel(ctx: AuthContext, bookingId: string): Promise<BookingView> {
    assertCan(ctx.role, 'booking.cancel');
    const organizationId = requireOrg(ctx);

    await getOwnedBooking(ctx, organizationId, bookingId);
    const updated = await bookingRepository.updateStatus(organizationId, bookingId, 'CANCELLED');
    if (!updated) throw Errors.notFound('Booking not found');
    await audit({
      actorUserId: ctx.userId,
      actorRole: ctx.role,
      action: 'booking.cancelled',
      resourceType: 'Booking',
      resourceId: updated.id,
      organizationId,
    });
    await notificationsService.notify('BOOKING_CANCELLED', updated.touristUserId, organizationId, {
      bookingId: updated.id,
    });
    return updated;
  },

  /** Guest chooses "request a quotation" instead of paying (DR-024) -- the
   * booking already exists and already passed its capacity check when the
   * hold was created, so this is just a status transition (HELD ->
   * QUOTE_REQUESTED), not a new creation path. Reuses booking.cancel's
   * permission/ownership shape rather than adding a new permission --
   * TOURIST already holds it and the semantics ("give up this hold") are
   * close enough. No notification fired; staff see these via the new
   * quote-requests dashboard queue instead. */
  async requestQuotation(ctx: AuthContext, bookingId: string): Promise<BookingView> {
    assertCan(ctx.role, 'booking.cancel');
    const organizationId = requireOrg(ctx);

    await getOwnedBooking(ctx, organizationId, bookingId);
    const updated = await bookingRepository.updateStatus(organizationId, bookingId, 'QUOTE_REQUESTED');
    if (!updated) throw Errors.notFound('Booking not found');
    await audit({
      actorUserId: ctx.userId,
      actorRole: ctx.role,
      action: 'booking.quote_requested',
      resourceType: 'Booking',
      resourceId: updated.id,
      organizationId,
    });
    return updated;
  },

  async getById(ctx: AuthContext, bookingId: string): Promise<BookingView> {
    assertCan(ctx.role, 'booking.read');
    const organizationId = requireOrg(ctx);
    return getOwnedBooking(ctx, organizationId, bookingId);
  },

  /** Tourist -> their own bookings only. Staff -> the full org manifest. */
  async list(ctx: AuthContext): Promise<BookingView[]> {
    assertCan(ctx.role, 'booking.read');
    const organizationId = requireOrg(ctx);
    return isStaff(ctx)
      ? bookingRepository.listForOrg(organizationId)
      : bookingRepository.listMine(organizationId, ctx.userId);
  },

  async addTraveler(ctx: AuthContext, bookingId: string, input: AddTravelerInput): Promise<TravelerView> {
    assertCan(ctx.role, 'booking.create');
    const organizationId = requireOrg(ctx);
    const booking = await getOwnedBooking(ctx, organizationId, bookingId);

    const existing = await bookingRepository.listTravelersForBooking(organizationId, bookingId);
    if (!canAddTraveler(existing.length, booking.seats)) {
      throw Errors.conflict('This booking already has a traveler for every seat');
    }
    if (input.isTourLead && existing.some((t) => t.isTourLead)) {
      throw Errors.conflict('This booking already has a tour lead');
    }

    const traveler = await bookingRepository.createTraveler(organizationId, bookingId, input);
    await audit({
      actorUserId: ctx.userId,
      actorRole: ctx.role,
      action: 'booking.traveler_added',
      resourceType: 'Traveler',
      resourceId: traveler.id,
      organizationId,
    });
    return traveler;
  },

  async listTravelers(ctx: AuthContext, bookingId: string): Promise<TravelerView[]> {
    assertCan(ctx.role, 'booking.read');
    const organizationId = requireOrg(ctx);
    await getOwnedBooking(ctx, organizationId, bookingId);
    return bookingRepository.listTravelersForBooking(organizationId, bookingId);
  },

  /** Attaches an uploaded passport Document to the booking's tour lead. The
   * Document itself is created by documentsService -- this just records the
   * link, keeping the module boundary intact (booking never touches Blob). */
  async setTravelerPassport(ctx: AuthContext, bookingId: string, travelerId: string, documentId: string): Promise<void> {
    assertCan(ctx.role, 'booking.create');
    const organizationId = requireOrg(ctx);
    await getOwnedBooking(ctx, organizationId, bookingId);
    const travelers = await bookingRepository.listTravelersForBooking(organizationId, bookingId);
    const traveler = travelers.find((t) => t.id === travelerId);
    if (!traveler) throw Errors.notFound('Traveler not found');
    if (!traveler.isTourLead) throw Errors.conflict('Only the tour lead needs a passport upload');
    await bookingRepository.setTravelerPassport(organizationId, travelerId, documentId);
    await audit({
      actorUserId: ctx.userId,
      actorRole: ctx.role,
      action: 'booking.traveler_passport_set',
      resourceType: 'Traveler',
      resourceId: travelerId,
      organizationId,
    });
  },

  /** Replace-all: the add-ons wizard step is meant to be finalized once,
   * including choosing none -- stamps addonsFinalizedAt either way, which is
   * what gates invoicing (see getBillableTotal). */
  async setAddons(ctx: AuthContext, bookingId: string, input: SetAddonsInput): Promise<BookingAddonView[]> {
    assertCan(ctx.role, 'booking.create');
    const organizationId = requireOrg(ctx);
    const booking = await getOwnedBooking(ctx, organizationId, bookingId);

    const items = [];
    for (const addonServiceId of input.addonServiceIds) {
      const addon = await catalogService.getAddonService(ctx, addonServiceId);
      if (addon.currency !== booking.currency) {
        throw Errors.conflict('Add-on currency does not match the booking currency');
      }
      items.push({ addonServiceId, priceMinor: addon.priceMinor, currency: addon.currency });
    }

    await bookingRepository.replaceAddons(organizationId, bookingId, items);
    await audit({
      actorUserId: ctx.userId,
      actorRole: ctx.role,
      action: 'booking.addons_finalized',
      resourceType: 'Booking',
      resourceId: bookingId,
      organizationId,
    });
    return bookingRepository.listAddonsForBooking(organizationId, bookingId);
  },

  /** The cross-module entry point invoicing calls instead of reading
   * Booking.priceMinor directly -- combines the seat price with the
   * finalized add-on selection. Throws until the traveler manifest + add-ons
   * step are both complete (see domain.isTravelerManifestComplete). */
  async getBillableTotal(ctx: AuthContext, bookingId: string): Promise<BillableTotal> {
    assertCan(ctx.role, 'booking.read');
    const organizationId = requireOrg(ctx);
    const booking = await getOwnedBooking(ctx, organizationId, bookingId);

    const travelers = await bookingRepository.listTravelersForBooking(organizationId, bookingId);
    if (!isTravelerManifestComplete(travelers, booking.seats) || !booking.addonsFinalizedAt) {
      throw Errors.conflict('Complete travelers, the tour lead passport, and add-ons before invoicing');
    }

    const addons = await bookingRepository.listAddonsForBooking(organizationId, bookingId);
    const base = money(booking.priceMinor, booking.currency);
    const total = addons.reduce<Money>((sum, a) => add(sum, money(a.priceMinor, a.currency)), base);

    return {
      baseMinor: base.minor,
      addonsMinor: total.minor - base.minor,
      totalMinor: total.minor,
      currency: total.currency,
    };
  },

  /** Public "find my booking" lookup (DR-016) -- deliberately NOT ctx-gated,
   * there is no session for this caller. Two factors (code + tour lead's
   * last name) stand in for session auth; a crude audit-log-backed rate
   * limit raises the cost of guessing since no real rate-limiting infra
   * exists yet. Read-only by design -- no mutating action reachable from
   * here (staff handle guest-requested changes from the staff dashboard). */
  async lookupByConfirmationCode(input: LookupBookingInput, ip: string | undefined): Promise<BookingLookupResult> {
    const organizationId = await getPrimaryOrgId();

    if (ip) {
      const recentFailures = await countRecentAuditEvents({
        organizationId,
        action: 'booking.lookup_failed',
        ip,
        sinceMinutes: LOOKUP_RATE_LIMIT_WINDOW_MINUTES,
      });
      if (recentFailures >= LOOKUP_RATE_LIMIT_MAX_ATTEMPTS) {
        throw Errors.rateLimited('Too many attempts -- try again later');
      }
    }

    const booking = await bookingRepository.findByConfirmationCode(organizationId, input.confirmationCode);
    const travelers = booking ? await bookingRepository.listTravelersForBooking(organizationId, booking.id) : [];
    const lead = travelers.find((t) => t.isTourLead);

    if (!booking || !lead || !lastNameMatches(lead, input.lastName)) {
      // Never reveal which part was wrong -- same anti-enumeration posture
      // as getOwnedBooking's 404-not-403 elsewhere in this module.
      await audit({ action: 'booking.lookup_failed', resourceType: 'Booking', organizationId, ip });
      throw Errors.notFound('No matching booking found');
    }

    return { booking, travelers };
  },
};
