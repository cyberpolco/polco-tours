'use server';

import { redirect } from 'next/navigation';
import { requireStaffContext } from '@lib/staff-guard';
import { CreateRestaurantInput, itineraryService } from '@modules/itinerary';

function emptyToUndefined(v: FormDataEntryValue | null): string | undefined {
  const s = v ? String(v).trim() : '';
  return s.length > 0 ? s : undefined;
}

function emptyToUndefinedNumber(v: FormDataEntryValue | null): number | undefined {
  const s = emptyToUndefined(v);
  return s !== undefined ? Number(s) : undefined;
}

export async function createRestaurantAction(formData: FormData): Promise<void> {
  const ctx = await requireStaffContext('itinerary.write');
  const input = CreateRestaurantInput.parse({
    name: String(formData.get('name') ?? '').trim(),
    country: String(formData.get('country') ?? '').trim(),
    address: emptyToUndefined(formData.get('address')),
    contactName: emptyToUndefined(formData.get('contactName')),
    contactPhone: emptyToUndefined(formData.get('contactPhone')),
    contactEmail: emptyToUndefined(formData.get('contactEmail')),
    latitude: emptyToUndefinedNumber(formData.get('latitude')),
    longitude: emptyToUndefinedNumber(formData.get('longitude')),
  });
  await itineraryService.createRestaurant(ctx, input);
  redirect('/staff/restaurants');
}
