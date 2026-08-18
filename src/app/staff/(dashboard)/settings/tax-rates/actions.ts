'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireStaffContext } from '@lib/staff-guard';
import { CreateTaxRateInput, UpdateTaxRateInput, settingsService } from '@modules/settings';
import type { ReapplyRatesResult } from '@modules/finance';

function percentToBp(formData: FormData, key: string): number {
  return Math.round(Number(formData.get(key)) * 100);
}

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
  return `/staff/settings/tax-rates?${params.toString()}`;
}

export async function createTaxRateAction(formData: FormData): Promise<void> {
  const ctx = await requireStaffContext('platform_settings.write');
  const taxTypeRaw = String(formData.get('taxType') ?? '').trim();
  const input = CreateTaxRateInput.parse({
    country: String(formData.get('country') ?? ''),
    taxType: taxTypeRaw || undefined,
    rateBp: percentToBp(formData, 'ratePercent'),
  });
  await settingsService.createTaxRate(ctx, input);
  revalidatePath('/staff/settings/tax-rates');
}

/** Explicit user request: an in-place update instead of delete-and-
 * recreate -- reapplies every existing package/booking cost breakdown
 * (see settingsService.updateTaxRate), same as financeService's own
 * updateXRate family (DR-136). */
export async function updateTaxRateAction(id: string, formData: FormData): Promise<void> {
  const ctx = await requireStaffContext('platform_settings.write');
  const taxTypeRaw = String(formData.get('taxType') ?? '').trim();
  const input = UpdateTaxRateInput.parse({
    country: String(formData.get('country') ?? ''),
    taxType: taxTypeRaw || undefined,
    rateBp: percentToBp(formData, 'ratePercent'),
  });
  const { reapply } = await settingsService.updateTaxRate(ctx, id, input);
  redirect(reapplyRedirectUrl(reapply));
}

export async function deleteTaxRateAction(id: string): Promise<void> {
  const ctx = await requireStaffContext('platform_settings.write');
  await settingsService.deleteTaxRate(ctx, id);
  revalidatePath('/staff/settings/tax-rates');
}
