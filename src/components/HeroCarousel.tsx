'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { LinkButton } from '@/components/ui/Button';

// DR-068: the homepage hero, rebuilt as a rotating 3-slide carousel matching
// the approved "Horizon" concept mockup -- one real destination per slide
// (Namibia/Sossusvlei, DR Congo/Virunga, Zambia+Zimbabwe/Victoria Falls),
// each with its own real color mood, not one gradient recolored three times.
// Nav/CTAs/dots stay fixed; only the background gradient + headline
// crossfade. Autoplay pauses on hover/focus and is fully disabled under
// `prefers-reduced-motion` (framer-motion's useReducedMotion, in addition to
// the global CSS-transition safety net in globals.css, which doesn't cover
// framer-motion's own transform/opacity animations).
//
// Data-driven (slides/CTA copy passed in, not hardcoded) so the calling
// Server Component can supply next-intl-translated content -- this
// component itself has no i18n access of its own (same "components fetch
// nothing, pages own data/translations" convention as Reveal/TrustSummary).
export interface HeroSlide {
  eyebrow: string;
  headline: string;
  lede: string;
  gradient: string;
}

interface HeroCarouselProps {
  slides: HeroSlide[];
  browseHref: string;
  browseLabel: string;
  planHref: string;
  planLabel: string;
}

const SLIDE_DURATION_MS = 6000;

export function HeroCarousel({ slides, browseHref, browseLabel, planHref, planLabel }: HeroCarouselProps) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const reduceMotion = useReducedMotion();
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (reduceMotion || paused) return undefined;
    timerRef.current = setInterval(() => {
      setIndex((i) => (i + 1) % slides.length);
    }, SLIDE_DURATION_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [reduceMotion, paused, slides.length]);

  function goTo(next: number) {
    setIndex(((next % slides.length) + slides.length) % slides.length);
  }

  // Non-null: `index` is always kept in [0, slides.length) by `goTo`'s and
  // the autoplay interval's modulo arithmetic -- there is no code path that
  // sets it otherwise (and `slides` is a fixed, non-empty array from the caller).
  const slide = slides[index]!;
  const transition = reduceMotion ? { duration: 0 } : { duration: 0.9, ease: 'easeOut' as const };

  return (
    <section
      className="relative isolate overflow-hidden rounded-card"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div className="absolute inset-0 -z-10">
        <AnimatePresence initial={false}>
          <motion.div
            key={index}
            className="absolute inset-0"
            style={{ backgroundImage: slide.gradient }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={transition}
          />
        </AnimatePresence>
      </div>

      <div className="relative px-6 py-16 sm:px-10 sm:py-24">
        <div className="relative min-h-[220px] max-w-xl sm:min-h-[260px]">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={index}
              initial={{ opacity: 0, y: reduceMotion ? 0 : 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: reduceMotion ? 0 : -10 }}
              transition={transition}
            >
              <span className="inline-block rounded-pill bg-bone px-3 py-1.5 text-xs font-extrabold uppercase tracking-wide text-ink">
                {slide.eyebrow}
              </span>
              <h1 className="mt-6 text-4xl font-extrabold leading-[0.98] tracking-tight text-bone sm:text-6xl">{slide.headline}</h1>
              <p className="mt-6 max-w-md text-lg text-bone/90">{slide.lede}</p>
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="mt-9 flex flex-wrap gap-4">
          <LinkButton href={browseHref} variant="invert">
            {browseLabel}
          </LinkButton>
          <LinkButton href={planHref} variant="invertOutline">
            {planLabel}
          </LinkButton>
        </div>

        <div role="tablist" aria-label="Featured destinations" className="mt-10 flex gap-2.5">
          {slides.map((s, i) => (
            <button
              key={s.eyebrow}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={s.eyebrow}
              onClick={() => goTo(i)}
              className={[
                'h-2.5 rounded-pill border border-bone transition-all duration-200',
                i === index ? 'w-7 bg-bone' : 'w-2.5 bg-transparent opacity-60 hover:opacity-100',
              ].join(' ')}
            />
          ))}
        </div>
      </div>

      <button
        type="button"
        aria-label="Previous destination"
        onClick={() => goTo(index - 1)}
        className="absolute left-3 top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-bone/40 bg-navy/30 text-lg text-bone transition-colors duration-200 hover:bg-navy/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-bone sm:flex"
      >
        ‹
      </button>
      <button
        type="button"
        aria-label="Next destination"
        onClick={() => goTo(index + 1)}
        className="absolute right-3 top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-bone/40 bg-navy/30 text-lg text-bone transition-colors duration-200 hover:bg-navy/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-bone sm:flex"
      >
        ›
      </button>
    </section>
  );
}
