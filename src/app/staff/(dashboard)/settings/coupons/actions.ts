'use server';

import { revalidatePath } from 'next/cache';
import { requireStaffContext } from '@lib/staff-guard';
import { CreateCouponInput, UpdateCouponInput, settingsService } from '@modules/settings';

function percentToBp(formData: FormData, key: string): number {
  return Math.round(Number(formData.get(key)) * 100);
}

// Shared by create/update -- blank optional fields mean "unlimited"/"never
// expires" on create, and the same blank means "clear it" on update (full
// replace, see UpdateCouponInput's own comment in domain.ts).
function parseCouponFormInput(formData: FormData): { discountBp: number; maxRedemptions?: number; expiresAt?: string } {
  const maxRedemptionsRaw = String(formData.get('maxRedemptions') ?? '').trim();
  const expiresAtRaw = String(formData.get('expiresAt') ?? '').trim();
  return {
    discountBp: percentToBp(formData, 'discountPercent'),
    maxRedemptions: maxRedemptionsRaw ? Number(maxRedemptionsRaw) : undefined,
    expiresAt: expiresAtRaw || undefined,
  };
}

export async function createCouponAction(formData: FormData): Promise<void> {
  const ctx = await requireStaffContext('platform_settings.write');
  const input = CreateCouponInput.parse(parseCouponFormInput(formData));
  await settingsService.createCoupon(ctx, input);
  revalidatePath('/staff/settings/coupons');
}

export async function updateCouponAction(id: string, formData: FormData): Promise<void> {
  const ctx = await requireStaffContext('platform_settings.write');
  const input = UpdateCouponInput.parse(parseCouponFormInput(formData));
  await settingsService.updateCoupon(ctx, id, input);
  revalidatePath('/staff/settings/coupons');
}

// DR-144 (explicit user request, replaces deactivateCouponAction): a
// genuine delete -- also removes the coupon's redemption history
// (schema-level cascade, see schema.prisma's Coupon/CouponRedemption
// comments).
export async function deleteCouponAction(id: string): Promise<void> {
  const ctx = await requireStaffContext('platform_settings.write');
  await settingsService.deleteCoupon(ctx, id);
  revalidatePath('/staff/settings/coupons');
}
