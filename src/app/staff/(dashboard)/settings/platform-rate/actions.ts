'use server';

import { revalidatePath } from 'next/cache';
import { requireStaffContext } from '@lib/staff-guard';
import { CreatePlatformRateInput, settingsService } from '@modules/settings';

export async function createPlatformRateAction(formData: FormData): Promise<void> {
  const ctx = await requireStaffContext('platform_settings.write');
  const input = CreatePlatformRateInput.parse({
    rateBp: Math.round(Number(formData.get('ratePercent')) * 100),
  });
  await settingsService.createPlatformRate(ctx, input);
  revalidatePath('/staff/settings/platform-rate');
}

export async function deletePlatformRateAction(id: string): Promise<void> {
  const ctx = await requireStaffContext('platform_settings.write');
  await settingsService.deletePlatformRate(ctx, id);
  revalidatePath('/staff/settings/platform-rate');
}
