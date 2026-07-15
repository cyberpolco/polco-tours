'use server';

import { redirect } from 'next/navigation';
import { requireStaffContext } from '@lib/staff-guard';
import { UpdatePackageInput, catalogService } from '@modules/catalog';

const PACKAGE_TAGS = ['WILDLIFE', 'ADVENTURE', 'RELAXATION', 'FAMILY', 'CULTURE', 'LUXURY', 'BUDGET'] as const;

export async function updatePackageAction(packageId: string, formData: FormData): Promise<void> {
  const ctx = await requireStaffContext('catalog.write');

  const durationDaysRaw = formData.get('durationDays');
  const input = UpdatePackageInput.parse({
    title: String(formData.get('title') ?? '').trim(),
    description: String(formData.get('description') ?? '').trim(),
    country: String(formData.get('country') ?? ''),
    priceMinor: Math.round(Number(formData.get('amount')) * 100),
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
