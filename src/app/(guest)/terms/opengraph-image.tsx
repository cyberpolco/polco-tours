import { ImageResponse } from 'next/og';
import { HeroOgPlate, OG_IMAGE_SIZE } from '@lib/hero-opengraph';

export const alt = 'Terms & Policies';
export const size = OG_IMAGE_SIZE;
export const contentType = 'image/png';

// Terms has no hero photo of its own -- see contact/opengraph-image.tsx's
// comment for why HeroOgPlate falls back to the gradient plate here.
export default function Image() {
  return new ImageResponse(<HeroOgPlate title="Terms & Policies" gradientSeed="terms" />, { ...size });
}
