'use server';

import { redirect } from 'next/navigation';
import { requireStaffContext } from '@lib/staff-guard';
import { UpdateGuideProfileInput, fleetService } from '@modules/fleet';

export async function updateGuideProfileAction(guideProfileId: string, formData: FormData): Promise<void> {
  const ctx = await requireStaffContext('fleet.write');

  const languagesRaw = String(formData.get('languages') ?? '').trim();
  const specialtiesRaw = String(formData.get('specialties') ?? '').trim();
  const input = UpdateGuideProfileInput.parse({
    languages: languagesRaw
      ? languagesRaw.split(',').map((l) => l.trim().toLowerCase()).filter(Boolean)
      : undefined,
    specialties: specialtiesRaw
      ? specialtiesRaw.split(',').map((s) => s.trim()).filter(Boolean)
      : undefined,
    status: formData.get('status') || undefined,
  });

  await fleetService.updateGuideProfile(ctx, guideProfileId, input);
  redirect(`/staff/fleet/guides/${guideProfileId}`);
}

// DR-059: genuinely destructive -- SUPERADMIN-only, enforced inside
// fleetService.deleteGuideProfile.
export async function deleteGuideProfileAction(guideProfileId: string): Promise<void> {
  const ctx = await requireStaffContext('fleet.delete');
  await fleetService.deleteGuideProfile(ctx, guideProfileId);
  redirect('/staff/fleet');
}

export async function uploadGuideDocumentAction(guideProfileId: string, formData: FormData): Promise<void> {
  const ctx = await requireStaffContext('fleet.write');

  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) {
    redirect(`/staff/fleet/guides/${guideProfileId}?error=missing_file`);
  }

  const expiresAtRaw = String(formData.get('expiresAt') ?? '');
  const expiresAt = expiresAtRaw ? new Date(expiresAtRaw) : undefined;

  const bytes = Buffer.from(await file.arrayBuffer());
  await fleetService.uploadGuideDocument(ctx, guideProfileId, {
    kind: 'GUIDE_CERTIFICATION',
    contentType: file.type,
    sizeBytes: file.size,
    bytes,
    expiresAt,
  });
  redirect(`/staff/fleet/guides/${guideProfileId}`);
}
