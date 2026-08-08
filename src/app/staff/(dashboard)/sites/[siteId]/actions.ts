'use server';

import { redirect } from 'next/navigation';
import { requireStaffContext } from '@lib/staff-guard';
import { UpdateSiteInput, itineraryService } from '@modules/itinerary';

function emptyToUndefined(v: FormDataEntryValue | null): string | undefined {
  const s = v ? String(v).trim() : '';
  return s.length > 0 ? s : undefined;
}

function emptyToUndefinedNumber(v: FormDataEntryValue | null): number | undefined {
  const s = emptyToUndefined(v);
  return s !== undefined ? Number(s) : undefined;
}

export async function updateSiteAction(siteId: string, formData: FormData): Promise<void> {
  const ctx = await requireStaffContext('itinerary.write');
  const input = UpdateSiteInput.parse({
    name: String(formData.get('name') ?? '').trim(),
    country: String(formData.get('country') ?? '').trim(),
    province: String(formData.get('province') ?? '').trim(),
    city: emptyToUndefined(formData.get('city')),
    latitude: emptyToUndefinedNumber(formData.get('latitude')),
    longitude: emptyToUndefinedNumber(formData.get('longitude')),
  });
  await itineraryService.updateSite(ctx, siteId, input);
  redirect('/staff/sites');
}

export async function deleteSiteAction(siteId: string): Promise<void> {
  const ctx = await requireStaffContext('itinerary.write');
  await itineraryService.deleteSite(ctx, siteId);
  redirect('/staff/sites');
}
