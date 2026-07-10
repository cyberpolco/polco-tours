'use server';

import { redirect } from 'next/navigation';
import { requireGuestContext } from '@lib/guest-guard';
import { toE164 } from '@lib/country-codes';
import { AddTravelerInput, bookingService } from '@modules/booking';

function emptyToUndefined(v: FormDataEntryValue | null): string | undefined {
  const s = v ? String(v).trim() : '';
  return s.length > 0 ? s : undefined;
}

export async function addTravelerAction(bookingId: string, formData: FormData): Promise<void> {
  const ctx = await requireGuestContext();

  const dialCode = String(formData.get('dialCode') ?? '');
  const localNumber = String(formData.get('localNumber') ?? '').trim();

  const input = AddTravelerInput.parse({
    firstName: String(formData.get('firstName') ?? ''),
    lastName: String(formData.get('lastName') ?? ''),
    age: Number(formData.get('age')),
    sex: String(formData.get('sex') ?? ''),
    nationality: String(formData.get('nationality') ?? ''),
    idOrPassportNumber: String(formData.get('idOrPassportNumber') ?? ''),
    phone: localNumber ? toE164(dialCode, localNumber) : undefined,
    disabilities: emptyToUndefined(formData.get('disabilities')),
    allergies: emptyToUndefined(formData.get('allergies')),
    drinkPreference: emptyToUndefined(formData.get('drinkPreference')),
    isTourLead: formData.get('isTourLead') === 'on',
  });

  await bookingService.addTraveler(ctx, bookingId, input);

  const [travelers, booking] = await Promise.all([
    bookingService.listTravelers(ctx, bookingId),
    bookingService.getById(ctx, bookingId),
  ]);
  redirect(
    travelers.length >= booking.seats
      ? `/booking/${bookingId}/passport`
      : `/booking/${bookingId}/travelers/new`,
  );
}
