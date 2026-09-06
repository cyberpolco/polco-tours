import { ImageResponse } from 'next/og';
import { HeroOgPlate, OG_IMAGE_SIZE } from '@lib/hero-opengraph';

export const alt = 'Find My Booking';
export const size = OG_IMAGE_SIZE;
export const contentType = 'image/png';

// Reuses this page's own full-bleed hero photo (zambezi-sunset-canoe.jpg,
// see page.tsx) -- see plan-my-trip/opengraph-image.tsx's comment for why an
// absolute URL and no sharp re-encode are needed here. /find-booking/result
// (the lookup outcome, real per-guest data) deliberately has no OG image of
// its own -- it inherits this plate rather than getting one built from
// booking data, since that page isn't meant to be a link-share target (see
// its own noindex metadata).
export default function Image() {
  return new ImageResponse(
    (
      <HeroOgPlate
        title="Find My Booking"
        heroImageUrl="https://mufasasafaris.com/images/hero/zambezi-sunset-canoe.jpg"
        gradientSeed="find-booking"
      />
    ),
    { ...size },
  );
}
