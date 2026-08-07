// Cross-module orchestration (DR-082): fleet's Vehicle/DriverProfile/
// GuideProfile availability depends on assignment (who's assigned to a
// departure) AND booking (whether that departure has a real, active
// booking) -- fleet must not import either (module boundary rule), so this
// lives one level up, in src/lib, same precedent as itineraryService
// composing booking/catalog directly rather than a shared module method.
//
// Call syncFleetAvailabilityForDeparture right after any mutation that
// could change either side of "is this departure currently booked":
// creating/removing an Assignment, or a booking status transition that
// crosses into or out of CONFIRMED/IN_PROGRESS. It is deliberately
// best-effort -- a failure here must never fail the real mutation that
// triggered it (assignment creation, booking confirmation, etc.), same
// "never let a side effect fail the primary action" discipline as
// itineraryService's template-day-copy try/catch.
import { assignmentService } from '@modules/assignment';
import { bookingService } from '@modules/booking';
import { fleetService } from '@modules/fleet';

export async function syncFleetAvailabilityForDeparture(organizationId: string, departureId: string): Promise<void> {
  try {
    const assignments = await assignmentService.listAssignmentsForRating(organizationId, departureId);
    if (assignments.length === 0) return;

    const isCurrentlyBooked = await bookingService.hasActiveBookingForDeparture(organizationId, departureId);

    for (const assignment of assignments) {
      await fleetService.recomputeVehicleAvailability(organizationId, assignment.vehicleId, isCurrentlyBooked);
      await fleetService.recomputeDriverAvailability(organizationId, assignment.driverProfileId, isCurrentlyBooked);
      if (assignment.guideUserId) {
        await fleetService.recomputeGuideAvailability(organizationId, assignment.guideUserId, isCurrentlyBooked);
      }
    }
  } catch {
    // Best-effort -- see file header. Staff can still see stale
    // availability and it'll self-correct on the next assignment/status
    // change, or the scheduled inactivity sweep.
  }
}
