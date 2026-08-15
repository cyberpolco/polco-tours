'use client';

import { useEffect, useId, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

// Purely decorative (charter rule 1 doesn't apply -- no business logic here,
// just presentation) -- every real value (temperature, condition text,
// humidity %) is already rendered as plain text by the pages that use this,
// so the whole scene is aria-hidden rather than needing new i18n strings.
// Colors are hardcoded hex, deliberately mirroring the Horizon tokens in
// tailwind.config.ts (navy/amber/forest/gold/bone/mist) rather than
// hand-picked sky-blue -- SVG `fill`/`stop-color` can't reach Tailwind
// utility classes, so this is the closest a raw SVG gets to "on-brand."
const COLORS = {
  navy: '#3B1F3A',
  navySoft: '#4A2B48',
  amber: '#D65B2E',
  amberSoft: '#F5DCC9',
  forest: '#2F6E4F',
  gold: '#F2B441',
  goldSoft: '#FBEEC9',
  bone: '#F6EFE4',
  mist: '#8C7D78',
  rule: '#E3D6C8',
};

type ConditionCategory = 'clear' | 'cloudy' | 'rain' | 'storm' | 'snow';

function classifyCondition(conditionText: string): ConditionCategory {
  const text = conditionText.toLowerCase();
  if (text.includes('thunder') || text.includes('storm')) return 'storm';
  if (text.includes('snow') || text.includes('sleet') || text.includes('hail')) return 'snow';
  if (text.includes('rain') || text.includes('shower') || text.includes('drizzle')) return 'rain';
  if (text.includes('cloud') || text.includes('overcast') || text.includes('haze') || text.includes('fog') || text.includes('mist')) {
    return 'cloudy';
  }
  return 'clear';
}

// Defaults to daytime for the server-rendered/first-paint frame (avoids a
// layout flash) and corrects to the visitor's real local time on mount --
// this is cosmetic sky-tinting only, never a value the page's actual
// content depends on, so the one-frame server/client mismatch is harmless.
function useIsDaytime(): boolean {
  const [isDay, setIsDay] = useState(true);
  useEffect(() => {
    const hour = new Date().getHours();
    setIsDay(hour >= 6 && hour < 18);
  }, []);
  return isDay;
}

function Clouds({ count, reduceMotion, tint }: { count: number; reduceMotion: boolean; tint: string }) {
  const specs = [
    { top: '18%', width: 46, duration: 26, delay: 0 },
    { top: '42%', width: 34, duration: 34, delay: -8 },
    { top: '8%', width: 30, duration: 30, delay: -18 },
  ].slice(0, count);

  return (
    <>
      {specs.map((cloud, i) => (
        <motion.svg
          key={i}
          viewBox="0 0 64 32"
          width={cloud.width}
          style={{ position: 'absolute', top: cloud.top, opacity: 0.85 }}
          initial={{ left: '-20%' }}
          animate={reduceMotion ? undefined : { left: '110%' }}
          transition={reduceMotion ? undefined : { duration: cloud.duration, delay: cloud.delay, repeat: Infinity, ease: 'linear' }}
        >
          <ellipse cx="20" cy="20" rx="16" ry="10" fill={tint} />
          <ellipse cx="34" cy="14" rx="18" ry="13" fill={tint} />
          <ellipse cx="48" cy="20" rx="14" ry="9" fill={tint} />
        </motion.svg>
      ))}
    </>
  );
}

function Rain({ reduceMotion, dense }: { reduceMotion: boolean; dense: boolean }) {
  const drops = Array.from({ length: dense ? 10 : 5 }, (_, i) => i);
  return (
    <>
      {drops.map((i) => (
        <motion.div
          key={i}
          style={{
            position: 'absolute',
            top: '40%',
            left: `${8 + i * (84 / drops.length)}%`,
            width: 2,
            height: 10,
            borderRadius: 999,
            background: COLORS.navySoft,
            opacity: 0.55,
          }}
          initial={{ y: 0, opacity: 0 }}
          animate={reduceMotion ? { opacity: 0.45 } : { y: [0, 46], opacity: [0, 0.6, 0] }}
          transition={reduceMotion ? undefined : { duration: 0.9 + (i % 3) * 0.15, delay: i * 0.12, repeat: Infinity, ease: 'easeIn' }}
        />
      ))}
    </>
  );
}

function Stars({ reduceMotion, count }: { reduceMotion: boolean; count: number }) {
  const stars = Array.from({ length: count }, (_, i) => ({
    top: `${8 + ((i * 37) % 55)}%`,
    left: `${6 + ((i * 53) % 88)}%`,
    delay: (i % 5) * 0.4,
  }));
  return (
    <>
      {stars.map((star, i) => (
        <motion.div
          key={i}
          style={{ position: 'absolute', top: star.top, left: star.left, width: 3, height: 3, borderRadius: 999, background: COLORS.goldSoft }}
          initial={{ opacity: 0.3 }}
          animate={reduceMotion ? { opacity: 0.7 } : { opacity: [0.25, 0.9, 0.25] }}
          transition={reduceMotion ? undefined : { duration: 2.2, delay: star.delay, repeat: Infinity, ease: 'easeInOut' }}
        />
      ))}
    </>
  );
}

interface WeatherAnimationProps {
  conditionText: string;
  /** compact: small inline icon for a list card. full: hero banner for the town detail page. */
  size?: 'compact' | 'full';
  className?: string;
}

export function WeatherAnimation({ conditionText, size = 'compact', className }: WeatherAnimationProps) {
  const reduceMotion = Boolean(useReducedMotion());
  const isDay = useIsDaytime();
  const category = classifyCondition(conditionText);
  const overcast = category === 'cloudy' || category === 'rain' || category === 'storm' || category === 'snow';

  const height = size === 'compact' ? 44 : 140;
  const sky = isDay
    ? `linear-gradient(to bottom, ${COLORS.goldSoft}, ${COLORS.amberSoft} 60%, ${COLORS.bone})`
    : `linear-gradient(to bottom, ${COLORS.navy}, ${COLORS.navySoft})`;

  return (
    <div
      aria-hidden="true"
      className={['relative overflow-hidden rounded-card', className].filter(Boolean).join(' ')}
      style={{ height, background: sky }}
    >
      {!isDay && <Stars reduceMotion={reduceMotion} count={size === 'compact' ? 6 : 16} />}

      {/* Sun / moon */}
      <motion.div
        style={{ position: 'absolute', top: size === 'compact' ? 6 : 18, left: size === 'compact' ? 6 : 22 }}
        animate={reduceMotion ? undefined : { y: [0, -4, 0] }}
        transition={reduceMotion ? undefined : { duration: 5, repeat: Infinity, ease: 'easeInOut' }}
      >
        {isDay ? (
          <motion.svg
            viewBox="0 0 40 40"
            width={size === 'compact' ? 20 : 44}
            animate={reduceMotion ? undefined : { rotate: 360 }}
            transition={reduceMotion ? undefined : { duration: 22, repeat: Infinity, ease: 'linear' }}
          >
            <g stroke={COLORS.gold} strokeWidth="2" strokeLinecap="round">
              {Array.from({ length: 8 }, (_, i) => {
                const angle = (i * Math.PI) / 4;
                const x1 = 20 + Math.cos(angle) * 15;
                const y1 = 20 + Math.sin(angle) * 15;
                const x2 = 20 + Math.cos(angle) * 19;
                const y2 = 20 + Math.sin(angle) * 19;
                return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} />;
              })}
            </g>
            <circle cx="20" cy="20" r="11" fill={COLORS.amber} />
          </motion.svg>
        ) : (
          <svg viewBox="0 0 40 40" width={size === 'compact' ? 18 : 40}>
            <path
              d="M25 6 A14 14 0 1 0 25 34 A11 11 0 1 1 25 6 Z"
              fill={COLORS.goldSoft}
            />
          </svg>
        )}
      </motion.div>

      {overcast && <Clouds count={size === 'compact' ? 1 : 3} reduceMotion={reduceMotion} tint={isDay ? COLORS.bone : COLORS.mist} />}
      {(category === 'rain' || category === 'storm') && <Rain reduceMotion={reduceMotion} dense={size === 'full'} />}
    </div>
  );
}

