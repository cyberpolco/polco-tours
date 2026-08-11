'use server';

import { revalidatePath } from 'next/cache';
import { requireStaffContext } from '@lib/staff-guard';
import { CreateCouponInput, settingsService } from '@modules/settings';

function percentToBp(formData: FormData, key: string): number {
  return Math.round(Number(formData.get(key)) * 100);
}

export async function createCouponAction(formData: FormData): Promise<void> {
  const ctx = await requireStaffContext('platform_settings.write');
  const maxRedemptionsRaw = String(formData.get('maxRedemptions') ?? '').trim();
  const expiresAtRaw = String(formData.get('expiresAt') ?? '').trim();
  const input = CreateCouponInput.parse({
    discountBp: percentToBp(formData, 'discountPercent'),
    maxRedemptions: maxRedemptionsRaw ? Number(maxRedemptionsRaw) : undefined,
    expiresAt: expiresAtRaw || undefined,
  });
  await settingsService.createCoupon(ctx, input);
  revalidatePath('/staff/settings/coupons');
}

export async function deactivateCouponAction(id: string): Promise<void> {
  const ctx = await requireStaffContext('platform_settings.write');
  await settingsService.deactivateCoupon(ctx, id);
  revalidatePath('/staff/settings/coupons');
}
