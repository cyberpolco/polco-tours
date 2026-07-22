import { cache } from 'react';
import { prisma } from './db';

/**
 * Resolves the single-tenant launch org (Lam, DR-005) for callers that have
 * no session/tenant context of their own -- the public catalog/quiz pages
 * and the guest-checkout flow (DR-016). Throws if none is configured: unlike
 * the auth signup hook (which degrades gracefully to a null organizationId),
 * a guest-facing page with no primary org to show is a real operator
 * misconfiguration and should fail loudly, not silently render nothing.
 *
 * Wrapped in React's cache() so the handful of independent public services
 * that each look this up on a single request (e.g. the homepage's catalog +
 * ratings calls) share one DB round trip instead of repeating it.
 */
export const getPrimaryOrgId = cache(async (): Promise<string> => {
  const primary = await prisma.organization.findFirst({ where: { isPrimary: true } });
  if (!primary) throw new Error('No primary organization configured');
  return primary.id;
});
