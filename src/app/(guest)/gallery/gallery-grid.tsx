'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { flagEmoji } from '@lib/country-codes';
import type { DestinationSite } from '@lib/destination-sites';
import { LinkButton } from '@/components/ui/Button';
import { PackageImage } from '@/components/ui/PackageImage';

const COUNTRY_NAMES: Record<string, string> = { NA: 'Namibia', CD: 'DR Congo', ZM: 'Zambia', ZW: 'Zimbabwe' };

interface GalleryGridProps {
  sites: DestinationSite[];
  planTripLabel: string;
  closeLabel: string;
}

// Previously the whole tile was one Link straight into /plan-my-trip, so
// "look at the picture" and "start booking" were the same click. Now only
// the destination name/flag is a Link (unchanged path to booking); the
// picture itself is a button that opens this in-page preview instead of
// navigating away.
export function GalleryGrid({ sites, planTripLabel, closeLabel }: GalleryGridProps) {
  const [active, setActive] = useState<DestinationSite | null>(null);

  useEffect(() => {
    if (!active) return undefined;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setActive(null);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [active]);

  return (
    <>
      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
        {sites.map((site) => (
          <div key={site.name} className="group">
            <button type="button" onClick={() => setActive(site)} className="block w-full text-left" aria-label={site.name}>
              <PackageImage imageUrl={null} alt={site.name} seed={site.name} />
            </button>
            <Link href={`/plan-my-trip?destination=${site.country}`} className="mt-2 block">
              <p className="text-sm font-medium text-navy transition-colors duration-200 group-hover:text-amber">{site.name}</p>
              <p className="text-xs text-mist">
                {flagEmoji(site.country)} {COUNTRY_NAMES[site.country]}
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
              className="relative w-full max-w-xl"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              onClick={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => setActive(null)}
                aria-label={closeLabel}
                className="absolute -right-3 -top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-bone text-lg text-ink shadow-card focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber"
              >
                ×
              </button>
              <PackageImage imageUrl={null} alt={active.name} seed={active.name} />
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-bone">
                <div>
                  <p className="text-lg font-bold">{active.name}</p>
                  <p className="text-sm text-bone/80">
                    {flagEmoji(active.country)} {COUNTRY_NAMES[active.country]}
                  </p>
                </div>
                <LinkButton href={`/plan-my-trip?destination=${active.country}`} variant="primary" size="compact">
                  {planTripLabel}
                </LinkButton>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
