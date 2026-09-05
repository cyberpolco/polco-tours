'use server';

import { redirect } from 'next/navigation';
import { ZodError } from 'zod';
import { requireStaffContext } from '@lib/staff-guard';
import { ApiError, Errors } from '@lib/errors';
import { logger, newTraceId } from '@lib/logger';
import { OPERATING_COUNTRY_CODES } from '@lib/country-codes';
import { CreatePackageInput, catalogService } from '@modules/catalog';

const PACKAGE_TAGS = ['WILDLIFE', 'ADVENTURE', 'RELAXATION', 'FAMILY', 'CULTURE', 'LUXURY', 'BUDGET', 'CAMPING', 'ADRENALINE', 'BIRDWATCHING', 'HONEYMOON', 'SELF_DRIVE'] as const;

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
    // DR-180: which add-ons this package offers on the guest site.
    const addonServiceIds = formData.getAll('addonServiceId').filter((v): v is string => typeof v === 'string');

    pkg = await catalogService.createPackage(ctx, input, addonServiceIds);
  } catch (err) {
    // DR-174 incident: a ZodError from CreatePackageInput.parse was falling
    // through the ApiError-only check below and crashing to Next's generic
    // error page with no useful message -- same treatment as every ApiError
    // already gets here, converting via Errors.validation (the same mapping
    // withAuth's route-guard.ts already applies to a ZodError from a JSON
    // API route).
    if (err instanceof ApiError) {
      redirect(`/staff/packages/new?error=${err.slug}&detail=${encodeURIComponent(err.detail ?? '')}`);
    }
    if (err instanceof ZodError) {
      const validationErr = Errors.validation(err.message);
      redirect(`/staff/packages/new?error=${validationErr.slug}&detail=${encodeURIComponent(validationErr.detail ?? '')}`);
    }
    // DR-182 incident: staff kept hitting a raw server-side crash here even
    // after DR-174's ZodError fix -- the actual trigger was never confirmed
    // (no Vercel log access this session), but DR-174 only closed the
    // ZodError gap, leaving anything else (a raw Prisma error, or literally
    // any other exception type) still falling through to an unhandled
    // `throw err`. Charter rule 8 ("third-party integrations must not crash
    // the system") applies just as much to an unexpected internal error as
    // to a third-party one -- this is now a true catch-all: log the real
    // error server-side (the only way to actually diagnose the next one,
    // since nothing here leaked to Vercel's logs distinctly before) and
    // show the same generic message an ApiError('internal') already gets,
    // rather than a raw crash page, regardless of what actually threw.
    const traceId = newTraceId();
    logger(traceId).error('createPackageAction: unhandled error', {
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    redirect(`/staff/packages/new?error=internal&detail=${encodeURIComponent(traceId)}`);
  }
  redirect(`/staff/packages/${pkg.id}`);
}
