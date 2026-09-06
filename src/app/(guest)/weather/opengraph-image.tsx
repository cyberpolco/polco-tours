import { ImageResponse } from 'next/og';
import { HeroOgPlate, OG_IMAGE_SIZE } from '@lib/hero-opengraph';
import { WEATHER_HERO_IMAGE } from './weather-glass';

export const alt = 'Weather';
export const size = OG_IMAGE_SIZE;
export const contentType = 'image/png';

// Reuses this page's own full-bleed hero photo -- WEATHER_HERO_IMAGE is the
// same constant weather-glass.ts's WEATHER_SECTION uses for the on-page
// background, so this can't drift out of sync with it. Absolute URL, not
// the relative path WEATHER_HERO_IMAGE is written as: see
// find-booking/opengraph-image.tsx's comment for why next/og's Satori
// renderer needs a real fetchable URL rather than a /public path. A real
// town (/weather/[town]) gets its own dynamic plate instead of inheriting
// this one -- see that segment's own opengraph-image.tsx.
export default function Image() {
  return new ImageResponse(
    <HeroOgPlate title="Weather" heroImageUrl={`https://mufasasafaris.com${WEATHER_HERO_IMAGE}`} gradientSeed="weather" />,
    { ...size },
  );
}
