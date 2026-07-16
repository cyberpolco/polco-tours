// booking module — repository. The only place that touches the DB for this module.
import type { Booking, BookingAddon, BookingStatus, Currency, Traveler } from '@prisma/client';
import { withOrg, type TenantTx } from '@lib/db';
import { canTransition, formatBookingReference, generateConfirmationCode, holdExpiryFrom } from './domain';
import type { AddTravelerInput, BookingAddonView, BookingView, TravelerView } from './domain';

export class SoldOutError extends Error {}

export interface CreateHoldParams {
  departureId: string;
  touristUserId: string;
  seats: number;
  capacity: number;
  priceMinor: number;
  currency: Currency;
  specialRequests?: string;
}

export interface CreateTailorMadeParams {
  touristUserId: string;
  seats: number;
  customCountry: string;
  customTravelStart: Date;
  customTravelEnd: Date;
  customDescription: string;
  specialRequests?: string;
}

export interface SendQuotationParams {
  priceMinor: number;
  currency: Currency;
}

function toBookingView(b: Booking): BookingView {
  return {
    id: b.id,
    organizationId: b.organizationId,
    origin: b.origin,
    departureId: b.departureId,
    touristUserId: b.touristUserId,
    seats: b.seats,
    status: b.status,
    holdExpiresAt: b.holdExpiresAt,
    priceMinor: b.priceMinor,
    currency: b.currency,
    addonsFinalizedAt: b.addonsFinalizedAt,
    confirmationCode: b.confirmationCode,
    bookingReference: b.bookingReference,
    specialRequests: b.specialRequests,
    customCountry: b.customCountry,
    customTravelStart: b.customTravelStart,
    customTravelEnd: b.customTravelEnd,
    customDescription: b.customDescription,
    createdAt: b.createdAt,
    updatedAt: b.updatedAt,
  };
}

function toTravelerView(t: Traveler): TravelerView {
  return {
    id: t.id,
    organizationId: t.organizationId,
    bookingId: t.bookingId,
    firstName: t.firstName,
    lastName: t.lastName,
    age: t.age,
    sex: t.sex,
    nationality: t.nationality,
    idOrPassportNumber: t.idOrPassportNumber,
    phone: t.phone,
    disabilities: t.disabilities,
    allergies: t.allergies,
    drinkPreference: t.drinkPreference,
    emergencyContactName: t.emergencyContactName,
    emergencyContactPhone: t.emergencyContactPhone,
    emergencyContactRelation: t.emergencyContactRelation,
    isTourLead: t.isTourLead,
    passportDocumentId: t.passportDocumentId,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  };
}

function toBookingAddonView(a: BookingAddon): BookingAddonView {
  return {
    id: a.id,
    organizationId: a.organizationId,
    bookingId: a.bookingId,
    addonServiceId: a.addonServiceId,
    priceMinor: a.priceMinor,
    currency: a.currency,
    createdAt: a.createdAt,
  };
}

async function nextBookingReference(tx: TenantTx): Promise<string> {
  const rows = await tx.$queryRaw<{ nextval: bigint }[]>`SELECT nextval('booking_reference_seq') AS nextval`;
  const row = rows[0];
  if (!row) throw new Error('booking_reference_seq returned no row');
  return formatBookingReference(new Date().getFullYear(), row.nextval);
}

// Lazy lifecycle sweep -- no queue/cron, same pattern as the old HELD/EXPIRED
// sweep. Three independent transitions, all scoped by the caller's `withOrg`
// transaction GUC (no need to duplicate an organizationId filter here):
//  1. An expired seat-hold (AWAITING_DEPOSIT past holdExpiresAt) -> CANCELLED.
//     Only ever set for a PREDEFINED_PACKAGE booking (TAILOR_MADE has no
//     capacity to protect, so holdExpiresAt stays null for it).
//  2. CONFIRMED -> IN_PROGRESS once travel has started (departure startDate
//     for PREDEFINED_PACKAGE, customTravelStart for TAILOR_MADE).
//  3. IN_PROGRESS -> COMPLETED once travel has ended (departure endDate,
//     which is optional, or customTravelEnd).
async function sweepLifecycle(tx: TenantTx): Promise<void> {
  await tx.$executeRaw`
    UPDATE bookings SET status = 'CANCELLED', "updatedAt" = now()
    WHERE status = 'AWAITING_DEPOSIT' AND "holdExpiresAt" <= now() AND "departureId" IS NOT NULL
  `;
  await tx.$executeRaw`
    UPDATE bookings SET status = 'IN_PROGRESS', "updatedAt" = now()
    WHERE status = 'CONFIRMED' AND (
      ("departureId" IS NOT NULL AND EXISTS (
        SELECT 1 FROM departures d WHERE d.id = bookings."departureId" AND d."startDate" <= now()
      ))
      OR ("departureId" IS NULL AND "customTravelStart" IS NOT NULL AND "customTravelStart" <= now())
    )
  `;
  await tx.$executeRaw`
    UPDATE bookings SET status = 'COMPLETED', "updatedAt" = now()
    WHERE status = 'IN_PROGRESS' AND (
      ("departureId" IS NOT NULL AND EXISTS (
        SELECT 1 FROM departures d WHERE d.id = bookings."departureId" AND d."endDate" IS NOT NULL AND d."endDate" < now()
      ))
      OR ("departureId" IS NULL AND "customTravelEnd" IS NOT NULL AND "customTravelEnd" < now())
    )
  `;
}

