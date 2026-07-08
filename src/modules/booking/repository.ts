// booking module — repository. The only place that touches the DB for this module.
import type { Booking, BookingStatus, Currency } from '@prisma/client';
import { withOrg, type TenantTx } from '@lib/db';
import { canTransition, holdExpiryFrom } from './domain';
import type { BookingView } from './domain';

export class SoldOutError extends Error {}

export interface CreateHoldParams {
  departureId: string;
  touristUserId: string;
  seats: number;
  capacity: number;
  priceMinor: number;
  currency: Currency;
}

function toBookingView(b: Booking): BookingView {
  return {
    id: b.id,
    organizationId: b.organizationId,
    departureId: b.departureId,
    touristUserId: b.touristUserId,
    seats: b.seats,
    status: b.status,
    holdExpiresAt: b.holdExpiresAt,
    priceMinor: b.priceMinor,
    currency: b.currency,
    createdAt: b.createdAt,
    updatedAt: b.updatedAt,
  };
}

// Flips any HELD row past its hold window to EXPIRED. RLS (the `withOrg`
// caller's transaction GUC) already scopes this to the current org -- no
// need to duplicate an organizationId filter here.
async function sweepExpired(tx: TenantTx): Promise<void> {
  await tx.$executeRaw`
    UPDATE bookings SET status = 'EXPIRED', "updatedAt" = now()
    WHERE status = 'HELD' AND "holdExpiresAt" <= now()
  `;
}

// Call only immediately after sweepExpired() in the same transaction --
// otherwise a stale HELD row past its expiry would be double-counted.
async function sumSeatsTaken(tx: TenantTx, departureId: string): Promise<number> {
  const rows = await tx.booking.findMany({
    where: { departureId, status: { in: ['CONFIRMED', 'HELD'] } },
    select: { seats: true },
  });
  return rows.reduce((sum, r) => sum + r.seats, 0);
}

export const bookingRepository = {
  async seatsTakenFor(organizationId: string, departureId: string): Promise<number> {
    return withOrg(organizationId, async (tx) => {
      await sweepExpired(tx);
      return sumSeatsTaken(tx, departureId);
    });
  },

  async createHold(organizationId: string, params: CreateHoldParams): Promise<BookingView> {
    return withOrg(organizationId, async (tx) => {
      // Serializes concurrent hold attempts on the SAME departure so two
      // requests can't both read "1 seat free" and both insert. Released
      // automatically at transaction end; unrelated departures are unaffected.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${params.departureId}::text))`;
      await sweepExpired(tx);
      const seatsTaken = await sumSeatsTaken(tx, params.departureId);
      if (seatsTaken + params.seats > params.capacity) {
        throw new SoldOutError('Not enough seats available on this departure');
      }
      const b = await tx.booking.create({
        data: {
          organizationId,
          departureId: params.departureId,
          touristUserId: params.touristUserId,
          seats: params.seats,
          status: 'HELD',
          holdExpiresAt: holdExpiryFrom(new Date()),
          priceMinor: params.priceMinor,
          currency: params.currency,
        },
      });
      return toBookingView(b);
    });
  },

  async findById(organizationId: string, id: string): Promise<BookingView | null> {
    return withOrg(organizationId, async (tx) => {
      await sweepExpired(tx);
      const b = await tx.booking.findUnique({ where: { id } });
      return b ? toBookingView(b) : null;
    });
  },

  async listMine(organizationId: string, touristUserId: string): Promise<BookingView[]> {
    return withOrg(organizationId, async (tx) => {
      await sweepExpired(tx);
      const rows = await tx.booking.findMany({ where: { touristUserId }, orderBy: { createdAt: 'desc' } });
      return rows.map(toBookingView);
    });
  },

  async listForOrg(organizationId: string): Promise<BookingView[]> {
    return withOrg(organizationId, async (tx) => {
      await sweepExpired(tx);
      const rows = await tx.booking.findMany({ orderBy: { createdAt: 'desc' } });
      return rows.map(toBookingView);
    });
  },

  async updateStatus(organizationId: string, id: string, to: BookingStatus): Promise<BookingView | null> {
    return withOrg(organizationId, async (tx) => {
      await sweepExpired(tx);
      const existing = await tx.booking.findUnique({ where: { id } });
      if (!existing) return null;
      if (!canTransition(existing.status, to)) {
        throw new Error(`Cannot transition booking from ${existing.status} to ${to}`);
      }
      const b = await tx.booking.update({
        where: { id },
        data: { status: to, holdExpiresAt: to === 'HELD' ? existing.holdExpiresAt : null },
      });
      return toBookingView(b);
    });
  },
};
