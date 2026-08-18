'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireStaffContext } from '@lib/staff-guard';
import { CreatePlatformRateInput, UpdatePlatformRateInput, settingsService } from '@modules/settings';
import type { ReapplyRatesResult } from '@modules/finance';

// Same query-string-summary convention as finance/rates/actions.ts's own
// reapplyRedirectUrl -- surfaced on this page as a banner (see page.tsx).
function reapplyRedirectUrl(reapply: ReapplyRatesResult): string {
  const params = new URLSearchParams({
    reapplied: '1',
    packagesUpdated: String(reapply.packagesUpdated),
    packagesSkipped: String(reapply.packagesSkipped.length),
    bookingsUpdated: String(reapply.bookingsUpdated),
    bookingsSkipped: String(reapply.bookingsSkipped.length),
  });
  return `/staff/settings/platform-rate?${params.toString()}`;
}

export async function createPlatformRateAction(formData: FormData): Promise<void> {
  const ctx = await requireStaffContext('platform_settings.write');
  const input = CreatePlatformRateInput.parse({
    rateBp: Math.round(Number(formData.get('ratePercent')) * 100),
  });
  await settingsService.createPlatformRate(ctx, input);
  revalidatePath('/staff/settings/platform-rate');
}

/** Explicit user request: an in-place update instead of delete-and-
 * recreate -- reapplies every existing package/booking cost breakdown (see
 * settingsService.updatePlatformRate), same as financeService's own
 * updateXRate family (DR-136). */
export async function updatePlatformRateAction(id: string, formData: FormData): Promise<void> {
  const ctx = await requireStaffContext('platform_settings.write');
  const input = UpdatePlatformRateInput.parse({
    rateBp: Math.round(Number(formData.get('ratePercent')) * 100),
  });
  const { reapply } = await settingsService.updatePlatformRate(ctx, id, input);
  redirect(reapplyRedirectUrl(reapply));
}

export async function deletePlatformRateAction(id: string): Promise<void> {
  const ctx = await requireStaffContext('platform_settings.write');
  await settingsService.deletePlatformRate(ctx, id);
  revalidatePath('/staff/settings/platform-rate');
}
