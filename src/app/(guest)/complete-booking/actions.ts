'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { authService } from '@modules/auth';
import { AddTravelerInput, bookingService, SetAddonsInput } from '@modules/booking';
import { documentsService } from '@modules/documents';
import { invoicingService } from '@modules/invoicing';
import type { PaymentKind } from '@prisma/client';
import { buildGuestSetupContext } from '@lib/booking-setup-context';
import { toE164 } from '@lib/country-codes';
import { isStaffRole } from '@lib/rbac';
import { ApiError } from '@lib/errors';
import { logger, newTraceId } from '@lib/logger';
import type { FinalizeAddonsResult } from '../booking/[bookingId]/addons/actions';
import { BOOKING_SETUP_COOKIE, BOOKING_SETUP_TTL_SECONDS, createBookingSetupToken, readBookingSetupToken } from '@lib/booking-setup-token';

// DR-257. The guest side of the quotation email: a guest whose 30-minute
// anonymous session has lapsed (i.e. almost every guest reading an email)
// previously had no way to accept their quotation or fill in their
// travellers -- both live only on the session-gated /booking/[bookingId].
//
// Nothing here trusts a booking id from the client. The verify step proves
// three factors, and everything after it reads the booking id back out of a
// signed, one-hour, single-booking cookie.

export interface VerifyState {
  status: 'idle' | 'error';
  error?: string;
}

/** Same IP-resolution convention as the other guest actions. */
async function clientIp(): Promise<string | undefined> {
  return (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim();
}

/** Reads the booking this browser has proved it may set up. Every step page
 * and every write action starts here; null means "send them back to verify". */
export async function currentSetupBookingId(): Promise<string | null> {
  const token = (await cookies()).get(BOOKING_SETUP_COOKIE)?.value;
  return readBookingSetupToken(token);
}

export async function verifyBookingAction(_prev: VerifyState, formData: FormData): Promise<VerifyState> {
  const bookingReference = String(formData.get('bookingReference') ?? '').trim();
  const lastName = String(formData.get('lastName') ?? '').trim();
  const email = String(formData.get('email') ?? '').trim();

  if (!bookingReference || !lastName || !email) {
    return { status: 'error', error: 'Enter your booking reference, surname, and email address.' };
  }

  let bookingId: string;
  try {
    const booking = await bookingService.verifyForBookingSetup({
      bookingReference,
      lastName,
      email,
      ip: await clientIp(),
    });
    bookingId = booking.id;
  } catch {
    // Deliberately one message for every failure -- wrong reference, wrong
    // surname, wrong email and rate-limited all look identical, so this
    // can't be used to discover whether a booking exists.
    return { status: 'error', error: "We couldn't find a booking matching those details." };
  }

  (await cookies()).set(BOOKING_SETUP_COOKIE, createBookingSetupToken(bookingId), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/complete-booking',
    maxAge: BOOKING_SETUP_TTL_SECONDS,
  });
  redirect('/complete-booking/setup');
}

export async function acceptQuotationAction(): Promise<void> {
  const bookingId = await currentSetupBookingId();
  if (!bookingId) redirect('/complete-booking');
  await bookingService.acceptQuotationForBookingLookup(bookingId);
  redirect('/complete-booking/setup');
}

function emptyToUndefined(v: FormDataEntryValue | null): string | undefined {
  const s = v ? String(v).trim() : '';
  return s.length > 0 ? s : undefined;
}

/** Mirrors booking/[bookingId]/travelers/new/actions.ts field-for-field --
 * same TravelerForm posts to both, so the parsing has to match. Only the
 * authorisation (setup cookie vs session) and the redirect targets differ. */
export async function addTravelerAction(formData: FormData): Promise<void> {
  const bookingId = await currentSetupBookingId();
  if (!bookingId) redirect('/complete-booking');

  const dialCode = String(formData.get('dialCode') ?? '');
  const localNumber = String(formData.get('localNumber') ?? '').trim();

  // DR-140: a tour lead's email may not already belong to a real staff
  // account -- same check as the session-gated action and plan-my-trip.
  const tourLeadEmail = emptyToUndefined(formData.get('email'));
  if (tourLeadEmail) {
    const existingByEmail = await authService.getUserByEmail(tourLeadEmail);
    if (existingByEmail && isStaffRole(existingByEmail.roles)) {
      redirect('/complete-booking/setup/travelers?error=email_in_use');
    }
  }

  const input = AddTravelerInput.parse({
    firstName: String(formData.get('firstName') ?? ''),
    lastName: String(formData.get('lastName') ?? ''),
    age: Number(formData.get('age')),
    sex: String(formData.get('sex') ?? ''),
    nationality: String(formData.get('nationality') ?? ''),
    idOrPassportNumber: String(formData.get('idOrPassportNumber') ?? ''),
    phone: localNumber ? toE164(dialCode, localNumber) : undefined,
    email: tourLeadEmail,
    countryOfResidence: emptyToUndefined(formData.get('countryOfResidence')),
    allergies: emptyToUndefined(formData.get('allergies')),
    emergencyContactName: emptyToUndefined(formData.get('emergencyContactName')),
    emergencyContactPhone: emptyToUndefined(formData.get('emergencyContactPhone')),
    emergencyContactRelation: emptyToUndefined(formData.get('emergencyContactRelation')),
    isTourLead: formData.get('isTourLead') === 'on',
  });

  await bookingService.addTravelerForBookingLookup(bookingId, input);

  const [travelers, booking] = await Promise.all([
    bookingService.listTravelersForBookingSetup(bookingId),
    bookingService.getForBookingSetup(bookingId),
  ]);
  if (travelers.length < booking.seats) redirect('/complete-booking/setup/travelers');
  redirect(booking.requiresPassportUpload ? '/complete-booking/setup/passport' : '/complete-booking/setup');
}

