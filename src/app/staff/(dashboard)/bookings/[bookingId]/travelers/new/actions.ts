'use server';

import { redirect } from 'next/navigation';
import { requireStaffContext } from '@lib/staff-guard';
import { toE164 } from '@lib/country-codes';
import { createCustomizedPackageFromBooking } from '@lib/create-customized-package';
import { AddTravelerInput, bookingService } from '@modules/booking';

function emptyToUndefined(v: FormDataEntryValue | null): string | undefined {
  const s = v ? String(v).trim() : '';
  return s.length > 0 ? s : undefined;
}

// DR-111: age is left blank rather than defaulted for a TAILOR_MADE booking
// -- Number('') is 0, a fabricated value, not "unspecified", so this can't
// reuse the plain Number(formData.get(...)) call the guest form still uses.
function emptyToUndefinedNumber(v: FormDataEntryValue | null): number | undefined {
  const s = v ? String(v).trim() : '';
  return s.length > 0 ? Number(s) : undefined;
}

export async function addTravelerAction(bookingId: string, formData: FormData): Promise<void> {
  const ctx = await requireStaffContext('booking.create');

  const dialCode = String(formData.get('dialCode') ?? '');
  const localNumber = String(formData.get('localNumber') ?? '').trim();

  const input = AddTravelerInput.parse({
    firstName: String(formData.get('firstName') ?? ''),
    lastName: String(formData.get('lastName') ?? ''),
    age: emptyToUndefinedNumber(formData.get('age')),
    sex: String(formData.get('sex') ?? ''),
    nationality: emptyToUndefined(formData.get('nationality')),
    idOrPassportNumber: emptyToUndefined(formData.get('idOrPassportNumber')),
    // Tour-lead-only fields -- absent from the submitted FormData entirely
    // for any other traveler (the form doesn't render those inputs).
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
    redirect(`/staff/bookings/${bookingId}/travelers/new`);
  }
  if (booking.requiresPassportUpload) {
    redirect(`/staff/bookings/${bookingId}/passport`);
  }

  // DR-111: traveler setup is the last step for a TAILOR_MADE booking that
  // doesn't also need passport upload -- auto-create its customized package
  // (once; setCustomizedPackage itself rejects a second one) and send staff
  // straight to it, instead of landing on the booking detail page and
  // requiring a separate manual click.
  if (booking.origin === 'TAILOR_MADE' && !booking.customizedPackageId) {
    const pkg = await createCustomizedPackageFromBooking(ctx, bookingId);
    redirect(`/staff/packages/${pkg.id}`);
  }
  redirect(`/staff/bookings/${bookingId}`);
}
