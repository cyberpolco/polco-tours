'use server';

import { revalidatePath } from 'next/cache';
import { requireStaffContext } from '@lib/staff-guard';
import {
  CreateActivityFeeInput,
  CreateFoodBeverageRateInput,
  CreateHotelRateInput,
  CreateImmigrationCostRateInput,
  CreateStaffRateInput,
  CreateTransportRateInput,
  financeService,
} from '@modules/finance';

function decimalToMinor(formData: FormData, key: string): number {
  return Math.round(Number(formData.get(key)) * 100);
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

export async function deleteStaffRateAction(id: string): Promise<void> {
  const ctx = await requireStaffContext('finance_config.write');
  await financeService.deleteStaffRate(ctx, id);
  revalidatePath('/staff/finance/rates');
}

export async function createHotelRateAction(formData: FormData): Promise<void> {
  const ctx = await requireStaffContext('finance_config.write');
  const input = CreateHotelRateInput.parse({
    country: String(formData.get('country') ?? ''),
    roomCategory: String(formData.get('roomCategory') ?? '').trim(),
    nightlyRateMinor: decimalToMinor(formData, 'nightlyRate'),
    currency: String(formData.get('currency') ?? ''),
  });
  await financeService.createHotelRate(ctx, input);
  revalidatePath('/staff/finance/rates');
}

export async function deleteHotelRateAction(id: string): Promise<void> {
  const ctx = await requireStaffContext('finance_config.write');
  await financeService.deleteHotelRate(ctx, id);
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

export async function deleteFoodBeverageRateAction(id: string): Promise<void> {
  const ctx = await requireStaffContext('finance_config.write');
  await financeService.deleteFoodBeverageRate(ctx, id);
  revalidatePath('/staff/finance/rates');
}

export async function createActivityFeeAction(formData: FormData): Promise<void> {
  const ctx = await requireStaffContext('finance_config.write');
  const input = CreateActivityFeeInput.parse({
    country: String(formData.get('country') ?? ''),
    name: String(formData.get('name') ?? '').trim(),
    feeMinor: decimalToMinor(formData, 'fee'),
    currency: String(formData.get('currency') ?? ''),
  });
  await financeService.createActivityFee(ctx, input);
  revalidatePath('/staff/finance/rates');
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

export async function deleteImmigrationCostRateAction(id: string): Promise<void> {
  const ctx = await requireStaffContext('finance_config.write');
  await financeService.deleteImmigrationCostRate(ctx, id);
  revalidatePath('/staff/finance/rates');
}
