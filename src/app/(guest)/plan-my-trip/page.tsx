import { cookies } from 'next/headers';
import Image from 'next/image';
import { getTranslations } from 'next-intl/server';
import { cmsService, type CmsLocale } from '@modules/cms';
import { OPERATING_COUNTRY_CODES } from '@lib/country-codes';
import { getEffectiveLateBookingRate } from '@lib/late-booking-rate';
import { Card } from '@/components/ui/Card';
import PlanMyTripForm, { type PlanMyTripSite } from './plan-my-trip-form';

// DR-198: same best-effort convention as book-package/[packageId]/page.tsx's
// own tryGetLateBookingRate -- an unconfigured rate just means no live
// warning, never a crashed page.
async function tryGetLateBookingRate() {
  try {
    return await getEffectiveLateBookingRate();
  } catch {
    return null;
  }
}

interface Props {
  // Populated when a guest arrives via the homepage map's country click
  // (AfricaMap.tsx) -- pre-selects that destination on step 0 instead of
  // starting the wizard empty.
  searchParams: Promise<{ destination?: string }>;
}

// Same direct-cookie-read convention as (guest)/about/page.tsx.
async function resolveLocale(): Promise<CmsLocale> {
  const store = await cookies();
  return store.get('locale')?.value === 'fr' ? 'fr' : 'en';
}

// Mirrors plan-my-trip-form.tsx's own local DESTINATIONS codes -- kept in
// sync by hand, same convention as that file's ADDONS/DESTINATIONS comment.
const VALID_DESTINATION_CODES = new Set<string>(OPERATING_COUNTRY_CODES);

// Merged entry point (DR-046) -- replaces the old quiz->package-matching
// flow AND the old tailor-made form with a single always-bespoke intake:
// every submission becomes a TAILOR_MADE booking for staff to price, no
// package matching/scoring happens anymore. The form itself is a gradual
// multi-step wizard (DR-047) with its own local progress indicator --
// deliberately NOT the shared BOOKING_WIZARD_STEPS/StepIndicator, since
// this isn't part of the direct-package-browse journey at all: it's the
// other booking origin, with no pre-existing Departure, priced by staff
// afterward via a quotation (see bookingService.createTailorMadeRequest).
export default async function PlanMyTripPage({ searchParams }: Props) {
  const { destination } = await searchParams;
  const initialDestination = destination && VALID_DESTINATION_CODES.has(destination) ? destination : undefined;
  const t = await getTranslations('PlanMyTripPage');
  const locale = await resolveLocale();
  const [cms, mediaItems, lateBookingRate] = await Promise.all([
    cmsService.getPublicTextBlock('plan-my-trip', locale),
    cmsService.listPublicMediaItems('gallery'),
    tryGetLateBookingRate(),
  ]);
  // Gallery sites are the single source of truth for this step's "sites to
  // visit" picker too (DR-167) -- a site with no name/country set yet is
  // filtered out, same as the Gallery page itself.
  const sites: PlanMyTripSite[] = mediaItems
    .filter((item) => item.name && item.country)
    .map((item) => ({ name: item.name!, country: item.country! }));

  return (
    // Explicit user request: a photo behind the whole wizard, with every
    // step sitting on top inside one big, slightly translucent card --
    // same full-bleed treatment /find-booking uses, just sized for a
    // 9-step form rather than a two-field lookup. This replaces the
    // TravelBackdrop line-art wallpaper that used to sit here; a photo and
    // that motif layer would compete, so the backdrop is now /packages'
    // alone. The card wraps the heading too, so nothing needs recoloring
    // for contrast against the photo.
    <section className="relative left-1/2 right-1/2 -mx-[50vw] w-screen overflow-hidden px-4 py-12 sm:px-8 sm:py-16">
      <Image src="/images/hero/nile-crocodile.jpg" alt="" fill priority sizes="100vw" className="object-cover" />
      <div className="absolute inset-0 bg-ink/25" />
      <Card className="relative mx-auto w-full max-w-4xl bg-bone/85">
        <p className="eyebrow text-mist">{cms?.eyebrow ?? t('eyebrow')}</p>
        <h1 className="mt-1 text-2xl font-bold text-navy">{cms?.title ?? t('title')}</h1>
        <p className="mt-1 text-sm text-mist">{cms?.body ?? t('subhead')}</p>
        <PlanMyTripForm initialDestination={initialDestination} sites={sites} lateBookingRate={lateBookingRate} />
      </Card>
    </section>
  );
}
