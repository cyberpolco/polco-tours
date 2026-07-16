'use server';

import { redirect } from 'next/navigation';
import { requireStaffContext } from '@lib/staff-guard';
import { CreateStarlinkKitInput, fleetService } from '@modules/fleet';

export async function createStarlinkKitAction(formData: FormData): Promise<void> {
  const ctx = await requireStaffContext('fleet.write');

  const vehicleId = String(formData.get('vehicleId') ?? '').trim();
  const input = CreateStarlinkKitInput.parse({
    kitId: String(formData.get('kitId') ?? '').trim(),
    vehicleId: vehicleId || undefined,
  });

  const kit = await fleetService.createStarlinkKit(ctx, input);
  redirect(`/staff/fleet/starlink-kits/${kit.id}`);
}
