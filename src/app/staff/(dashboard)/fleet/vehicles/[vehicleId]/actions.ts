'use server';

import { redirect } from 'next/navigation';
import { requireStaffContext } from '@lib/staff-guard';
import { UpdateVehicleInput, fleetService } from '@modules/fleet';

export async function updateVehicleAction(vehicleId: string, formData: FormData): Promise<void> {
  const ctx = await requireStaffContext('fleet.write');

  const yearRaw = formData.get('year');
  const input = UpdateVehicleInput.parse({
    plateNumber: String(formData.get('plateNumber') ?? '').trim(),
    make: String(formData.get('make') ?? '').trim(),
    model: String(formData.get('model') ?? '').trim(),
    year: yearRaw ? Number(yearRaw) : undefined,
    vehicleType: String(formData.get('vehicleType') ?? '').trim(),
    seatCapacity: Number(formData.get('seatCapacity')),
    status: formData.get('status') || undefined,
  });

  await fleetService.updateVehicle(ctx, vehicleId, input);
  redirect(`/staff/fleet/vehicles/${vehicleId}`);
}

const VEHICLE_DOCUMENT_KINDS = ['VEHICLE_REGISTRATION', 'VEHICLE_INSURANCE', 'VEHICLE_INSPECTION'] as const;

export async function uploadVehicleDocumentAction(vehicleId: string, formData: FormData): Promise<void> {
  const ctx = await requireStaffContext('fleet.write');

  const kind = formData.get('kind');
  if (typeof kind !== 'string' || !VEHICLE_DOCUMENT_KINDS.includes(kind as (typeof VEHICLE_DOCUMENT_KINDS)[number])) {
    redirect(`/staff/fleet/vehicles/${vehicleId}?error=invalid_kind`);
  }

  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) {
    redirect(`/staff/fleet/vehicles/${vehicleId}?error=missing_file`);
  }

  const expiresAtRaw = String(formData.get('expiresAt') ?? '');
  const expiresAt = expiresAtRaw ? new Date(expiresAtRaw) : undefined;

  const bytes = Buffer.from(await file.arrayBuffer());
  await fleetService.uploadVehicleDocument(ctx, vehicleId, {
    kind: kind as 'VEHICLE_REGISTRATION' | 'VEHICLE_INSURANCE' | 'VEHICLE_INSPECTION',
    contentType: file.type,
    sizeBytes: file.size,
    bytes,
    expiresAt,
  });
  redirect(`/staff/fleet/vehicles/${vehicleId}`);
}
