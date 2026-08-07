// itinerary module — service. Business logic; orchestrates repository + rbac.
// Callable by other modules ONLY through index.ts (module boundary rule).
import type { ItineraryStatus, Role } from '@prisma/client';
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
  type CreateSiteInput,
  type HotelRatingView,
  type HotelView,
  type ItineraryDayView,
  type ItineraryView,
  type RateHotelInput,
  type RateRestaurantInput,
  type RestaurantRatingView,
  type RestaurantView,
  type SiteView,
  type UpdateHotelInput,
  type UpdateItineraryDayInput,
  type UpdateItineraryInput,
  type UpdateRestaurantInput,
  type UpdateSiteInput,
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

    // Explicit user direction: an emergency contact is the tourist's own
    // data, collected once already on the tour lead's Traveler row during
    // guest booking -- default the itinerary's copy from there instead of
    // asking staff to retype it from scratch. Still a plain input field
    // (not read-live from Traveler), same "prefill but staff can still
    // override" convention as the departure page's guide auto-assign --
    // staff may legitimately want a different on-the-ground contact (e.g.
    // a local ranger station, see the Relation field's placeholder).
    const travelers = await bookingService.listTravelers(ctx, bookingId);
    const tourLead = travelers.find((t) => t.isTourLead);
    const effectiveInput: CreateItineraryInput = {
      ...input,
      emergencyContactName: input.emergencyContactName ?? tourLead?.emergencyContactName ?? undefined,
      emergencyContactPhone: input.emergencyContactPhone ?? tourLead?.emergencyContactPhone ?? undefined,
      emergencyContactRelation: input.emergencyContactRelation ?? tourLead?.emergencyContactRelation ?? undefined,
    };

    const itinerary = await itineraryRepository.create(organizationId, bookingId, effectiveInput);
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
            await itineraryRepository.addDay(organizationId, itinerary.id, day.dayNumber, {
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

  /** Guest `/find-booking` lookup (no session at all): the page has already
   * independently verified the guest's two-factor bookingReference+last-name
   * match before reaching here, same "caller already gates" convention as
   * bookingService.listTravelersForDeparture (DR-030) and
   * assignmentService.listAssignmentsForRating (DR-037) -- deliberately not
   * a public REST route for the same reason. Returns just the bare status
   * (null when no itinerary exists yet), never the full ItineraryView (no
   * emergency-contact/notes exposure to an unauthenticated caller). */
  async getStatusForBookingLookup(organizationId: string, bookingId: string): Promise<ItineraryStatus | null> {
    const itinerary = await itineraryRepository.findByBookingId(organizationId, bookingId);
    return itinerary?.status ?? null;
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
    const itinerary = await requireManagedItinerary(organizationId, itineraryId);
    const dayNumber = await computeDayNumber(ctx, itinerary, input.date);
    if (input.hotelId) await requireHotelExists(organizationId, input.hotelId);
    if (input.restaurantId) await requireRestaurantExists(organizationId, input.restaurantId);
    return itineraryRepository.addDay(organizationId, itineraryId, dayNumber, input);
  },

  async updateDay(
    ctx: AuthContext,
    itineraryId: string,
    dayId: string,
    input: UpdateItineraryDayInput,
  ): Promise<ItineraryDayView> {
    assertCan(ctx, 'itinerary.write');
    const organizationId = requireOrg(ctx);
    const itinerary = await requireManagedItinerary(organizationId, itineraryId);
    const dayNumber = input.date ? await computeDayNumber(ctx, itinerary, input.date) : undefined;
    if (input.hotelId) await requireHotelExists(organizationId, input.hotelId);
    if (input.restaurantId) await requireRestaurantExists(organizationId, input.restaurantId);
    const updated = await itineraryRepository.updateDay(organizationId, dayId, input, dayNumber);
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

  /** Batch name resolution for the daily-schedule day cards (DR-083) -- each
   * ItineraryDay stores only a hotelId, this resolves the small (typically
   * <10) distinct set actually used across an itinerary's days in one query. */
  async listHotelsByIds(ctx: AuthContext, hotelIds: string[]): Promise<HotelView[]> {
    assertCan(ctx, 'itinerary.read');
    return itineraryRepository.findHotelsByIds(requireOrg(ctx), hotelIds);
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

  /** Restaurant counterpart to listHotelsByIds -- identical shape. */
  async listRestaurantsByIds(ctx: AuthContext, restaurantIds: string[]): Promise<RestaurantView[]> {
    assertCan(ctx, 'itinerary.read');
    return itineraryRepository.findRestaurantsByIds(requireOrg(ctx), restaurantIds);
  },

  // ------------------------------------------------------------ sites (reference data)

  async createSite(ctx: AuthContext, input: CreateSiteInput): Promise<SiteView> {
    assertCan(ctx, 'itinerary.write');
    return itineraryRepository.createSite(requireOrg(ctx), input);
  },

  async getSite(ctx: AuthContext, siteId: string): Promise<SiteView> {
    assertCan(ctx, 'itinerary.read');
    const site = await itineraryRepository.findSiteById(requireOrg(ctx), siteId);
    if (!site) throw Errors.notFound('Site not found');
    return site;
  },

  async updateSite(ctx: AuthContext, siteId: string, input: UpdateSiteInput): Promise<SiteView> {
    assertCan(ctx, 'itinerary.write');
    const updated = await itineraryRepository.updateSite(requireOrg(ctx), siteId, input);
    if (!updated) throw Errors.notFound('Site not found');
    return updated;
  },

  async deleteSite(ctx: AuthContext, siteId: string): Promise<void> {
    assertCan(ctx, 'itinerary.write');
    const removed = await itineraryRepository.deleteSite(requireOrg(ctx), siteId);
    if (!removed) throw Errors.notFound('Site not found');
  },

  async listSites(ctx: AuthContext): Promise<SiteView[]> {
    assertCan(ctx, 'itinerary.read');
    return itineraryRepository.listSites(requireOrg(ctx));
  },

  /** Powers the day form's "planned sites" picker, scoped to the itinerary's
   * own package country -- staff building a day plan only sees sites
   * relevant to where the trip actually is. */
  async listSitesForCountry(ctx: AuthContext, country: string): Promise<SiteView[]> {
    assertCan(ctx, 'itinerary.read');
    return itineraryRepository.listSitesForCountry(requireOrg(ctx), country);
  },

  // ------------------------------------------------------------ hotel / restaurant ratings

  /** Anti-BOLA scope for TOUR_GUIDE/DRIVER (DR-083): hotels actually used
   * (ItineraryDay.hotelId) on one of the caller's own assigned itineraries.
   * Consulted only for non-managers -- a manager (itinerary.write holder)
   * may rate any hotel, matching the pre-existing "operators can rate any"
   * design. Also used by the hotel profile page to decide page-level
   * access (404 for a hotel a guide/driver never actually toured). */
  async listMyRateableHotelIds(ctx: AuthContext): Promise<string[]> {
    assertCan(ctx, 'itinerary.read');
    return myRateableHotelIds(ctx, requireOrg(ctx));
  },

  /** Restaurant counterpart to listMyRateableHotelIds -- identical shape. */
  async listMyRateableRestaurantIds(ctx: AuthContext): Promise<string[]> {
    assertCan(ctx, 'itinerary.read');
    return myRateableRestaurantIds(ctx, requireOrg(ctx));
  },

  /** Staff-only 5-star rating, now scoped to the hotel directly (DR-083:
   * moved off the itinerary page onto /staff/hotels/[hotelId], no
   * itineraryId in scope anymore). Non-managers are restricted to a hotel
   * they've actually toured (listMyRateableHotelIds); managers may rate any. */
  async rateHotel(ctx: AuthContext, hotelId: string, input: RateHotelInput): Promise<HotelRatingView> {
    assertCan(ctx, 'hotel_restaurant_rating.write');
    const organizationId = requireOrg(ctx);
    const hotel = await itineraryRepository.findHotelById(organizationId, hotelId);
    if (!hotel) throw Errors.notFound('Hotel not found');
    if (!isItineraryManager(ctx.roles)) {
      const rateableIds = await myRateableHotelIds(ctx, organizationId);
      if (!rateableIds.includes(hotelId)) throw Errors.notFound('Hotel not found');
    }

    const rating = await itineraryRepository.upsertHotelRating(organizationId, hotelId, ctx.userId, input);
    await audit({
      actorUserId: ctx.userId,
      actorRole: ctx.roles[0],
      action: 'hotel.rated',
      resourceType: 'Hotel',
      resourceId: hotelId,
      organizationId,
      metadata: { rating: input.rating },
    });
    return rating;
  },

  /** The caller's own rating for a hotel -- read-only, no anti-BOLA gate of
   * its own (a rating that doesn't exist yet is simply null; the write path
   * above is where access is actually enforced). */
  async getMyHotelRating(ctx: AuthContext, hotelId: string): Promise<HotelRatingView | null> {
    assertCan(ctx, 'itinerary.read');
    const organizationId = requireOrg(ctx);
    return itineraryRepository.getMyHotelRating(organizationId, hotelId, ctx.userId);
  },

  /** Restaurant counterpart to rateHotel -- identical shape/rules. */
  async rateRestaurant(ctx: AuthContext, restaurantId: string, input: RateRestaurantInput): Promise<RestaurantRatingView> {
    assertCan(ctx, 'hotel_restaurant_rating.write');
    const organizationId = requireOrg(ctx);
    const restaurant = await itineraryRepository.findRestaurantById(organizationId, restaurantId);
    if (!restaurant) throw Errors.notFound('Restaurant not found');
    if (!isItineraryManager(ctx.roles)) {
      const rateableIds = await myRateableRestaurantIds(ctx, organizationId);
      if (!rateableIds.includes(restaurantId)) throw Errors.notFound('Restaurant not found');
    }

    const rating = await itineraryRepository.upsertRestaurantRating(organizationId, restaurantId, ctx.userId, input);
    await audit({
      actorUserId: ctx.userId,
      actorRole: ctx.roles[0],
      action: 'restaurant.rated',
      resourceType: 'Restaurant',
      resourceId: restaurantId,
      organizationId,
      metadata: { rating: input.rating },
    });
    return rating;
  },

  async getMyRestaurantRating(ctx: AuthContext, restaurantId: string): Promise<RestaurantRatingView | null> {
    assertCan(ctx, 'itinerary.read');
    const organizationId = requireOrg(ctx);
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

function diffInCalendarDays(a: Date, b: Date): number {
  const utcA = Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate());
  const utcB = Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate());
  return Math.round((utcA - utcB) / 86_400_000);
}

/** The trip's own start date, resolved the same way the itinerary detail
 * page already displays "travel dates": a PREDEFINED_PACKAGE booking's real
 * Departure.startDate, or a converted TAILOR_MADE booking's
 * customTravelStart. Throws (not null) -- a booking with neither means
 * travel dates were never set, and adding a dated day makes no sense yet. */
async function resolveTripStartDate(ctx: AuthContext, itinerary: ItineraryView): Promise<Date> {
  const booking = await bookingService.getById(ctx, itinerary.bookingId);
  if (booking.departureId) {
    const { departure } = await catalogService.getDepartureDetail(ctx, booking.departureId);
    return departure.startDate;
  }
  if (booking.customTravelStart) return booking.customTravelStart;
  throw Errors.conflict("This booking has no travel start date yet -- set travel dates before adding itinerary days.");
}

/** Explicit user direction: dayNumber is never client-supplied -- it's
 * derived from `date` relative to the trip's own start date, so it can
 * never disagree with the date staff actually picked. */
async function computeDayNumber(ctx: AuthContext, itinerary: ItineraryView, date: Date): Promise<number> {
  const startDate = await resolveTripStartDate(ctx, itinerary);
  const dayNumber = diffInCalendarDays(date, startDate) + 1;
  if (dayNumber < 1) {
    throw Errors.validation(`Date is before the trip's start date (${startDate.toISOString().slice(0, 10)})`);
  }
  return dayNumber;
}

async function requireHotelExists(organizationId: string, hotelId: string): Promise<void> {
  const hotel = await itineraryRepository.findHotelById(organizationId, hotelId);
  if (!hotel) throw Errors.notFound('Hotel not found');
}

async function requireRestaurantExists(organizationId: string, restaurantId: string): Promise<void> {
  const restaurant = await itineraryRepository.findRestaurantById(organizationId, restaurantId);
  if (!restaurant) throw Errors.notFound('Restaurant not found');
}

/** Same departureIds resolution as the public listMine() -- factored out so
 * the rateable-hotel/restaurant helpers below don't need to re-derive it. */
async function myAssignedItineraryIds(ctx: AuthContext, organizationId: string): Promise<string[]> {
  const assignments = await assignmentService.listMyAssignments(ctx);
  const departureIds = [...new Set(assignments.map((a) => a.departureId))];
  const itineraries = await itineraryRepository.listForDepartureIds(organizationId, departureIds);
  return itineraries.map((i) => i.id);
}

async function myRateableHotelIds(ctx: AuthContext, organizationId: string): Promise<string[]> {
  const itineraryIds = await myAssignedItineraryIds(ctx, organizationId);
  const days = await itineraryRepository.listDaysForItineraries(organizationId, itineraryIds);
  return [...new Set(days.map((d) => d.hotelId).filter((id): id is string => id !== null))];
}

async function myRateableRestaurantIds(ctx: AuthContext, organizationId: string): Promise<string[]> {
  const itineraryIds = await myAssignedItineraryIds(ctx, organizationId);
  const days = await itineraryRepository.listDaysForItineraries(organizationId, itineraryIds);
  return [...new Set(days.map((d) => d.restaurantId).filter((id): id is string => id !== null))];
}
