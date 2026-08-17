'use server';

import { redirect } from 'next/navigation';
import { requireGuestContext } from '@lib/guest-guard';
import { toE164 } from '@lib/country-codes';
import { isStaffRole } from '@lib/rbac';
import { authService } from '@modules/auth';
import { AddTravelerInput, bookingService } from '@modules/booking';

function emptyToUndefined(v: FormDataEntryValue | null): string | undefined {
  const s = v ? String(v).trim() : '';
  return s.length > 0 ? s : undefined;
}

export async function addTravelerAction(bookingId: string, formData: FormData): Promise<void> {
  const ctx = await requireGuestContext();

  const dialCode = String(formData.get('dialCode') ?? '');
  const localNumber = String(formData.get('localNumber') ?? '').trim();

  // DR-140: reject a tour lead's email if it already belongs to a real
  // staff account (any non-TOURIST role) -- explicit user request, same
  // check as plan-my-trip/actions.ts. Only present for the tour lead (the
  // form doesn't render this field for any other traveler).
  const tourLeadEmail = emptyToUndefined(formData.get('email'));
  if (tourLeadEmail) {
    const existingByEmail = await authService.getUserByEmail(tourLeadEmail);
    if (existingByEmail && isStaffRole(existingByEmail.roles)) {
      redirect(`/booking/${bookingId}/travelers/new?error=email_in_use`);
    }
  }

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
    email: tourLeadEmail,
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
