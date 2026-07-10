// assignment module — domain types & rules. Pure; no framework or DB imports.
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
  guideUserId: z.string().uuid().optional(),
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
