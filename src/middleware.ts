import { NextResponse, type NextRequest } from 'next/server';

/**
 * Edge middleware: attaches a trace id and seeds the `locale` cookie. The
 * rate-limit pre-check and session hydration hook in here in Phase 1
 * (Upstash + Better Auth). Business logic never lives here — the backend
 * decides (Vol. 5).
 *
 * Locale resolution (cookie, else Accept-Language) used to only get written
 * to an `x-locale` response header nothing read (DR-023 found this dead).
 * Now it seeds the actual `locale` cookie `src/i18n/request.ts` reads, but
 * only on a visitor's first request -- once the language-switcher Server
 * Action (`set-locale-action.ts`) writes an explicit choice, that cookie
 * wins on every later request and this never overwrites it.
 */
const LOCALES = ['en', 'fr'] as const;

export function middleware(req: NextRequest) {
  const res = NextResponse.next();

  const traceId = `req_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  res.headers.set('x-trace-id', traceId);

  const cookieLocale = req.cookies.get('locale')?.value;
  if (!cookieLocale) {
    const headerLocale = req.headers.get('accept-language')?.slice(0, 2);
    const locale = (LOCALES as readonly string[]).includes(headerLocale ?? '') ? headerLocale : 'en';
    res.cookies.set('locale', locale as string, { path: '/' });
  }

  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
