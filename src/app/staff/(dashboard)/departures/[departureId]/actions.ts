'use server';

import { redirect } from 'next/navigation';
import { requireStaffContext } from '@lib/staff-guard';
import { ApiError } from '@lib/errors';
import { syncFleetAvailabilityForDeparture } from '@lib/fleet-availability';
import { CreateAssignmentInput, assignmentService } from '@modules/assignment';
import { SetDeparturePickupLocationInput, catalogService } from '@modules/catalog';
import { fleetService } from '@modules/fleet';

export async function createAssignmentAction(departureId: string, formData: FormData): Promise<void> {
  const ctx = await requireStaffContext('assignment.write');

  // DR-078/079: the guide field is a SearchableSelect over the
  // recommendation's own eligible-guide list, so this is always a real
  // userId from that pre-vetted list (never a raw email to resolve) --
  // mandatory now, same "let zod reject a blank one" posture as
  // vehicleId/driverProfileId below. assignmentService.createAssignment
  // still independently re-validates role/org/status.
  const input = CreateAssignmentInput.parse({
    vehicleId: String(formData.get('vehicleId') ?? ''),
    driverProfileId: String(formData.get('driverProfileId') ?? ''),
    guideUserId: String(formData.get('guideUserId') ?? ''),
  });

  try {
    await assignmentService.createAssignment(ctx, departureId, input);
    // DR-082: a freshly assigned vehicle/driver/guide should reflect the
    // departure's current booking state right away, not wait for the next
    // sweep -- orchestrated here (not inside assignmentService), same
    // "cross-module side effect stays at the caller layer" convention as
    // the booking confirm/cancel/refund actions.
    if (ctx.organizationId) await syncFleetAvailabilityForDeparture(ctx.organizationId, departureId);
  } catch (err) {
    // DR-079 incident: createAssignment can also throw a 422
    // (Errors.validation, e.g. "guideUserId must reference a TOUR_GUIDE in
    // this organization") -- previously harmless-if-rare since guide was
    // optional (staff could just omit it), this became a real production
    // crash once guide became mandatory, since this catch only handled 409
    // and let everything else propagate as an uncaught server-action error.
    // Catch every ApiError generically now, not just conflicts.
    if (err instanceof ApiError) {
      redirect(`/staff/departures/${departureId}?error=${err.slug}&detail=${encodeURIComponent(err.detail ?? '')}`);
    }
    throw err;
  }
  redirect(`/staff/departures/${departureId}`);
}

export async function removeAssignmentAction(departureId: string, assignmentId: string): Promise<void> {
  const ctx = await requireStaffContext('assignment.write');
  const removed = await assignmentService.removeAssignment(ctx, assignmentId);
  // DR-082: the freed vehicle/driver/guide are no longer serving this
  // departure at all -- recompute them directly (not via
  // syncFleetAvailabilityForDeparture, which can no longer find them once
  // the assignment row is gone; see the REST DELETE route's identical fix).
  if (ctx.organizationId) {
    await fleetService.recomputeVehicleAvailability(ctx.organizationId, removed.vehicleId, false);
    await fleetService.recomputeDriverAvailability(ctx.organizationId, removed.driverProfileId, false);
    if (removed.guideUserId) await fleetService.recomputeGuideAvailability(ctx.organizationId, removed.guideUserId, false);
  }
  redirect(`/staff/departures/${departureId}`);
}

export async function setPickupLocationAction(departureId: string, formData: FormData): Promise<void> {
  const ctx = await requireStaffContext('catalog.write');
  const input = SetDeparturePickupLocationInput.parse({
    latitude: Number(formData.get('latitude')),
    longitude: Number(formData.get('longitude')),
  });
  await catalogService.setDeparturePickupLocation(ctx, departureId, input);
  redirect(`/staff/departures/${departureId}`);
}
