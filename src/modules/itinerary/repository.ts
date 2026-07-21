// itinerary module — repository. The only place that touches the DB for this module.
import type { Hotel, Itinerary, ItineraryDay, ItineraryStatus, Restaurant } from '@prisma/client';
import { withOrg } from '@lib/db';
import type {
  AddItineraryDayInput,
  CreateHotelInput,
  CreateItineraryInput,
  CreateRestaurantInput,
  HotelView,
  ItineraryDayView,
  ItineraryView,
  RestaurantView,
  UpdateHotelInput,
  UpdateItineraryDayInput,
  UpdateItineraryInput,
  UpdateRestaurantInput,
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
    plannedSites: d.plannedSites,
    activities: d.activities,
    estimatedTravelMinutes: d.estimatedTravelMinutes,
    notes: d.notes,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
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
   * Cascade to this itinerary's ItineraryDay/ItineraryHotel/
   * ItineraryRestaurant join rows (Hotel/Restaurant reference rows
   * themselves are untouched). Returns null (not an error) when the
   * booking never had an itinerary at all -- most bookings don't. */
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

  async addDay(organizationId: string, itineraryId: string, input: AddItineraryDayInput): Promise<ItineraryDayView> {
    return withOrg(organizationId, async (tx) => {
      const d = await tx.itineraryDay.create({ data: { organizationId, itineraryId, ...input } });
      return toDayView(d);
    });
  },

  async updateDay(
    organizationId: string,
    dayId: string,
    input: UpdateItineraryDayInput,
  ): Promise<ItineraryDayView | null> {
    return withOrg(organizationId, async (tx) => {
      const existing = await tx.itineraryDay.findUnique({ where: { id: dayId } });
      if (!existing) return null;
      const d = await tx.itineraryDay.update({ where: { id: dayId }, data: input });
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

  async listDays(organizationId: string, itineraryId: string): Promise<ItineraryDayView[]> {
    return withOrg(organizationId, async (tx) => {
      const rows = await tx.itineraryDay.findMany({ where: { itineraryId }, orderBy: { dayNumber: 'asc' } });
      return rows.map(toDayView);
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

  // ------------------------------------------------------------ assignment join tables

  async assignHotel(organizationId: string, itineraryId: string, hotelId: string): Promise<void> {
    await withOrg(organizationId, (tx) => tx.itineraryHotel.create({ data: { organizationId, itineraryId, hotelId } }));
  },

  async unassignHotel(organizationId: string, itineraryId: string, hotelId: string): Promise<void> {
    await withOrg(organizationId, (tx) =>
      tx.itineraryHotel.deleteMany({ where: { itineraryId, hotelId } }),
    );
  },

  async listAssignedHotelIds(organizationId: string, itineraryId: string): Promise<string[]> {
    return withOrg(organizationId, async (tx) => {
      const rows = await tx.itineraryHotel.findMany({ where: { itineraryId }, select: { hotelId: true } });
      return rows.map((r) => r.hotelId);
    });
  },

  async assignRestaurant(organizationId: string, itineraryId: string, restaurantId: string): Promise<void> {
    await withOrg(organizationId, (tx) =>
      tx.itineraryRestaurant.create({ data: { organizationId, itineraryId, restaurantId } }),
    );
  },

  async unassignRestaurant(organizationId: string, itineraryId: string, restaurantId: string): Promise<void> {
    await withOrg(organizationId, (tx) =>
      tx.itineraryRestaurant.deleteMany({ where: { itineraryId, restaurantId } }),
    );
  },

  async listAssignedRestaurantIds(organizationId: string, itineraryId: string): Promise<string[]> {
    return withOrg(organizationId, async (tx) => {
      const rows = await tx.itineraryRestaurant.findMany({ where: { itineraryId }, select: { restaurantId: true } });
      return rows.map((r) => r.restaurantId);
    });
  },
};
