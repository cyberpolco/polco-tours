'use server';

import { redirect } from 'next/navigation';
import { requireStaffContext } from '@lib/staff-guard';
import { ApiError } from '@lib/errors';
import { SaveCostBreakdownInput, financeService } from '@modules/finance';

function toMinor(formData: FormData, key: string): number {
  const raw = formData.get(key);
  return raw ? Math.round(Number(raw) * 100) : 0;
}

function optionalId(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

// Every drink rate available for the package's country is rendered as its
// own quantity input (name `lineItem_food_<id>`) -- no client JS needed to
// add/remove rows. A quantity left at 0 or blank is simply omitted from the
// saved breakdown. DR-131: accommodation/restaurant/activities are no
// longer form fields at all -- they're derived server-side from the
// package's own Day Template.
export async function saveCostBreakdownAction(packageId: string, formData: FormData): Promise<void> {
  const ctx = await requireStaffContext('catalog.write');

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

  const input = SaveCostBreakdownInput.parse({
    currency: String(formData.get('currency') ?? ''),
    referenceGroupSize: Number(formData.get('referenceGroupSize')),
    nights: Number(formData.get('nights') || 0),
    driverDays: Number(formData.get('driverDays') || 0),
    guideDays: Number(formData.get('guideDays') || 0),
    photographerDays: Number(formData.get('photographerDays') || 0),
    videographerDays: Number(formData.get('videographerDays') || 0),
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

  // DR-131: a package whose Day Template isn't filled in yet (missing
  // hotel/restaurant/activity Operational Rates) now throws a real, expected
  // Errors.conflict here far more often than before -- same ?error=&detail=
  // convention as the booking cost-breakdown flow, so staff see why instead
  // of a crash.
  try {
    await financeService.saveCostBreakdown(ctx, packageId, input);
  } catch (err) {
    if (err instanceof ApiError) {
      redirect(`/staff/packages/${packageId}/cost-breakdown?error=${err.slug}&detail=${encodeURIComponent(err.detail ?? '')}`);
    }
    throw err;
  }
  redirect(`/staff/packages/${packageId}/cost-breakdown`);
}