/** Mirrors booking/[bookingId]/addons/actions.ts, including its
 * returns-a-result-instead-of-redirecting contract -- AddonsForm calls this
 * directly from a client handler and navigates itself, so an uncaught throw
 * here would become an invisible unhandled rejection rather than a visible
 * error. `_bookingId` is ignored on purpose: the real booking comes from the
 * setup cookie, never from an argument the client could tamper with. */
export async function finalizeAddonsAction(_bookingId: string, formData: FormData): Promise<FinalizeAddonsResult> {
  const bookingId = await currentSetupBookingId();
  if (!bookingId) return { error: true };

  const traceId = newTraceId();
  try {
    const plainSelections = formData.getAll('addonServiceId').map((id) => ({ addonServiceId: String(id) }));
    const flightSelections = formData.getAll('flightSelection').map((v) => JSON.parse(String(v)));
    const esimSelections = formData.getAll('esimSelection').map((v) => JSON.parse(String(v)));
    const input = SetAddonsInput.parse({ addons: [...plainSelections, ...flightSelections, ...esimSelections] });
    await bookingService.setAddonsForBookingLookup(bookingId, input);
    return { ok: true };
  } catch (err) {
    if (!(err instanceof ApiError)) {
      logger(traceId).error('finalizeAddonsAction (guest setup) failed unexpectedly', {
        message: err instanceof Error ? err.message : String(err),
      });
    }
    return { error: true };
  }
}

export async function uploadPassportAction(travelerId: string, formData: FormData): Promise<void> {
  const bookingId = await currentSetupBookingId();
  if (!bookingId) redirect('/complete-booking');

  const file = formData.get('passport');
  if (!(file instanceof File) || file.size === 0) {
    redirect('/complete-booking/setup/passport?error=missing_file');
  }

  // NOTE (DR-216): this still proxies the file through a Server Action, so a
  // PDF over Next's ~4.5MB body ceiling fails before documents/domain.ts's
  // own 10MB check ever runs -- same limitation the session-gated upload
  // has. Moving both to a direct browser-to-Blob client upload is its own
  // task; @vercel/blob 2.6.1 does support private-store client uploads.
  const bytes = Buffer.from(await file.arrayBuffer());
  const booking = await bookingService.getForBookingSetup(bookingId);
  const doc = await documentsService.uploadPassportForGuest(booking.organizationId, booking.touristUserId, {
    contentType: file.type,
    sizeBytes: file.size,
    bytes,
  });
  await bookingService.setTravelerPassportForBookingLookup(bookingId, travelerId, doc.id);

  // The session-gated twin also fires visaService.autoSubmitOnPassportUpload
  // here. That call is ctx-gated and already best-effort (DR-060) with a
  // documented fallback -- /staff/visa-queue's "Needs application"
  // reconciliation view -- so rather than invent a no-ctx twin for it, this
  // flow leans on that same fallback and a facilitator picks it up.
  const travelers = await bookingService.listTravelersForBookingSetup(bookingId);
  redirect(travelers.some((t) => !t.passportDocumentId) ? '/complete-booking/setup/passport' : '/complete-booking/setup');
}

/** Pays the booking's invoice. Runs the existing, already-tested invoicing
 * chain (getOrCreateInvoiceForBooking -> initiatePayment -> auto-succeed,
 * DR-074's stub) under the guest's own rebuilt context rather than a second
 * no-ctx copy of the money maths -- see src/lib/booking-setup-context.ts.
 *
 * DPO is still stubbed (OI-01), so initiatePayment marks the payment
 * succeeded immediately; when a real gateway lands this becomes a redirect
 * to its hosted page and the rest of this flow is unchanged. */
export async function payAction(kind: PaymentKind): Promise<void> {
  const bookingId = await currentSetupBookingId();
  if (!bookingId) redirect('/complete-booking');

  const booking = await bookingService.getForBookingSetup(bookingId);
  const ctx = buildGuestSetupContext(booking);
  const invoice = await invoicingService.getOrCreateInvoiceForBooking(ctx, bookingId);
  await invoicingService.initiatePayment(ctx, invoice.id, kind);
  redirect('/complete-booking/setup');
}

export async function leaveSetupAction(): Promise<void> {
  (await cookies()).delete(BOOKING_SETUP_COOKIE);
  redirect('/');
}
