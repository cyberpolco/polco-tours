'use server';

import { redirect } from 'next/navigation';
import { requireStaffContext } from '@lib/staff-guard';
import { LANGUAGE_CODES, UpdateGuideProfileInput, fleetService } from '@modules/fleet';

// DR-245/DR-246: same controlled vocabularies as TourPackage.tags/the fixed
// language list -- kept as local literal tuples, same hand-duplicated-
// per-file convention the package setup actions already use for
// PACKAGE_TAGS.
const PACKAGE_TAGS = ['WILDLIFE', 'ADVENTURE', 'RELAXATION', 'FAMILY', 'CULTURE', 'LUXURY', 'BUDGET', 'CAMPING', 'ADRENALINE', 'BIRDWATCHING', 'HONEYMOON', 'SELF_DRIVE'] as const;

export async function updateGuideProfileAction(guideProfileId: string, formData: FormData): Promise<void> {
  const ctx = await requireStaffContext('fleet.write');

  // Always pass the array, even empty -- these are real checkboxes now, not
  // a comma-typed field: unchecking every box must clear languages/
  // specialties, same convention packages/[packageId]/actions.ts already
  // uses for its own tags checkboxes.
  const input = UpdateGuideProfileInput.parse({
    languages: formData.getAll('languages').filter((l): l is string => typeof l === 'string' && (LANGUAGE_CODES as readonly string[]).includes(l)),
    specialties: formData.getAll('specialties').filter((s): s is string => typeof s === 'string' && (PACKAGE_TAGS as readonly string[]).includes(s)),
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
  redirect('/staff/fleet/guides');
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
