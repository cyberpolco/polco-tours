// itinerary module — domain types & rules. Pure; no framework or DB imports.
import type { ItineraryStatus } from '@prisma/client';
import { z } from 'zod';

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
  createdAt: Date;
  updatedAt: Date;
}

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

export const AddItineraryDayInput = z.object({
  dayNumber: z.number().int().positive(),
  date: z.coerce.date(),
  departureTime: z.string().regex(TIME_HHMM).optional(),
  arrivalTime: z.string().regex(TIME_HHMM).optional(),
  pickupLocation: z.string().max(500).optional(),
  dropoffLocation: z.string().max(500).optional(),
  plannedSites: z.string().max(2000).optional(),
  activities: z.string().max(2000).optional(),
  estimatedTravelMinutes: z.number().int().nonnegative().optional(),
  notes: z.string().max(2000).optional(),
});
export type AddItineraryDayInput = z.infer<typeof AddItineraryDayInput>;

export const UpdateItineraryDayInput = AddItineraryDayInput.omit({ dayNumber: true }).partial();
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
