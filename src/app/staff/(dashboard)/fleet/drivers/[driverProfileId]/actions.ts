'use server';

import { redirect } from 'next/navigation';
import { requireStaffContext } from '@lib/staff-guard';
import { UpdateDriverProfileInput, fleetService } from '@modules/fleet';

export async function updateDriverProfileAction(driverProfileId: string, formData: FormData): Promise<void> {
  const ctx = await requireStaffContext('fleet.write');

  const licenseExpiresAtRaw = String(formData.get('licenseExpiresAt') ?? '');
  const languagesRaw = String(formData.get('languages') ?? '').trim();
  const input = UpdateDriverProfileInput.parse({
    licenseNumber: String(formData.get('licenseNumber') ?? '').trim(),
    licenseExpiresAt: licenseExpiresAtRaw || undefined,
    languages: languagesRaw
      ? languagesRaw.split(',').map((l) => l.trim().toLowerCase()).filter(Boolean)
      : undefined,
    status: formData.get('status') || undefined,
  });

  await fleetService.updateDriverProfile(ctx, driverProfileId, input);
  redirect(`/staff/fleet/drivers/${driverProfileId}`);
}

export async function uploadDriverDocumentAction(driverProfileId: string, formData: FormData): Promise<void> {
  const ctx = await requireStaffContext('fleet.write');

  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) {
    redirect(`/staff/fleet/drivers/${driverProfileId}?error=missing_file`);
  }

  const expiresAtRaw = String(formData.get('expiresAt') ?? '');
  const expiresAt = expiresAtRaw ? new Date(expiresAtRaw) : undefined;

  const bytes = Buffer.from(await file.arrayBuffer());
  await fleetService.uploadDriverDocument(ctx, driverProfileId, {
    kind: 'DRIVER_LICENSE',
    contentType: file.type,
    sizeBytes: file.size,
    bytes,
    expiresAt,
  });
  redirect(`/staff/fleet/drivers/${driverProfileId}`);
}
