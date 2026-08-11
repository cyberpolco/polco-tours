'use server';

import { requireGuestContext } from '@lib/guest-guard';
import { bookingService, SetAddonsInput } from '@modules/booking';
import { ApiError } from '@lib/errors';

export type FinalizeAddonsResult = { ok: true } | { error: true };

// Returns a result instead of calling redirect() -- redirect()'s special
// throw is only reliably turned into client-side navigation through a plain
// <form action> or useActionState (see book/[departureId]/actions.ts's own
// comment on this exact issue, and the real CI flake it caused here: a
// correct, fast server response whose redirect the browser's router
// occasionally never acted on). This action is now invoked directly from a
// client event handler (addons-form.tsx), which does the navigation itself
// via router.push once the promise resolves -- a plain client-side call,
// not subject to that redirect-header race.
export async function finalizeAddonsAction(bookingId: string, formData: FormData): Promise<FinalizeAddonsResult> {
  const ctx = await requireGuestContext();
  const input = SetAddonsInput.parse({ addonServiceIds: formData.getAll('addonServiceId').map(String) });
  try {
    await bookingService.setAddons(ctx, bookingId, input);
    return { ok: true };
  } catch (err) {
    // setAddons throws a real ApiError (e.g. a currency mismatch, or "no
    // price yet") -- this was previously completely unhandled, crashing
    // the whole page with a generic server-exception screen instead of a
    // friendly message (found live in production: a seeded add-on service
    // in a different currency than a NAD-priced package). Never let an
    // ApiError propagate unhandled out of a Server Action.
    if (err instanceof ApiError) {
      return { error: true };
    }
    throw err;
  }
}
