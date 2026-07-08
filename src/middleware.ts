import { NextResponse, type NextRequest } from 'next/server';

/**
 * Edge middleware: attaches a trace id and resolves locale. The rate-limit
 * pre-check and session hydration hook in here in Phase 1 (Upstash + Better
 * Auth). Business logic never lives here — the backend decides (Vol. 5).
 */
const LOCALES = ['en', 'fr'] as const;

export function middleware(req: NextRequest) {
  const res = NextResponse.next();

  const traceId = `req_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  res.headers.set('x-trace-id', traceId);

  const cookieLocale = req.cookies.get('locale')?.value;
  const headerLocale = req.headers.get('accept-language')?.slice(0, 2);
  const locale = [cookieLocale, headerLocale].find(
    (l): l is (typeof LOCALES)[number] => !!l && (LOCALES as readonly string[]).includes(l),
  );
  res.headers.set('x-locale', locale ?? 'en');

  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
