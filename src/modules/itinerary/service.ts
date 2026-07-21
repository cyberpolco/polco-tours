// itinerary module — service. Business logic; orchestrates repository + rbac.
// Callable by other modules ONLY through index.ts (module boundary rule).
import type { Role } from '@prisma/client';
import type { AuthContext } from '@modules/auth';
import { assignmentService } from '@modules/assignment';
import { bookingService } from '@modules/booking';
import { catalogService } from '@modules/catalog';
import { audit } from '@lib/audit';
import { Errors } from '@lib/errors';
import { assertCan } from '@lib/rbac';
import {
  canTransition,
  type AddItineraryDayInput,
  type CreateHotelInput,
  type CreateItineraryInput,
  type CreateRestaurantInput,
  type HotelRatingView,
  type HotelView,
  type ItineraryDayView,
  type ItineraryView,
  type RateHotelInput,
  type RateRestaurantInput,
  type RestaurantRatingView,
  type RestaurantView,
  type UpdateHotelInput,
  type UpdateItineraryDayInput,
  type UpdateItineraryInput,
  type UpdateRestaurantInput,
} from './domain';
import { itineraryRepository } from './repository';

function requireOrg(ctx: AuthContext): string {
  if (!ctx.organizationId) throw Errors.forbidden('No organization membership');
  return ctx.organizationId;
}

// TOUR_OPERATOR/SUPERADMIN/PLATFORM_ADMIN manage every itinerary in the org;
// TOUR_GUIDE/DRIVER (itinerary.read only) see only their own assigned ones --
// per explicit user choice, SUPERADMIN and PLATFORM_ADMIN are NOT
// differentiated here (matches every other manager-role check in this app).
function isItineraryManager(roles: Role[]): boolean {
  return roles.some((role) => role === 'TOUR_OPERATOR' || role === 'SUPERADMIN' || role === 'PLATFORM_ADMIN');
}

/** TOUR_GUIDE/DRIVER anti-BOLA scoping: "their assigned itineraries" means
 * the itinerary's underlying booking sits on a departure they're assigned
 * to (assignmentService.listMyAssignments, already scoped to the caller).
 * A TAILOR_MADE booking not yet converted to a real departure has nothing
 * to be assigned to, so it's never visible to a non-manager this way. */
async function isAssignedToItinerary(ctx: AuthContext, itinerary: ItineraryView): Promise<boolean> {
  const booking = await bookingService.getById(ctx, itinerary.bookingId);
  if (!booking.departureId) return false;
  const myAssignments = await assignmentService.listMyAssignments(ctx);
  return myAssignments.some((a) => a.departureId === booking.departureId);
}

async function getOwnedItinerary(ctx: AuthContext, organizationId: string, itineraryId: string): Promise<ItineraryView> {
  const itinerary = await itineraryRepository.findById(organizationId, itineraryId);
  if (!itinerary) throw Errors.notFound('Itinerary not found');
  if (!isItineraryManager(ctx.roles) && !(await isAssignedToItinerary(ctx, itinerary))) {
    throw Errors.notFound('Itinerary not found');
  }
  return itinerary;
}

