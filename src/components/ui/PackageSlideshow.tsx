'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { PackageImage } from './PackageImage';

// DR-172/DR-173: a package can carry up to 3 images (TourPackage.imageUrls) --
// this autoplay crossfade cycles through them everywhere a package's images
// are shown: the guest package card (DR-172) AND the package detail page's
// own hero (DR-173 -- reverses DR-172's original "card-only" split so the
// slideshow keeps playing once a guest clicks through, instead of freezing on
// the cover image). Deliberately no nav dots/arrows since every call site
// already nests this inside its own click target or scrim-overlay content --
// a click target here would fight that. Falls back to PackageImage's existing
// single-image/gradient rendering whenever there's 0 or 1 image, so most
// packages (not yet multi-photographed) render exactly as PackageImage always
// has, no extra client JS behavior. Autoplay is fully disabled under
// prefers-reduced-motion (framer-motion's useReducedMotion, same DR-068
// convention as HeroCarousel). `index` always starts at 0 on mount -- each
// instance (one per card, or the one on the detail page) runs its own
// independent timer with no cross-instance sync or persistence across
// navigations.
const SLIDE_DURATION_MS = 4000;

interface PackageSlideshowProps {
  imageUrls: string[];
  alt: string;
  seed: string;
  className?: string;
  sizes?: string;
  /** Set false when already nested inside another `rounded-card
   * overflow-hidden` container (e.g. PackageCard) -- see PackageImage's own
   * doc comment for why. */
  rounded?: boolean;
  /** Rendered absolutely-positioned on top of the current slide, inside the
   * same clipped box -- e.g. the package detail page's title-on-scrim
   * overlay. Forwarded to PackageImage for the 0-or-1-image fallback case
   * too, so a single-image/no-image package still gets its overlay. */
  children?: React.ReactNode;
}

export function PackageSlideshow({
  imageUrls,
  alt,
  seed,
  className,
  sizes,
  rounded = true,
  children,
}: PackageSlideshowProps) {
  const [index, setIndex] = useState(0);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (reduceMotion || imageUrls.length <= 1) return undefined;
    const timer = setInterval(() => setIndex((i) => (i + 1) % imageUrls.length), SLIDE_DURATION_MS);
    return () => clearInterval(timer);
  }, [reduceMotion, imageUrls.length]);

  if (imageUrls.length <= 1) {
    return (
      <PackageImage imageUrl={imageUrls[0] ?? null} alt={alt} seed={seed} rounded={rounded} className={className}>
        {children}
      </PackageImage>
    );
  }

  const base = ['relative aspect-[16/10] overflow-hidden', rounded && 'rounded-card', className].filter(Boolean).join(' ');

  return (
    <div className={base}>
      <AnimatePresence initial={false}>
        <motion.div
          key={index}
          className="absolute inset-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.6, ease: 'easeOut' }}
        >
          <Image
            src={imageUrls[index]!}
            alt={alt}
            fill
            sizes={sizes ?? '(min-width: 1024px) 380px, 100vw'}
            className="object-cover transition-transform duration-500 ease-out group-hover:scale-105"
          />
        </motion.div>
      </AnimatePresence>
      {children}
    </div>
  );
}
