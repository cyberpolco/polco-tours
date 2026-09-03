// One-off CLI to create a real, credentialed staff/admin login -- there is
// no public sign-up UI for staff (src/app/staff/login is sign-in only), and
// prisma/seed.ts deliberately never sets a password on the seeded Lam user
// (it also runs against real environments via db:setup). Uses better-auth's
// own signUpEmail so the password is hashed the real way (same mechanism
// e2e/helpers/staff-user.ts uses for tests). DR-229: role/organizationId/
// emailVerified are set atomically as part of that same signUpEmail insert
// via the trusted-signal mechanism (src/lib/trusted-user-create.ts) --
// emailVerified: true is required since requireEmailVerification blocks
// sign-in otherwise and no email-sending is configured to click a real
// verification link.
//
// Usage: npx tsx scripts/create-staff-user.ts <email> <password> <role> [name]
// Role must be one of: SUPERADMIN, PLATFORM_ADMIN, TOUR_OPERATOR,
// TOUR_GUIDE, DRIVER, VEHICLE_OWNER, VISA_FACILITATOR
import { Role } from '@prisma/client';
import { auth } from '@lib/auth';
import { prisma } from '@lib/db';
import { getPrimaryOrgId } from '@lib/primary-org';
import { withTrustedUserCreate } from '@lib/trusted-user-create';

async function main() {
  const [email, password, role, name] = process.argv.slice(2);

  if (!email || !password || !role) {
    console.error('Usage: npx tsx scripts/create-staff-user.ts <email> <password> <role> [name]');
    console.error(`Role must be one of: ${Object.values(Role).join(', ')}`);
    process.exit(1);
  }

  if (!Object.values(Role).includes(role as Role)) {
    console.error(`Invalid role "${role}". Must be one of: ${Object.values(Role).join(', ')}`);
    process.exit(1);
  }

  // DR-229: role/organizationId/emailVerified are set atomically inside
  // this signUpEmail call's own INSERT via the trusted signal (see
  // src/lib/trusted-user-create.ts) -- no separate update needed anymore.
  // mustChangePassword: false since this is a real password the operator
  // chose directly, not a temporary one needing a forced change.
  const organizationId = await getPrimaryOrgId();
  const result = await withTrustedUserCreate(
    { role: role as Role, organizationId, mustChangePassword: false, phone: null },
    () => auth.api.signUpEmail({ body: { name: name ?? email, email, password } }),
  );
  const user = await prisma.user.findUniqueOrThrow({ where: { id: result.user.id } });

  console.log(`Created ${user.role} account: ${user.email}`);
  console.log('Sign in at /staff/login with the email/password you provided.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
