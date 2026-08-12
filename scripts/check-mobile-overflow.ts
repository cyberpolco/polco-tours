import { chromium } from '@playwright/test';
import { createVerifiedStaffUser } from '../e2e/helpers/staff-user';
import { prisma } from '../src/lib/db';

// Manual mobile-overflow smoke check -- run by hand against a running app
// (local `next start`, or a Vercel Preview with deployment protection
// disabled/bypassed) at a phone-width viewport. Not part of the e2e suite:
// this asserts nothing, it just reports scrollWidth vs clientWidth per page
// and screenshots each one for a human to eyeball. Point it elsewhere via
// MOBILE_CHECK_BASE_URL, e.g.:
//   MOBILE_CHECK_BASE_URL=https://your-preview.vercel.app npx tsx scripts/check-mobile-overflow.ts
const BASE = process.env.MOBILE_CHECK_BASE_URL ?? 'http://localhost:3000';

async function main() {
  const { email, password } = await createVerifiedStaffUser();
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  await prisma.user.update({ where: { id: user.id }, data: { role: 'SUPERADMIN' } });

  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 375, height: 667 } });
  const page = await context.newPage();

  await page.goto(`${BASE}/staff/login`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.fill('#email', email);
  await page.fill('#password', password);
  await Promise.all([page.waitForURL(/\/staff\/bookings/, { timeout: 30000 }), page.click('button[type="submit"]')]);

  const urls = [
    `${BASE}/`,
    `${BASE}/packages`,
    `${BASE}/plan-my-trip`,
    `${BASE}/staff/bookings`,
    `${BASE}/staff/settings/coupons`,
    `${BASE}/staff/fleet/vehicles`,
    `${BASE}/staff/admin/permissions`,
  ];

  for (const url of urls) {
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      const overflow = scrollWidth - clientWidth;
      console.log(
        `${overflow > 5 ? 'OVERFLOW' : 'OK      '} ${url}  scrollWidth=${scrollWidth} clientWidth=${clientWidth} overflow=${overflow}`,
      );
      const name = url.replace(/[^a-z0-9]+/gi, '_');
      await page.screenshot({ path: `/tmp/mobile_${name}.png`, fullPage: false });
    } catch (err) {
      console.log(`ERROR ${url}: ${(err as Error).message}`);
    }
  }

  await browser.close();
  await prisma.user.delete({ where: { id: user.id } });
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
