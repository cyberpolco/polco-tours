'use server';

import { redirect } from 'next/navigation';
import { requireStaffContext } from '@lib/staff-guard';
import { SetStarlinkLocationInput, UpdateStarlinkKitInput, fleetService } from '@modules/fleet';

export async function updateStarlinkKitAction(kitId: string, formData: FormData): Promise<void> {
  const ctx = await requireStaffContext('fleet.write');

  const vehicleId = String(formData.get('vehicleId') ?? '').trim();
  const input = UpdateStarlinkKitInput.parse({
    status: formData.get('status') || undefined,
    vehicleId: vehicleId || null,
  });

  await fleetService.updateStarlinkKit(ctx, kitId, input);
  redirect(`/staff/fleet/starlink-kits/${kitId}`);
}

export async function setStarlinkLocationAction(kitId: string, formData: FormData): Promise<void> {
  const ctx = await requireStaffContext('fleet.write');

  const input = SetStarlinkLocationInput.parse({
    latitude: Number(formData.get('latitude')),
    longitude: Number(formData.get('longitude')),
  });

  await fleetService.setStarlinkLocation(ctx, kitId, input);
  redirect(`/staff/fleet/starlink-kits/${kitId}`);
}

// DR-059: genuinely destructive -- SUPERADMIN-only, enforced inside
// fleetService.deleteStarlinkKit.
export async function deleteStarlinkKitAction(kitId: string): Promise<void> {
  const ctx = await requireStaffContext('fleet.delete');
  await fleetService.deleteStarlinkKit(ctx, kitId);
  redirect('/staff/fleet');
}
