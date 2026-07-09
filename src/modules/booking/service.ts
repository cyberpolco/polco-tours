// booking module — service. Business logic; orchestrates repository + rbac.
// Callable by other modules ONLY through index.ts (module boundary rule).
import type { AuthContext } from '@modules/auth';
import { catalogService } from '@modules/catalog';
import { notificationsService } from '@modules/notifications';
import { audit } from '@lib/audit';
import { Errors } from '@lib/errors';
import { scale } from '@lib/money';
import { assertCan } from '@lib/rbac';
import { computeAvailability, type BookingView, type CreateBookingInput } from './domain';
import { bookingRepository, SoldOutError } from './repository';

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

    const existing = await bookingRepository.findById(organizationId, bookingId);
    if (!existing) throw Errors.notFound('Booking not found');
    // Anti-BOLA: a tourist may only cancel their own booking. Don't leak
    // existence of another tourist's booking via a 403 vs 404 distinction.
    if (!isStaff(ctx) && existing.touristUserId !== ctx.userId) {
      throw Errors.notFound('Booking not found');
    }

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

  async getById(ctx: AuthContext, bookingId: string): Promise<BookingView> {
    assertCan(ctx.role, 'booking.read');
    const organizationId = requireOrg(ctx);
    const booking = await bookingRepository.findById(organizationId, bookingId);
    if (!booking) throw Errors.notFound('Booking not found');
    if (!isStaff(ctx) && booking.touristUserId !== ctx.userId) {
      throw Errors.notFound('Booking not found');
    }
    return booking;
  },

  /** Tourist -> their own bookings only. Staff -> the full org manifest. */
  async list(ctx: AuthContext): Promise<BookingView[]> {
    assertCan(ctx.role, 'booking.read');
    const organizationId = requireOrg(ctx);
    return isStaff(ctx)
      ? bookingRepository.listForOrg(organizationId)
      : bookingRepository.listMine(organizationId, ctx.userId);
  },
};
