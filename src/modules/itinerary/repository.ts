// itinerary module — repository. The only place that touches the DB for this module.
import type {
  Hotel,
  HotelRating,
  Itinerary,
  ItineraryDay,
  ItineraryDaySite,
  ItineraryStatus,
  Restaurant,
  RestaurantRating,
  Site,
} from '@prisma/client';
import { withOrg } from '@lib/db';
import type {
  AddItineraryDayInput,
  CreateHotelInput,
  CreateItineraryInput,
  CreateRestaurantInput,
  CreateSiteInput,
  HotelRatingView,
  HotelView,
  ItineraryDaySiteView,
  ItineraryDayView,
  ItineraryView,
  RateHotelInput,
  RateRestaurantInput,
  RestaurantRatingView,
  RestaurantView,
  SiteView,
  UpdateHotelInput,
  UpdateItineraryDayInput,
  UpdateItineraryInput,
  UpdateRestaurantInput,
  UpdateSiteInput,
} from './domain';

function toItineraryView(i: Itinerary): ItineraryView {
  return {
    id: i.id,
    organizationId: i.organizationId,
    bookingId: i.bookingId,
    status: i.status,
    notes: i.notes,
    emergencyContactName: i.emergencyContactName,
    emergencyContactPhone: i.emergencyContactPhone,
    emergencyContactRelation: i.emergencyContactRelation,
    approvedAt: i.approvedAt,
    approvedByUserId: i.approvedByUserId,
    createdAt: i.createdAt,
    updatedAt: i.updatedAt,
  };
}

