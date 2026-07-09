import { betterAuth } from 'better-auth';
import { testUtils } from 'better-auth/plugins';
import { authConfig } from '../../src/lib/auth';

/**
 * Mints a valid session for an existing user id without driving the
 * browser -- same shortcut tests/helpers/test-auth.ts uses for API-route
 * tests, adapted here for Playwright's cookie-jar API. `cookies` from
 * ctx.test.login() is already shaped for Playwright's addCookies()
 * (name/value/domain/path/httpOnly/secure/sameSite/expires).
 */
const testAuth = betterAuth({ ...authConfig, plugins: [testUtils()] });

export async function sessionCookiesFor(userId: string) {
  const ctx = await testAuth.$context;
  const { cookies } = await ctx.test.login({ userId });
  return cookies;
}
