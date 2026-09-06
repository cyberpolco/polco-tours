import { ImageResponse } from 'next/og';
import { HeroOgPlate, OG_IMAGE_SIZE } from '@lib/hero-opengraph';

export const alt = 'Rate Your Trip';
export const size = OG_IMAGE_SIZE;
export const contentType = 'image/png';

// Reuses this page's own full-bleed hero photo (etosha-zebra-waterhole.jpg,
// see page.tsx) -- see find-booking/opengraph-image.tsx's comment for why an
// absolute URL and no sharp re-encode are needed here. /rate/result has no
// OG image of its own for the same reason /find-booking/result doesn't
// (see its own noindex metadata) -- it inherits this plate.
export default function Image() {
  return new ImageResponse(
    <HeroOgPlate title="Rate Your Trip" heroImageUrl="https://mufasasafaris.com/images/hero/etosha-zebra-waterhole.jpg" gradientSeed="rate" />,
    { ...size },
  );
}
