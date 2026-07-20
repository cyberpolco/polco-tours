'use server';

import { redirect } from 'next/navigation';
import { requireGuestContext } from '@lib/guest-guard';
import { bookingService, SetAddonsInput } from '@modules/booking';
import { ApiError } from '@lib/errors';

export async function finalizeAddonsAction(bookingId: string, formData: FormData): Promise<void> {
  const ctx = await requireGuestContext();
  const input = SetAddonsInput.parse({ addonServiceIds: formData.getAll('addonServiceId').map(String) });
  try {
    await bookingService.setAddons(ctx, bookingId, input);
  } catch (err) {
    // setAddons throws a real ApiError (e.g. a currency mismatch, or "no
    // price yet") -- this was previously completely unhandled, crashing
    // the whole page with a generic server-exception screen instead of a
    // friendly message (found live in production: a seeded add-on service
    // in a different currency than a NAD-priced package). Never let an
    // ApiError propagate unhandled out of a Server Action.
    if (err instanceof ApiError) {
      redirect(`/booking/${bookingId}/addons?error=setAddons`);
    }
    throw err;
  }
  redirect(`/booking/${bookingId}/travelers/new`);
}
