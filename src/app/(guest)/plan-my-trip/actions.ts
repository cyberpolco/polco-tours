'use server';

import { headers } from 'next/headers';
import { authService } from '@modules/auth';
import { CreateTailorMadeInput, bookingService } from '@modules/booking';
import { toE164 } from '@lib/country-codes';
import { ApiError } from '@lib/errors';
import { logger, newTraceId } from '@lib/logger';

export type CreatePlanMyTripResult = { bookingId: string } | { error: string };

// Mirrors (guest)/book/[departureId]/actions.ts's createGuestBookingAction --
// same reasoning applies here: called right after the client establishes the
// anonymous session, returns a result instead of calling redirect() since
// it's invoked from a plain client event handler, not a <form action>.
// Still creates a TAILOR_MADE booking exactly as the old tailor-made form
// did (DR-046 merged the entry point, not the underlying operation) --
// tags/sites are the old quiz's preference questions, carried over as
// Booking.preferredTags/preferredSites (staff context only, no scoring).
export async function createPlanMyTripRequestAction(formData: FormData): Promise<CreatePlanMyTripResult> {
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
      preferredTags: formData.getAll('tags').map(String),
      preferredSites: formData.getAll('sites').map(String),
    });
    const booking = await bookingService.createTailorMadeRequest(ctx, input);
    return { bookingId: booking.id };
  } catch (err) {
    if (err instanceof ApiError) {
      return { error: err.detail ?? err.title };
    }
    logger(traceId).error('plan-my-trip request failed unexpectedly', {
      message: err instanceof Error ? err.message : String(err),
    });
    return { error: 'Something went wrong submitting your request -- please try again.' };
  }
}
