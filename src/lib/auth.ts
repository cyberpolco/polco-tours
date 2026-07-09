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
  // Better Auth only writes columns it knows about -- its adapter factory's
  // transformInput() builds the create/update payload by iterating ITS OWN
  // schema (core fields + additionalFields declared here), silently
  // dropping anything else, even a value databaseHooks.user.create.before
  // correctly merges into the payload. organizationId must be declared or
  // the hook below computes the right value and it still never reaches
  // Postgres (root-caused via CI diagnostics, 2026-07-09 -- see Gotchas).
  // input: false means a client can never set this directly via the
  // sign-up request body; only the server-side hook may.
  user: {
    additionalFields: {
      organizationId: { type: 'string', required: false, input: false } as const,
    },
  },
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
    // Every id/organizationId/userId column in our schema is Postgres `uuid`
    // (@db.Uuid), but Better Auth's default id generator produces its own
    // non-UUID strings and passes them explicitly on insert (bypassing our
    // @default(uuid())). Without this, the very first real sign-in fails
    // with "Error creating UUID, invalid character" on the Session insert --
    // caught by tests/api/*.test.ts, not by hand.
    database: { generateId: 'uuid' as const },
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
