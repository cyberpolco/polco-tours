import { auth } from '../../src/lib/auth';
import { prisma } from '../../src/lib/db';

/**
 * Creates a real, throwaway credentialed staff user for e2e login tests --
 * never touches prisma/seed.ts or Lam's row (seed.ts also seeds real
 * environments via `db:setup`, so a hardcoded test password must never live
 * there). Uses better-auth's own signUpEmail (real password hashing, never
 * reimplemented) then flips emailVerified directly, since
 * requireEmailVerification blocks sign-in otherwise and no email-sending is
 * configured to click a real verification link.
 */
export async function createVerifiedStaffUser(): Promise<{ email: string; password: string }> {
  const email = `e2e-staff-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`;
  const password = 'E2E-test-password-1!';

  const org = await prisma.organization.findFirstOrThrow({ where: { isPrimary: true } });
  const result = await auth.api.signUpEmail({ body: { name: 'E2E Staff', email, password } });
  // Explicitly set organizationId rather than relying on authConfig's
  // databaseHooks.user.create.before -- see the Gotcha in CLAUDE.md: that
  // hook did not visibly take effect for this signUpEmail call in CI, an
  // unresolved finding tracked separately from what this test verifies.
  await prisma.user.update({
    where: { id: result.user.id },
    data: { role: 'TOUR_OPERATOR', emailVerified: true, organizationId: org.id },
  });

  return { email, password };
}
