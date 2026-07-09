import { createAuthClient } from 'better-auth/react';

// Browser-side counterpart to src/lib/auth.ts's `auth` -- talks to the
// mounted /api/auth/[...all] route. First Client-Component-facing piece in
// the repo (DR-014).
export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL,
});
