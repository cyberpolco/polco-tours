'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireStaffContext } from '@lib/staff-guard';
import {
  CreateActivityFeeInput,
  CreateAddonRateInput,
  CreateAdminCostRateInput,
  CreateFoodBeverageRateInput,
  CreateHotelRateInput,
  CreateImmigrationCostRateInput,
  CreateRestaurantRateInput,
  CreateStaffRateInput,
  CreateTransportRateInput,
  financeService,
  type ReapplyRatesResult,
} from '@modules/finance';

function decimalToMinor(formData: FormData, key: string): number {
  return Math.round(Number(formData.get(key)) * 100);
}

// Explicit user request: once a rate's price is updated, every existing
// cost breakdown package/booking is recomputed against it -- surfaced here
// as a plain redirect + query-string summary (same "?error=&detail="
// convention as the packages pages) rather than a return value, since
// these are plain <form action={...}> Server Actions with no client-side
// handler to read a return value from.
function reapplyRedirectUrl(reapply: ReapplyRatesResult): string {
  const params = new URLSearchParams({
    reapplied: '1',
    packagesUpdated: String(reapply.packagesUpdated),
    packagesSkipped: String(reapply.packagesSkipped.length),
    bookingsUpdated: String(reapply.bookingsUpdated),
    bookingsSkipped: String(reapply.bookingsSkipped.length),
  });
  return `/staff/finance/rates?${params.toString()}`;
}

export async function createStaffRateAction(formData: FormData): Promise<void> {
  const ctx = await requireStaffContext('finance_config.write');
  const input = CreateStaffRateInput.parse({
    country: String(formData.get('country') ?? ''),
    role: String(formData.get('role') ?? ''),
    dailyRateMinor: decimalToMinor(formData, 'dailyRate'),
    currency: String(formData.get('currency') ?? ''),
  });
  await financeService.createStaffRate(ctx, input);
  revalidatePath('/staff/finance/rates');
}

export async function updateStaffRateAction(id: string, formData: FormData): Promise<void> {
  const ctx = await requireStaffContext('finance_config.write');
  const input = CreateStaffRateInput.parse({
    country: String(formData.get('country') ?? ''),
    role: String(formData.get('role') ?? ''),
    dailyRateMinor: decimalToMinor(formData, 'dailyRate'),
    currency: String(formData.get('currency') ?? ''),
  });
  const { reapply } = await financeService.updateStaffRate(ctx, id, input);
  redirect(reapplyRedirectUrl(reapply));
}

export async function deleteStaffRateAction(id: string): Promise<void> {
  const ctx = await requireStaffContext('finance_config.write');
  await financeService.deleteStaffRate(ctx, id);
  revalidatePath('/staff/finance/rates');
}

export async function createHotelRateAction(formData: FormData): Promise<void> {
  const ctx = await requireStaffContext('finance_config.write');
  const input = CreateHotelRateInput.parse({
    country: String(formData.get('country') ?? ''),
    hotelId: String(formData.get('hotelId') ?? ''),
    roomCategory: String(formData.get('roomCategory') ?? '').trim(),
    nightlyRateMinor: decimalToMinor(formData, 'nightlyRate'),
    currency: String(formData.get('currency') ?? ''),
  });
  await financeService.createHotelRate(ctx, input);
  revalidatePath('/staff/finance/rates');
}

export async function updateHotelRateAction(id: string, formData: FormData): Promise<void> {
  const ctx = await requireStaffContext('finance_config.write');
  const input = CreateHotelRateInput.parse({
    country: String(formData.get('country') ?? ''),
    hotelId: String(formData.get('hotelId') ?? ''),
    roomCategory: String(formData.get('roomCategory') ?? '').trim(),
    nightlyRateMinor: decimalToMinor(formData, 'nightlyRate'),
    currency: String(formData.get('currency') ?? ''),
  });
  const { reapply } = await financeService.updateHotelRate(ctx, id, input);
  redirect(reapplyRedirectUrl(reapply));
}

export async function deleteHotelRateAction(id: string): Promise<void> {
  const ctx = await requireStaffContext('finance_config.write');
  await financeService.deleteHotelRate(ctx, id);
  revalidatePath('/staff/finance/rates');
}

export async function createRestaurantRateAction(formData: FormData): Promise<void> {
  const ctx = await requireStaffContext('finance_config.write');
  const input = CreateRestaurantRateInput.parse({
    country: String(formData.get('country') ?? ''),
    restaurantId: String(formData.get('restaurantId') ?? ''),
    dailyRateMinor: decimalToMinor(formData, 'dailyRate'),
    currency: String(formData.get('currency') ?? ''),
  });
  await financeService.createRestaurantRate(ctx, input);
  revalidatePath('/staff/finance/rates');
}

