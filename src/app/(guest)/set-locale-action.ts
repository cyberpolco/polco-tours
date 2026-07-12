'use server';

import { cookies } from 'next/headers';

const LOCALES = ['en', 'fr'] as const;
type Locale = (typeof LOCALES)[number];

// Called by language-switcher.tsx -- writes the visitor's explicit choice,
// which then wins over src/middleware.ts's Accept-Language-derived seed on
// every subsequent request (see i18n/request.ts).
export async function setLocaleAction(locale: Locale) {
  if (!LOCALES.includes(locale)) return;
  (await cookies()).set('locale', locale, { path: '/', maxAge: 60 * 60 * 24 * 365 });
}
