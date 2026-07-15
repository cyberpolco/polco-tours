// One-off, explicitly-confirmed destructive CLI (DR-026): deletes every
// `User` row -- which cascades (prisma/schema.prisma's onDelete: Cascade)
// to every Membership/Session/Account/Booking (and everything hanging off a
// booking: Traveler/Invoice/Payment/BookingAddon/VisaApplication) and
// DriverProfile tied to any user. Assignment.guideUserId/Vehicle.ownerId
// are nullable with no onDelete, so those rows survive but get SET NULL.
// Document.uploadedByUserId/AuditLog.actorUserId aren't real FKs at all --
// they're left holding stale UUIDs, which is fine (AuditLog is explicitly
// append-only and meant to outlive its actors).
//
// Then bootstraps a single SUPERADMIN so the platform isn't locked out.
// Unlike scripts/create-staff-user.ts's generated-password flow (DR-026),
// this account's password is the real one the operator chose for
// themselves, so it does NOT get mustChangePassword: true.
//
// Usage: BOOTSTRAP_PASSWORD=<password> npx tsx scripts/reset-all-users.ts
import { auth } from '@lib/auth';
import { prisma, withOrg } from '@lib/db';
import { getPrimaryOrgId } from '@lib/primary-org';

const BOOTSTRAP_EMAIL = 'cyberpolco@gmail.com';
const BOOTSTRAP_PASSWORD = process.env.BOOTSTRAP_PASSWORD;
const BOOTSTRAP_NAME = 'Cyber Polco';

async function main() {
  if (!BOOTSTRAP_PASSWORD) {
    throw new Error('Set BOOTSTRAP_PASSWORD in the environment before running this script.');
  }

  const { count } = await prisma.user.deleteMany({});
  console.log(`Deleted ${count} user(s) and everything cascading from them.`);

  const organizationId = await getPrimaryOrgId();

  const result = await auth.api.signUpEmail({
    body: { name: BOOTSTRAP_NAME, email: BOOTSTRAP_EMAIL, password: BOOTSTRAP_PASSWORD },
  });
  await prisma.user.update({
    where: { id: result.user.id },
    data: { role: 'SUPERADMIN', organizationId, emailVerified: true },
  });
  // organization_members is RLS-protected (DR-026) -- a plain unscoped
  // prisma call would be rejected by its WITH CHECK, same gotcha
  // authRepository.createMemberships already routes around via withOrg.
  await withOrg(organizationId, (tx) =>
    tx.membership.create({ data: { userId: result.user.id, organizationId, role: 'SUPERADMIN' } }),
  );

  console.log(`Created SUPERADMIN account: ${BOOTSTRAP_EMAIL}`);
  console.log('Sign in at /staff/login with the email/password above.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
