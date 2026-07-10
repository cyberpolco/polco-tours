import type { Metadata } from 'next';
import { Fraunces, IBM_Plex_Mono, IBM_Plex_Sans } from 'next/font/google';
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fraunces.variable} ${ibmPlexSans.variable} ${ibmPlexMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
