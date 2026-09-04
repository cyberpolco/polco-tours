'use server';

import { redirect } from 'next/navigation';
import { requireStaffContext } from '@lib/staff-guard';
import { LANGUAGE_CODES, UpdateDriverProfileInput, fleetService } from '@modules/fleet';

export async function updateDriverProfileAction(driverProfileId: string, formData: FormData): Promise<void> {
  const ctx = await requireStaffContext('fleet.write');

  const licenseExpiresAtRaw = String(formData.get('licenseExpiresAt') ?? '');
  const input = UpdateDriverProfileInput.parse({
    licenseNumber: String(formData.get('licenseNumber') ?? '').trim(),
    licenseExpiresAt: licenseExpiresAtRaw || undefined,
    // Always pass the array, even empty -- these are real checkboxes now,
    // not a comma-typed field: unchecking every box must clear languages,
    // same convention the guide profile update action already uses.
    languages: formData.getAll('languages').filter((l): l is string => typeof l === 'string' && (LANGUAGE_CODES as readonly string[]).includes(l)),
    status: formData.get('status') || undefined,
  });

  await fleetService.updateDriverProfile(ctx, driverProfileId, input);
  redirect(`/staff/fleet/drivers/${driverProfileId}`);
}

// DR-059: genuinely destructive -- SUPERADMIN-only, enforced inside
// fleetService.deleteDriverProfile.
export async function deleteDriverProfileAction(driverProfileId: string): Promise<void> {
  const ctx = await requireStaffContext('fleet.delete');
  await fleetService.deleteDriverProfile(ctx, driverProfileId);
  redirect('/staff/fleet/drivers');
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
