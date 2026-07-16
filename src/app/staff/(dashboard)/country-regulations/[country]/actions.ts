'use server';

import { redirect } from 'next/navigation';
import { requireStaffContext } from '@lib/staff-guard';
import { UpdateCountryRegulationInput, immigrationService } from '@modules/immigration';

function emptyToUndefined(v: FormDataEntryValue | null): string | undefined {
  const s = v ? String(v).trim() : '';
  return s.length > 0 ? s : undefined;
}

function feeMinorFromForm(formData: FormData): number | undefined {
  const raw = String(formData.get('fee') ?? '').trim();
  return raw.length > 0 ? Math.round(Number(raw) * 100) : undefined;
}

export async function updateCountryRegulationAction(country: string, formData: FormData): Promise<void> {
  const ctx = await requireStaffContext('country_regulation.write');
  if (!ctx.roles.includes('SUPERADMIN')) redirect('/staff/forbidden');

  const input = UpdateCountryRegulationInput.parse({
    visaRequirements: String(formData.get('visaRequirements') ?? '').trim(),
    requiredDocuments: String(formData.get('requiredDocuments') ?? '').trim(),
    processingTimeDays: emptyToUndefined(formData.get('processingTimeDays'))
      ? Number(formData.get('processingTimeDays'))
      : undefined,
    entryConditions: String(formData.get('entryConditions') ?? '').trim(),
    immigrationFeeMinor: feeMinorFromForm(formData),
    feeCurrency: emptyToUndefined(formData.get('feeCurrency')),
    embassyName: emptyToUndefined(formData.get('embassyName')),
    embassyAddress: emptyToUndefined(formData.get('embassyAddress')),
    embassyPhone: emptyToUndefined(formData.get('embassyPhone')),
    embassyEmail: emptyToUndefined(formData.get('embassyEmail')),
    healthRequirements: String(formData.get('healthRequirements') ?? '').trim(),
    travelAdvisories: emptyToUndefined(formData.get('travelAdvisories')),
    specialRestrictions: emptyToUndefined(formData.get('specialRestrictions')),
  });
  await immigrationService.updateRegulation(ctx, country, input);
  redirect(`/staff/country-regulations/${country}`);
}

export async function deleteCountryRegulationAction(country: string): Promise<void> {
  const ctx = await requireStaffContext('country_regulation.write');
  if (!ctx.roles.includes('SUPERADMIN')) redirect('/staff/forbidden');

  await immigrationService.deleteRegulation(ctx, country);
  redirect('/staff/country-regulations');
}
