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
        <div className="mt-6 flex flex-wrap items-center gap-x-10 gap-y-6">
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
            className="flex w-max items-center gap-12"
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

function PartnerMark({ partner }: { partner: Partner }) {
  if (partner.logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- staff-supplied partner logos, not part of next/image's local-asset allowlist
      <img
        src={partner.logoUrl}
        alt={partner.name}
        className="h-8 w-auto shrink-0 opacity-80 grayscale transition-all duration-200 hover:opacity-100 hover:grayscale-0"
      />
    );
  }
  return (
    <span className="flex shrink-0 items-center gap-2 text-mist transition-colors duration-200 hover:text-navy">
      <BrandMark className="h-5 w-5" />
      <span className="eyebrow whitespace-nowrap">{partner.name}</span>
    </span>
  );
}
