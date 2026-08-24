'use client';

import { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { BrandMark } from '@/components/BrandMark';

export interface Partner {
  name: string;
  // A real per-partner logo, once supplied. Undefined falls back to the
  // BrandMark + name lockup (same icon+wordmark pairing as the site's own
  // header/footer) -- explicit user direction: stand in with our own mark
  // rather than fabricate a placeholder logo for a real organization
  // (matches this app's "never fabricate imagery" convention, OI-12).
  logoUrl?: string;
}

interface PartnersMarqueeProps {
  partners: Partner[];
  eyebrow: string;
  title: string;
}

const MARQUEE_DURATION_SECONDS = 25;

// Continuous horizontal scroll, pausing on hover -- the track is the
// partner list duplicated once so the loop (animating to exactly -50%)
// has no visible seam. Falls back to a plain wrapped row under
// prefers-reduced-motion, same convention as Reveal.
export function PartnersMarquee({ partners, eyebrow, title }: PartnersMarqueeProps) {
  const reduceMotion = useReducedMotion();
  const [paused, setPaused] = useState(false);
  const track = [...partners, ...partners];

  return (
    <div>
      <div className="survey-rule mb-8" />
      <p className="eyebrow text-mist">{eyebrow}</p>
      <h2 className="mt-1 text-2xl font-bold text-navy">{title}</h2>

      {reduceMotion ? (
        <div className="mt-6 flex flex-wrap items-start gap-x-10 gap-y-8">
          {partners.map((partner, i) => (
            <PartnerMark key={`${partner.name}-${i}`} partner={partner} />
          ))}
        </div>
      ) : (
        <div
          className="mt-6 overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_10%,black_90%,transparent)]"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
        >
          <motion.div
            className="flex w-max items-start gap-16"
            animate={paused ? undefined : { x: ['0%', '-50%'] }}
            transition={{ duration: MARQUEE_DURATION_SECONDS, ease: 'linear', repeat: Infinity }}
          >
            {track.map((partner, i) => (
              <PartnerMark key={`${partner.name}-${i}`} partner={partner} />
            ))}
          </motion.div>
        </div>
      )}
    </div>
  );
}

// A logo (or, absent one, BrandMark) stacked above the partner's name --
// bigger than the old inline logo-only/mark+name layouts (both too small,
// and a real logo had no visible name at all, only alt text) and a
// consistent shape for every entry regardless of which branch it takes.
function PartnerMark({ partner }: { partner: Partner }) {
  return (
    <div className="group flex w-28 shrink-0 flex-col items-center gap-2 text-center sm:w-36">
      {partner.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- staff-supplied partner logos, not part of next/image's local-asset allowlist
        <img
          src={partner.logoUrl}
          alt=""
          className="h-16 w-auto max-w-[128px] object-contain opacity-80 grayscale transition-all duration-200 group-hover:opacity-100 group-hover:grayscale-0 sm:h-24 sm:max-w-[160px]"
        />
      ) : (
        <BrandMark className="h-10 w-10 text-mist transition-colors duration-200 group-hover:text-navy sm:h-14 sm:w-14" />
      )}
      <span className="eyebrow text-mist transition-colors duration-200 group-hover:text-navy">{partner.name}</span>
    </div>
  );
}
