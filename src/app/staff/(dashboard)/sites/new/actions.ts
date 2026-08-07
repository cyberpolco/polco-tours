'use server';

import { redirect } from 'next/navigation';
import { requireStaffContext } from '@lib/staff-guard';
import { CreateSiteInput, itineraryService } from '@modules/itinerary';

export async function createSiteAction(formData: FormData): Promise<void> {
  const ctx = await requireStaffContext('itinerary.write');
  const input = CreateSiteInput.parse({
    name: String(formData.get('name') ?? '').trim(),
    country: String(formData.get('country') ?? '').trim(),
  });
  await itineraryService.createSite(ctx, input);
  redirect('/staff/sites');
}
