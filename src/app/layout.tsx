import type { Metadata } from 'next';
import { Fraunces, IBM_Plex_Mono, IBM_Plex_Sans } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale } from 'next-intl/server';
import './globals.css';

// "Meridian Cartography" typography: Fraunces (warm editorial serif) for
// headlines, IBM Plex Sans for body/UI, IBM Plex Mono for the existing
// tracking-survey eyebrow/label pattern and confirmation codes -- a
// technical/drafting face reinforcing the "survey" identity. All three via
// next/font/google (already part of the Next.js dependency, no new package).
const fraunces = Fraunces({ subsets: ['latin'], variable: '--font-serif' });
const ibmPlexSans = IBM_Plex_Sans({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-sans' });
const ibmPlexMono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-mono' });

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
    <html lang={locale} className={`${fraunces.variable} ${ibmPlexSans.variable} ${ibmPlexMono.variable}`}>
      <body>
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