export const itineraryService = {
  /** Staff-only (itinerary.write) -- "Every itinerary is linked to a single
   * Booking ID". One itinerary per booking (DB-unique on bookingId). */
  async createItinerary(ctx: AuthContext, bookingId: string, input: CreateItineraryInput): Promise<ItineraryView> {
    assertCan(ctx, 'itinerary.write');
    const organizationId = requireOrg(ctx);
    const booking = await bookingService.getById(ctx, bookingId); // 404s if not found/visible in this org

    const existing = await itineraryRepository.findByBookingId(organizationId, bookingId);
    if (existing) throw Errors.conflict('This booking already has an itinerary');

    const itinerary = await itineraryRepository.create(organizationId, bookingId, input);
    await audit({
      actorUserId: ctx.userId,
      actorRole: ctx.roles[0],
      action: 'itinerary.created',
      resourceType: 'Itinerary',
      resourceId: itinerary.id,
      organizationId,
    });

    // Explicit user direction: a package's own reusable itinerary template
    // (catalog module, per-package day-by-day plan) gets copied onto this
    // fresh Itinerary's real, dated ItineraryDay rows as a starting point --
    // staff review/adjust from there instead of building one from scratch
    // every time. Best-effort: a bespoke/TAILOR_MADE booking has no
    // departure/package to copy from at all (skip silently, same as today);
    // any other failure here must never fail itinerary creation itself.
    try {
      if (booking.departureId) {
        const { departure } = await catalogService.getDepartureDetail(ctx, booking.departureId);
        if (departure.tourPackageId) {
          const templateDays = await catalogService.listTemplateDaysForItineraryCopy(organizationId, departure.tourPackageId);
          for (const day of templateDays) {
            await itineraryRepository.addDay(organizationId, itinerary.id, {
              dayNumber: day.dayNumber,
              date: addDaysToDate(departure.startDate, day.dayNumber - 1),
              departureTime: day.departureTime ?? undefined,
              arrivalTime: day.arrivalTime ?? undefined,
              pickupLocation: day.pickupLocation ?? undefined,
              dropoffLocation: day.dropoffLocation ?? undefined,
              plannedSites: day.plannedSites ?? undefined,
              activities: day.activities ?? undefined,
              estimatedTravelMinutes: day.estimatedTravelMinutes ?? undefined,
              notes: day.notes ?? undefined,
            });
          }
        }
      }
    } catch {
      // Never fail itinerary creation over a template-copy issue -- staff
      // can still add days manually, same as before this feature existed.
    }

    return itinerary;
  },

  async getItinerary(ctx: AuthContext, itineraryId: string): Promise<ItineraryView> {
    assertCan(ctx, 'itinerary.read');
    const organizationId = requireOrg(ctx);
    return getOwnedItinerary(ctx, organizationId, itineraryId);
  },

  async getItineraryForBooking(ctx: AuthContext, bookingId: string): Promise<ItineraryView | null> {
    assertCan(ctx, 'itinerary.read');
    const organizationId = requireOrg(ctx);
    await bookingService.getById(ctx, bookingId); // 404s if not found/visible
    const itinerary = await itineraryRepository.findByBookingId(organizationId, bookingId);
    if (!itinerary) return null;
    if (!isItineraryManager(ctx.roles) && !(await isAssignedToItinerary(ctx, itinerary))) return null;
    return itinerary;
  },

  /** Manager-only -- the staff itinerary-list page. */
  async listAll(ctx: AuthContext): Promise<ItineraryView[]> {
    assertCan(ctx, 'itinerary.write');
    if (!isItineraryManager(ctx.roles)) throw Errors.forbidden('Only itinerary managers may list every itinerary');
    return itineraryRepository.listAll(requireOrg(ctx));
  },

  /** DR-059 follow-up: closes a real regression a booking-deletion (DR-058)
   * feature surfaced -- an Itinerary left pointing at a soft-deleted
   * Booking crashed the itineraries/schedule pages (bookingService.getById
   * now throws for a soft-deleted booking, where it never used to).
   * Per explicit user direction, deleting a booking now also removes its
   * itinerary automatically, rather than just tolerating the dangling
   * reference. Deliberately NOT called from bookingService.deleteBooking
   * itself -- this module already depends on booking (see
   * isAssignedToItinerary/getItineraryForBooking above), so booking calling
   * back into itinerary would create a circular module dependency; the
   * caller (the staff deleteBookingAction Server Action, which already
   * imports both modules for createItineraryAction) orchestrates both
   * calls instead. No-op, not an error, when the booking never had an
   * itinerary at all -- most bookings don't. */
  async deleteForBooking(ctx: AuthContext, bookingId: string): Promise<void> {
    assertCan(ctx, 'itinerary.write');
    const organizationId = requireOrg(ctx);
    const deleted = await itineraryRepository.deleteByBookingId(organizationId, bookingId);
    if (!deleted) return;
    await audit({
      actorUserId: ctx.userId,
      actorRole: ctx.roles[0],
      action: 'itinerary.deleted',
      resourceType: 'Itinerary',
      resourceId: deleted.id,
      organizationId,
      metadata: { bookingId },
    });
  },

  /** TOUR_GUIDE/DRIVER: itineraries for their own assigned departures --
   * mirrors assignmentService.listMyAssignments' self-service shape
   * (DR-021/030/031). Managers use listAll instead. */
  async listMine(ctx: AuthContext): Promise<ItineraryView[]> {
    assertCan(ctx, 'itinerary.read');
    const organizationId = requireOrg(ctx);
    const assignments = await assignmentService.listMyAssignments(ctx);
    const departureIds = [...new Set(assignments.map((a) => a.departureId))];
    return itineraryRepository.listForDepartureIds(organizationId, departureIds);
  },

  async updateItinerary(ctx: AuthContext, itineraryId: string, input: UpdateItineraryInput): Promise<ItineraryView> {
    assertCan(ctx, 'itinerary.write');
    const organizationId = requireOrg(ctx);
    const updated = await itineraryRepository.update(organizationId, itineraryId, input);
    if (!updated) throw Errors.notFound('Itinerary not found');
    return updated;
  },

  /** DRAFT -> IN_REVIEW ("Platform Admin can: Review assigned itineraries"). */
  async submitForReview(ctx: AuthContext, itineraryId: string): Promise<ItineraryView> {
    assertCan(ctx, 'itinerary.write');
    return transition(ctx, itineraryId, 'IN_REVIEW');
  },

  /** Sends an IN_REVIEW itinerary back to DRAFT for edits. */
  async sendBackToDraft(ctx: AuthContext, itineraryId: string): Promise<ItineraryView> {
    assertCan(ctx, 'itinerary.write');
    return transition(ctx, itineraryId, 'DRAFT');
  },

  /** itinerary.approve -- "Super Admin can: ... Approve itineraries". Stamps
   * approvedAt/approvedByUserId. */
  async approveItinerary(ctx: AuthContext, itineraryId: string): Promise<ItineraryView> {
    assertCan(ctx, 'itinerary.approve');
    const organizationId = requireOrg(ctx);
    const existing = await itineraryRepository.findById(organizationId, itineraryId);
    if (!existing) throw Errors.notFound('Itinerary not found');
    if (!canTransition(existing.status, 'APPROVED')) {
      throw Errors.conflict(`Cannot approve an itinerary in ${existing.status} status`);
    }
    const updated = await itineraryRepository.updateStatus(organizationId, itineraryId, 'APPROVED', {
      userId: ctx.userId,
      at: new Date(),
    });
    if (!updated) throw Errors.notFound('Itinerary not found');
    await audit({
      actorUserId: ctx.userId,
      actorRole: ctx.roles[0],
      action: 'itinerary.approved',
      resourceType: 'Itinerary',
      resourceId: updated.id,
      organizationId,
    });
    return updated;
  },

  // ------------------------------------------------------------ days

  async addDay(ctx: AuthContext, itineraryId: string, input: AddItineraryDayInput): Promise<ItineraryDayView> {
    assertCan(ctx, 'itinerary.write');
    const organizationId = requireOrg(ctx);
    await requireManagedItinerary(organizationId, itineraryId);
    return itineraryRepository.addDay(organizationId, itineraryId, input);
  },

  async updateDay(
    ctx: AuthContext,
    itineraryId: string,
    dayId: string,
    input: UpdateItineraryDayInput,
  ): Promise<ItineraryDayView> {
    assertCan(ctx, 'itinerary.write');
    const organizationId = requireOrg(ctx);
    await requireManagedItinerary(organizationId, itineraryId);
    const updated = await itineraryRepository.updateDay(organizationId, dayId, input);
    if (!updated) throw Errors.notFound('Itinerary day not found');
    return updated;
  },

  async removeDay(ctx: AuthContext, itineraryId: string, dayId: string): Promise<void> {
    assertCan(ctx, 'itinerary.write');
    const organizationId = requireOrg(ctx);
    await requireManagedItinerary(organizationId, itineraryId);
    const removed = await itineraryRepository.removeDay(organizationId, dayId);
    if (!removed) throw Errors.notFound('Itinerary day not found');
  },

  /** Read path shared by staff and the guide/driver read-only view -- same
   * anti-BOLA scoping as getItinerary. */
  async listDays(ctx: AuthContext, itineraryId: string): Promise<ItineraryDayView[]> {
    assertCan(ctx, 'itinerary.read');
    const organizationId = requireOrg(ctx);
    await getOwnedItinerary(ctx, organizationId, itineraryId);
    return itineraryRepository.listDays(organizationId, itineraryId);
  },

  // ------------------------------------------------------------ hotels / restaurants (reference data)

  async createHotel(ctx: AuthContext, input: CreateHotelInput): Promise<HotelView> {
    assertCan(ctx, 'itinerary.write');
    return itineraryRepository.createHotel(requireOrg(ctx), input);
  },

  async getHotel(ctx: AuthContext, hotelId: string): Promise<HotelView> {
    assertCan(ctx, 'itinerary.read');
    const hotel = await itineraryRepository.findHotelById(requireOrg(ctx), hotelId);
    if (!hotel) throw Errors.notFound('Hotel not found');
    return hotel;
  },

  async updateHotel(ctx: AuthContext, hotelId: string, input: UpdateHotelInput): Promise<HotelView> {
    assertCan(ctx, 'itinerary.write');
    const updated = await itineraryRepository.updateHotel(requireOrg(ctx), hotelId, input);
    if (!updated) throw Errors.notFound('Hotel not found');
    return updated;
  },

  async deleteHotel(ctx: AuthContext, hotelId: string): Promise<void> {
    assertCan(ctx, 'itinerary.write');
    const removed = await itineraryRepository.deleteHotel(requireOrg(ctx), hotelId);
    if (!removed) throw Errors.notFound('Hotel not found');
  },

  async listHotels(ctx: AuthContext): Promise<HotelView[]> {
    assertCan(ctx, 'itinerary.read');
    return itineraryRepository.listHotels(requireOrg(ctx));
  },

  async createRestaurant(ctx: AuthContext, input: CreateRestaurantInput): Promise<RestaurantView> {
    assertCan(ctx, 'itinerary.write');
    return itineraryRepository.createRestaurant(requireOrg(ctx), input);
  },

  async getRestaurant(ctx: AuthContext, restaurantId: string): Promise<RestaurantView> {
    assertCan(ctx, 'itinerary.read');
    const restaurant = await itineraryRepository.findRestaurantById(requireOrg(ctx), restaurantId);
    if (!restaurant) throw Errors.notFound('Restaurant not found');
    return restaurant;
  },

  async updateRestaurant(ctx: AuthContext, restaurantId: string, input: UpdateRestaurantInput): Promise<RestaurantView> {
    assertCan(ctx, 'itinerary.write');
    const updated = await itineraryRepository.updateRestaurant(requireOrg(ctx), restaurantId, input);
    if (!updated) throw Errors.notFound('Restaurant not found');
    return updated;
  },

  async deleteRestaurant(ctx: AuthContext, restaurantId: string): Promise<void> {
    assertCan(ctx, 'itinerary.write');
    const removed = await itineraryRepository.deleteRestaurant(requireOrg(ctx), restaurantId);
    if (!removed) throw Errors.notFound('Restaurant not found');
  },

  async listRestaurants(ctx: AuthContext): Promise<RestaurantView[]> {
    assertCan(ctx, 'itinerary.read');
    return itineraryRepository.listRestaurants(requireOrg(ctx));
  },

  // ------------------------------------------------------------ assignment (join tables)

  async assignHotel(ctx: AuthContext, itineraryId: string, hotelId: string): Promise<void> {
    assertCan(ctx, 'itinerary.write');
    const organizationId = requireOrg(ctx);
    await requireManagedItinerary(organizationId, itineraryId);
    const hotels = await itineraryRepository.findHotelsByIds(organizationId, [hotelId]);
    if (hotels.length === 0) throw Errors.notFound('Hotel not found');
    await itineraryRepository.assignHotel(organizationId, itineraryId, hotelId);
  },

  async unassignHotel(ctx: AuthContext, itineraryId: string, hotelId: string): Promise<void> {
    assertCan(ctx, 'itinerary.write');
    const organizationId = requireOrg(ctx);
    await requireManagedItinerary(organizationId, itineraryId);
    await itineraryRepository.unassignHotel(organizationId, itineraryId, hotelId);
  },

  async listAssignedHotels(ctx: AuthContext, itineraryId: string): Promise<HotelView[]> {
    assertCan(ctx, 'itinerary.read');
    const organizationId = requireOrg(ctx);
    await getOwnedItinerary(ctx, organizationId, itineraryId);
    const ids = await itineraryRepository.listAssignedHotelIds(organizationId, itineraryId);
    return itineraryRepository.findHotelsByIds(organizationId, ids);
  },

  async assignRestaurant(ctx: AuthContext, itineraryId: string, restaurantId: string): Promise<void> {
    assertCan(ctx, 'itinerary.write');
    const organizationId = requireOrg(ctx);
    await requireManagedItinerary(organizationId, itineraryId);
    const restaurants = await itineraryRepository.findRestaurantsByIds(organizationId, [restaurantId]);
    if (restaurants.length === 0) throw Errors.notFound('Restaurant not found');
    await itineraryRepository.assignRestaurant(organizationId, itineraryId, restaurantId);
  },

  async unassignRestaurant(ctx: AuthContext, itineraryId: string, restaurantId: string): Promise<void> {
    assertCan(ctx, 'itinerary.write');
    const organizationId = requireOrg(ctx);
    await requireManagedItinerary(organizationId, itineraryId);
    await itineraryRepository.unassignRestaurant(organizationId, itineraryId, restaurantId);
  },

  async listAssignedRestaurants(ctx: AuthContext, itineraryId: string): Promise<RestaurantView[]> {
    assertCan(ctx, 'itinerary.read');
    const organizationId = requireOrg(ctx);
    await getOwnedItinerary(ctx, organizationId, itineraryId);
    const ids = await itineraryRepository.listAssignedRestaurantIds(organizationId, itineraryId);
    return itineraryRepository.findRestaurantsByIds(organizationId, ids);
  },

  // ------------------------------------------------------------ hotel / restaurant ratings

  /** Staff-only 5-star rating, scoped to a hotel actually assigned to the
   * given itinerary (re-verified here, not trusted from the client) --
   * getOwnedItinerary's existing anti-BOLA check is what actually restricts
   * TOUR_GUIDE/DRIVER to only their own toured itineraries; a manager
   * (itinerary.write holder) can reach any itinerary and so effectively any
   * assigned hotel, matching the explicit "operators can rate any" design. */
  async rateHotel(ctx: AuthContext, itineraryId: string, hotelId: string, input: RateHotelInput): Promise<HotelRatingView> {
    assertCan(ctx, 'hotel_restaurant_rating.write');
    const organizationId = requireOrg(ctx);
    await getOwnedItinerary(ctx, organizationId, itineraryId);
    const assignedIds = await itineraryRepository.listAssignedHotelIds(organizationId, itineraryId);
    if (!assignedIds.includes(hotelId)) throw Errors.notFound('Hotel is not assigned to this itinerary');

    const rating = await itineraryRepository.upsertHotelRating(organizationId, hotelId, ctx.userId, input);
    await audit({
      actorUserId: ctx.userId,
      actorRole: ctx.roles[0],
      action: 'hotel.rated',
      resourceType: 'Hotel',
      resourceId: hotelId,
      organizationId,
      metadata: { itineraryId, rating: input.rating },
    });
    return rating;
  },

  /** The caller's own rating for a hotel, in the context of one of their
   * itineraries -- same anti-BOLA gate as rateHotel, read-only. */
  async getMyHotelRating(ctx: AuthContext, itineraryId: string, hotelId: string): Promise<HotelRatingView | null> {
    assertCan(ctx, 'itinerary.read');
    const organizationId = requireOrg(ctx);
    await getOwnedItinerary(ctx, organizationId, itineraryId);
    return itineraryRepository.getMyHotelRating(organizationId, hotelId, ctx.userId);
  },

  /** Restaurant counterpart to rateHotel -- identical shape/rules. */
  async rateRestaurant(
    ctx: AuthContext,
    itineraryId: string,
    restaurantId: string,
    input: RateRestaurantInput,
  ): Promise<RestaurantRatingView> {
    assertCan(ctx, 'hotel_restaurant_rating.write');
    const organizationId = requireOrg(ctx);
    await getOwnedItinerary(ctx, organizationId, itineraryId);
    const assignedIds = await itineraryRepository.listAssignedRestaurantIds(organizationId, itineraryId);
    if (!assignedIds.includes(restaurantId)) throw Errors.notFound('Restaurant is not assigned to this itinerary');

    const rating = await itineraryRepository.upsertRestaurantRating(organizationId, restaurantId, ctx.userId, input);
    await audit({
      actorUserId: ctx.userId,
      actorRole: ctx.roles[0],
      action: 'restaurant.rated',
      resourceType: 'Restaurant',
      resourceId: restaurantId,
      organizationId,
      metadata: { itineraryId, rating: input.rating },
    });
    return rating;
  },

  async getMyRestaurantRating(
    ctx: AuthContext,
    itineraryId: string,
    restaurantId: string,
  ): Promise<RestaurantRatingView | null> {
    assertCan(ctx, 'itinerary.read');
    const organizationId = requireOrg(ctx);
    await getOwnedItinerary(ctx, organizationId, itineraryId);
    return itineraryRepository.getMyRestaurantRating(organizationId, restaurantId, ctx.userId);
  },
};

