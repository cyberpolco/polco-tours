'use server';

import { headers } from 'next/headers';
import { authService } from '@modules/auth';
import { CreateTailorMadeInput, bookingService } from '@modules/booking';
import { toE164 } from '@lib/country-codes';
import { ApiError } from '@lib/errors';
import { logger, newTraceId } from '@lib/logger';

export type CreateTailorMadeResult = { bookingId: string } | { error: string };

// Mirrors (guest)/book/[departureId]/actions.ts's createGuestBookingAction --
// same reasoning applies here: called right after the client establishes the
// anonymous session, returns a result instead of calling redirect() since
// it's invoked from a plain client event handler, not a <form action>.
export async function createTailorMadeRequestAction(formData: FormData): Promise<CreateTailorMadeResult> {
  const traceId = newTraceId();
  try {
    const ctx = await authService.resolveSession(await headers());

    const name = String(formData.get('name') ?? '').trim();
    const dialCode = String(formData.get('dialCode') ?? '');
    const localNumber = String(formData.get('localNumber') ?? '').trim();
    if (name) {
      await authService.updateProfile(ctx, {
        name,
        phone: localNumber ? toE164(dialCode, localNumber) : undefined,
      });
    }

    const specialRequests = String(formData.get('specialRequests') ?? '').trim();
    const input = CreateTailorMadeInput.parse({
      customCountry: String(formData.get('customCountry')).trim().toUpperCase(),
      customTravelStart: String(formData.get('customTravelStart')),
      customTravelEnd: String(formData.get('customTravelEnd')),
      seats: Number(formData.get('seats')),
      customDescription: String(formData.get('customDescription')),
      specialRequests: specialRequests || undefined,
    });
    const booking = await bookingService.createTailorMadeRequest(ctx, input);
    return { bookingId: booking.id };
  } catch (err) {
    if (err instanceof ApiError) {
      return { error: err.detail ?? err.title };
    }
    logger(traceId).error('tailor-made request failed unexpectedly', {
      message: err instanceof Error ? err.message : String(err),
    });
    return { error: 'Something went wrong submitting your request -- please try again.' };
  }
}
