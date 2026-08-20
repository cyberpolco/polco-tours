import type { Metadata } from 'next';
import { Archivo, Special_Elite } from 'next/font/google';
import localFont from 'next/font/local';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale } from 'next-intl/server';
import './globals.css';

// "Horizon" typography (DR-156, replacing the prior Fraunces/IBM Plex trio,
// which read as generic "boutique DTC"/"dev tool" defaults): Big Shoulders
// Stencil Display (die-cut crate/signage stencil) for headlines and hero
// figures, Archivo (institutional-grotesque, built for wayfinding) for
// body/UI, and Special Elite (distressed field-dispatch typewriter) for the
// eyebrow/label pattern and booking/rating codes -- a rugged, expedition-
// manifest register replacing the old warm-editorial one.
//
// Big Shoulders Stencil Display is self-hosted via next/font/local, not
// next/font/google, after two rounds of misdiagnosis (DR-156 follow-ups):
// "Big Shoulders Stencil" and "Big Shoulders Stencil Display" are two
// *separate* published Google Fonts families, not one variable family with
// an opsz axis. `next/font/google` only bundles a function for the base
// "Big Shoulders Stencil" family -- there is no `Big_Shoulders_Stencil_
// Display` export at all. That base family's own file has a `wght` axis
// declared 100-900 (so earlier attempts didn't error), but zero named
// instances beyond its default, and visibly renders as a plain sans with no
// die-cut gaps at all -- confirmed both by inspecting the file directly
// with fontTools (no Bold/Black named instances) and by the live screenshot
// the user sent, which showed an ordinary bold sans, not a stencil. The
// real "...Display" family (fetched directly from Google's own CSS2
// endpoint, the same one the comparison specimen used) has genuine Thin
// through Black named instances and visibly cuts -- that exact file is
// vendored at ./fonts/big-shoulders-stencil-display.woff2 (Latin subset,
// OFL-licensed, same font Google itself would otherwise serve) and self-
// hosted the same way next/font/google would.
const bigShouldersStencilDisplay = localFont({
  src: './fonts/big-shoulders-stencil-display.woff2',
  weight: '100 900',
  style: 'normal',
  display: 'swap',
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
    <html lang={locale} className={`${bigShouldersStencilDisplay.variable} ${archivo.variable} ${specialElite.variable}`}>
      <body>
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
