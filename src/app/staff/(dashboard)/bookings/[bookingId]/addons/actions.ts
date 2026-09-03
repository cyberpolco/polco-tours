'use server';

import { redirect } from 'next/navigation';
import { requireStaffContext } from '@lib/staff-guard';
import { bookingService, SetAddonsInput } from '@modules/booking';
import { ApiError } from '@lib/errors';

export async function finalizeAddonsAction(bookingId: string, formData: FormData): Promise<void> {
  const ctx = await requireStaffContext('booking.create');
  try {
    // DR-222: SetAddonsInput's shape changed from a flat addonServiceIds
    // array to a per-selection { addons: [...] } array (to carry the new
    // FLIGHT_TICKET/ESIM variant fields). Plain checkboxes (the 4 existing
    // flat-priced codes) still map to a bare { addonServiceId }; the new
    // FlightTicketPicker/EsimPlanPicker each render one hidden, JSON-encoded
    // `flightSelection`/`esimSelection` field per accepted variant pick --
    // decoded here and merged into one flat addons array before validating,
    // same convention as the guest equivalent's own comment.
    const plainSelections = formData.getAll('addonServiceId').map((id) => ({ addonServiceId: String(id) }));
    const flightSelections = formData.getAll('flightSelection').map((v) => JSON.parse(String(v)));
    const esimSelections = formData.getAll('esimSelection').map((v) => JSON.parse(String(v)));
    const input = SetAddonsInput.parse({
      addons: [...plainSelections, ...flightSelections, ...esimSelections],
    });
    await bookingService.setAddons(ctx, bookingId, input);
  } catch (err) {
    // Never let an ApiError (e.g. a currency mismatch) -- or a malformed
    // JSON/zod-validation failure from the variant hidden fields -- escape
    // unhandled out of a Server Action; see the guest equivalent's own
    // comment for the real production incident this closes.
    if (err instanceof ApiError) {
      redirect(`/staff/bookings/${bookingId}/addons?error=setAddons`);
    }
    throw err;
  }
  redirect(`/staff/bookings/${bookingId}/travelers/new`);
}
