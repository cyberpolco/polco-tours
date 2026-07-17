// tracking module — domain types & rules. Pure; no framework or DB imports.
// Tracking (DR-041) -- a read-only "what's happening right now" view: fleet
// last-known-location (staff-entered, DR-029; no live feed yet, OI-09) plus
// active-trip progress. No Prisma table of its own (same shape as
// `insights`/`notifications`) -- everything is composed from data other
// modules already produce.

export type TripStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';

export interface TripProgress {
  status: TripStatus;
  dayNumber: number | null; // 1-based; null while NOT_STARTED or COMPLETED
  totalDays: number | null; // null when the departure has no endDate (open-ended)
  percentComplete: number | null; // 0-100; null when totalDays is unknown
}

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/** Pure date-range progress -- deliberately departure-level, not
 * itinerary-day-level. A predefined-package Departure can serve several
 * Bookings, each with its own (or no) Itinerary, so there is no single
 * canonical "the" itinerary to resolve day-by-day detail from; this stays a
 * plain function of the departure's own start/end dates instead of guessing
 * at one booking's itinerary to represent a shared departure. */
export function resolveTripProgress(startDate: Date, endDate: Date | null, now: Date): TripProgress {
  if (now < startDate) {
    return { status: 'NOT_STARTED', dayNumber: null, totalDays: null, percentComplete: 0 };
  }
  if (endDate && now > endDate) {
    return { status: 'COMPLETED', dayNumber: null, totalDays: null, percentComplete: 100 };
  }

  const dayNumber = Math.floor((now.getTime() - startDate.getTime()) / MS_PER_DAY) + 1;
  if (!endDate) {
    return { status: 'IN_PROGRESS', dayNumber, totalDays: null, percentComplete: null };
  }
  const totalDays = Math.floor((endDate.getTime() - startDate.getTime()) / MS_PER_DAY) + 1;
  const percentComplete = totalDays <= 0 ? 100 : Math.min(100, Math.round((dayNumber / totalDays) * 100));
  return { status: 'IN_PROGRESS', dayNumber, totalDays, percentComplete };
}

export type LocationFreshness = 'FRESH' | 'STALE' | 'UNKNOWN';

// Deliberately generous -- kits are staff-entered (OI-09, no live feed), so
// a day-old reading is still the best information ops has, not "broken."
const STALE_AFTER_HOURS = 24;

export function locationFreshness(lastLocationAt: Date | null, now: Date): LocationFreshness {
  if (!lastLocationAt) return 'UNKNOWN';
  const hoursSince = (now.getTime() - lastLocationAt.getTime()) / (1000 * 60 * 60);
  return hoursSince > STALE_AFTER_HOURS ? 'STALE' : 'FRESH';
}

export interface FleetLocationView {
  vehicleId: string;
  plateNumber: string;
  kitId: string | null;
  latitude: number | null;
  longitude: number | null;
  lastLocationAt: Date | null;
  freshness: LocationFreshness;
}

export interface ActiveTripView {
  departureId: string;
  packageTitle: string | null; // null for a bespoke (TAILOR_MADE-converted) departure
  country: string;
  startDate: Date;
  endDate: Date | null;
  vehiclePlate: string | null;
  driverName: string | null;
  guideName: string | null;
  progress: TripProgress;
}

export interface FleetSnapshot {
  fleet: FleetLocationView[];
  activeTrips: ActiveTripView[];
}
