'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireStaffContext } from '@lib/staff-guard';
import { ApiError, Errors } from '@lib/errors';
import { OPERATING_COUNTRY_CODES } from '@lib/country-codes';
import { AddPackageItineraryDayInput, UpdatePackageItineraryDayInput, UpdatePackageInput, catalogService } from '@modules/catalog';

const PACKAGE_TAGS = ['WILDLIFE', 'ADVENTURE', 'RELAXATION', 'FAMILY', 'CULTURE', 'LUXURY', 'BUDGET'] as const;

export async function updatePackageAction(packageId: string, formData: FormData): Promise<void> {
  const ctx = await requireStaffContext('catalog.write');

  const country = String(formData.get('country') ?? '');
  // DR-114: full country set = primary + any additional ones checked,
  // de-duplicated.
  const additionalCountries = formData
    .getAll('additionalCountries')
    .filter((c): c is string => typeof c === 'string' && (OPERATING_COUNTRY_CODES as readonly string[]).includes(c));
  const countries = Array.from(new Set([country, ...additionalCountries]));

  // DR-115 incident: publishing with no price/duration yet throws a real,
  // expected ApiError (Errors.conflict, catalog/service.ts's DR-039 gate) --
  // previously uncaught here, so it crashed to Next's generic error page
  // instead of showing staff the actual reason. Same "catch every ApiError
  // generically, redirect with ?error=&detail=" convention as
  // departures/[departureId]/actions.ts's createAssignmentAction (DR-079).
  // DR-114's uploadPackageImage call below is wrapped in the same try --
  // an oversized/wrong-type file (Errors.validation) or a Blob failure
  // (Errors.internal) are exactly the same class of "real, expected
  // ApiError" this block already exists to catch.
  try {
    // DR-114/DR-172: kept existing images (whichever weren't checked for
    // removal) + newly uploaded ones, in that order -- capped at 3 BEFORE
    // uploading anything, so a too-many mistake never burns a Blob upload
    // it'll just discard. Neither box touched at all (no removals, no new
    // files) reproduces the exact current imageUrls, same net effect as the
    // old single-image field's "leave empty -> unchanged" shape.
    const existing = await catalogService.getPackage(ctx, packageId);
    const removedUrls = new Set(formData.getAll('removeImages').filter((u): u is string => typeof u === 'string'));
    const keptUrls = existing.imageUrls.filter((url) => !removedUrls.has(url));
    const newImages = formData.getAll('images').filter((f): f is File => f instanceof File && f.size > 0);
    if (keptUrls.length + newImages.length > 3) {
      throw Errors.validation('You can upload at most 3 images per package');
    }
    const uploadedUrls = await Promise.all(
      newImages.map(async (image) => {
        const bytes = Buffer.from(await image.arrayBuffer());
        const uploaded = await catalogService.uploadPackageImage(ctx, { contentType: image.type, sizeBytes: image.size, bytes });
        return uploaded.url;
      }),
    );
    const imageUrls = [...keptUrls, ...uploadedUrls];

    // DR-039: price is no longer typed here -- it's computed by the finance
    // module's cost breakdown (or set there via an audited override). This
    // form still edits every other package attribute, including currency
    // (the cost breakdown's own currency must match, checked in
    // financeService.saveCostBreakdown).
    const durationDaysRaw = formData.get('durationDays');
    const input = UpdatePackageInput.parse({
      title: String(formData.get('title') ?? '').trim(),
      description: String(formData.get('description') ?? '').trim(),
      country,
      countries,
      currency: String(formData.get('currency') ?? ''),
      durationDays: durationDaysRaw ? Number(durationDaysRaw) : undefined,
      imageUrls,
      tags: formData.getAll('tags').filter((t): t is string => typeof t === 'string' && (PACKAGE_TAGS as readonly string[]).includes(t)),
      status: String(formData.get('status') ?? ''),
    });

    await catalogService.updatePackage(ctx, packageId, input);
  } catch (err) {
    if (err instanceof ApiError) {
      redirect(`/staff/packages/${packageId}?error=${err.slug}&detail=${encodeURIComponent(err.detail ?? '')}`);
    }
    throw err;
  }
  redirect(`/staff/packages/${packageId}`);
}

export async function archivePackageAction(packageId: string): Promise<void> {
  const ctx = await requireStaffContext('catalog.write');
  try {
    await catalogService.updatePackage(ctx, packageId, { status: 'ARCHIVED' });
  } catch (err) {
    if (err instanceof ApiError) {
      redirect(`/staff/packages/${packageId}?error=${err.slug}&detail=${encodeURIComponent(err.detail ?? '')}`);
    }
    throw err;
  }
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
    activities: optionalString(formData, 'activities'),
    activityIds: formData.getAll('activityIds').map(String),
    hotelId: optionalString(formData, 'hotelId'),
    restaurantId: optionalString(formData, 'restaurantId'),
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
    activities: optionalString(formData, 'activities'),
    activityIds: formData.getAll('activityIds').map(String),
    hotelId: optionalString(formData, 'hotelId'),
    restaurantId: optionalString(formData, 'restaurantId'),
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

export async function generateTemplateDaysAction(packageId: string): Promise<void> {
  const ctx = await requireStaffContext('catalog.write');
  try {
    await catalogService.generateTemplateDays(ctx, packageId);
  } catch (err) {
    if (err instanceof ApiError) {
      redirect(`/staff/packages/${packageId}?error=${err.slug}&detail=${encodeURIComponent(err.detail ?? '')}`);
    }
    throw err;
  }
  revalidatePath(`/staff/packages/${packageId}`);
}
