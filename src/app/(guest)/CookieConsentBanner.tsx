import { cookies } from 'next/headers';
import { COOKIE_CONSENT_COOKIE } from '@lib/cookie-consent';
import { CookieConsentBannerClient } from './CookieConsentBannerClient';

// DR-207: server wrapper so a returning guest who already chose never
// renders (or flashes) the banner client component at all -- only an
// undecided visitor pays for it.
export async function CookieConsentBanner() {
  const store = await cookies();
  const consent = store.get(COOKIE_CONSENT_COOKIE)?.value;
  if (consent === 'accepted' || consent === 'rejected') return null;
  return <CookieConsentBannerClient />;
}
