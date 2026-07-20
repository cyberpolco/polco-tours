'use server';

import { cookies, headers } from 'next/headers';
import { authService } from '@modules/auth';
import { CreateTailorMadeInput, bookingService } from '@modules/booking';
import { toE164 } from '@lib/country-codes';
import { ApiError } from '@lib/errors';
import { logger, newTraceId } from '@lib/logger';

export type CreatePlanMyTripResult = { bookingId: string } | { error: string };

export interface CreatePlanMyTripPayload {
  countries: string[];
  customTravelStart: string;
  customTravelEnd: string;
  seats: number;
  preferredTags: string[];
  preferredSites: string[];
  customDescription?: string; // optional (DR-048)
  preferredAddons?: string[];
  countryOfResidence?: string;
  citizenship?: string;
  specialRequests?: string;
  firstName: string;
  lastName: string;
  email: string;
  dialCode: string;
  localNumber: string;
}

// Mirrors (guest)/book/[departureId]/actions.ts's createGuestBookingAction --
// same reasoning applies here: called right after the client establishes the
// anonymous session, returns a result instead of calling redirect() since
// it's invoked from a plain client event handler, not a <form action>.
// Still creates a TAILOR_MADE booking exactly as the old tailor-made form
// did (DR-046 merged the entry point, not the underlying operation) --
// tags/sites are the old quiz's preference questions, carried over as
// Booking.preferredTags/preferredSites (staff context only, no scoring).
// Takes a plain object, not FormData (DR-047) -- the form is now a
// client-managed multi-step wizard, not a single native <form> submit.
export async function createPlanMyTripRequestAction(payload: CreatePlanMyTripPayload): Promise<CreatePlanMyTripResult> {
  const traceId = newTraceId();
  try {
    const ctx = await authService.resolveSession(await headers());

    // User.name is a single better-auth-managed string (no firstName/lastName
    // split at the schema level) -- the form collects them separately so the
    // last name can be called out on its own (see the confirmation screen's
    // reminder), but they're combined here since there's nowhere else on
    // User to put lastName individually.
    const name = `${payload.firstName.trim()} ${payload.lastName.trim()}`.trim();
    if (name) {
      await authService.updateProfile(ctx, {
        name,
        phone: payload.localNumber ? toE164(payload.dialCode, payload.localNumber) : undefined,
      });
    }

    const input = CreateTailorMadeInput.parse({
      countries: payload.countries.map((c) => c.trim().toUpperCase()),
      customTravelStart: payload.customTravelStart,
      customTravelEnd: payload.customTravelEnd,
      seats: payload.seats,
      customDescription: payload.customDescription?.trim() || undefined,
      specialRequests: payload.specialRequests?.trim() || undefined,
      preferredTags: payload.preferredTags,
      preferredSites: payload.preferredSites,
      email: payload.email.trim(),
      preferredAddons: payload.preferredAddons,
      countryOfResidence: payload.countryOfResidence?.trim().toUpperCase() || undefined,
      citizenship: payload.citizenship?.trim().toUpperCase() || undefined,
    });
    // Confirmation email language follows the guest's own site-wide locale
    // cookie (DR-023) -- notifications' Locale enum is uppercase ('EN'/'FR'),
    // the cookie's value is lowercase; default 'en' matches request.ts's own
    // fallback.
    const cookieLocale = (await cookies()).get('locale')?.value;
    const locale = cookieLocale === 'fr' ? 'FR' : 'EN';

    const booking = await bookingService.createTailorMadeRequest(ctx, input, locale);
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
