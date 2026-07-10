'use server';

import { headers } from 'next/headers';
import { authService } from '@modules/auth';
import { CreateBookingInput, bookingService } from '@modules/booking';
import { toE164 } from '@lib/country-codes';
import { ApiError } from '@lib/errors';
import { logger, newTraceId } from '@lib/logger';

export type CreateGuestBookingResult = { bookingId: string } | { error: string };

// No requireGuestContext here -- this is the flow's own entry point, called
// right after the client establishes the anonymous session
// (authClient.signIn.anonymous()), not a page that assumes one exists yet.
//
// Returns a result instead of calling redirect() -- this action is invoked
// as a plain function from a client event handler (booking-form.tsx needs to
// await the anonymous sign-in FIRST), not via a <form action={...}> prop or
// useActionState/startTransition, and redirect()'s special throw is only
// reliably turned into client-side navigation through those two paths.
// Every other action in this app's wizards uses the plain <form action>
// convention and keeps redirect() -- this is the one deliberate exception.
//
// Every branch returns rather than throws (mirrors withAuth's route-guard.ts
// error translation, but for a plain function call instead of an HTTP
// response) -- an uncaught throw here becomes a silent, invisible unhandled
// promise rejection in the browser since there's no <form action>/
// useActionState wiring to surface it, which is a much worse failure mode
// than an honest error message.
export async function createGuestBookingAction(
  departureId: string,
  formData: FormData,
): Promise<CreateGuestBookingResult> {
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

    const input = CreateBookingInput.parse({ departureId, seats: Number(formData.get('seats')) });
    const booking = await bookingService.createHold(ctx, input);
    return { bookingId: booking.id };
  } catch (err) {
    if (err instanceof ApiError) {
      return { error: err.detail ?? err.title };
    }
    logger(traceId).error('guest booking failed unexpectedly', {
      message: err instanceof Error ? err.message : String(err),
    });
    return { error: 'Something went wrong starting your booking -- please try again.' };
  }
}