// Call only immediately after sweepLifecycle() in the same transaction --
// otherwise a stale AWAITING_DEPOSIT row past its expiry would be double-counted.
async function sumSeatsTaken(tx: TenantTx, departureId: string): Promise<number> {
  const rows = await tx.booking.findMany({
    where: { departureId, status: { in: ['AWAITING_DEPOSIT', 'DEPOSIT_PAID', 'FULLY_PAID', 'CONFIRMED', 'IN_PROGRESS'] } },
    select: { seats: true },
  });
  return rows.reduce((sum, r) => sum + r.seats, 0);
}

export const bookingRepository = {
  async seatsTakenFor(organizationId: string, departureId: string): Promise<number> {
    return withOrg(organizationId, async (tx) => {
      await sweepLifecycle(tx);
      return sumSeatsTaken(tx, departureId);
    });
  },

  async createHold(organizationId: string, params: CreateHoldParams): Promise<BookingView> {
    return withOrg(organizationId, async (tx) => {
      // Serializes concurrent hold attempts on the SAME departure so two
      // requests can't both read "1 seat free" and both insert. Released
      // automatically at transaction end; unrelated departures are unaffected.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${params.departureId}::text))`;
      await sweepLifecycle(tx);
      const seatsTaken = await sumSeatsTaken(tx, params.departureId);
      if (seatsTaken + params.seats > params.capacity) {
        throw new SoldOutError('Not enough seats available on this departure');
      }
      const b = await tx.booking.create({
        data: {
          organizationId,
          origin: 'PREDEFINED_PACKAGE',
          departureId: params.departureId,
          touristUserId: params.touristUserId,
          seats: params.seats,
          status: 'AWAITING_DEPOSIT',
          holdExpiresAt: holdExpiryFrom(new Date()),
          priceMinor: params.priceMinor,
          currency: params.currency,
          confirmationCode: generateConfirmationCode(),
          bookingReference: await nextBookingReference(tx),
          specialRequests: params.specialRequests,
        },
      });
      return toBookingView(b);
    });
  },

  /** TAILOR_MADE origin -- no departure/capacity to check, no hold timer. */
  async createTailorMadeRequest(organizationId: string, params: CreateTailorMadeParams): Promise<BookingView> {
    return withOrg(organizationId, async (tx) => {
      const b = await tx.booking.create({
        data: {
          organizationId,
          origin: 'TAILOR_MADE',
          touristUserId: params.touristUserId,
          seats: params.seats,
          status: 'AWAITING_QUOTATION',
          customCountry: params.customCountry,
          customTravelStart: params.customTravelStart,
          customTravelEnd: params.customTravelEnd,
          customDescription: params.customDescription,
          confirmationCode: generateConfirmationCode(),
          bookingReference: await nextBookingReference(tx),
          specialRequests: params.specialRequests,
        },
      });
      return toBookingView(b);
    });
  },

  async findById(organizationId: string, id: string): Promise<BookingView | null> {
    return withOrg(organizationId, async (tx) => {
      await sweepLifecycle(tx);
      const b = await tx.booking.findUnique({ where: { id } });
      return b ? toBookingView(b) : null;
    });
  },

  /** Powers the public "find my booking" lookup (DR-016) -- no org context
   * exists for that caller, so this scans across the primary org the caller
   * already resolved (confirmationCode is globally unique regardless). */
  async findByConfirmationCode(organizationId: string, confirmationCode: string): Promise<BookingView | null> {
    return withOrg(organizationId, async (tx) => {
      await sweepLifecycle(tx);
      const b = await tx.booking.findUnique({ where: { confirmationCode } });
      return b ? toBookingView(b) : null;
    });
  },

  async listMine(organizationId: string, touristUserId: string): Promise<BookingView[]> {
    return withOrg(organizationId, async (tx) => {
      await sweepLifecycle(tx);
      const rows = await tx.booking.findMany({ where: { touristUserId }, orderBy: { createdAt: 'desc' } });
      return rows.map(toBookingView);
    });
  },

  async listForOrg(organizationId: string): Promise<BookingView[]> {
    return withOrg(organizationId, async (tx) => {
      await sweepLifecycle(tx);
      const rows = await tx.booking.findMany({ orderBy: { createdAt: 'desc' } });
      return rows.map(toBookingView);
    });
  },

  /** Guides Module (DR-030) -- backs a guide's "client list". Only bookings
   * that actually occupy a seat on this departure (not a cancelled/refunded
   * one) are relevant to someone running the tour. */
  async listBookingsWithTravelersForDeparture(
    organizationId: string,
    departureId: string,
  ): Promise<Array<{ booking: BookingView; travelers: TravelerView[] }>> {
    return withOrg(organizationId, async (tx) => {
      await sweepLifecycle(tx);
      const rows = await tx.booking.findMany({
        where: {
          departureId,
          status: { in: ['DEPOSIT_PAID', 'FULLY_PAID', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED'] },
        },
        include: { travelers: { orderBy: { createdAt: 'asc' } } },
        orderBy: { createdAt: 'asc' },
      });
      return rows.map((b) => ({ booking: toBookingView(b), travelers: b.travelers.map(toTravelerView) }));
    });
  },

  async updateStatus(organizationId: string, id: string, to: BookingStatus): Promise<BookingView | null> {
    return withOrg(organizationId, async (tx) => {
      await sweepLifecycle(tx);
      const existing = await tx.booking.findUnique({ where: { id } });
      if (!existing) return null;
      if (!canTransition(existing.status, to)) {
        throw new Error(`Cannot transition booking from ${existing.status} to ${to}`);
      }
      const b = await tx.booking.update({
        where: { id },
        data: { status: to, holdExpiresAt: to === 'AWAITING_DEPOSIT' ? existing.holdExpiresAt : null },
      });
      return toBookingView(b);
    });
  },

  /** DR-028: attaches the newly-created bespoke Departure (see
   * bookingService.convertToItinerary) to a TAILOR_MADE booking -- from this
   * point on the booking behaves like any other departure-having booking for
   * every downstream purpose (invoicing, visa, assignment). */
  async attachDeparture(organizationId: string, id: string, departureId: string): Promise<BookingView | null> {
    return withOrg(organizationId, async (tx) => {
      const existing = await tx.booking.findUnique({ where: { id } });
      if (!existing) return null;
      const b = await tx.booking.update({ where: { id }, data: { departureId } });
      return toBookingView(b);
    });
  },

  /** Staff prices a TAILOR_MADE booking -- the only place priceMinor/currency
   * get set outside createHold, since a bespoke trip has no departure-derived
   * price. AWAITING_QUOTATION -> QUOTATION_SENT only (canTransition-enforced). */
  async sendQuotation(organizationId: string, id: string, params: SendQuotationParams): Promise<BookingView | null> {
    return withOrg(organizationId, async (tx) => {
      await sweepLifecycle(tx);
      const existing = await tx.booking.findUnique({ where: { id } });
      if (!existing) return null;
      if (!canTransition(existing.status, 'QUOTATION_SENT')) {
        throw new Error(`Cannot transition booking from ${existing.status} to QUOTATION_SENT`);
      }
      const b = await tx.booking.update({
        where: { id },
        data: { status: 'QUOTATION_SENT', priceMinor: params.priceMinor, currency: params.currency },
      });
      return toBookingView(b);
    });
  },

  async createTraveler(
    organizationId: string,
    bookingId: string,
    input: AddTravelerInput,
  ): Promise<TravelerView> {
    return withOrg(organizationId, async (tx) => {
      const t = await tx.traveler.create({ data: { organizationId, bookingId, ...input } });
      return toTravelerView(t);
    });
  },

  async listTravelersForBooking(organizationId: string, bookingId: string): Promise<TravelerView[]> {
    return withOrg(organizationId, async (tx) => {
      const rows = await tx.traveler.findMany({ where: { bookingId }, orderBy: { createdAt: 'asc' } });
      return rows.map(toTravelerView);
    });
  },

  async setTravelerPassport(organizationId: string, travelerId: string, documentId: string): Promise<void> {
    await withOrg(organizationId, (tx) => tx.traveler.update({ where: { id: travelerId }, data: { passportDocumentId: documentId } }));
  },

  async listAddonsForBooking(organizationId: string, bookingId: string): Promise<BookingAddonView[]> {
    return withOrg(organizationId, async (tx) => {
      const rows = await tx.bookingAddon.findMany({ where: { bookingId } });
      return rows.map(toBookingAddonView);
    });
  },

  /** Replace-all semantics -- this wizard step is meant to be finalized once. */
  async replaceAddons(
    organizationId: string,
    bookingId: string,
    items: Array<{ addonServiceId: string; priceMinor: number; currency: Currency }>,
  ): Promise<void> {
    await withOrg(organizationId, async (tx) => {
      await tx.bookingAddon.deleteMany({ where: { bookingId } });
      if (items.length > 0) {
        await tx.bookingAddon.createMany({
          data: items.map((i) => ({ organizationId, bookingId, ...i })),
        });
      }
      await tx.booking.update({ where: { id: bookingId }, data: { addonsFinalizedAt: new Date() } });
    });
  },
};
