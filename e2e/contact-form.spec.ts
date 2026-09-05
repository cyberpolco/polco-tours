import { test, expect } from '@playwright/test';

// DR-255: the guest contact form on /contact. Note: assertWriteNotRateLimited
// no-ops when Upstash isn't configured for this environment, so a single run
// here is safe; if this CI environment ever configures real Upstash
// credentials, repeated runs from the same test IP could eventually trip
// the 5-attempts/60min bucket -- worth knowing before assuming an
// intermittent failure here is unrelated to rate-limiting.
test('guest can submit the contact form', async ({ page }) => {
  await page.goto('/contact');

  await page.getByLabel(/^name$/i).fill('Jane Doe');
  await page.getByLabel(/^email$/i).fill(`contact-e2e-${Date.now()}@example.test`);
  await page.getByLabel(/what's this about/i).selectOption('GENERAL_INQUIRY');
  await page.getByLabel(/^message$/i).fill('This is a test message from the e2e suite, long enough to pass validation.');

  await page.getByRole('button', { name: /send message/i }).click();

  await expect(page.getByText(/message sent/i)).toBeVisible();
});
