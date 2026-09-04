// assignment module — domain types & rules. Pure; no framework or DB imports.
import type { PackageTag } from '@prisma/client';
import { z } from 'zod';

export interface AssignmentView {
  id: string;
  organizationId: string;
  departureId: string;
  vehicleId: string;
  driverProfileId: string;
  guideUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export const CreateAssignmentInput = z.object({
  vehicleId: z.string().uuid(),
  driverProfileId: z.string().uuid(),
  // DR-079: mandatory, not optional -- every assignment must name a guide.
  guideUserId: z.string().uuid(),
});
export type CreateAssignmentInput = z.infer<typeof CreateAssignmentInput>;

export interface DateRange {
  startDate: Date;
  endDate: Date | null;
}

/** A vehicle/driver cannot be assigned to two departures whose dates
 * overlap (double-booking) -- the actual business rule this increment. A
 * departure with no endDate is treated as a same-day trip. Inclusive on
 * both ends: two same-day departures on the same date collide. */
export function departuresOverlap(a: DateRange, b: DateRange): boolean {
  const aEnd = a.endDate ?? a.startDate;
  const bEnd = b.endDate ?? b.startDate;
  return a.startDate <= bEnd && b.startDate <= aEnd;
}

// -------------------------------------------------------------- recommendation scoring (DR-029)
//
// This is a simple, transparent rules-based scorer -- NOT the "AI assignment
// engine" this project's own roadmap lists as Phase 3. It's an honest MVP
// built only from data that actually exists today: availability (reuses
// departuresOverlap, the existing hard gate), vehicle capacity fit,
// maintenance recency (fleetService.maintenanceRecencyScore), and distance
// from pickup (only when both a Departure pickup point and a vehicle's
// Starlink location are on file). Driver AND guide rating (DR-037,
// compareByRating below) rank eligible candidates -- both are otherwise
// only filtered to eligible (ACTIVE + not conflicting), never scored
// against vehicle-style factors like capacity/maintenance/distance, since
// neither of those apply to a person.

/** How tightly a vehicle's capacity matches what's needed -- rewards
 * minimal wasted seats. Null (excluded, not merely down-scored) if it can't
 * even fit the departure -- this is a hard requirement, not a preference. */
export function capacityFitScore(seatCapacity: number, seatsNeeded: number): number | null {
  if (seatCapacity < seatsNeeded) return null;
  return seatsNeeded / seatCapacity;
}

// Beyond this, distance stops meaningfully differentiating candidates in a
// Namibia/DRC road-trip context -- a same-day, reasonable-driving-distance
// heuristic, not a precise cutoff.
const MAX_RELEVANT_DISTANCE_KM = 200;

export function distanceScore(distanceKm: number): number {
  return Math.max(0, 1 - distanceKm / MAX_RELEVANT_DISTANCE_KM);
}

export interface VehicleScoreFactors {
  capacityFit: number;
  maintenanceRecency: number;
  distance: number | null; // null = no Starlink/pickup data on file -- excluded from the average, not penalized
}

/** Equal-weighted average of whichever factors have real data. */
export function combineVehicleScore(factors: VehicleScoreFactors): number {
  const values = [factors.capacityFit, factors.maintenanceRecency, ...(factors.distance != null ? [factors.distance] : [])];
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/** Ratings module (DR-037): descending by averageRating -- missing data
 * (never rated yet) sorts LAST, but is never excluded (spec: "may be
 * deprioritized," never a hard filter). Used to order drivers, and guides
 * when no specialty signal applies (see compareGuidesByMatch below). */
export function compareByRating(a: { averageRating: number | null }, b: { averageRating: number | null }): number {
  if (a.averageRating == null && b.averageRating == null) return 0;
  if (a.averageRating == null) return 1;
  if (b.averageRating == null) return -1;
  return b.averageRating - a.averageRating;
}

// DR-247: explicit user request -- recommendAssignment's guide ranking now
// also factors in how well a guide's specialties (DR-245, the same
// PackageTag enum) match the departure's own package tags, not rating
// alone.

/** How many of a guide's specialties this departure's package tags actually
 * call for -- a bespoke (TAILOR_MADE, no linked TourPackage) departure has
 * no tags at all, so this is always 0 for it, same as a guide with no
 * specialties set. */
export function specialtyOverlapCount(specialties: PackageTag[], packageTags: PackageTag[]): number {
  const tagSet = new Set(packageTags);
  return specialties.filter((s) => tagSet.has(s)).length;
}

/** Descending by specialty-tag overlap with this departure's package first,
 * then compareByRating as the tiebreaker (both for genuine ties and for the
 * bespoke-departure case where every candidate's overlap is 0, preserving
 * the pre-DR-247 rating-only ordering exactly). Curried on packageTags since
 * that's fixed per recommendAssignment call, not per candidate pair. */
export function compareGuidesByMatch(
  packageTags: PackageTag[],
): (a: { specialties: PackageTag[]; averageRating: number | null }, b: { specialties: PackageTag[]; averageRating: number | null }) => number {
  return (a, b) => {
    const overlapDiff = specialtyOverlapCount(b.specialties, packageTags) - specialtyOverlapCount(a.specialties, packageTags);
    if (overlapDiff !== 0) return overlapDiff;
    return compareByRating(a, b);
  };
}
