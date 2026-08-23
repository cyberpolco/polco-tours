'use server';

import { redirect } from 'next/navigation';
import { requireStaffContext } from '@lib/staff-guard';
import { ApiError, Errors } from '@lib/errors';
import { OPERATING_COUNTRY_CODES } from '@lib/country-codes';
import { CreatePackageInput, catalogService } from '@modules/catalog';

const PACKAGE_TAGS = ['WILDLIFE', 'ADVENTURE', 'RELAXATION', 'FAMILY', 'CULTURE', 'LUXURY', 'BUDGET'] as const;

export async function createPackageAction(formData: FormData): Promise<void> {
  const ctx = await requireStaffContext('catalog.write');

  const country = String(formData.get('country') ?? '');
  // DR-114: full country set = primary + any additional ones checked,
  // de-duplicated (checking the primary again in the "also visits" group is
  // harmless).
  const additionalCountries = formData
    .getAll('additionalCountries')
    .filter((c): c is string => typeof c === 'string' && (OPERATING_COUNTRY_CODES as readonly string[]).includes(c));
  const countries = Array.from(new Set([country, ...additionalCountries]));

  // DR-115: an oversized/wrong-type file (Errors.validation) or a Blob
  // failure (Errors.internal) is a real, expected ApiError -- caught below
  // and surfaced via ?error=&detail= instead of crashing to Next's generic
  // error page, same convention as the edit page's updatePackageAction.
  let pkg;
  try {
    // DR-114/DR-172: staff upload real files instead of pasting a URL --
    // optional, same "no file selected -> stays unset" shape as passport
    // upload's own `instanceof File && size > 0` check (uploadPassportAction),
    // now for up to 3 files at once. Checked BEFORE uploading anything, so a
    // too-many-files mistake never burns a Blob upload it'll just discard.
    const images = formData.getAll('images').filter((f): f is File => f instanceof File && f.size > 0);
    if (images.length > 3) {
      throw Errors.validation('You can upload at most 3 images per package');
    }
    const imageUrls = await Promise.all(
      images.map(async (image) => {
        const bytes = Buffer.from(await image.arrayBuffer());
        const uploaded = await catalogService.uploadPackageImage(ctx, { contentType: image.type, sizeBytes: image.size, bytes });
        return uploaded.url;
      }),
    );

    // DR-039: no priceMinor here -- a new package starts unpriced until the
    // finance module's cost breakdown computes one.
    const durationDaysRaw = formData.get('durationDays');
    const input = CreatePackageInput.parse({
      title: String(formData.get('title') ?? '').trim(),
      description: String(formData.get('description') ?? '').trim(),
      country,
      countries,
      currency: String(formData.get('currency') ?? ''),
      durationDays: durationDaysRaw ? Number(durationDaysRaw) : undefined,
      imageUrls,
      tags: formData.getAll('tags').filter((t): t is string => typeof t === 'string' && (PACKAGE_TAGS as readonly string[]).includes(t)),
    });

    pkg = await catalogService.createPackage(ctx, input);
  } catch (err) {
    if (err instanceof ApiError) {
      redirect(`/staff/packages/new?error=${err.slug}&detail=${encodeURIComponent(err.detail ?? '')}`);
    }
    throw err;
  }
  redirect(`/staff/packages/${pkg.id}`);
}
