'use server';

import { redirect } from 'next/navigation';
import { requireStaffContext } from '@lib/staff-guard';
import { bookingService, SetAddonsInput } from '@modules/booking';
import { ApiError } from '@lib/errors';

export async function finalizeAddonsAction(bookingId: string, formData: FormData): Promise<void> {
  const ctx = await requireStaffContext('booking.create');
  const input = SetAddonsInput.parse({ addonServiceIds: formData.getAll('addonServiceId').map(String) });
  try {
    await bookingService.setAddons(ctx, bookingId, input);
  } catch (err) {
    // Never let an ApiError (e.g. a currency mismatch) propagate unhandled
    // out of a Server Action -- see the guest equivalent's own comment for
    // the real production incident this closes.
    if (err instanceof ApiError) {
      redirect(`/staff/bookings/${bookingId}/addons?error=setAddons`);
    }
    throw err;
  }
  redirect(`/staff/bookings/${bookingId}/travelers/new`);
}