// Shared by every manager-only mutation below getItinerary/updateItinerary --
// re-fetches for existence, but callers here are already itinerary.write
// holders (managers), so no anti-BOLA re-check is needed, just an org/exists
// check (same "manager-only, existence-only" shape as fleetService's
// vehicle/driver write paths).
async function requireManagedItinerary(organizationId: string, itineraryId: string): Promise<ItineraryView> {
  const itinerary = await itineraryRepository.findById(organizationId, itineraryId);
  if (!itinerary) throw Errors.notFound('Itinerary not found');
  return itinerary;
}

async function transition(ctx: AuthContext, itineraryId: string, to: 'DRAFT' | 'IN_REVIEW'): Promise<ItineraryView> {
  const organizationId = requireOrg(ctx);
  const existing = await itineraryRepository.findById(organizationId, itineraryId);
  if (!existing) throw Errors.notFound('Itinerary not found');
  if (!canTransition(existing.status, to)) {
    throw Errors.conflict(`Cannot transition itinerary from ${existing.status} to ${to}`);
  }
  const updated = await itineraryRepository.updateStatus(organizationId, itineraryId, to);
  if (!updated) throw Errors.notFound('Itinerary not found');
  await audit({
    actorUserId: ctx.userId,
    actorRole: ctx.roles[0],
    action: to === 'IN_REVIEW' ? 'itinerary.submitted_for_review' : 'itinerary.sent_back_to_draft',
    resourceType: 'Itinerary',
    resourceId: updated.id,
    organizationId,
  });
  return updated;
}

// Same "start + extraDays calendar days" arithmetic as catalog/domain.ts's
// computeDepartureEndDate -- a package template day's dayNumber is relative
// to the trip start, this converts it to the real calendar date once a
// specific booking's departure.startDate is known.
function addDaysToDate(startDate: Date, extraDays: number): Date {
  const d = new Date(startDate);
  d.setUTCDate(d.getUTCDate() + extraDays);
  return d;
}
