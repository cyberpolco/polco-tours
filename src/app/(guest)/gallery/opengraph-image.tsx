import { ImageResponse } from 'next/og';
import { HeroOgPlate, OG_IMAGE_SIZE } from '@lib/hero-opengraph';

export const alt = 'Gallery';
export const size = OG_IMAGE_SIZE;
export const contentType = 'image/png';

// The gallery INDEX has no single photo of its own to lead with (each site
// has its own, see gallery/[identifier]/opengraph-image.tsx, which this file
// doesn't affect -- Next always prefers a segment's own file over an
// ancestor's) -- HeroOgPlate falls back to the gradient plate here, same as
// contact/opengraph-image.tsx.
export default function Image() {
  return new ImageResponse(<HeroOgPlate title="Gallery" gradientSeed="gallery" />, { ...size });
}
