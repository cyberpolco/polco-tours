import { cookies } from 'next/headers';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { cmsService, type CmsLocale, type CmsMediaItemView } from '@modules/cms';
import type { OperatingCountryCode } from '@lib/country-codes';
import { Reveal } from '@/components/ui/Reveal';
import { GalleryGrid } from './gallery-grid';

// A gallery site once its two required display fields are confirmed
// present -- narrows CmsMediaItemView's nullable name/country so GalleryGrid
// (and its lightbox) never has to null-check them. `country` is validated
// against OperatingCountryCode at write time (cms/domain.ts's zod schema),
// so this cast is safe once presence itself is confirmed by the filter below.
export interface GallerySite extends CmsMediaItemView {
  name: string;
  country: OperatingCountryCode;
}

// Same direct-cookie-read convention as (guest)/about/page.tsx.
async function resolveLocale(): Promise<CmsLocale> {
  const store = await cookies();
  return store.get('locale')?.value === 'fr' ? 'fr' : 'en';
}

// Reuses the exact eyebrow/subhead this page already renders -- see
// plan-my-trip/page.tsx's generateMetadata comment for why. A real gallery
// site (/gallery/[identifier]) already has its own dynamic metadata,
// unaffected by this.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Gallery');
  const locale = await resolveLocale();
  const cms = await cmsService.getPublicTextBlock('gallery', locale);
  return { title: cms?.eyebrow ?? t('eyebrow'), description: cms?.body ?? t('subhead') };
}

// No destination/hotel/package photography was licensed at all originally
// (OI-12 in CLAUDE.md) -- staff can now upload a real photo or video per
// site, and (DR-167) the sites themselves are fully staff-managed
// (name/country/description, add/remove) from /staff/cms -- the old static
// DESTINATION_SITES list is gone. A site with no staff-uploaded media yet
// still falls back to the same illustrated "Horizon" gradient plate
// PackageImage shows for a package with no imageUrl (GalleryGrid handles
// the per-site fallback); a site with no name/country set yet (freshly
// added, still blank) is filtered out here entirely.
export default async function GalleryPage() {
  const t = await getTranslations('Gallery');
  const locale = await resolveLocale();
  const [cms, mediaItems] = await Promise.all([
    cmsService.getPublicTextBlock('gallery', locale),
    cmsService.listPublicMediaItems('gallery'),
  ]);
  const sites = mediaItems.filter((item) => item.name && item.country) as GallerySite[];

  return (
    <Reveal>
      <div>
        <p className="eyebrow text-mist">{cms?.eyebrow ?? t('eyebrow')}</p>
        <h1 className="mt-1 text-2xl font-bold text-navy">{cms?.title ?? t('title')}</h1>
        <p className="mt-1 max-w-2xl text-sm text-mist">{cms?.body ?? t('subhead')}</p>
        <GalleryGrid sites={sites} closeLabel={t('close')} shareLabel={t('share')} linkCopiedLabel={t('linkCopied')} />
      </div>
    </Reveal>
  );
}
