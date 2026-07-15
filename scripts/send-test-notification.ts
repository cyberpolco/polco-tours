// One-off CLI to prove the notifications module actually sends over a real
// channel now that Resend/Africa's Talking credentials exist (2026-07-15,
// resolves OI-05/07; WhatsApp/OI-06 stays deliberately unconfigured).
// notificationsService.notify() never throws and returns nothing (fire-and-
// forget, charter rule 8), so the only way to observe the outcome is the
// notification.sent/notification.failed audit row it writes -- this script
// creates a throwaway recipient user, triggers one notify() call, reads that
// audit row back, and deletes the throwaway user.
//
// Usage: npx tsx scripts/send-test-notification.ts <phone-E.164|none> <email>
// Pass "none" for phone to force the EMAIL-only path (no phone on file means
// resolveChannelOrder skips WHATSAPP/SMS entirely) -- useful for exercising
// Resend specifically once SMS has already succeeded on an earlier run.
import { notificationsService } from '@modules/notifications';
import { prisma, withOrg } from '@lib/db';
import { getPrimaryOrgId } from '@lib/primary-org';

async function main() {
  const [phoneArg, email] = process.argv.slice(2);
  if (!phoneArg || !email) {
    console.error('Usage: npx tsx scripts/send-test-notification.ts <phone-E.164|none> <email>');
    process.exit(1);
  }
  const phone = phoneArg === 'none' ? null : phoneArg;

  const organizationId = await getPrimaryOrgId();
  const user = await prisma.user.create({
    data: { email, phone, role: 'TOURIST', organizationId, emailVerified: false },
  });

  try {
    console.log(`Sending BOOKING_CONFIRMED to ${email} / ${phone ?? '(no phone)'} ...`);
    await notificationsService.notify('BOOKING_CONFIRMED', user.id, organizationId, { bookingId: 'TEST-NOTIFY' });

    const result = await withOrg(organizationId, (tx) =>
      tx.auditLog.findFirst({
        where: { organizationId, action: { in: ['notification.sent', 'notification.failed'] } },
        orderBy: { createdAt: 'desc' },
      }),
    );

    if (!result) {
      console.error('No audit row found -- notify() may not have run.');
      process.exitCode = 1;
      return;
    }
    console.log(`Outcome: ${result.action}`);
    console.log('Metadata:', JSON.stringify(result.metadata));
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
