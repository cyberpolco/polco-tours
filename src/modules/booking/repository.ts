// booking module — repository. The only place that touches the DB for this module.
import { Prisma, type AddonCode, type Booking, type BookingAddon, type BookingStatus, type Currency, type PackageTag, type Traveler } from '@prisma/client';
import { withOrg, type TenantTx } from '@lib/db';
import { canTransition, generateConfirmationCode, holdExpiryFrom } from './domain';
import type { AddTravelerInput, BookingAddonView, BookingView, TravelerView } from './domain';

export class SoldOutError extends Error {}

/** Thrown by updateStatus/sendQuotation when the requested transition isn't
 * in domain.ts's TRANSITIONS table -- e.g. a stale page double-submitting
 * Confirm, or Cancel on a booking someone else just refunded. service.ts
 * catches this and rethrows as Errors.conflict (409), same SoldOutError ->
 * Errors.conflict pattern createHold already uses, so a bad transition
 * attempt reads as a clean client error instead of an unhandled 500. */
export class InvalidTransitionError extends Error {}

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
  // DR-047: one or more, selection order preserved -- countries[0] is the
  // sole driver of tax/visa lookups (stored as customCountry), the full
  // list is kept as preferredCountries for staff context.
  countries: string[];
  customTravelStart: Date;
  customTravelEnd: Date;
  customDescription?: string; // optional (DR-048)
  specialRequests?: string;
  preferredTags?: PackageTag[];
  preferredSites?: string[];
  email: string;
  preferredAddons?: AddonCode[];
  countryOfResidence?: string;
  citizenship?: string;
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
    preferredTags: b.preferredTags,
    preferredSites: b.preferredSites,
    preferredCountries: b.preferredCountries,
    contactEmail: b.contactEmail,
    preferredAddons: b.preferredAddons,
    countryOfResidence: b.countryOfResidence,
    citizenship: b.citizenship,
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

const MAX_CODE_GENERATION_ATTEMPTS = 5;

/** `confirmationCode`/`bookingReference` are both freshly random per booking
 * (see domain.ts's generateConfirmationCode) -- the DB's `@unique`
 * constraint is what actually guarantees no two bookings ever share a code
 * (never silently duplicated), and this retry is what turns a rare
 * collision into an invisible regenerate-and-retry instead of a failed
 * request. At the 77,688,000-combination keyspace this pattern spec
 * produces, a same-attempt collision on 2 independently drawn codes is
 * astronomically unlikely; this exists for correctness, not because
 * collisions are expected in practice. */
async function createBookingWithUniqueCodes(create: (codes: { confirmationCode: string; bookingReference: string }) => Promise<Booking>): Promise<Booking> {
  for (let attempt = 1; attempt <= MAX_CODE_GENERATION_ATTEMPTS; attempt++) {
    try {
      return await create({ confirmationCode: generateConfirmationCode(), bookingReference: generateConfirmationCode() });
    } catch (err) {
      const isLastAttempt = attempt === MAX_CODE_GENERATION_ATTEMPTS;
      if (isLastAttempt || !(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== 'P2002') throw err;
    }
  }
  throw new Error('unreachable');
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
      const b = await createBookingWithUniqueCodes((codes) =>
        tx.booking.create({
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
            ...codes,
            specialRequests: params.specialRequests,
          },
        }),
      );
      return toBookingView(b);
    });
  },

  /** TAILOR_MADE origin -- no departure/capacity to check, no hold timer. */
  async createTailorMadeRequest(organizationId: string, params: CreateTailorMadeParams): Promise<BookingView> {
    // z.array(...).min(1) at the domain layer already guarantees this, but
    // TS's noUncheckedIndexedAccess can't see across that boundary.
    const [primaryCountry] = params.countries;
    if (!primaryCountry) throw new Error('CreateTailorMadeParams.countries must have at least one entry');

    return withOrg(organizationId, async (tx) => {
      const b = await createBookingWithUniqueCodes((codes) =>
        tx.booking.create({
          data: {
            organizationId,
            origin: 'TAILOR_MADE',
            touristUserId: params.touristUserId,
            seats: params.seats,
            status: 'AWAITING_QUOTATION',
            customCountry: primaryCountry,
            customTravelStart: params.customTravelStart,
            customTravelEnd: params.customTravelEnd,
            customDescription: params.customDescription,
            preferredTags: params.preferredTags ?? [],
            preferredSites: params.preferredSites ?? [],
            preferredCountries: params.countries,
            contactEmail: params.email,
            preferredAddons: params.preferredAddons ?? [],
            countryOfResidence: params.countryOfResidence,
            citizenship: params.citizenship,
            ...codes,
            specialRequests: params.specialRequests,
          },
        }),
      );
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

  /** Ratings module (DR-037): the "Booking ID" half of the guest rating
   * lookup's two factors (paired with RatingCode). Mirrors
   * findByConfirmationCode's shape -- no org context exists for that caller
   * either, so the ratings service resolves the primary org itself first. */
  async findByBookingReference(organizationId: string, bookingReference: string): Promise<BookingView | null> {
    return withOrg(organizationId, async (tx) => {
      await sweepLifecycle(tx);
      const b = await tx.booking.findUnique({ where: { bookingReference } });
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
        throw new InvalidTransitionError(`Cannot transition booking from ${existing.status} to ${to}`);
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
        throw new InvalidTransitionError(`Cannot transition booking from ${existing.status} to QUOTATION_SENT`);
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

  /** Reverse lookup by travelerId alone, with no bookingId already in hand --
   * needed by the visa module's facilitator queue (DR-031) to resolve a
   * VisaApplication's travel date via Traveler -> Booking -> Departure. */
  async findTravelerById(organizationId: string, travelerId: string): Promise<TravelerView | null> {
    return withOrg(organizationId, async (tx) => {
      const t = await tx.traveler.findUnique({ where: { id: travelerId } });
      return t ? toTravelerView(t) : null;
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
