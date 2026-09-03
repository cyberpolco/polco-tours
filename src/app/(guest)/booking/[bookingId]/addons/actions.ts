'use server';

import { requireGuestContext } from '@lib/guest-guard';
import { bookingService, SetAddonsInput } from '@modules/booking';
import { ApiError } from '@lib/errors';
import { logger, newTraceId } from '@lib/logger';

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
//
// Every branch returns rather than throws (same convention as
// createGuestBookingAction, for the same reason): an uncaught throw out of
// a plain function call like this becomes a silent, invisible unhandled
// promise rejection in the browser, not a visible error -- there's no
// <form action>/useActionState wiring here to surface it on our behalf.
export async function finalizeAddonsAction(bookingId: string, formData: FormData): Promise<FinalizeAddonsResult> {
  // Deliberately outside the try/catch below -- requireGuestContext() throws
  // Next's own internal redirect() sentinel when there's no valid session,
  // and that special throw must propagate to the framework, not get caught
  // and swallowed as a generic { error: true } here.
  const ctx = await requireGuestContext();
  const traceId = newTraceId();
  try {
    // DR-222: SetAddonsInput's shape changed from a flat addonServiceIds
    // array to a per-selection { addons: [...] } array (to carry the new
    // FLIGHT_TICKET/ESIM variant fields). Plain checkboxes (the 4 existing
    // flat-priced codes) still map to a bare { addonServiceId }; the new
    // FlightTicketPicker/EsimPlanPicker each render one hidden, JSON-encoded
    // `flightSelection`/`esimSelection` field per accepted variant pick
    // (there's no other way for a plain FormData field to carry a
    // multi-field structured selection) -- decoded here and merged into one
    // flat addons array before validating against the real schema, so a
    // malformed/tampered JSON value fails the same way any other bad input
    // does (caught below, never propagated unhandled).
    const plainSelections = formData.getAll('addonServiceId').map((id) => ({ addonServiceId: String(id) }));
    const flightSelections = formData.getAll('flightSelection').map((v) => JSON.parse(String(v)));
    const esimSelections = formData.getAll('esimSelection').map((v) => JSON.parse(String(v)));
    const input = SetAddonsInput.parse({
      addons: [...plainSelections, ...flightSelections, ...esimSelections],
    });
    await bookingService.setAddons(ctx, bookingId, input);
    return { ok: true };
  } catch (err) {
    // setAddons throws a real ApiError (e.g. a currency mismatch, or "no
    // price yet") -- this was previously completely unhandled, crashing
    // the whole page with a generic server-exception screen instead of a
    // friendly message (found live in production: a seeded add-on service
    // in a different currency than a NAD-priced package). Never let an
    // ApiError -- or anything else -- propagate unhandled out of here.
    if (!(err instanceof ApiError)) {
      logger(traceId).error('finalizeAddonsAction failed unexpectedly', {
        message: err instanceof Error ? err.message : String(err),
      });
    }
    return { error: true };
  }
}
