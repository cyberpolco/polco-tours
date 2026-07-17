'use server';

import { redirect } from 'next/navigation';
import { requireStaffContext } from '@lib/staff-guard';
import { CreatePackageInput, catalogService } from '@modules/catalog';

const PACKAGE_TAGS = ['WILDLIFE', 'ADVENTURE', 'RELAXATION', 'FAMILY', 'CULTURE', 'LUXURY', 'BUDGET'] as const;

export async function createPackageAction(formData: FormData): Promise<void> {
  const ctx = await requireStaffContext('catalog.write');

  // DR-039: no priceMinor here -- a new package starts unpriced until the
  // finance module's cost breakdown computes one.
  const durationDaysRaw = formData.get('durationDays');
  const input = CreatePackageInput.parse({
    title: String(formData.get('title') ?? '').trim(),
    description: String(formData.get('description') ?? '').trim(),
    country: String(formData.get('country') ?? ''),
    currency: String(formData.get('currency') ?? ''),
    durationDays: durationDaysRaw ? Number(durationDaysRaw) : undefined,
    tags: formData.getAll('tags').filter((t): t is string => typeof t === 'string' && (PACKAGE_TAGS as readonly string[]).includes(t)),
  });

  const pkg = await catalogService.createPackage(ctx, input);
  redirect(`/staff/packages/${pkg.id}`);
}