export async function updateRestaurantRateAction(id: string, formData: FormData): Promise<void> {
  const ctx = await requireStaffContext('finance_config.write');
  const input = CreateRestaurantRateInput.parse({
    country: String(formData.get('country') ?? ''),
    restaurantId: String(formData.get('restaurantId') ?? ''),
    dailyRateMinor: decimalToMinor(formData, 'dailyRate'),
    currency: String(formData.get('currency') ?? ''),
  });
  const { reapply } = await financeService.updateRestaurantRate(ctx, id, input);
  redirect(reapplyRedirectUrl(reapply));
}

export async function deleteRestaurantRateAction(id: string): Promise<void> {
  const ctx = await requireStaffContext('finance_config.write');
  await financeService.deleteRestaurantRate(ctx, id);
  revalidatePath('/staff/finance/rates');
}

export async function createTransportRateAction(formData: FormData): Promise<void> {
  const ctx = await requireStaffContext('finance_config.write');
  const input = CreateTransportRateInput.parse({
    country: String(formData.get('country') ?? ''),
    fuelEstimateMinor: decimalToMinor(formData, 'fuelEstimate'),
    tollFeesMinor: decimalToMinor(formData, 'tollFees'),
    parkingFeesMinor: decimalToMinor(formData, 'parkingFees'),
    vehicleOperatingCostMinor: decimalToMinor(formData, 'vehicleOperatingCost'),
    currency: String(formData.get('currency') ?? ''),
  });
  await financeService.createTransportRate(ctx, input);
  revalidatePath('/staff/finance/rates');
}

export async function updateTransportRateAction(id: string, formData: FormData): Promise<void> {
  const ctx = await requireStaffContext('finance_config.write');
  const input = CreateTransportRateInput.parse({
    country: String(formData.get('country') ?? ''),
    fuelEstimateMinor: decimalToMinor(formData, 'fuelEstimate'),
    tollFeesMinor: decimalToMinor(formData, 'tollFees'),
    parkingFeesMinor: decimalToMinor(formData, 'parkingFees'),
    vehicleOperatingCostMinor: decimalToMinor(formData, 'vehicleOperatingCost'),
    currency: String(formData.get('currency') ?? ''),
  });
  const { reapply } = await financeService.updateTransportRate(ctx, id, input);
  redirect(reapplyRedirectUrl(reapply));
}

export async function deleteTransportRateAction(id: string): Promise<void> {
  const ctx = await requireStaffContext('finance_config.write');
  await financeService.deleteTransportRate(ctx, id);
  revalidatePath('/staff/finance/rates');
}

export async function createFoodBeverageRateAction(formData: FormData): Promise<void> {
  const ctx = await requireStaffContext('finance_config.write');
  const input = CreateFoodBeverageRateInput.parse({
    country: String(formData.get('country') ?? ''),
    category: String(formData.get('category') ?? ''),
    perUnitMinor: decimalToMinor(formData, 'perUnit'),
    currency: String(formData.get('currency') ?? ''),
  });
  await financeService.createFoodBeverageRate(ctx, input);
  revalidatePath('/staff/finance/rates');
}

export async function updateFoodBeverageRateAction(id: string, formData: FormData): Promise<void> {
  const ctx = await requireStaffContext('finance_config.write');
  const input = CreateFoodBeverageRateInput.parse({
    country: String(formData.get('country') ?? ''),
    category: String(formData.get('category') ?? ''),
    perUnitMinor: decimalToMinor(formData, 'perUnit'),
    currency: String(formData.get('currency') ?? ''),
  });
  const { reapply } = await financeService.updateFoodBeverageRate(ctx, id, input);
  redirect(reapplyRedirectUrl(reapply));
}

export async function deleteFoodBeverageRateAction(id: string): Promise<void> {
  const ctx = await requireStaffContext('finance_config.write');
  await financeService.deleteFoodBeverageRate(ctx, id);
  revalidatePath('/staff/finance/rates');
}

export async function createActivityFeeAction(formData: FormData): Promise<void> {
  const ctx = await requireStaffContext('finance_config.write');
  const input = CreateActivityFeeInput.parse({
    country: String(formData.get('country') ?? ''),
    activityId: String(formData.get('activityId') ?? ''),
    feeMinor: decimalToMinor(formData, 'fee'),
    currency: String(formData.get('currency') ?? ''),
  });
  await financeService.createActivityFee(ctx, input);
  revalidatePath('/staff/finance/rates');
}

export async function updateActivityFeeAction(id: string, formData: FormData): Promise<void> {
  const ctx = await requireStaffContext('finance_config.write');
  const input = CreateActivityFeeInput.parse({
    country: String(formData.get('country') ?? ''),
    activityId: String(formData.get('activityId') ?? ''),
    feeMinor: decimalToMinor(formData, 'fee'),
    currency: String(formData.get('currency') ?? ''),
  });
  const { reapply } = await financeService.updateActivityFee(ctx, id, input);
  redirect(reapplyRedirectUrl(reapply));
}

