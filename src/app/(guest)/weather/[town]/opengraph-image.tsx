import { ImageResponse } from 'next/og';
import { weatherService } from '@modules/weather';
import { HeroOgPlate, OG_IMAGE_SIZE } from '@lib/hero-opengraph';
import { WEATHER_HERO_IMAGE } from '../weather-glass';

export const alt = 'Weather forecast';
export const size = OG_IMAGE_SIZE;
export const contentType = 'image/png';

interface Props {
  params: Promise<{ town: string }>;
}

// Same hero photo as the /weather index (WEATHER_HERO_IMAGE, see that
// segment's own opengraph-image.tsx) -- there's no per-town photo asset in
// this app, so the plate is distinguished by title only, same idea as
// packages/[packageId]'s fallback plate (title-only, no photo, when no real
// package photo exists) rather than by a different background per town.
export default async function Image({ params }: Props) {
  const { town: slug } = await params;

  let title = 'Weather';
  try {
    const town = await weatherService.getPublicTownWeather(slug);
    if (town) title = `Weather in ${town.name}`;
  } catch {
    // Unknown/misconfigured slug -- fall through to the generic title below,
    // same convention as every other dynamic OG route in this app.
  }

  return new ImageResponse(
    <HeroOgPlate title={title} heroImageUrl={`https://mufasasafaris.com${WEATHER_HERO_IMAGE}`} gradientSeed={slug} />,
    { ...size },
  );
}
