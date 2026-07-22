// One-off/idempotent CLI to register the real QStash schedule that drives
// the booking-lifecycle sweep job (DR-067, src/app/api/jobs/sweep-bookings)
// -- creating a *schedule* (as opposed to the app's own signature-
// verification code) is an external Upstash account action, not something
// expressible in application code, same category as verifying a Resend
// sending domain (OI-05) or topping up the Africa's Talking balance
// (OI-07). Passing a fixed `scheduleId` makes this safe to re-run: QStash
// updates the existing schedule in place instead of creating a duplicate.
//
// Usage: npx tsx scripts/register-qstash-schedule.ts
// Requires QSTASH_TOKEN + APP_URL in .env (see .env.example) -- the latter
// is the deployed URL QStash should call (e.g. https://polco-tours.vercel.app),
// NOT the same as BETTER_AUTH_URL/NEXT_PUBLIC_APP_URL's local-dev default.
import { Client } from '@upstash/qstash';
// Side-effect only: importing @prisma/client is what loads .env into
// process.env in every script in this repo (no dotenv dependency, see
// scripts/apply-rls.mjs) -- this script doesn't touch the database itself.
import '@prisma/client';

const SCHEDULE_ID = 'polco-sweep-bookings';
const CRON = '*/15 * * * *'; // every 15 minutes -- well under HOLD_DURATION_MINUTES (30)

async function main() {
  const token = process.env.QSTASH_TOKEN;
  const appUrl = process.env.APP_URL;

  if (!token || !appUrl) {
    console.error('Usage: set QSTASH_TOKEN and APP_URL in .env, then run this script.');
    console.error('QSTASH_TOKEN: https://console.upstash.com/qstash');
    console.error('APP_URL: the deployed URL QStash should call, e.g. https://polco-tours.vercel.app');
    process.exit(1);
  }

  const client = new Client({ token });
  const { scheduleId } = await client.schedules.create({
    scheduleId: SCHEDULE_ID,
    destination: `${appUrl}/api/jobs/sweep-bookings`,
    cron: CRON,
  });

  console.log(`Registered QStash schedule "${scheduleId}" (${CRON}) -> ${appUrl}/api/jobs/sweep-bookings`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
