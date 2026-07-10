import { createAuthClient } from 'better-auth/react';
import { anonymousClient } from 'better-auth/client/plugins';

// Browser-side counterpart to src/lib/auth.ts's `auth` -- talks to the
// mounted /api/auth/[...all] route. First Client-Component-facing piece in
// the repo (DR-014). anonymousClient() pairs with the server's `anonymous`
// plugin (DR-016) so authClient.signIn.anonymous() is typed/available.
export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL,
  plugins: [anonymousClient()],
});
