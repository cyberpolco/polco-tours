'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { PackageImage } from './PackageImage';

// DR-172: a package can carry up to 3 images (TourPackage.imageUrls) --
// this is the guest package card's own lightweight autoplay crossfade
// through them. Deliberately no nav dots/arrows (unlike HeroCarousel,
// src/components/HeroCarousel.tsx) since this box sits nested inside the
// card's own <Link> to the detail page -- a click target here would just
// fight that navigation. Falls back to PackageImage's existing single-
// image/gradient rendering whenever there's 0 or 1 image, so most packages
// (not yet multi-photographed) render exactly as before, no extra client
// JS behavior. Autoplay is fully disabled under prefers-reduced-motion
// (framer-motion's useReducedMotion, same DR-068 convention as HeroCarousel).
const SLIDE_DURATION_MS = 4000;

interface PackageCardSlideshowProps {
  imageUrls: string[];
  alt: string;
  seed: string;
}

export function PackageCardSlideshow({ imageUrls, alt, seed }: PackageCardSlideshowProps) {
  const [index, setIndex] = useState(0);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (reduceMotion || imageUrls.length <= 1) return undefined;
    const timer = setInterval(() => setIndex((i) => (i + 1) % imageUrls.length), SLIDE_DURATION_MS);
    return () => clearInterval(timer);
  }, [reduceMotion, imageUrls.length]);

  if (imageUrls.length <= 1) {
    return <PackageImage imageUrl={imageUrls[0] ?? null} alt={alt} seed={seed} rounded={false} className="shrink-0" />;
  }

  return (
    <div className="relative aspect-[16/10] shrink-0 overflow-hidden">
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
            sizes="(min-width: 1024px) 380px, 100vw"
            className="object-cover transition-transform duration-500 ease-out group-hover:scale-105"
          />
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
