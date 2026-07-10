'use server';

import { redirect } from 'next/navigation';
import { requireGuestContext } from '@lib/guest-guard';
import { bookingService, SetAddonsInput } from '@modules/booking';

export async function finalizeAddonsAction(bookingId: string, formData: FormData): Promise<void> {
  const ctx = await requireGuestContext();
  const input = SetAddonsInput.parse({ addonServiceIds: formData.getAll('addonServiceId').map(String) });
  await bookingService.setAddons(ctx, bookingId, input);
  redirect(`/booking/${bookingId}`);
}
