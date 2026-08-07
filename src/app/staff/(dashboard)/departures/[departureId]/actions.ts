'use server';

import { redirect } from 'next/navigation';
import { requireStaffContext } from '@lib/staff-guard';
import { ApiError } from '@lib/errors';
import { CreateAssignmentInput, assignmentService } from '@modules/assignment';
import { SetDeparturePickupLocationInput, catalogService } from '@modules/catalog';

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
  await assignmentService.removeAssignment(ctx, assignmentId);
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