export async function deleteActivityFeeAction(id: string): Promise<void> {
  const ctx = await requireStaffContext('finance_config.write');
  await financeService.deleteActivityFee(ctx, id);
  revalidatePath('/staff/finance/rates');
}

export async function createImmigrationCostRateAction(formData: FormData): Promise<void> {
  const ctx = await requireStaffContext('finance_config.write');
  const input = CreateImmigrationCostRateInput.parse({
    country: String(formData.get('country') ?? ''),
    visaFeeMinor: decimalToMinor(formData, 'visaFee'),
    processingFeeMinor: decimalToMinor(formData, 'processingFee'),
    invitationLetterFeeMinor: decimalToMinor(formData, 'invitationLetterFee'),
    borderPermitFeeMinor: decimalToMinor(formData, 'borderPermitFee'),
    currency: String(formData.get('currency') ?? ''),
  });
  await financeService.createImmigrationCostRate(ctx, input);
  revalidatePath('/staff/finance/rates');
}

export async function updateImmigrationCostRateAction(id: string, formData: FormData): Promise<void> {
  const ctx = await requireStaffContext('finance_config.write');
  const input = CreateImmigrationCostRateInput.parse({
    country: String(formData.get('country') ?? ''),
    visaFeeMinor: decimalToMinor(formData, 'visaFee'),
    processingFeeMinor: decimalToMinor(formData, 'processingFee'),
    invitationLetterFeeMinor: decimalToMinor(formData, 'invitationLetterFee'),
    borderPermitFeeMinor: decimalToMinor(formData, 'borderPermitFee'),
    currency: String(formData.get('currency') ?? ''),
  });
  const { reapply } = await financeService.updateImmigrationCostRate(ctx, id, input);
  redirect(reapplyRedirectUrl(reapply));
}

export async function deleteImmigrationCostRateAction(id: string): Promise<void> {
  const ctx = await requireStaffContext('finance_config.write');
  await financeService.deleteImmigrationCostRate(ctx, id);
  revalidatePath('/staff/finance/rates');
}

export async function createAdminCostRateAction(formData: FormData): Promise<void> {
  const ctx = await requireStaffContext('finance_config.write');
  const input = CreateAdminCostRateInput.parse({
    country: String(formData.get('country') ?? ''),
    dailyRateMinor: decimalToMinor(formData, 'dailyRate'),
    currency: String(formData.get('currency') ?? ''),
  });
  await financeService.createAdminCostRate(ctx, input);
  revalidatePath('/staff/finance/rates');
}

export async function updateAdminCostRateAction(id: string, formData: FormData): Promise<void> {
  const ctx = await requireStaffContext('finance_config.write');
  const input = CreateAdminCostRateInput.parse({
    country: String(formData.get('country') ?? ''),
    dailyRateMinor: decimalToMinor(formData, 'dailyRate'),
    currency: String(formData.get('currency') ?? ''),
  });
  const { reapply } = await financeService.updateAdminCostRate(ctx, id, input);
  redirect(reapplyRedirectUrl(reapply));
}

export async function deleteAdminCostRateAction(id: string): Promise<void> {
  const ctx = await requireStaffContext('finance_config.write');
  await financeService.deleteAdminCostRate(ctx, id);
  revalidatePath('/staff/finance/rates');
}

export async function createAddonRateAction(formData: FormData): Promise<void> {
  const ctx = await requireStaffContext('finance_config.write');
  const input = CreateAddonRateInput.parse({
    country: String(formData.get('country') ?? ''),
    code: String(formData.get('code') ?? ''),
    priceMinor: decimalToMinor(formData, 'price'),
    currency: String(formData.get('currency') ?? ''),
  });
  await financeService.createAddonRate(ctx, input);
  revalidatePath('/staff/finance/rates');
}

// No reapply summary here, unlike every other update action above -- an
// AddonRate has nothing snapshotted anywhere to recompute.
export async function updateAddonRateAction(id: string, formData: FormData): Promise<void> {
  const ctx = await requireStaffContext('finance_config.write');
  const input = CreateAddonRateInput.parse({
    country: String(formData.get('country') ?? ''),
    code: String(formData.get('code') ?? ''),
    priceMinor: decimalToMinor(formData, 'price'),
    currency: String(formData.get('currency') ?? ''),
  });
  await financeService.updateAddonRate(ctx, id, input);
  revalidatePath('/staff/finance/rates');
}

export async function deleteAddonRateAction(id: string): Promise<void> {
  const ctx = await requireStaffContext('finance_config.write');
  await financeService.deleteAddonRate(ctx, id);
  revalidatePath('/staff/finance/rates');
}
