// Cross-module orchestration (DR-082): fleet's Vehicle/DriverProfile/
// GuideProfile availability depends on assignment (who's assigned to a
// departure), booking (whether that departure has a real, active booking),
// AND catalog (the departure's own endDate, DR-107) -- fleet must not
// import any of them (module boundary rule), so this lives one level up, in
// src/lib, same precedent as itineraryService composing booking/catalog
// directly rather than a shared module method.
//
// Call syncFleetAvailabilityForDeparture right after any mutation that
// could change any side of "is this departure currently booked":
// creating/removing an Assignment, or a booking status transition that
// crosses into or out of CONFIRMED/IN_PROGRESS. It is deliberately
// best-effort -- a failure here must never fail the real mutation that
// triggered it (assignment creation, booking confirmation, etc.), same
// "never let a side effect fail the primary action" discipline as
// itineraryService's template-day-copy try/catch.
import { assignmentService } from '@modules/assignment';
import { bookingService } from '@modules/booking';
import { catalogService } from '@modules/catalog';
import { fleetService, isWithinPostTourCooldown, POST_TOUR_AVAILABILITY_DELAY_HOURS } from '@modules/fleet';

export async function syncFleetAvailabilityForDeparture(organizationId: string, departureId: string): Promise<void> {
  try {
    const assignments = await assignmentService.listAssignmentsForRating(organizationId, departureId);
    if (assignments.length === 0) return;

    const [hasActiveBooking, departureEndDate] = await Promise.all([
      bookingService.hasActiveBookingForDeparture(organizationId, departureId),
      catalogService.getDepartureEndDate(organizationId, departureId),
    ]);
    // DR-107: a departure that just ended stays "booked" for a fixed
    // turnaround window (cleaning, fuel, rest) before it reads AVAILABLE
    // again, even though no booking on it is CONFIRMED/IN_PROGRESS anymore.
    const isCurrentlyBooked = hasActiveBooking || isWithinPostTourCooldown(departureEndDate, new Date());

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

/** DR-107: none of syncFleetAvailabilityForDeparture's other call sites
 * (assignment create/remove, booking confirm/cancel/refund, the lifecycle
 * sweep's own COMPLETED transition) fire again on their own once the
 * post-tour cooldown above has actually elapsed -- this is the only thing
 * that re-evaluates a resource stuck at BOOKED and flips it to AVAILABLE
 * once its window is up. Re-syncing is idempotent regardless of a
 * departure's current state, so this deliberately doesn't try to figure out
 * which resources are still in cooldown first -- it just re-runs the same
 * sync for every departure that ended recently. Window is 2x the cooldown
 * so a missed/delayed sweep run still catches everything before the next. */
export async function resyncRecentlyEndedDepartures(): Promise<void> {
  const recentlyEnded = await catalogService.listRecentlyEndedDepartures(POST_TOUR_AVAILABILITY_DELAY_HOURS * 2);
  for (const { organizationId, departureId } of recentlyEnded) {
    await syncFleetAvailabilityForDeparture(organizationId, departureId);
  }
}
