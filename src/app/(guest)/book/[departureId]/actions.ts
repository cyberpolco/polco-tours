'use server';

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { authService } from '@modules/auth';
import { CreateBookingInput, bookingService } from '@modules/booking';
import { toE164 } from '@lib/country-codes';
import { ApiError } from '@lib/errors';

// No requireGuestContext here -- this is the flow's own entry point, called
// right after the client establishes the anonymous session
// (authClient.signIn.anonymous()), not a page that assumes one exists yet.
export async function createGuestBookingAction(departureId: string, formData: FormData): Promise<void> {
  let ctx;
  try {
    ctx = await authService.resolveSession(await headers());
  } catch {
    redirect(`/book/${departureId}?error=session`);
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
    redirect(`/booking/${booking.id}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 409) {
      redirect(`/book/${departureId}?error=sold_out`);
    }
    throw err;
  }
}
