import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { prisma } from './db';

/**
 * Authentication (Vol. 5 / Vol. 7): Better Auth, self-hosted, data in our own
 * Neon DB (EU residency, no per-MAU fee). Email + password with mandatory
 * verification (FR-A01) and session timeouts (FR-A03).
 *
 * Better Auth's own tables (Account, Verification; Session/User extended with
 * ipAddress/image) were generated via `npx @better-auth/cli@latest generate`
 * and are committed in prisma/schema.prisma -- re-run that command (and
 * review the diff by hand, see Gotchas in CLAUDE.md) if this config changes
 * in a way that affects Better Auth's managed schema.
 */
// Exported separately (not inlined into betterAuth() below) so
// tests/helpers/test-auth.ts can build a test-only auth instance with the
// exact same cookie/session settings plus the testUtils plugin -- if the two
// instances' cookie-affecting config ever drifted, a test-minted session
// cookie wouldn't be recognized by this production instance's getSession.
export const authConfig = {
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
  databaseHooks: {
    user: {
      create: {
        // DR-005/DR-011: single-tenant launch -- every new tourist joins the
        // primary org (Lam) at signup. organizationId stays nullable in the
        // schema for the future multi-operator case; this hook is the only
        // place that decides the default.
        async before() {
          const primary = await prisma.organization.findFirst({ where: { isPrimary: true } });
          return { data: { organizationId: primary?.id ?? null } };
        },
      },
    },
  },
};

export const auth = betterAuth(authConfig);

export type Auth = typeof auth;
