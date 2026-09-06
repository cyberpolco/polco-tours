import { ImageResponse } from 'next/og';
import { HeroOgPlate, OG_IMAGE_SIZE } from '@lib/hero-opengraph';

export const alt = 'Frequently Asked Questions';
export const size = OG_IMAGE_SIZE;
export const contentType = 'image/png';

// Reuses this page's own full-bleed hero photo (faq-hero.jpg, see
// page.tsx) -- see find-booking/opengraph-image.tsx's comment for why an
// absolute URL and no sharp re-encode are needed here.
export default function Image() {
  return new ImageResponse(
    <HeroOgPlate title="Frequently Asked Questions" heroImageUrl="https://mufasasafaris.com/images/hero/faq-hero.jpg" gradientSeed="faq" />,
    { ...size },
  );
}
