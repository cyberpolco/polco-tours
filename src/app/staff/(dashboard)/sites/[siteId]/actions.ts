'use server';

import { redirect } from 'next/navigation';
import { requireStaffContext } from '@lib/staff-guard';
import { UpdateSiteInput, itineraryService } from '@modules/itinerary';

export async function updateSiteAction(siteId: string, formData: FormData): Promise<void> {
  const ctx = await requireStaffContext('itinerary.write');
  const input = UpdateSiteInput.parse({
    name: String(formData.get('name') ?? '').trim(),
    country: String(formData.get('country') ?? '').trim(),
  });
  await itineraryService.updateSite(ctx, siteId, input);
  redirect('/staff/sites');
}

export async function deleteSiteAction(siteId: string): Promise<void> {
  const ctx = await requireStaffContext('itinerary.write');
  await itineraryService.deleteSite(ctx, siteId);
  redirect('/staff/sites');
}
