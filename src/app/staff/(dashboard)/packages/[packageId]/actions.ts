'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireStaffContext } from '@lib/staff-guard';
import { AddPackageItineraryDayInput, UpdatePackageItineraryDayInput, UpdatePackageInput, catalogService } from '@modules/catalog';

const PACKAGE_TAGS = ['WILDLIFE', 'ADVENTURE', 'RELAXATION', 'FAMILY', 'CULTURE', 'LUXURY', 'BUDGET'] as const;

export async function updatePackageAction(packageId: string, formData: FormData): Promise<void> {
  const ctx = await requireStaffContext('catalog.write');

  // DR-039: price is no longer typed here -- it's computed by the finance
  // module's cost breakdown (or set there via an audited override). This
  // form still edits every other package attribute, including currency
  // (the cost breakdown's own currency must match, checked in
  // financeService.saveCostBreakdown).
  const durationDaysRaw = formData.get('durationDays');
  const input = UpdatePackageInput.parse({
    title: String(formData.get('title') ?? '').trim(),
    description: String(formData.get('description') ?? '').trim(),
    country: String(formData.get('country') ?? ''),
    currency: String(formData.get('currency') ?? ''),
    durationDays: durationDaysRaw ? Number(durationDaysRaw) : undefined,
    tags: formData.getAll('tags').filter((t): t is string => typeof t === 'string' && (PACKAGE_TAGS as readonly string[]).includes(t)),
    status: String(formData.get('status') ?? ''),
  });

  await catalogService.updatePackage(ctx, packageId, input);
  redirect(`/staff/packages/${packageId}`);
}

export async function archivePackageAction(packageId: string): Promise<void> {
  const ctx = await requireStaffContext('catalog.write');
  await catalogService.updatePackage(ctx, packageId, { status: 'ARCHIVED' });
  redirect(`/staff/packages/${packageId}`);
}

export async function deletePackageAction(packageId: string): Promise<void> {
  const ctx = await requireStaffContext('catalog.write');
  await catalogService.deletePackage(ctx, packageId);
  redirect('/staff/packages');
}

export async function duplicatePackageAction(packageId: string): Promise<void> {
  const ctx = await requireStaffContext('catalog.write');
  const duplicated = await catalogService.duplicatePackage(ctx, packageId);
  redirect(`/staff/packages/${duplicated.id}`);
}

function optionalString(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export async function addTemplateDayAction(packageId: string, formData: FormData): Promise<void> {
  const ctx = await requireStaffContext('catalog.write');
  const input = AddPackageItineraryDayInput.parse({
    dayNumber: Number(formData.get('dayNumber')),
    departureTime: optionalString(formData, 'departureTime'),
    arrivalTime: optionalString(formData, 'arrivalTime'),
    pickupLocation: optionalString(formData, 'pickupLocation'),
    dropoffLocation: optionalString(formData, 'dropoffLocation'),
    plannedSites: optionalString(formData, 'plannedSites'),
    activities: optionalString(formData, 'activities'),
    estimatedTravelMinutes: formData.get('estimatedTravelMinutes') ? Number(formData.get('estimatedTravelMinutes')) : undefined,
    notes: optionalString(formData, 'notes'),
  });
  await catalogService.addTemplateDay(ctx, packageId, input);
  revalidatePath(`/staff/packages/${packageId}`);
}

export async function updateTemplateDayAction(packageId: string, dayId: string, formData: FormData): Promise<void> {
  const ctx = await requireStaffContext('catalog.write');
  const input = UpdatePackageItineraryDayInput.parse({
    departureTime: optionalString(formData, 'departureTime'),
    arrivalTime: optionalString(formData, 'arrivalTime'),
    pickupLocation: optionalString(formData, 'pickupLocation'),
    dropoffLocation: optionalString(formData, 'dropoffLocation'),
    plannedSites: optionalString(formData, 'plannedSites'),
    activities: optionalString(formData, 'activities'),
    estimatedTravelMinutes: formData.get('estimatedTravelMinutes') ? Number(formData.get('estimatedTravelMinutes')) : undefined,
    notes: optionalString(formData, 'notes'),
  });
  await catalogService.updateTemplateDay(ctx, dayId, input);
  revalidatePath(`/staff/packages/${packageId}`);
}

export async function removeTemplateDayAction(packageId: string, dayId: string): Promise<void> {
  const ctx = await requireStaffContext('catalog.write');
  await catalogService.removeTemplateDay(ctx, dayId);
  revalidatePath(`/staff/packages/${packageId}`);
}
