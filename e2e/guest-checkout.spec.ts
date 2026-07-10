import { test, expect } from '@playwright/test';
import { seedPublicDeparture } from './helpers/catalog-fixture';

// DR-016: the first real end-to-end guest journey in this repo -- a real
// authClient.signIn.anonymous() session (not a testUtils()/loginAs()
// shortcut), a real Vercel Blob passport upload (BLOB_READ_WRITE_TOKEN is
// wired into this job's env, see .github/workflows/ci.yml), and the
// confirmation-code lookup after clearing cookies to simulate coming back
// later on a different visit.
test.describe('guest checkout (DR-016)', () => {
  test('browse -> book -> setup wizard -> pay -> find my booking later', async ({ page }) => {
    const { departureId } = await seedPublicDeparture({ capacity: 1 });

    await page.goto('/packages');
    await expect(page.getByRole('heading', { name: 'Tour packages' })).toBeVisible();

    await page.goto(`/book/${departureId}`);
    await page.getByLabel('Seats').fill('1');
    await page.getByLabel('Your name').fill('Guest Traveler');
    await page.locator('select[name="dialCode"]').selectOption('264');
    await page.locator('input[name="localNumber"]').fill('811234567');
    await page.getByRole('button', { name: 'Start my booking' }).click();

    await expect(page).toHaveURL(/\/booking\/[0-9a-f-]+$/);
    await expect(page.getByText('BOOKING SETUP')).toBeVisible();
    await page.getByRole('link', { name: 'Continue setup' }).click();

    await expect(page).toHaveURL(/\/travelers\/new$/);
    await expect(page.getByRole('heading', { name: 'Traveler 1 of 1' })).toBeVisible();
    await page.getByLabel('First name').fill('Guest');
    await page.getByLabel('Last name').fill('Traveler');
    await page.getByLabel('Age').fill('34');
    await page.getByLabel('ID / passport number').fill('GUESTE2E1');
    await expect(page.getByLabel(/Tour lead/)).toBeChecked();
    await page.getByRole('button', { name: 'Finish travelers' }).click();

    await expect(page).toHaveURL(/\/passport$/);
    await page.locator('input[type="file"]').setInputFiles({
      name: 'passport.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4 e2e fixture passport'),
    });
    await page.getByRole('button', { name: 'Upload & continue' }).click();

    await expect(page).toHaveURL(/\/addons$/);
    await page.getByRole('button', { name: 'Finish setup' }).click();

    await expect(page).toHaveURL(/\/booking\/[0-9a-f-]+$/);
    await expect(page.getByText('YOUR BOOKING')).toBeVisible();
    await page.getByRole('button', { name: 'Pay deposit' }).click();

    await expect(page.getByText('Your reference code:')).toBeVisible();
    const code = await page.locator('span.font-mono').innerText();
    expect(code).toMatch(/^[A-Z0-9]{8}$/);

    // Simulate coming back later, on what the app must treat as a fresh visit.
    await page.context().clearCookies();

    await page.goto('/find-booking');
    await page.getByLabel('Reference code').fill(code);
    await page.getByLabel("Tour lead's last name").fill('Traveler');
    await page.getByRole('button', { name: 'Find my booking' }).click();

    await expect(page).toHaveURL(/\/find-booking\/result/);
    await expect(page.getByRole('heading', { name: code })).toBeVisible();
    await expect(page.getByText('Guest Traveler')).toBeVisible();
  });
});
