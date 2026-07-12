import { cookies } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';

// Cookie-based locale, no [locale] URL segment (DR-023) -- matches this
// app's guest-checkout-anonymous-session philosophy (DR-016) of avoiding
// route complexity. The cookie itself is seeded by src/middleware.ts on a
// visitor's first request and overwritten by the language switcher's
// Server Action (set-locale-action.ts) once they make an explicit choice.
const LOCALES = ['en', 'fr'] as const;
type Locale = (typeof LOCALES)[number];

export default getRequestConfig(async () => {
  const store = await cookies();
  const cookieLocale = store.get('locale')?.value;
  const locale: Locale = (LOCALES as readonly string[]).includes(cookieLocale ?? '') ? (cookieLocale as Locale) : 'en';

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
