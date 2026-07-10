import { prisma } from './db';

/**
 * Resolves the single-tenant launch org (Lam, DR-005) for callers that have
 * no session/tenant context of their own -- the public catalog/quiz pages
 * and the guest-checkout flow (DR-016). Throws if none is configured: unlike
 * the auth signup hook (which degrades gracefully to a null organizationId),
 * a guest-facing page with no primary org to show is a real operator
 * misconfiguration and should fail loudly, not silently render nothing.
 */
export async function getPrimaryOrgId(): Promise<string> {
  const primary = await prisma.organization.findFirst({ where: { isPrimary: true } });
  if (!primary) throw new Error('No primary organization configured');
  return primary.id;
}
