'use server';

import { redirect } from 'next/navigation';
import { requireStaffContext } from '@lib/staff-guard';
import { authService } from '@modules/auth';
import { CreateGuideProfileInput, LANGUAGE_CODES, fleetService } from '@modules/fleet';

// DR-245: same controlled vocabulary as TourPackage.tags -- kept as a local
// literal tuple, same hand-duplicated-per-file convention the package setup
// actions (packages/new/actions.ts) already use for PACKAGE_TAGS.
const PACKAGE_TAGS = ['WILDLIFE', 'ADVENTURE', 'RELAXATION', 'FAMILY', 'CULTURE', 'LUXURY', 'BUDGET'] as const;

// Same convention as staff booking-on-behalf-of-a-client (DR-014) and the
// driver profile equivalent: the TOUR_GUIDE-role user must already have an
// account, found by email.
export async function createGuideProfileAction(formData: FormData): Promise<void> {
  const ctx = await requireStaffContext('fleet.write');

  const email = String(formData.get('email') ?? '').trim();
  const user = await authService.getUserByEmail(email);
  if (!user || !user.roles.includes('TOUR_GUIDE')) {
    redirect('/staff/fleet/guides/new?error=guide_not_found');
  }

  const languages = formData.getAll('languages').filter((l): l is string => typeof l === 'string' && (LANGUAGE_CODES as readonly string[]).includes(l));
  const specialties = formData.getAll('specialties').filter((s): s is string => typeof s === 'string' && (PACKAGE_TAGS as readonly string[]).includes(s));
  const input = CreateGuideProfileInput.parse({
    userId: user.id,
    languages: languages.length ? languages : undefined,
    specialties: specialties.length ? specialties : undefined,
  });

  const guide = await fleetService.createGuideProfile(ctx, input);
  redirect(`/staff/fleet/guides/${guide.id}`);
}
