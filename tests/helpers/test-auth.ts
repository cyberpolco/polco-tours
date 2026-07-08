import { betterAuth } from 'better-auth';
import { testUtils } from 'better-auth/plugins';
import { authConfig } from '@lib/auth';

/**
 * Test-only Better Auth instance: same config as the production `auth`
 * export (so cookies it mints are recognized by authService.resolveSession)
 * plus the official testUtils plugin, which can mint a valid session for an
 * existing user id without going through password hashing or email
 * verification. Never import this from application code.
 */
const testAuth = betterAuth({ ...authConfig, plugins: [testUtils()] });

/** Returns request headers (incl. a valid session cookie) for the given user id. */
export async function loginAs(userId: string): Promise<Headers> {
  const ctx = await testAuth.$context;
  const { headers } = await ctx.test.login({ userId });
  return headers;
}
