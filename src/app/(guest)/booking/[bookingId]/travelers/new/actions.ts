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
    // Tour-lead-only fields -- absent from the submitted FormData entirely
    // for any other traveler (the form doesn't render those inputs), so
    // these all naturally resolve to undefined for them.
    phone: localNumber ? toE164(dialCode, localNumber) : undefined,
    email: emptyToUndefined(formData.get('email')),
    countryOfResidence: emptyToUndefined(formData.get('countryOfResidence')),
    allergies: emptyToUndefined(formData.get('allergies')),
    emergencyContactName: emptyToUndefined(formData.get('emergencyContactName')),
    emergencyContactPhone: emptyToUndefined(formData.get('emergencyContactPhone')),
    emergencyContactRelation: emptyToUndefined(formData.get('emergencyContactRelation')),
    isTourLead: formData.get('isTourLead') === 'on',
  });

  await bookingService.addTraveler(ctx, bookingId, input);

  const [travelers, booking] = await Promise.all([
    bookingService.listTravelers(ctx, bookingId),
    bookingService.getById(ctx, bookingId),
  ]);
  if (travelers.length < booking.seats) {
    redirect(`/booking/${bookingId}/travelers/new`);
  }
  redirect(booking.requiresPassportUpload ? `/booking/${bookingId}/passport` : `/booking/${bookingId}`);
}
