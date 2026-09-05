import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { cmsService, type CmsMediaItemView } from '@modules/cms';
import type { OperatingCountryCode } from '@lib/country-codes';
import { flagEmoji } from '@lib/country-codes';
import { BackLink } from '@/components/ui/BackLink';
import { PackageImage } from '@/components/ui/PackageImage';
import { Reveal } from '@/components/ui/Reveal';

interface Props {
  // Either the staff-editable `slug` or the raw `slotKey` (DR-254) --
  // cmsService.getPublicMediaItem resolves both the same way.
  params: Promise<{ identifier: string }>;
}

// Same "confirmed-present name/country" narrowing as (guest)/gallery/page.tsx's
// GallerySite -- this is the single-item counterpart of that listing.
type GallerySite = CmsMediaItemView & { name: string; country: OperatingCountryCode };

async function loadSite(identifier: string): Promise<GallerySite | null> {
  const item = await cmsService.getPublicMediaItem('gallery', identifier);
  if (!item?.name || !item.country) return null;
  return item as GallerySite;
}

// Per-site title/description for a shared link's preview -- paired with this
// route's opengraph-image.tsx (the image half of the same preview). Gives
// each gallery site its own shareable URL, which the grid's lightbox share
// button links to (previously the lightbox had no URL of its own at all).
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { identifier } = await params;
  const site = await loadSite(identifier);
  if (!site) return {};
  return {
    title: site.name,
    description: site.description ?? undefined,
  };
}

export default async function GallerySitePage({ params }: Props) {
  const { identifier } = await params;
  const site = await loadSite(identifier);
  if (!site) notFound();

  const t = await getTranslations('Gallery');
  const tCountries = await getTranslations('Countries');

  return (
    <Reveal>
      <div>
        <BackLink href="/gallery">{t('backToGallery')}</BackLink>
        <div className="mt-4 max-w-2xl">
          {site.mediaType === 'video' && site.url ? (
            <video src={site.url} muted loop playsInline autoPlay className="aspect-[16/10] w-full rounded-card object-cover" />
          ) : (
            <PackageImage imageUrl={site.mediaType === 'image' ? site.url : null} alt={site.name} seed={site.slotKey} />
          )}
          <div className="mt-4">
            <p className="text-lg font-bold text-navy">{site.name}</p>
            <p className="text-sm text-mist">
              {flagEmoji(site.country)} {tCountries(site.country)}
            </p>
            {site.description && <p className="mt-2 text-sm text-mist">{site.description}</p>}
          </div>
        </div>
      </div>
    </Reveal>
  );
}
