import type { Config } from 'tailwindcss';

/**
 * Design tokens — "Meridian Cartography", the identity used across the
 * POLCO TOURS engineering design package (survey-line precision, expedition
 * palette). Keeping the product surface and the documents visually coherent.
 */
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: { DEFAULT: '#152238', soft: '#22344F', line: '#3A4E70' },
        amber: { DEFAULT: '#C97B2D', soft: '#F3E4CF' },
        forest: { DEFAULT: '#2E5B41', soft: '#E3EDE4' },
        bone: '#F7F4EE',
        mist: '#8A93A1',
        ink: '#2A2F38',
        rule: '#C9CFD8',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
      letterSpacing: { survey: '0.28em' },
      borderRadius: { survey: '3px' },
    },
  },
  plugins: [],
};
export default config;
