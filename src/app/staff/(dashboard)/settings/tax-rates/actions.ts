'use server';

import { revalidatePath } from 'next/cache';
import { requireStaffContext } from '@lib/staff-guard';
import { CreateTaxRateInput, settingsService } from '@modules/settings';

function percentToBp(formData: FormData, key: string): number {
  return Math.round(Number(formData.get(key)) * 100);
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

export async function deleteTaxRateAction(id: string): Promise<void> {
  const ctx = await requireStaffContext('platform_settings.write');
  await settingsService.deleteTaxRate(ctx, id);
  revalidatePath('/staff/settings/tax-rates');
}
