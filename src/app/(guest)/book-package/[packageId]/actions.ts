'use server';

import { headers } from 'next/headers';
import { authService } from '@modules/auth';
import { CreateBookingWithDatesInput, bookingService } from '@modules/booking';
import { toE164 } from '@lib/country-codes';
import { ApiError } from '@lib/errors';
import { logger, newTraceId } from '@lib/logger';

export type CreateGuestBookingResult = { bookingId: string } | { error: string };

// Mirrors (guest)/book/[departureId]/actions.ts's createGuestBookingAction --
// same anonymous-session-already-established assumption, same
// return-a-result-instead-of-redirect() convention (see that file's own
// comment for why). The one real difference: this resolves/creates its own
// Departure from the guest's chosen start date (DR-054,
// bookingService.createHoldWithDates) instead of taking a pre-existing
// departureId -- trip length is the package's own staff-set durationDays,
// not a guest choice, so there's no endDate here at all.
export async function createGuestPackageBookingAction(
  packageId: string,
  formData: FormData,
): Promise<CreateGuestBookingResult> {
  const traceId = newTraceId();
  try {
    const ctx = await authService.resolveSession(await headers());

    const firstName = String(formData.get('firstName') ?? '').trim();
    const lastName = String(formData.get('lastName') ?? '').trim();
    const name = `${firstName} ${lastName}`.trim();
    const dialCode = String(formData.get('dialCode') ?? '');
    const localNumber = String(formData.get('localNumber') ?? '').trim();
    if (name) {
      await authService.updateProfile(ctx, {
        name,
        phone: localNumber ? toE164(dialCode, localNumber) : undefined,
      });
    }

    const input = CreateBookingWithDatesInput.parse({
      packageId,
      startDate: String(formData.get('startDate') ?? ''),
      seats: Number(formData.get('seats')),
    });
    const booking = await bookingService.createHoldWithDates(ctx, input);
    return { bookingId: booking.id };
  } catch (err) {
    if (err instanceof ApiError) {
      return { error: err.detail ?? err.title };
    }
    logger(traceId).error('guest package booking failed unexpectedly', {
      message: err instanceof Error ? err.message : String(err),
    });
    return { error: 'Something went wrong starting your booking -- please try again.' };
  }
}