interface HumidityGaugeProps {
  humidityPct: number;
  className?: string;
}

// A filling droplet -- the fill height animates once from 0 to the real
// value on mount/scroll-in, plus a couple of slow-rising bubbles while it
// sits full. Reduced-motion skips the rise/bubbles but still shows the
// correct fill level immediately (no information is motion-gated).
export function HumidityGauge({ humidityPct, className }: HumidityGaugeProps) {
  const reduceMotion = Boolean(useReducedMotion());
  const clipId = useId();
  const clamped = Math.max(0, Math.min(100, humidityPct));
  const fillY = 58 - (58 * clamped) / 100;

  return (
    <div aria-hidden="true" className={['relative', className].filter(Boolean).join(' ')} style={{ width: 40, height: 52 }}>
      <svg viewBox="0 0 40 52" width={40} height={52}>
        <defs>
          <clipPath id={clipId}>
            <path d="M20 2 C20 2 4 24 4 36 A16 16 0 0 0 36 36 C36 24 20 2 20 2 Z" />
          </clipPath>
        </defs>
        <path d="M20 2 C20 2 4 24 4 36 A16 16 0 0 0 36 36 C36 24 20 2 20 2 Z" fill="none" stroke={COLORS.mist} strokeWidth="1.5" />
        <g clipPath={`url(#${clipId})`}>
          <motion.rect
            x="0"
            width="40"
            height="58"
            fill={COLORS.forest}
            fillOpacity={0.75}
            initial={{ y: 58 }}
            animate={{ y: fillY }}
            transition={{ duration: 1.1, ease: 'easeOut' }}
          />
          {!reduceMotion && (
            <>
              <motion.circle
                cx="15"
                r="1.6"
                fill={COLORS.bone}
                fillOpacity={0.7}
                initial={{ cy: 50 }}
                animate={{ cy: [50, 20], opacity: [0, 0.8, 0] }}
                transition={{ duration: 3, delay: 0.5, repeat: Infinity, ease: 'easeOut' }}
              />
              <motion.circle
                cx="24"
                r="1.2"
                fill={COLORS.bone}
                fillOpacity={0.7}
                initial={{ cy: 52 }}
                animate={{ cy: [52, 24], opacity: [0, 0.8, 0] }}
                transition={{ duration: 2.4, delay: 1.4, repeat: Infinity, ease: 'easeOut' }}
              />
            </>
          )}
        </g>
      </svg>
    </div>
  );
}
