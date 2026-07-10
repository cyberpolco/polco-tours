'use server';

import { redirect } from 'next/navigation';
import { requireStaffContext } from '@lib/staff-guard';
import { authService } from '@modules/auth';
import { CreateVehicleInput, fleetService } from '@modules/fleet';

export async function createVehicleAction(formData: FormData): Promise<void> {
  const ctx = await requireStaffContext('fleet.write');

  const ownerEmail = String(formData.get('ownerEmail') ?? '').trim();
  let ownerId: string | undefined;
  if (ownerEmail) {
    const owner = await authService.getUserByEmail(ownerEmail);
    if (!owner || owner.role !== 'VEHICLE_OWNER') {
      redirect('/staff/fleet/vehicles/new?error=owner_not_found');
    }
    ownerId = owner.id;
  }

  const yearRaw = formData.get('year');
  const input = CreateVehicleInput.parse({
    ownerId,
    plateNumber: String(formData.get('plateNumber') ?? '').trim(),
    make: String(formData.get('make') ?? '').trim(),
    model: String(formData.get('model') ?? '').trim(),
    year: yearRaw ? Number(yearRaw) : undefined,
    vehicleType: String(formData.get('vehicleType') ?? '').trim(),
    seatCapacity: Number(formData.get('seatCapacity')),
  });

  const vehicle = await fleetService.createVehicle(ctx, input);
  redirect(`/staff/fleet/vehicles/${vehicle.id}`);
}
