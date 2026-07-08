import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { prisma } from './db';

/**
 * Authentication (Vol. 5 / Vol. 7): Better Auth, self-hosted, data in our own
 * Neon DB (EU residency, no per-MAU fee). Email + password with mandatory
 * verification (FR-A01) and session timeouts (FR-A03).
 *
 * Setup note: run `npx @better-auth/cli@latest generate` after install to emit
 * Better Auth's own tables into the Prisma schema, then `npm run db:push`.
 */
export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: 'postgresql' }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
  },
  session: {
    expiresIn: 60 * 60 * 12, // 12h absolute
    updateAge: 60 * 30, // refresh idle window (30m)
  },
  advanced: {
    cookiePrefix: 'polco',
  },
});

export type Auth = typeof auth;
