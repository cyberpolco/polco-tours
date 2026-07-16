'use server';

import { redirect } from 'next/navigation';
import { requireStaffContext } from '@lib/staff-guard';
import { UpdateHotelInput, itineraryService } from '@modules/itinerary';

function emptyToUndefined(v: FormDataEntryValue | null): string | undefined {
  const s = v ? String(v).trim() : '';
  return s.length > 0 ? s : undefined;
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
  });
  await itineraryService.updateHotel(ctx, hotelId, input);
  redirect('/staff/hotels');
}

export async function deleteHotelAction(hotelId: string): Promise<void> {
  const ctx = await requireStaffContext('itinerary.write');
  await itineraryService.deleteHotel(ctx, hotelId);
  redirect('/staff/hotels');
}
