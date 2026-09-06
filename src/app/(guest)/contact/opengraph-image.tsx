import { ImageResponse } from 'next/og';
import { HeroOgPlate, OG_IMAGE_SIZE } from '@lib/hero-opengraph';

export const alt = 'Contact Us';
export const size = OG_IMAGE_SIZE;
export const contentType = 'image/png';

// Contact has no hero photo of its own (unlike Plan my trip/Find booking/
// Rate/Weather/FAQ) -- HeroOgPlate falls back to the same Horizon gradient
// plate the Packages family uses when there's no photo to show, rather than
// leaving this page on the generic (guest)/opengraph-image.tsx logo plate.
export default function Image() {
  return new ImageResponse(<HeroOgPlate title="Contact Us" gradientSeed="contact" />, { ...size });
}
