import { test, expect } from '@playwright/test';
import { seedPublicDeparture } from './helpers/catalog-fixture';

// DR-016: the first real end-to-end guest journey in this repo -- a real
// authClient.signIn.anonymous() session (not a testUtils()/loginAs()
// shortcut), a real Vercel Blob passport upload (BLOB_READ_WRITE_TOKEN is
// wired into this job's env, see .github/workflows/ci.yml), and the
// bookingReference + last-name lookup (DR-052) after clearing cookies to
// simulate coming back later on a different visit.
test.describe('guest checkout (DR-016)', () => {
  test('browse -> book -> setup wizard -> pay -> find my booking later', async ({ page }) => {
    const { departureId, visaAddonServiceId } = await seedPublicDeparture({ capacity: 1 });

    await page.goto('/packages');
    await expect(page.getByRole('heading', { name: 'Tour packages' })).toBeVisible();

    await page.goto(`/book/${departureId}`);
    await page.getByLabel('Seats').fill('1');
    await page.getByLabel('First name').fill('Guest');
    await page.getByLabel('Last name').fill('Traveler');
    await page.locator('select[name="dialCode"]').selectOption('264');
    await page.locator('input[name="localNumber"]').fill('811234567');
    await page.getByRole('button', { name: 'Start my booking' }).click();

    // Diagnostic: surface whatever visible error the form produced (if any)
    // in the test failure message itself, instead of a bare URL-mismatch
    // timeout that gives no clue why the flow didn't advance.
    const bookingFormError = page.locator('form p.text-amber');
    if (await bookingFormError.isVisible({ timeout: 8000 }).catch(() => false)) {
      throw new Error(`Guest booking form showed an error: ${await bookingFormError.innerText()}`);
    }

    await expect(page).toHaveURL(/\/booking\/[0-9a-f-]+$/);
    await expect(page.getByText('BOOKING SETUP')).toBeVisible();
    await page.getByRole('link', { name: 'Continue setup' }).click();

    // Add-ons is now the first setup step -- selecting Visa Assistance here
    // is what makes the Passport step (below) appear at all. Targeted by
    // the fixture's returned id, not a label match -- every call to
    // seedPublicDeparture shares the same primary org, so a broad
    // "Visa Assistance" text match would ambiguously hit other runs'/
    // retries' same-named fixture rows too (see the staff-dashboard.spec.ts
    // CI failure this exact ambiguity caused).
    await expect(page).toHaveURL(/\/addons$/);
    await page.locator(`input[name="addonServiceId"][value="${visaAddonServiceId}"]`).check();
    await page.getByRole('button', { name: 'Finish setup' }).click();

    await expect(page).toHaveURL(/\/travelers\/new$/);
    await expect(page.getByRole('heading', { name: 'Traveler 1 of 1' })).toBeVisible();
    // Prefilled from "Your details" (book/[departureId]) -- same name/phone
    // typed there, so the tour lead doesn't retype it.
    await expect(page.getByLabel('First name')).toHaveValue('Guest');
    await expect(page.getByLabel('Last name')).toHaveValue('Traveler');
    await expect(page.locator('input[name="localNumber"]')).toHaveValue('811234567');
    await page.getByLabel('Age').fill('34');
    await page.getByLabel('ID / passport number').fill('GUESTE2E1');
    // The only (first) traveler is always the tour lead -- gets the extra
    // contact fields the wizard only ever asks the lead for.
    await page.getByLabel('Email').fill('guest-traveler@example.test');
    await page.getByLabel('Country of residence').selectOption('NA');
    await expect(page.getByLabel(/Tour lead/)).toBeChecked();
    await page.getByRole('button', { name: 'Finish travelers' }).click();

    await expect(page).toHaveURL(/\/passport$/);
    await page.locator('input[type="file"]').setInputFiles({
      name: 'passport.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4 e2e fixture passport'),
    });
    await page.getByRole('button', { name: 'Upload & continue' }).click();

    await expect(page).toHaveURL(/\/booking\/[0-9a-f-]+$/);
    await expect(page.getByText('YOUR BOOKING')).toBeVisible();
    await page.getByRole('button', { name: 'Pay deposit' }).click();

    await expect(page.getByText('Your booking reference')).toBeVisible();
    // DR-052: a single bookingReference is the only code shown now (the
    // separate confirmationCode secret this used to pair with was removed
    // -- /find-booking is single-factor by bookingReference + last name).
    // 6-char pattern (2-3 non-adjacent unique letters + unique digits)
    // since DR-045.
    const bookingReference = await page.locator('p.font-mono.text-3xl.font-bold').innerText();
    expect(bookingReference).toMatch(/^[A-Z0-9]{6}$/);

    // Simulate coming back later, on what the app must treat as a fresh visit.
    await page.context().clearCookies();

    await page.goto('/find-booking');
    await page.getByLabel('Booking reference').fill(bookingReference);
    await page.getByLabel("Tour lead's last name").fill('Traveler');
    await page.getByRole('button', { name: 'Find my booking' }).click();

    await expect(page).toHaveURL(/\/find-booking\/result/);
    await expect(page.getByRole('heading', { name: bookingReference })).toBeVisible();
    await expect(page.getByText('Guest Traveler')).toBeVisible();
  });
});
