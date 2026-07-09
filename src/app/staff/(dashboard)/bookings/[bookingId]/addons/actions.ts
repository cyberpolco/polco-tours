'use server';

import { redirect } from 'next/navigation';
import { requireStaffContext } from '@lib/staff-guard';
import { bookingService, SetAddonsInput } from '@modules/booking';

export async function finalizeAddonsAction(bookingId: string, formData: FormData): Promise<void> {
  const ctx = await requireStaffContext('booking.create');
  const input = SetAddonsInput.parse({ addonServiceIds: formData.getAll('addonServiceId').map(String) });
  await bookingService.setAddons(ctx, bookingId, input);
  redirect(`/staff/bookings/${bookingId}`);
}
