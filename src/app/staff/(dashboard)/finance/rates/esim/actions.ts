'use server';

import { revalidatePath } from 'next/cache';
import { requireStaffContext } from '@lib/staff-guard';
import { CreateEsimDataPlanRateInput, financeService } from '@modules/finance';

function decimalToMinor(formData: FormData, key: string): number {
  return Math.round(Number(formData.get(key)) * 100);
}

// DR-222: EsimDataPlanRate prices the ESIM add-on by country + data-plan
// tier (GB). No reapply summary on update -- same reasoning as AddonRate/
// FlightFareRate's own update actions: resolved live at add-on selection
// time (src/lib/esim-rate.ts), never snapshotted into a cost breakdown.
export async function createEsimDataPlanRateAction(formData: FormData): Promise<void> {
  const ctx = await requireStaffContext('finance_config.write');
  const input = CreateEsimDataPlanRateInput.parse({
    country: String(formData.get('country') ?? ''),
    dataAllowanceGb: Number(formData.get('dataAllowanceGb')),
    priceMinor: decimalToMinor(formData, 'price'),
    currency: String(formData.get('currency') ?? ''),
  });
  await financeService.createEsimDataPlanRate(ctx, input);
  revalidatePath('/staff/finance/rates/esim');
}

export async function updateEsimDataPlanRateAction(id: string, formData: FormData): Promise<void> {
  const ctx = await requireStaffContext('finance_config.write');
  const input = CreateEsimDataPlanRateInput.parse({
    country: String(formData.get('country') ?? ''),
    dataAllowanceGb: Number(formData.get('dataAllowanceGb')),
    priceMinor: decimalToMinor(formData, 'price'),
    currency: String(formData.get('currency') ?? ''),
  });
  await financeService.updateEsimDataPlanRate(ctx, id, input);
  revalidatePath('/staff/finance/rates/esim');
}

export async function deleteEsimDataPlanRateAction(id: string): Promise<void> {
  const ctx = await requireStaffContext('finance_config.write');
  await financeService.deleteEsimDataPlanRate(ctx, id);
  revalidatePath('/staff/finance/rates/esim');
}
