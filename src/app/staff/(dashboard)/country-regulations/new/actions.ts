'use server';

import { redirect } from 'next/navigation';
import { requireStaffContext } from '@lib/staff-guard';
import { CreateCountryRegulationInput, immigrationService } from '@modules/immigration';

function emptyToUndefined(v: FormDataEntryValue | null): string | undefined {
  const s = v ? String(v).trim() : '';
  return s.length > 0 ? s : undefined;
}

function feeMinorFromForm(formData: FormData): number | undefined {
  const raw = String(formData.get('fee') ?? '').trim();
  return raw.length > 0 ? Math.round(Number(raw) * 100) : undefined;
}

export async function createCountryRegulationAction(formData: FormData): Promise<void> {
  const ctx = await requireStaffContext('country_regulation.write');
  if (!ctx.roles.includes('SUPERADMIN')) redirect('/staff/forbidden');

  const input = CreateCountryRegulationInput.parse({
    country: String(formData.get('country') ?? '').trim(),
    visaRequirements: String(formData.get('visaRequirements') ?? '').trim(),
    visaRequirementsFr: emptyToUndefined(formData.get('visaRequirementsFr')),
    requiredDocuments: String(formData.get('requiredDocuments') ?? '').trim(),
    requiredDocumentsFr: emptyToUndefined(formData.get('requiredDocumentsFr')),
    processingTimeDays: emptyToUndefined(formData.get('processingTimeDays'))
      ? Number(formData.get('processingTimeDays'))
      : undefined,
    entryConditions: String(formData.get('entryConditions') ?? '').trim(),
    entryConditionsFr: emptyToUndefined(formData.get('entryConditionsFr')),
    immigrationFeeMinor: feeMinorFromForm(formData),
    feeCurrency: emptyToUndefined(formData.get('feeCurrency')),
    embassyName: emptyToUndefined(formData.get('embassyName')),
    embassyAddress: emptyToUndefined(formData.get('embassyAddress')),
    embassyPhone: emptyToUndefined(formData.get('embassyPhone')),
    embassyEmail: emptyToUndefined(formData.get('embassyEmail')),
    healthRequirements: String(formData.get('healthRequirements') ?? '').trim(),
    healthRequirementsFr: emptyToUndefined(formData.get('healthRequirementsFr')),
    travelAdvisories: emptyToUndefined(formData.get('travelAdvisories')),
    travelAdvisoriesFr: emptyToUndefined(formData.get('travelAdvisoriesFr')),
    specialRestrictions: emptyToUndefined(formData.get('specialRestrictions')),
    specialRestrictionsFr: emptyToUndefined(formData.get('specialRestrictionsFr')),
  });
  const regulation = await immigrationService.createRegulation(ctx, input);
  redirect(`/staff/country-regulations/${regulation.country}`);
}
