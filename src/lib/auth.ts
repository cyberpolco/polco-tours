import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { anonymous } from 'better-auth/plugins';
import { prisma } from './db';
import { getPrimaryOrgId } from './primary-org';

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
  // Guest checkout (DR-016): a real, cookie-backed session with zero
  // password/email UX -- the tourist self-serve site's whole trust model.
  // disableDeleteAnonymousUser is true because our guests never "convert" to
  // a real account (no tourist signup flow exists) -- the plugin's default
  // "delete the anonymous user once they sign in for real" behavior must not
  // run, or a guest's booking history would vanish under them.
  plugins: [anonymous({ disableDeleteAnonymousUser: true })],
  // Explicit user direction: no session -- staff or guest/anonymous alike
  // -- may sit inactive for more than 30 minutes before requiring a fresh
  // sign-in. better-auth's session model is a sliding window, not a
  // separate "inactivity" concept: expiresIn is how long a session stays
  // valid since its last refresh, and updateAge is how often using the
  // session actually pushes that expiry forward. Setting both to the same
  // 30-minute value makes them work together as a real inactivity timeout
  // -- any request at least updateAge since the last refresh extends the
  // session another expiresIn from now, so genuinely active use (requests
  // less than 30m apart) never gets logged out, while 30+ consecutive
  // minutes of no requests lets the session lapse. This intentionally
  // replaces the previous 12h-absolute/30m-refresh-cadence pair (which
  // actually allowed up to 12h of inactivity, not 30m -- the old "30m"
  // comment there described the refresh cadence, not a real timeout).
  // Applies globally, including anonymous guest-checkout sessions (a real,
  // accepted tradeoff: a guest who pauses 30+ minutes mid-wizard has to
  // restart as a new anonymous identity, since there's no credential to
  // "sign back into" the same one).
  session: {
    expiresIn: 60 * 30,
    updateAge: 60 * 30,
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
        // DR-005/DR-011: single-tenant launch -- every new tourist (real or
        // anonymous/guest, DR-016) joins the primary org (Lam) at signup.
        // organizationId stays nullable in the schema for the future
        // multi-operator case. Deliberately falls back to null instead of
        // propagating getPrimaryOrgId()'s throw -- unlike a guest-facing page
        // failing loudly on misconfiguration, signup itself should degrade
        // gracefully rather than block entirely.
        async before() {
          let organizationId: string | null = null;
          try {
            organizationId = await getPrimaryOrgId();
          } catch {
            // No primary org configured -- leave organizationId null.
          }
          return { data: { organizationId } };
        },
      },
    },
    // "Last login" column on /staff/admin/users -- a plain direct write
    // (not part of better-auth's own managed create payload, so no
    // additionalFields registration is needed, unlike organizationId
    // above), run right after a new Session row is actually created, i.e.
    // a real sign-in -- not on every authenticated request, which is what
    // updateAge's own sliding-window refresh would otherwise conflate this
    // with. Best-effort: a failure here must never block sign-in itself.
    session: {
      create: {
        async after(session: { userId: string }) {
          try {
            await prisma.user.update({ where: { id: session.userId }, data: { lastLoginAt: new Date() } });
          } catch {
            // Never block sign-in over a lastLoginAt write failing.
          }
        },
      },
    },
  },
};

export const auth = betterAuth(authConfig);

export type Auth = typeof auth;
