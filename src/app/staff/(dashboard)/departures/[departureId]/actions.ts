'use server';

import { redirect } from 'next/navigation';
import { requireStaffContext } from '@lib/staff-guard';
import { ApiError } from '@lib/errors';
import { authService } from '@modules/auth';
import { CreateAssignmentInput, assignmentService } from '@modules/assignment';
import { SetDeparturePickupLocationInput, catalogService } from '@modules/catalog';

export async function createAssignmentAction(departureId: string, formData: FormData): Promise<void> {
  const ctx = await requireStaffContext('assignment.write');

  const guideEmail = String(formData.get('guideEmail') ?? '').trim();
  let guideUserId: string | undefined;
  if (guideEmail) {
    const guide = await authService.getUserByEmail(guideEmail);
    if (!guide || !guide.roles.includes('TOUR_GUIDE')) {
      redirect(`/staff/departures/${departureId}?error=guide_not_found`);
    }
    guideUserId = guide.id;
  }

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
