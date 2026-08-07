// itinerary module — domain types & rules. Pure; no framework or DB imports.
import type { ItineraryStatus } from '@prisma/client';
import { z } from 'zod';
import { PROVINCES_BY_COUNTRY, SITE_COUNTRY_CODES } from '@lib/provinces';

export interface ItineraryView {
  id: string;
  organizationId: string;
  bookingId: string;
  status: ItineraryStatus;
  notes: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  emergencyContactRelation: string | null;
  approvedAt: Date | null;
  approvedByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ItineraryDayView {
  id: string;
  organizationId: string;
  itineraryId: string;
  dayNumber: number;
  date: Date;
  departureTime: string | null;
  arrivalTime: string | null;
  pickupLocation: string | null;
  dropoffLocation: string | null;
  plannedSites: string | null;
  activities: string | null;
  estimatedTravelMinutes: number | null;
  notes: string | null;
  // DR-083: per-day lodging/dining, replacing the old itinerary-wide
  // ItineraryHotel/ItineraryRestaurant join tables.
  hotelId: string | null;
  restaurantId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface HotelView {
  id: string;
  organizationId: string;
  name: string;
  country: string;
  address: string | null;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  // Staff-only 5-star rating, live-recomputed from HotelRating on every
  // submission -- null/0 until the first rating exists.
  averageRating: number | null;
  ratingCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface RestaurantView {
  id: string;
  organizationId: string;
  name: string;
  country: string;
  address: string | null;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  averageRating: number | null;
  ratingCount: number;
  createdAt: Date;
  updatedAt: Date;
}

// Staff-only hotel/restaurant rating -- one row per (hotel-or-restaurant,
// staff rater), overwritten on each revisit rather than accumulating a new
// row per visit (explicit user choice). Distinct from the tourist-facing
// ratings module's Review/ReviewSubjectRating (DRIVER/GUIDE only).
export interface HotelRatingView {
  id: string;
  hotelId: string;
  raterUserId: string;
  rating: number;
  comment: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface RestaurantRatingView {
  id: string;
  restaurantId: string;
  raterUserId: string;
  rating: number;
  comment: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export const RateHotelInput = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(1000).optional(),
});
export type RateHotelInput = z.infer<typeof RateHotelInput>;

export const RateRestaurantInput = RateHotelInput;
export type RateRestaurantInput = z.infer<typeof RateRestaurantInput>;

export const CreateItineraryInput = z.object({
  notes: z.string().max(2000).optional(),
  emergencyContactName: z.string().max(200).optional(),
  emergencyContactPhone: z.string().max(50).optional(),
  emergencyContactRelation: z.string().max(100).optional(),
});
export type CreateItineraryInput = z.infer<typeof CreateItineraryInput>;

export const UpdateItineraryInput = CreateItineraryInput.partial();
export type UpdateItineraryInput = z.infer<typeof UpdateItineraryInput>;

// 24h "HH:MM" -- no existing time-of-day type in this schema, and timezone
// precision isn't needed for a same-day local activity time.
const TIME_HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

// dayNumber is deliberately NOT in this input -- explicit user direction: a
// separate manually-typed day number was redundant with `date` and
// error-prone (staff could enter a date and day number that disagreed).
// The service computes it from `date` relative to the trip's own start
// date instead (see itineraryService.addDay/resolveTripStartDate).
export const AddItineraryDayInput = z.object({
  date: z.coerce.date(),
  departureTime: z.string().regex(TIME_HHMM).optional(),
  arrivalTime: z.string().regex(TIME_HHMM).optional(),
  pickupLocation: z.string().max(500).optional(),
  dropoffLocation: z.string().max(500).optional(),
  plannedSites: z.string().max(2000).optional(),
  activities: z.string().max(2000).optional(),
  estimatedTravelMinutes: z.number().int().nonnegative().optional(),
  notes: z.string().max(2000).optional(),
  hotelId: z.string().uuid().optional(),
  restaurantId: z.string().uuid().optional(),
});
export type AddItineraryDayInput = z.infer<typeof AddItineraryDayInput>;

export const UpdateItineraryDayInput = AddItineraryDayInput.partial();
export type UpdateItineraryDayInput = z.infer<typeof UpdateItineraryDayInput>;

export const CreateHotelInput = z.object({
  name: z.string().min(1).max(200),
  country: z.string().length(2),
  address: z.string().max(500).optional(),
  contactName: z.string().max(200).optional(),
  contactPhone: z.string().max(50).optional(),
  contactEmail: z.string().email().optional(),
});
export type CreateHotelInput = z.infer<typeof CreateHotelInput>;

export const UpdateHotelInput = CreateHotelInput.partial();
export type UpdateHotelInput = z.infer<typeof UpdateHotelInput>;

export const CreateRestaurantInput = CreateHotelInput;
export type CreateRestaurantInput = z.infer<typeof CreateRestaurantInput>;

export const UpdateRestaurantInput = UpdateHotelInput;
export type UpdateRestaurantInput = z.infer<typeof UpdateRestaurantInput>;

// DR-083: staff-managed reference list of named sites/attractions per
// country -- populates the daily-schedule "planned sites" picker.
export interface SiteView {
  id: string;
  organizationId: string;
  name: string;
  country: string;
  province: string;
  city: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// Explicit user direction: a Site's country is restricted to this app's 4
// operating countries (SITE_COUNTRY_CODES), not the full world list Hotel/
// Restaurant use -- and province must be one of that country's real
// administrative divisions (PROVINCES_BY_COUNTRY), not free text. The
// frontend (site-form.tsx) already only offers these as picklists; this is
// the backend source-of-truth enforcement (charter rule 1), same
// "client prevents for UX, server still validates" precedent as
// booking/domain.ts's Budget/Luxury mutual-exclusion refine.
export const CreateSiteInput = z
  .object({
    name: z.string().min(1).max(200),
    country: z.enum(SITE_COUNTRY_CODES),
    province: z.string().min(1).max(100),
    city: z.string().max(100).optional(),
  })
  .refine((v) => PROVINCES_BY_COUNTRY[v.country].includes(v.province), {
    message: 'Province must be a real administrative division of the selected country',
    path: ['province'],
  });
export type CreateSiteInput = z.infer<typeof CreateSiteInput>;

// Can't reuse CreateSiteInput.partial() here -- refine()'d schemas don't
// expose .partial() (the refinement can't be checked against a partial
// object missing one of the two fields it compares). Same
// required-fields-optional shape as CreateSiteInput, plus the identical
// cross-field check applied only when both fields are actually present in
// this particular update (an update might only touch `name`, say).
export const UpdateSiteInput = z
  .object({
    name: z.string().min(1).max(200).optional(),
    country: z.enum(SITE_COUNTRY_CODES).optional(),
    province: z.string().min(1).max(100).optional(),
    city: z.string().max(100).optional(),
  })
  .refine((v) => !v.country || !v.province || PROVINCES_BY_COUNTRY[v.country].includes(v.province), {
    message: 'Province must be a real administrative division of the selected country',
    path: ['province'],
  });
export type UpdateSiteInput = z.infer<typeof UpdateSiteInput>;

// DRAFT -> IN_REVIEW -> APPROVED, or DRAFT -> APPROVED directly (the same
// roles hold both itinerary.write and itinerary.approve in this launch --
// see rbac.ts's explicit-choice comment -- so a fast path skipping a
// separate reviewer is allowed, not forced). IN_REVIEW -> DRAFT sends it
// back for edits. No path out of APPROVED -- amending an approved plan
// isn't a concept the spec defines.
const TRANSITIONS: Record<ItineraryStatus, ItineraryStatus[]> = {
  DRAFT: ['IN_REVIEW', 'APPROVED'],
  IN_REVIEW: ['APPROVED', 'DRAFT'],
  APPROVED: [],
};

export function canTransition(from: ItineraryStatus, to: ItineraryStatus): boolean {
  return TRANSITIONS[from].includes(to);
}
