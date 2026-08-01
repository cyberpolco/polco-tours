import { createAuthClient } from 'better-auth/react';
import { anonymousClient } from 'better-auth/client/plugins';

// Browser-side counterpart to src/lib/auth.ts's `auth` -- talks to the
// mounted /api/auth/[...all] route. First Client-Component-facing piece in
// the repo (DR-014). anonymousClient() pairs with the server's `anonymous`
// plugin (DR-016) so authClient.signIn.anonymous() is typed/available.
//
// DR-072: no explicit `baseURL` -- better-auth's client falls back to
// `window.location.origin` when it's omitted (src/utils/url.ts's
// `getBaseURL`), so requests always target whatever domain actually served
// the page. This app now serves production traffic from more than one
// domain (see auth.ts's `trustedOrigins`); a hardcoded `NEXT_PUBLIC_APP_URL`
// here previously baked ONE domain into the client bundle at build time --
// every other domain's sign-in was a cross-origin call to that one, which
// the browser silently blocked (or which set the session cookie on the
// wrong domain), surfacing as a sign-in button that spins forever.
export const authClient = createAuthClient({
  plugins: [anonymousClient()],
});
