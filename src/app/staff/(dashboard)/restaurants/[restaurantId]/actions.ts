'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireStaffContext } from '@lib/staff-guard';
import { RateRestaurantInput, UpdateRestaurantInput, itineraryService } from '@modules/itinerary';

function emptyToUndefined(v: FormDataEntryValue | null): string | undefined {
  const s = v ? String(v).trim() : '';
  return s.length > 0 ? s : undefined;
}

function emptyToUndefinedNumber(v: FormDataEntryValue | null): number | undefined {
  const s = emptyToUndefined(v);
  return s !== undefined ? Number(s) : undefined;
}

export async function updateRestaurantAction(restaurantId: string, formData: FormData): Promise<void> {
  const ctx = await requireStaffContext('itinerary.write');
  const input = UpdateRestaurantInput.parse({
    name: String(formData.get('name') ?? '').trim(),
    country: String(formData.get('country') ?? '').trim(),
    address: emptyToUndefined(formData.get('address')),
    contactName: emptyToUndefined(formData.get('contactName')),
    contactPhone: emptyToUndefined(formData.get('contactPhone')),
    contactEmail: emptyToUndefined(formData.get('contactEmail')),
    latitude: emptyToUndefinedNumber(formData.get('latitude')),
    longitude: emptyToUndefinedNumber(formData.get('longitude')),
  });
  await itineraryService.updateRestaurant(ctx, restaurantId, input);
  redirect('/staff/restaurants');
}

export async function deleteRestaurantAction(restaurantId: string): Promise<void> {
  const ctx = await requireStaffContext('itinerary.write');
  await itineraryService.deleteRestaurant(ctx, restaurantId);
  redirect('/staff/restaurants');
}

// DR-083: moved off the itinerary page -- itineraryService.rateRestaurant
// itself re-checks the anti-BOLA "actually toured this restaurant" rule.
export async function rateRestaurantAction(restaurantId: string, formData: FormData): Promise<void> {
  const ctx = await requireStaffContext('hotel_restaurant_rating.write');
  const input = RateRestaurantInput.parse({
    rating: Number(formData.get('rating')),
    comment: emptyToUndefined(formData.get('comment')),
  });
  await itineraryService.rateRestaurant(ctx, restaurantId, input);
  revalidatePath(`/staff/restaurants/${restaurantId}`);
}
