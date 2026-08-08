'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireStaffContext } from '@lib/staff-guard';
import { RateHotelInput, UpdateHotelInput, itineraryService } from '@modules/itinerary';

function emptyToUndefined(v: FormDataEntryValue | null): string | undefined {
  const s = v ? String(v).trim() : '';
  return s.length > 0 ? s : undefined;
}

function emptyToUndefinedNumber(v: FormDataEntryValue | null): number | undefined {
  const s = emptyToUndefined(v);
  return s !== undefined ? Number(s) : undefined;
}

export async function updateHotelAction(hotelId: string, formData: FormData): Promise<void> {
  const ctx = await requireStaffContext('itinerary.write');
  const input = UpdateHotelInput.parse({
    name: String(formData.get('name') ?? '').trim(),
    country: String(formData.get('country') ?? '').trim(),
    address: emptyToUndefined(formData.get('address')),
    contactName: emptyToUndefined(formData.get('contactName')),
    contactPhone: emptyToUndefined(formData.get('contactPhone')),
    contactEmail: emptyToUndefined(formData.get('contactEmail')),
    latitude: emptyToUndefinedNumber(formData.get('latitude')),
    longitude: emptyToUndefinedNumber(formData.get('longitude')),
  });
  await itineraryService.updateHotel(ctx, hotelId, input);
  redirect('/staff/hotels');
}

export async function deleteHotelAction(hotelId: string): Promise<void> {
  const ctx = await requireStaffContext('itinerary.write');
  await itineraryService.deleteHotel(ctx, hotelId);
  redirect('/staff/hotels');
}

// DR-083: moved off the itinerary page -- itineraryService.rateHotel itself
// re-checks the anti-BOLA "actually toured this hotel" rule for non-managers.
export async function rateHotelAction(hotelId: string, formData: FormData): Promise<void> {
  const ctx = await requireStaffContext('hotel_restaurant_rating.write');
  const input = RateHotelInput.parse({
    rating: Number(formData.get('rating')),
    comment: emptyToUndefined(formData.get('comment')),
  });
  await itineraryService.rateHotel(ctx, hotelId, input);
  revalidatePath(`/staff/hotels/${hotelId}`);
}
