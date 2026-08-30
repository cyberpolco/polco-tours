'use server';

import { revalidatePath } from 'next/cache';
import { requireStaffContext } from '@lib/staff-guard';
import { CreateLateBookingRateInput, UpdateLateBookingRateInput, settingsService } from '@modules/settings';

export async function createLateBookingRateAction(formData: FormData): Promise<void> {
  const ctx = await requireStaffContext('platform_settings.write');
  const input = CreateLateBookingRateInput.parse({
    thresholdDays: Number(formData.get('thresholdDays')),
    surchargeRateBp: Math.round(Number(formData.get('surchargePercent')) * 100),
  });
  await settingsService.createLateBookingRate(ctx, input);
  revalidatePath('/staff/settings/late-booking-rate');
}

/** Explicit user request: an in-place update instead of delete-and-
 * recreate, same convention as updatePlatformRateAction -- deliberately no
 * reapply sweep here (see settingsService.updateLateBookingRate's own
 * comment), so this just revalidates instead of redirecting through a
 * reapply-summary banner. */
export async function updateLateBookingRateAction(id: string, formData: FormData): Promise<void> {
  const ctx = await requireStaffContext('platform_settings.write');
  const input = UpdateLateBookingRateInput.parse({
    thresholdDays: Number(formData.get('thresholdDays')),
    surchargeRateBp: Math.round(Number(formData.get('surchargePercent')) * 100),
  });
  await settingsService.updateLateBookingRate(ctx, id, input);
  revalidatePath('/staff/settings/late-booking-rate');
}

export async function deleteLateBookingRateAction(id: string): Promise<void> {
  const ctx = await requireStaffContext('platform_settings.write');
  await settingsService.deleteLateBookingRate(ctx, id);
  revalidatePath('/staff/settings/late-booking-rate');
}
