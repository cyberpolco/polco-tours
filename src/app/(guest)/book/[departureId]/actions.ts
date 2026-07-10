'use server';

import { headers } from 'next/headers';
import { authService } from '@modules/auth';
import { CreateBookingInput, bookingService } from '@modules/booking';
import { toE164 } from '@lib/country-codes';
import { ApiError } from '@lib/errors';

export type CreateGuestBookingResult = { bookingId: string } | { error: 'session' | 'sold_out' };

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
export async function createGuestBookingAction(
  departureId: string,
  formData: FormData,
): Promise<CreateGuestBookingResult> {
  let ctx;
  try {
    ctx = await authService.resolveSession(await headers());
  } catch {
    return { error: 'session' };
  }

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
  try {
    const booking = await bookingService.createHold(ctx, input);
    return { bookingId: booking.id };
  } catch (err) {
    if (err instanceof ApiError && err.status === 409) {
      return { error: 'sold_out' };
    }
    throw err;
  }
}
