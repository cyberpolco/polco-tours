import type { Config } from 'tailwindcss';

/**
 * Design tokens — "Horizon" (DR-068), replacing the flat "Meridian
 * Cartography" navy/amber/forest with a richer desert-sunset palette:
 * dusk plum -> ember -> gold, the same family used throughout the guest +
 * staff UI. Token KEYS are kept identical to the prior palette (navy/amber/
 * forest/bone/mist/ink/rule) on purpose -- every existing `bg-navy`/
 * `text-amber`/etc. class name across ~40+ staff pages and the guest site
 * re-themes automatically; only the underlying hex VALUES changed.
 */
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Dusk plum -- the dark anchor (was flat navy). `soft`/`line` back
        // the existing dark-surface form inputs (staff login/change-password).
        navy: { DEFAULT: '#3B1F3A', soft: '#4A2B48', line: '#6B4B68' },
        // Ember -- the primary CTA/accent (was flat amber).
        amber: { DEFAULT: '#D65B2E', soft: '#F5DCC9' },
        // Dusk forest -- the secondary/success accent, warmed to sit next
        // to ember rather than clash with it (was a cooler flat green).
        forest: { DEFAULT: '#2F6E4F', soft: '#DCEAE1' },
        // New: low-sun gold, the third sunset stop -- used for gradients,
        // scarcity/highlight badges, and rating stars.
        gold: { DEFAULT: '#F2B441', soft: '#FBEEC9' },
        // Warm sand -- the light ground (was a cooler flat cream).
        bone: '#F6EFE4',
        // Warm taupe-gray secondary text (was a cool blue-gray, clashed
        // with the new warm palette).
        mist: '#8C7D78',
        // Plum-biased near-black body text (was a cool slate).
        ink: '#211A1D',
        // Warm hairline/border (was a cool blue-gray).
        rule: '#E3D6C8',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
        serif: ['var(--font-serif)', 'Georgia', 'serif'],
      },
      letterSpacing: { survey: '0.28em' },
      // `survey` (3px) kept for any surface not yet migrated off the old
      // sharp-edged look; `card`/`pill` are the new rounder Horizon shapes.
      borderRadius: { survey: '3px', card: '14px', pill: '999px' },
      // Real elevation -- the old palette had none at all (every Card/
      // Button/Table was flat with no hover state).
      boxShadow: {
        card: '0 1px 2px rgba(33, 26, 29, 0.06)',
        lift: '0 16px 32px -12px rgba(59, 31, 58, 0.22)',
        'lift-lg': '0 24px 48px -16px rgba(33, 26, 29, 0.28)',
      },
      // CSS-only fallback animations for surfaces that don't warrant pulling
      // in framer-motion (most scroll-reveal/hero motion uses that instead,
      // see HeroCarousel). Neutralized globally under prefers-reduced-motion
      // in globals.css.
      keyframes: {
        'fade-up': { from: { opacity: '0', transform: 'translateY(12px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
      },
      animation: {
        'fade-up': 'fade-up 0.5s ease-out both',
        'fade-in': 'fade-in 0.4s ease-out both',
      },
    },
  },
  plugins: [],
};
export default config;
