import { toNextJsHandler } from 'better-auth/next-js';
import { auth } from '@lib/auth';

// Better Auth's own mount point (sign-in/sign-up/session/sign-out etc.) --
// previously never wired up anywhere; DR-014. src/lib/auth.ts's authConfig
// is the single source of truth for its behavior.
export const { GET, POST } = toNextJsHandler(auth);
