'use server';

import { redirect } from 'next/navigation';
import { requireStaffContext } from '@lib/staff-guard';
import { ApiError } from '@lib/errors';
import { SaveBookingCostBreakdownInput, financeService } from '@modules/finance';

function toMinor(formData: FormData, key: string): number {
  const raw = formData.get(key);
  return raw ? Math.round(Number(raw) * 100) : 0;
}

function optionalId(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

// Same lineItem_food_<id> dynamic-row convention as
// packages/[packageId]/cost-breakdown/actions.ts. DR-131: accommodation/
// restaurant/activities are no longer form fields -- derived server-side
// from the booking's linked customized package's Day Template.
export async function saveBookingCostBreakdownAction(bookingId: string, formData: FormData): Promise<void> {
  const ctx = await requireStaffContext('booking.confirm');

  const drinkLineItems: Array<{ foodBeverageRateId: string; quantityPerPerson: number }> = [];
  for (const [key, value] of formData.entries()) {
    const quantity = Number(value);
    if (!quantity || quantity <= 0) continue;
    if (key.startsWith('lineItem_food_')) {
      drinkLineItems.push({ foodBeverageRateId: key.replace('lineItem_food_', ''), quantityPerPerson: quantity });
    }
  }

  const overrideRaw = formData.get('overridePriceMinor');
  const overridePriceMinor = overrideRaw && String(overrideRaw).trim() ? toMinor(formData, 'overridePriceMinor') : undefined;
  const overrideReason = optionalId(formData, 'overrideReason');

  const input = SaveBookingCostBreakdownInput.parse({
    nights: Number(formData.get('nights') || 0),
    driverDays: Number(formData.get('driverDays') || 0),
    guideDays: Number(formData.get('guideDays') || 0),
    transportRateId: optionalId(formData, 'transportRateId'),
    transportDays: Number(formData.get('transportDays') || 0),
    requiresVisa: formData.get('requiresVisa') === 'on',
    immigrationCostRateId: optionalId(formData, 'immigrationCostRateId'),
    adminDays: Number(formData.get('adminDays') || 0),
    adminCostBasis: String(formData.get('adminCostBasis') || 'PER_GROUP'),
    agencyMarginBp: Math.round(Number(formData.get('agencyMarginPercent') || 0) * 100),
    drinkLineItems,
    overridePriceMinor,
    overrideReason,
  });

  try {
    await financeService.saveBookingCostBreakdown(ctx, bookingId, input);
  } catch (err) {
    if (err instanceof ApiError) {
      redirect(`/staff/bookings/${bookingId}/cost-breakdown?error=${err.slug}&detail=${encodeURIComponent(err.detail ?? '')}`);
    }
    throw err;
  }
  redirect(`/staff/bookings/${bookingId}/cost-breakdown`);
}
