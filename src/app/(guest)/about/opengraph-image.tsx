import { ImageResponse } from 'next/og';
import { cmsService } from '@modules/cms';
import { BRAND_LOGO_DATA_URI } from '@lib/brand-logo';
import { ABOUT_STAT_DEFAULTS, ABOUT_TEXT_DEFAULTS } from './defaults';

export const alt = 'Mufasa Safaris & Tours — at a glance';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
// cmsService reads through Prisma, which has no Edge build -- same reason
// the other OG routes in this app pin the Node runtime (theirs is sharp's
// native bindings rather than Prisma, but the constraint is the same).
export const runtime = 'nodejs';

// Overrides the generic (guest)/opengraph-image.tsx logo plate for /about
// only -- explicit user request to lead the link preview with the "At a
// glance" figures instead. Same override mechanism the Packages tree uses:
// Next always prefers the file nearest the segment over an ancestor default.
//
// Always English: a social crawler carries no `locale` cookie, so there is
// nothing to resolve a French variant from (unlike the page itself, which
// reads that cookie). The FR figures are identical anyway -- only the labels
// differ, and updateAboutEntry keeps the numbers in step across locales.
const LOCALE = 'en';

export default async function Image() {
  const fallback = ABOUT_STAT_DEFAULTS[LOCALE];
  let stats = fallback;
  try {
    const rows = await cmsService.listPublicAboutEntries('stat', LOCALE);
    const usable = rows.filter((row) => row.numericValue !== null);
    if (usable.length > 0) {
      stats = usable.map((row) => ({
        heading: row.heading,
        numericValue: row.numericValue ?? 0,
        prefix: row.prefix,
        suffix: row.suffix,
        animate: row.animate,
      }));
    }
  } catch {
    // Never crash the social-preview route on a DB hiccup -- the coded
    // defaults are the same figures the guest page falls back to.
  }

  // Six across would crowd the plate at this width; the page itself has no
  // such cap since it wraps onto a second row.
  const shown = stats.slice(0, 5);
  const badge = ABOUT_TEXT_DEFAULTS[LOCALE]['about.stats'].body;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          backgroundColor: '#3B1F3A',
          fontFamily: 'sans-serif',
          padding: '56px 64px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', fontSize: 22, letterSpacing: 4, color: '#F2B441' }}>AT A GLANCE</div>
            <div style={{ display: 'flex', fontSize: 52, fontWeight: 700, color: '#FFFFFF', marginTop: 10 }}>
              Mufasa Safaris &amp; Tours
            </div>
          </div>
          <img src={BRAND_LOGO_DATA_URI} width={132} height={132} alt="" />
        </div>

        <div style={{ display: 'flex', height: 5, backgroundColor: '#D65B2E', width: 96, borderRadius: 3 }} />

        {/* Top-aligned, not bottom: a label that wraps to two lines ("Largest
            group supervised") would otherwise push its own figure up out of
            line with the rest of the row. */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          {shown.map((stat) => (
            <div
              key={stat.heading}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                width: Math.floor(1072 / shown.length),
              }}
            >
              <div style={{ display: 'flex', fontSize: 84, fontWeight: 700, color: '#D65B2E', lineHeight: 1 }}>
                {`${stat.prefix ?? ''}${stat.numericValue}${stat.suffix ?? ''}`}
              </div>
              <div
                style={{
                  display: 'flex',
                  textAlign: 'center',
                  fontSize: 20,
                  color: '#F6EFE4',
                  marginTop: 14,
                  lineHeight: 1.25,
                }}
              >
                {stat.heading}
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', fontSize: 20, color: '#8C7D78' }}>{badge}</div>
      </div>
    ),
    { ...size },
  );
}
