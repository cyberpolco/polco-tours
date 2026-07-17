// One-off CLI to set/replace the password on an EXISTING user -- scripts/
// create-staff-user.ts only handles brand-new signups (auth.api.signUpEmail
// rejects an email that's already taken), which doesn't help prisma/seed.ts's
// Lam row: seeded with emailVerified: true but deliberately no password (no
// Account/credential row), since seed.ts also runs against real environments
// via db:setup. Hashes the password the same way better-auth's own sign-up
// flow does (better-auth/crypto's hashPassword, scrypt) and links a
// providerId: "credential" Account the same way
// internalAdapter.linkAccount(...) does in
// node_modules/better-auth/dist/api/routes/sign-up.mjs -- so the resulting
// login is indistinguishable from one created through signUpEmail.
//
// Usage: npx tsx scripts/set-staff-password.ts <email> <password>
//
// Always forces mustChangePassword -- same precedent as authService
// .resetPassword (DR-035): a password set this way (operator-generated,
// shell/DB access, no in-app audit trail) is never left as the account's
// long-term one. The account holder changes it themselves via the
// self-service /staff/change-password flow on next sign-in.
import { hashPassword } from 'better-auth/crypto';
import { prisma } from '@lib/db';

async function main() {
  const [email, password] = process.argv.slice(2);

  if (!email || !password) {
    console.error('Usage: npx tsx scripts/set-staff-password.ts <email> <password>');
    process.exit(1);
  }

  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const hash = await hashPassword(password);
  const existing = await prisma.account.findFirst({ where: { userId: user.id, providerId: 'credential' } });

  if (existing) {
    await prisma.account.update({ where: { id: existing.id }, data: { password: hash } });
  } else {
    await prisma.account.create({
      data: { userId: user.id, providerId: 'credential', accountId: user.id, password: hash },
    });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { emailVerified: true, mustChangePassword: true },
  });

  console.log(`Password set for ${user.role} account: ${user.email}`);
  console.log('This is a temporary password -- signing in will require choosing a new one.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
