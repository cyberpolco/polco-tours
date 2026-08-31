'use server';

import { cookies } from 'next/headers';
import { COOKIE_CONSENT_COOKIE, type CookieConsentChoice } from './cookie-consent';

// DR-207: the cookie-consent banner's own write -- same "plain server
// action, no cookies() ceremony beyond a single set()" shape as
// set-locale-action.ts.
export async function setCookieConsentAction(choice: CookieConsentChoice) {
  (await cookies()).set(COOKIE_CONSENT_COOKIE, choice, { path: '/', maxAge: 60 * 60 * 24 * 365 });
}
