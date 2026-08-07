'use server';

import { redirect } from 'next/navigation';
import { requireStaffContext } from '@lib/staff-guard';
import { ApiError } from '@lib/errors';
import { CreateAssignmentInput, assignmentService } from '@modules/assignment';
import { SetDeparturePickupLocationInput, catalogService } from '@modules/catalog';

export async function createAssignmentAction(departureId: string, formData: FormData): Promise<void> {
  const ctx = await requireStaffContext('assignment.write');

  // DR-078: the guide field is now a SearchableSelect over the
  // recommendation's own eligible-guide list, so this is always either a
  // real userId from that pre-vetted list or empty (never a raw email to
  // resolve) -- assignmentService.createAssignment still independently
  // re-validates role/org/status, this is just no longer doing that lookup
  // twice.
  const guideUserId = String(formData.get('guideUserId') ?? '').trim() || undefined;

  const input = CreateAssignmentInput.parse({
    vehicleId: String(formData.get('vehicleId') ?? ''),
    driverProfileId: String(formData.get('driverProfileId') ?? ''),
    guideUserId,
  });

  try {
    await assignmentService.createAssignment(ctx, departureId, input);
  } catch (err) {
    if (err instanceof ApiError && err.status === 409) {
      redirect(`/staff/departures/${departureId}?error=conflict&detail=${encodeURIComponent(err.detail ?? '')}`);
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
