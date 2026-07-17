'use server';

import { redirect } from 'next/navigation';
import { requireStaffContext } from '@lib/staff-guard';
import { SaveCostBreakdownInput, financeService } from '@modules/finance';

function toMinor(formData: FormData, key: string): number {
  const raw = formData.get(key);
  return raw ? Math.round(Number(raw) * 100) : 0;
}

function optionalId(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

// Every drink/activity rate available for the package's country is rendered
// as its own quantity input (name `lineItem_food_<id>` / `lineItem_activity_
// <id>`) -- no client JS needed to add/remove rows. A quantity left at 0 or
// blank is simply omitted from the saved breakdown.
export async function saveCostBreakdownAction(packageId: string, formData: FormData): Promise<void> {
  const ctx = await requireStaffContext('catalog.write');

  const lineItems: Array<{ foodBeverageRateId?: string; activityFeeId?: string; quantityPerPerson: number }> = [];
  for (const [key, value] of formData.entries()) {
    const quantity = Number(value);
    if (!quantity || quantity <= 0) continue;
    if (key.startsWith('lineItem_food_')) {
      lineItems.push({ foodBeverageRateId: key.replace('lineItem_food_', ''), quantityPerPerson: quantity });
    } else if (key.startsWith('lineItem_activity_')) {
      lineItems.push({ activityFeeId: key.replace('lineItem_activity_', ''), quantityPerPerson: quantity });
    }
  }

  const overrideRaw = formData.get('overridePriceMinor');
  const overridePriceMinor = overrideRaw && String(overrideRaw).trim() ? toMinor(formData, 'overridePriceMinor') : undefined;
  const overrideReason = optionalId(formData, 'overrideReason');

  const input = SaveCostBreakdownInput.parse({
    currency: String(formData.get('currency') ?? ''),
    referenceGroupSize: Number(formData.get('referenceGroupSize')),
    nights: Number(formData.get('nights') || 0),
    driverDays: Number(formData.get('driverDays') || 0),
    guideDays: Number(formData.get('guideDays') || 0),
    photographerDays: Number(formData.get('photographerDays') || 0),
    videographerDays: Number(formData.get('videographerDays') || 0),
    hotelRateId: optionalId(formData, 'hotelRateId'),
    roomsNeeded: Number(formData.get('roomsNeeded') || 1),
    breakfastCount: Number(formData.get('breakfastCount') || 0),
    lunchCount: Number(formData.get('lunchCount') || 0),
    dinnerCount: Number(formData.get('dinnerCount') || 0),
    transportRateId: optionalId(formData, 'transportRateId'),
    transportDays: Number(formData.get('transportDays') || 0),
    requiresVisa: formData.get('requiresVisa') === 'on',
    immigrationCostRateId: optionalId(formData, 'immigrationCostRateId'),
    agencyMarginBp: Math.round(Number(formData.get('agencyMarginPercent') || 0) * 100),
    lineItems,
    overridePriceMinor,
    overrideReason,
  });

  await financeService.saveCostBreakdown(ctx, packageId, input);
  redirect(`/staff/packages/${packageId}/cost-breakdown`);
}
