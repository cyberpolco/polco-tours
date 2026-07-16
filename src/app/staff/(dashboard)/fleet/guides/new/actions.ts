'use server';

import { redirect } from 'next/navigation';
import { requireStaffContext } from '@lib/staff-guard';
import { authService } from '@modules/auth';
import { CreateGuideProfileInput, fleetService } from '@modules/fleet';

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

  const languagesRaw = String(formData.get('languages') ?? '').trim();
  const specialtiesRaw = String(formData.get('specialties') ?? '').trim();
  const input = CreateGuideProfileInput.parse({
    userId: user.id,
    languages: languagesRaw
      ? languagesRaw.split(',').map((l) => l.trim().toLowerCase()).filter(Boolean)
      : undefined,
    specialties: specialtiesRaw
      ? specialtiesRaw.split(',').map((s) => s.trim()).filter(Boolean)
      : undefined,
  });

  const guide = await fleetService.createGuideProfile(ctx, input);
  redirect(`/staff/fleet/guides/${guide.id}`);
}
