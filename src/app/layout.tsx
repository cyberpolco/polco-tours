import type { Metadata } from 'next';
import { Archivo, Big_Shoulders_Stencil, Special_Elite } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale } from 'next-intl/server';
import './globals.css';

// "Horizon" typography (DR-156, replacing the prior Fraunces/IBM Plex trio,
// which read as generic "boutique DTC"/"dev tool" defaults): Big Shoulders
// Stencil (die-cut crate/signage stencil) for headlines and hero figures,
// Archivo (institutional-grotesque, built for wayfinding) for body/UI, and
// Special Elite (distressed field-dispatch typewriter) for the eyebrow/label
// pattern and booking/rating codes -- a rugged, expedition-manifest register
// replacing the old warm-editorial one. All three via next/font/google
// (already part of the Next.js dependency, no new package).
// `weight: 'variable'` (tried for a live opsz axis, DR-156 follow-up)
// turned out to be a dead end for this family -- despite the compiled CSS
// claiming a `font-weight: 100 900` range, fc-query on the actual served
// file showed it was really a single static "Big Shoulders Stencil Thin"
// instance (~weight 100), not a true variable binary; next/font silently
// degrades to that rather than erroring. Pinned static weights (matching
// what the Google Fonts CSS2 API actually served in the specimen the user
// picked from) are the only reliable way to get the real heavy/Black cut --
// verified via fc-query against the redeployed file before calling this
// done. No opsz axis as a result; the die-cut look comes from the weight,
// not an optical-size ramp.
const bigShouldersStencil = Big_Shoulders_Stencil({
  subsets: ['latin'],
  weight: ['700', '900'],
  variable: '--font-display',
});
const archivo = Archivo({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-sans' });
const specialElite = Special_Elite({ subsets: ['latin'], weight: '400', variable: '--font-mono' });

export const metadata: Metadata = {
  title: 'POLCO TOURS',
  description: 'Tourism Operating System for Namibia & the Democratic Republic of Congo.',
};

// NextIntlClientProvider lives here, not scoped to the (guest) route group
// (as it was pre-full-i18n-rollout) -- the staff dashboard now shares the
// same cookie-based EN/FR locale, so both trees need exactly one provider
// covering the whole app. No explicit locale/messages props needed;
// next-intl's plugin (next.config.mjs) auto-supplies them from
// src/i18n/request.ts's getRequestConfig.
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={locale} className={`${bigShouldersStencil.variable} ${archivo.variable} ${specialElite.variable}`}>
      <body>
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