function toDayView(d: ItineraryDay): ItineraryDayView {
  return {
    id: d.id,
    organizationId: d.organizationId,
    itineraryId: d.itineraryId,
    dayNumber: d.dayNumber,
    date: d.date,
    departureTime: d.departureTime,
    arrivalTime: d.arrivalTime,
    pickupLocation: d.pickupLocation,
    dropoffLocation: d.dropoffLocation,
    pickupLatitude: d.pickupLatitude,
    pickupLongitude: d.pickupLongitude,
    dropoffLatitude: d.dropoffLatitude,
    dropoffLongitude: d.dropoffLongitude,
    activities: d.activities,
    estimatedTravelMinutes: d.estimatedTravelMinutes,
    notes: d.notes,
    hotelId: d.hotelId,
    restaurantId: d.restaurantId,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
}

function toDaySiteView(s: ItineraryDaySite): ItineraryDaySiteView {
  return {
    id: s.id,
    itineraryDayId: s.itineraryDayId,
    siteId: s.siteId,
    sequence: s.sequence,
  };
}

function toSiteView(s: Site): SiteView {
  return {
    id: s.id,
    organizationId: s.organizationId,
    name: s.name,
    country: s.country,
    province: s.province,
    city: s.city,
    latitude: s.latitude,
    longitude: s.longitude,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  };
}

function toHotelView(h: Hotel): HotelView {
  return {
    id: h.id,
    organizationId: h.organizationId,
    name: h.name,
    country: h.country,
    address: h.address,
    contactName: h.contactName,
    contactPhone: h.contactPhone,
    contactEmail: h.contactEmail,
    latitude: h.latitude,
    longitude: h.longitude,
    averageRating: h.averageRating,
    ratingCount: h.ratingCount,
    createdAt: h.createdAt,
    updatedAt: h.updatedAt,
  };
}

function toRestaurantView(r: Restaurant): RestaurantView {
  return {
    id: r.id,
    organizationId: r.organizationId,
    name: r.name,
    country: r.country,
    address: r.address,
    contactName: r.contactName,
    contactPhone: r.contactPhone,
    contactEmail: r.contactEmail,
    latitude: r.latitude,
    longitude: r.longitude,
    averageRating: r.averageRating,
    ratingCount: r.ratingCount,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

function toHotelRatingView(r: HotelRating): HotelRatingView {
  return {
    id: r.id,
    hotelId: r.hotelId,
    raterUserId: r.raterUserId,
    rating: r.rating,
    comment: r.comment,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

function toRestaurantRatingView(r: RestaurantRating): RestaurantRatingView {
  return {
    id: r.id,
    restaurantId: r.restaurantId,
    raterUserId: r.raterUserId,
    rating: r.rating,
    comment: r.comment,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

export const itineraryRepository = {
  async create(organizationId: string, bookingId: string, input: CreateItineraryInput): Promise<ItineraryView> {
    return withOrg(organizationId, async (tx) => {
      const i = await tx.itinerary.create({ data: { organizationId, bookingId, ...input } });
      return toItineraryView(i);
    });
  },

  async findById(organizationId: string, id: string): Promise<ItineraryView | null> {
    return withOrg(organizationId, async (tx) => {
      const i = await tx.itinerary.findUnique({ where: { id } });
      return i ? toItineraryView(i) : null;
    });
  },

  async findByBookingId(organizationId: string, bookingId: string): Promise<ItineraryView | null> {
    return withOrg(organizationId, async (tx) => {
      const i = await tx.itinerary.findUnique({ where: { bookingId } });
      return i ? toItineraryView(i) : null;
    });
  },

  async listAll(organizationId: string): Promise<ItineraryView[]> {
    return withOrg(organizationId, async (tx) => {
      const rows = await tx.itinerary.findMany({ orderBy: { createdAt: 'desc' } });
      return rows.map(toItineraryView);
    });
  },

  /** DR-059 follow-up: cascade cleanup when a Booking is deleted -- a real
   * hard delete (not soft), cascading via the schema's own onDelete:
   * Cascade to this itinerary's ItineraryDay rows (Hotel/Restaurant
   * reference rows themselves are untouched). Returns null (not an error)
   * when the booking never had an itinerary at all -- most bookings don't. */
  async deleteByBookingId(organizationId: string, bookingId: string): Promise<ItineraryView | null> {
    return withOrg(organizationId, async (tx) => {
      const existing = await tx.itinerary.findUnique({ where: { bookingId } });
      if (!existing) return null;
      await tx.itinerary.delete({ where: { id: existing.id } });
      return toItineraryView(existing);
    });
  },

  /** Guides Module / My Schedule-style scoping (DR-030/031): itineraries
   * whose booking sits on one of the caller's own assigned departures --
   * itineraryService resolves departureIds via assignmentService first. */
  async listForDepartureIds(organizationId: string, departureIds: string[]): Promise<ItineraryView[]> {
    if (departureIds.length === 0) return [];
    return withOrg(organizationId, async (tx) => {
      const rows = await tx.itinerary.findMany({
        where: { booking: { departureId: { in: departureIds } } },
        orderBy: { createdAt: 'desc' },
      });
      return rows.map(toItineraryView);
    });
  },

  async update(organizationId: string, id: string, input: UpdateItineraryInput): Promise<ItineraryView | null> {
    return withOrg(organizationId, async (tx) => {
      const existing = await tx.itinerary.findUnique({ where: { id } });
      if (!existing) return null;
      const i = await tx.itinerary.update({ where: { id }, data: input });
      return toItineraryView(i);
    });
  },

  async updateStatus(
    organizationId: string,
    id: string,
    to: ItineraryStatus,
    approvedBy?: { userId: string; at: Date },
  ): Promise<ItineraryView | null> {
    return withOrg(organizationId, async (tx) => {
      const existing = await tx.itinerary.findUnique({ where: { id } });
      if (!existing) return null;
      const i = await tx.itinerary.update({
        where: { id },
        data: {
          status: to,
          approvedAt: to === 'APPROVED' ? (approvedBy?.at ?? new Date()) : existing.approvedAt,
          approvedByUserId: to === 'APPROVED' ? (approvedBy?.userId ?? existing.approvedByUserId) : existing.approvedByUserId,
        },
      });
      return toItineraryView(i);
    });
  },

  // ------------------------------------------------------------ days

  /** dayNumber is computed by the service (from `input.date` relative to the
   * trip's start date), not part of AddItineraryDayInput -- passed in
   * explicitly here rather than smuggled onto the input object. */
  async addDay(
    organizationId: string,
    itineraryId: string,
    dayNumber: number,
    input: AddItineraryDayInput,
  ): Promise<ItineraryDayView> {
    return withOrg(organizationId, async (tx) => {
      const d = await tx.itineraryDay.create({ data: { organizationId, itineraryId, dayNumber, ...input } });
      return toDayView(d);
    });
  },

  /** dayNumber, when provided, is a service-computed recomputation triggered
   * by a `date` change (same reasoning as addDay) -- omitted (undefined)
   * when the update didn't touch `date`, leaving it as-is. */
  async updateDay(
    organizationId: string,
    dayId: string,
    input: UpdateItineraryDayInput,
    dayNumber?: number,
  ): Promise<ItineraryDayView | null> {
    return withOrg(organizationId, async (tx) => {
      const existing = await tx.itineraryDay.findUnique({ where: { id: dayId } });
      if (!existing) return null;
      const d = await tx.itineraryDay.update({ where: { id: dayId }, data: { ...input, dayNumber } });
      return toDayView(d);
    });
  },

  async removeDay(organizationId: string, dayId: string): Promise<boolean> {
    return withOrg(organizationId, async (tx) => {
      const existing = await tx.itineraryDay.findUnique({ where: { id: dayId } });
      if (!existing) return false;
      await tx.itineraryDay.delete({ where: { id: dayId } });
      return true;
    });
  },

  async findDayById(organizationId: string, dayId: string): Promise<ItineraryDayView | null> {
    return withOrg(organizationId, async (tx) => {
      const d = await tx.itineraryDay.findUnique({ where: { id: dayId } });
      return d ? toDayView(d) : null;
    });
  },

  async listDays(organizationId: string, itineraryId: string): Promise<ItineraryDayView[]> {
    return withOrg(organizationId, async (tx) => {
      const rows = await tx.itineraryDay.findMany({ where: { itineraryId }, orderBy: { dayNumber: 'asc' } });
      return rows.map(toDayView);
    });
  },

  /** Anti-BOLA helper for TOUR_GUIDE/DRIVER rating scope (DR-083): every day
   * across a set of itineraries, used to derive "hotels/restaurants I've
   * actually toured" without a per-itinerary join table. */
  async listDaysForItineraries(organizationId: string, itineraryIds: string[]): Promise<ItineraryDayView[]> {
    if (itineraryIds.length === 0) return [];
    return withOrg(organizationId, async (tx) => {
      const rows = await tx.itineraryDay.findMany({ where: { itineraryId: { in: itineraryIds } } });
      return rows.map(toDayView);
    });
  },

  // ------------------------------------------------------------ day sites (ordered stops)

  async listDaySites(organizationId: string, itineraryDayId: string): Promise<ItineraryDaySiteView[]> {
    return withOrg(organizationId, async (tx) => {
      const rows = await tx.itineraryDaySite.findMany({ where: { itineraryDayId }, orderBy: { sequence: 'asc' } });
      return rows.map(toDaySiteView);
    });
  },

  /** Always appends at the end (max existing sequence + 1) -- staff reorder
   * afterward via moveDaySite. Gaps left behind by a removal are harmless
   * since every read orders by `sequence asc`, never assumes contiguity. */
  async addDaySite(organizationId: string, itineraryDayId: string, siteId: string): Promise<ItineraryDaySiteView> {
    return withOrg(organizationId, async (tx) => {
      const max = await tx.itineraryDaySite.aggregate({ where: { itineraryDayId }, _max: { sequence: true } });
      const s = await tx.itineraryDaySite.create({
        data: { organizationId, itineraryDayId, siteId, sequence: (max._max.sequence ?? 0) + 1 },
      });
      return toDaySiteView(s);
    });
  },

  async removeDaySite(organizationId: string, itineraryDayId: string, siteId: string): Promise<boolean> {
    return withOrg(organizationId, async (tx) => {
      const existing = await tx.itineraryDaySite.findUnique({ where: { itineraryDayId_siteId: { itineraryDayId, siteId } } });
      if (!existing) return false;
      await tx.itineraryDaySite.delete({ where: { id: existing.id } });
      return true;
    });
  },

  /** Swaps this site's sequence with its immediate neighbor in the given
   * direction -- a no-op (returns false) at either end of the list.
   * withOrg already runs its whole callback inside one transaction, and
   * `@@unique([itineraryDayId, sequence])` is not DEFERRABLE, so a direct
   * two-update swap would transiently collide (Postgres checks a unique
   * constraint immediately after each statement, not at commit). Routing
   * through an unused sentinel value avoids that -- addDaySite only ever
   * assigns positive sequences, so a negative one can never collide. */
  async moveDaySite(
    organizationId: string,
    itineraryDayId: string,
    siteId: string,
    direction: 'up' | 'down',
  ): Promise<boolean> {
    return withOrg(organizationId, async (tx) => {
      const rows = await tx.itineraryDaySite.findMany({ where: { itineraryDayId }, orderBy: { sequence: 'asc' } });
      const index = rows.findIndex((r) => r.siteId === siteId);
      if (index === -1) return false;
      const neighborIndex = direction === 'up' ? index - 1 : index + 1;
      if (neighborIndex < 0 || neighborIndex >= rows.length) return false;
      const current = rows[index];
      const neighbor = rows[neighborIndex];
      if (!current || !neighbor) return false;
      await tx.itineraryDaySite.update({ where: { id: current.id }, data: { sequence: -1 } });
      await tx.itineraryDaySite.update({ where: { id: neighbor.id }, data: { sequence: current.sequence } });
      await tx.itineraryDaySite.update({ where: { id: current.id }, data: { sequence: neighbor.sequence } });
      return true;
    });
  },

  // ------------------------------------------------------------ hotels / restaurants (reference data)

  async createHotel(organizationId: string, input: CreateHotelInput): Promise<HotelView> {
    return withOrg(organizationId, async (tx) => {
      const h = await tx.hotel.create({ data: { organizationId, ...input } });
      return toHotelView(h);
    });
  },

  async updateHotel(organizationId: string, id: string, input: UpdateHotelInput): Promise<HotelView | null> {
    return withOrg(organizationId, async (tx) => {
      const existing = await tx.hotel.findUnique({ where: { id } });
      if (!existing || existing.deletedAt) return null;
      const h = await tx.hotel.update({ where: { id }, data: input });
      return toHotelView(h);
    });
  },

  async deleteHotel(organizationId: string, id: string): Promise<boolean> {
    return withOrg(organizationId, async (tx) => {
      const existing = await tx.hotel.findUnique({ where: { id } });
      if (!existing || existing.deletedAt) return false;
      await tx.hotel.update({ where: { id }, data: { deletedAt: new Date() } });
      return true;
    });
  },

  async findHotelById(organizationId: string, id: string): Promise<HotelView | null> {
    return withOrg(organizationId, async (tx) => {
      const h = await tx.hotel.findUnique({ where: { id } });
      if (!h || h.deletedAt) return null;
      return toHotelView(h);
    });
  },

  async listHotels(organizationId: string): Promise<HotelView[]> {
    return withOrg(organizationId, async (tx) => {
      const rows = await tx.hotel.findMany({ where: { deletedAt: null }, orderBy: { name: 'asc' } });
      return rows.map(toHotelView);
    });
  },

  async findHotelsByIds(organizationId: string, ids: string[]): Promise<HotelView[]> {
    if (ids.length === 0) return [];
    return withOrg(organizationId, async (tx) => {
      const rows = await tx.hotel.findMany({ where: { id: { in: ids }, deletedAt: null } });
      return rows.map(toHotelView);
    });
  },

  async createRestaurant(organizationId: string, input: CreateRestaurantInput): Promise<RestaurantView> {
    return withOrg(organizationId, async (tx) => {
      const r = await tx.restaurant.create({ data: { organizationId, ...input } });
      return toRestaurantView(r);
    });
  },

  async updateRestaurant(
    organizationId: string,
    id: string,
    input: UpdateRestaurantInput,
  ): Promise<RestaurantView | null> {
    return withOrg(organizationId, async (tx) => {
      const existing = await tx.restaurant.findUnique({ where: { id } });
      if (!existing || existing.deletedAt) return null;
      const r = await tx.restaurant.update({ where: { id }, data: input });
      return toRestaurantView(r);
    });
  },

  async deleteRestaurant(organizationId: string, id: string): Promise<boolean> {
    return withOrg(organizationId, async (tx) => {
      const existing = await tx.restaurant.findUnique({ where: { id } });
      if (!existing || existing.deletedAt) return false;
      await tx.restaurant.update({ where: { id }, data: { deletedAt: new Date() } });
      return true;
    });
  },

  async findRestaurantById(organizationId: string, id: string): Promise<RestaurantView | null> {
    return withOrg(organizationId, async (tx) => {
      const r = await tx.restaurant.findUnique({ where: { id } });
      if (!r || r.deletedAt) return null;
      return toRestaurantView(r);
    });
  },

  async listRestaurants(organizationId: string): Promise<RestaurantView[]> {
    return withOrg(organizationId, async (tx) => {
      const rows = await tx.restaurant.findMany({ where: { deletedAt: null }, orderBy: { name: 'asc' } });
      return rows.map(toRestaurantView);
    });
  },

  async findRestaurantsByIds(organizationId: string, ids: string[]): Promise<RestaurantView[]> {
    if (ids.length === 0) return [];
    return withOrg(organizationId, async (tx) => {
      const rows = await tx.restaurant.findMany({ where: { id: { in: ids }, deletedAt: null } });
      return rows.map(toRestaurantView);
    });
  },

  // ------------------------------------------------------------ sites (reference data)

  async createSite(organizationId: string, input: CreateSiteInput): Promise<SiteView> {
    return withOrg(organizationId, async (tx) => {
      const s = await tx.site.create({ data: { organizationId, ...input } });
      return toSiteView(s);
    });
  },

  async updateSite(organizationId: string, id: string, input: UpdateSiteInput): Promise<SiteView | null> {
    return withOrg(organizationId, async (tx) => {
      const existing = await tx.site.findUnique({ where: { id } });
      if (!existing || existing.deletedAt) return null;
      const s = await tx.site.update({ where: { id }, data: input });
      return toSiteView(s);
    });
  },

  /** Soft-delete (matches Hotel/Restaurant) -- a hard delete would FK-violate
   * or corrupt any ItineraryDaySite row already referencing this Site. */
  async deleteSite(organizationId: string, id: string): Promise<boolean> {
    return withOrg(organizationId, async (tx) => {
      const existing = await tx.site.findUnique({ where: { id } });
      if (!existing || existing.deletedAt) return false;
      await tx.site.update({ where: { id }, data: { deletedAt: new Date() } });
      return true;
    });
  },

  async findSiteById(organizationId: string, id: string): Promise<SiteView | null> {
    return withOrg(organizationId, async (tx) => {
      const s = await tx.site.findUnique({ where: { id } });
      if (!s || s.deletedAt) return null;
      return toSiteView(s);
    });
  },

  async findSitesByIds(organizationId: string, ids: string[]): Promise<SiteView[]> {
    if (ids.length === 0) return [];
    return withOrg(organizationId, async (tx) => {
      const rows = await tx.site.findMany({ where: { id: { in: ids }, deletedAt: null } });
      return rows.map(toSiteView);
    });
  },

  async listSites(organizationId: string): Promise<SiteView[]> {
    return withOrg(organizationId, async (tx) => {
      const rows = await tx.site.findMany({ where: { deletedAt: null }, orderBy: [{ country: 'asc' }, { name: 'asc' }] });
      return rows.map(toSiteView);
    });
  },

  async listSitesForCountry(organizationId: string, country: string): Promise<SiteView[]> {
    return withOrg(organizationId, async (tx) => {
      const rows = await tx.site.findMany({ where: { country, deletedAt: null }, orderBy: { name: 'asc' } });
      return rows.map(toSiteView);
    });
  },

  // ------------------------------------------------------------ hotel / restaurant ratings

  /** One row per (hotel, rater) -- overwritten on each revisit, not
   * accumulated. Recomputes Hotel.averageRating/ratingCount in the same
   * transaction so the aggregate is never momentarily stale. */
  async upsertHotelRating(
    organizationId: string,
    hotelId: string,
    raterUserId: string,
    input: RateHotelInput,
  ): Promise<HotelRatingView> {
    return withOrg(organizationId, async (tx) => {
      const r = await tx.hotelRating.upsert({
        where: { hotelId_raterUserId: { hotelId, raterUserId } },
        create: { organizationId, hotelId, raterUserId, ...input },
        update: { rating: input.rating, comment: input.comment },
      });
      const agg = await tx.hotelRating.aggregate({ where: { hotelId }, _avg: { rating: true }, _count: true });
      await tx.hotel.update({
        where: { id: hotelId },
        data: { averageRating: agg._avg.rating, ratingCount: agg._count },
      });
      return toHotelRatingView(r);
    });
  },

  async getMyHotelRating(organizationId: string, hotelId: string, raterUserId: string): Promise<HotelRatingView | null> {
    return withOrg(organizationId, async (tx) => {
      const r = await tx.hotelRating.findUnique({ where: { hotelId_raterUserId: { hotelId, raterUserId } } });
      return r ? toHotelRatingView(r) : null;
    });
  },

  /** Restaurant counterpart to upsertHotelRating -- identical shape. */
  async upsertRestaurantRating(
    organizationId: string,
    restaurantId: string,
    raterUserId: string,
    input: RateRestaurantInput,
  ): Promise<RestaurantRatingView> {
    return withOrg(organizationId, async (tx) => {
      const r = await tx.restaurantRating.upsert({
        where: { restaurantId_raterUserId: { restaurantId, raterUserId } },
        create: { organizationId, restaurantId, raterUserId, ...input },
        update: { rating: input.rating, comment: input.comment },
      });
      const agg = await tx.restaurantRating.aggregate({ where: { restaurantId }, _avg: { rating: true }, _count: true });
      await tx.restaurant.update({
        where: { id: restaurantId },
        data: { averageRating: agg._avg.rating, ratingCount: agg._count },
      });
      return toRestaurantRatingView(r);
    });
  },

  async getMyRestaurantRating(
    organizationId: string,
    restaurantId: string,
    raterUserId: string,
  ): Promise<RestaurantRatingView | null> {
    return withOrg(organizationId, async (tx) => {
      const r = await tx.restaurantRating.findUnique({
        where: { restaurantId_raterUserId: { restaurantId, raterUserId } },
      });
      return r ? toRestaurantRatingView(r) : null;
    });
  },
};
