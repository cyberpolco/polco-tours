'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import type { GallerySite } from './page';
import { flagEmoji } from '@lib/country-codes';
import { PackageImage } from '@/components/ui/PackageImage';

interface GalleryGridProps {
  sites: GallerySite[];
  closeLabel: string;
  shareLabel: string;
  linkCopiedLabel: string;
}

// Hand-drawn to match every other icon in this app (no icon package
// installed) -- a standard "share" glyph (node-and-line network) rather than
// the platform-specific iOS box-with-arrow, since this triggers the Web
// Share API sheet on some devices and a plain clipboard copy on others.
function ShareIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <path d="M7.3 9.3 12.7 6M7.3 10.7l5.4 3.3" />
      <circle cx="15" cy="4.5" r="2.1" />
      <circle cx="5" cy="10" r="2.1" />
      <circle cx="15" cy="15.5" r="2.1" />
    </svg>
  );
}

// Renders a site's staff-uploaded video/image if present, else
// PackageImage's own null-imageUrl gradient fallback -- same image/video
// branching HeroCarousel.tsx already does, just without the Ken Burns
// motion (this is a static grid tile/lightbox, not an autoplay carousel).
function SiteMedia({ site, className }: { site: GallerySite; className?: string }) {
  if (site.mediaType === 'video' && site.url) {
    return <video src={site.url} muted loop playsInline autoPlay className={className ?? 'aspect-[16/10] w-full rounded-card object-cover'} />;
  }
  const imageUrl = site.mediaType === 'image' ? site.url : null;
  return <PackageImage imageUrl={imageUrl} alt={site.name} seed={site.slotKey} className={className} />;
}

// Previously the whole tile was one Link straight into /plan-my-trip, so
// "look at the picture" and "start booking" were the same click. Now only
// the destination name/flag is a Link (unchanged path to booking); the
// picture itself is a button that opens this in-page preview instead of
// navigating away.
export function GalleryGrid({ sites, closeLabel, shareLabel, linkCopiedLabel }: GalleryGridProps) {
  const tCountries = useTranslations('Countries');
  const [active, setActive] = useState<GallerySite | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!active) return undefined;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setActive(null);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [active]);

  useEffect(() => {
    setCopied(false);
  }, [active]);

  // Shares the site's own standalone page (gallery/[identifier]) -- its
  // opengraph-image.tsx is what gives the shared link a real preview (brand
  // logo, name, description) instead of the lightbox's own in-page state,
  // which has no URL of its own to share. Prefers the staff-editable `slug`
  // (DR-254, a readable link) over the raw `slotKey`, falling back to the
  // latter when no slug has been set yet. Native share sheet where
  // available (mobile browsers), clipboard copy as the fallback.
  async function handleShare(site: GallerySite) {
    const url = `${window.location.origin}/gallery/${site.slug ?? site.slotKey}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: site.name, text: site.description ?? undefined, url });
      } catch {
        // User dismissed the native share sheet -- not an error.
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access denied/unavailable in this browser -- nothing more
      // to do; the button simply won't confirm a copy.
    }
  }

  return (
    <>
      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
        {sites.map((site) => (
          <div key={site.slotKey} className="group">
            <button type="button" onClick={() => setActive(site)} className="block w-full text-left" aria-label={site.name}>
              <SiteMedia site={site} />
            </button>
            <Link href={`/plan-my-trip?destination=${site.country}`} className="mt-2 block">
              <p className="text-sm font-medium text-navy transition-colors duration-200 group-hover:text-amber">{site.name}</p>
              <p className="text-xs text-mist">
                {flagEmoji(site.country)} {tCountries(site.country)}
              </p>
            </Link>
          </div>
        ))}
      </div>

      <AnimatePresence>
        {active && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-ink/80 p-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setActive(null)}
            role="dialog"
            aria-modal="true"
            aria-label={active.name}
          >
            <motion.div
              className="relative w-full max-w-2xl"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="absolute -right-3 -top-3 z-10 flex items-center gap-2">
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => handleShare(active)}
                    aria-label={shareLabel}
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-bone text-ink shadow-card focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber"
                  >
                    <ShareIcon className="h-4 w-4" />
                  </button>
                  {copied && (
                    <span
                      role="status"
                      className="absolute right-0 top-11 whitespace-nowrap rounded-pill bg-ink px-3 py-1 text-xs font-medium text-bone shadow-card"
                    >
                      {linkCopiedLabel}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setActive(null)}
                  aria-label={closeLabel}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-bone text-lg text-ink shadow-card focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber"
                >
                  ×
                </button>
              </div>
              <SiteMedia site={active} />
              <div className="mt-4 text-bone">
                <p className="text-lg font-bold">{active.name}</p>
                <p className="text-sm text-bone/80">
                  {flagEmoji(active.country)} {tCountries(active.country)}
                </p>
                {active.description && <p className="mt-2 text-sm text-bone/80">{active.description}</p>}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
