import { test, expect } from '@playwright/test';

/**
 * The plan-my-trip 9-step wizard (destination -> dates -> travelers ->
 * preferences -> sites -> your trip -> add-ons -> special requests ->
 * contact) had no e2e coverage at all (found by an architecture audit),
 * despite being one of the two ways a real booking enters this system
 * (the other, guest-checkout.spec.ts, only covers PREDEFINED_PACKAGE).
 * This is the TAILOR_MADE origin's own journey: a real anonymous sign-in
 * (same DR-016 precedent as guest-checkout.spec.ts) into a fresh
 * AWAITING_QUOTATION booking, no staff quotation involved yet.
 */
test.describe('plan my trip (TAILOR_MADE)', () => {
  test('destination -> dates -> travelers -> ... -> contact -> trip request received', async ({ page }) => {
    test.setTimeout(60000);
    await page.goto('/plan-my-trip');

    // Step 0: destination -- at least one country required to advance.
    await page.getByLabel(/Namibia/).check();
    await page.getByRole('button', { name: 'Next' }).click();

    // Step 1: dates -- far enough out to never trip the late-booking notice.
    await page.getByLabel('Travel start').fill('2027-06-01');
    await page.getByLabel('Travel end').fill('2027-06-10');
    await page.getByRole('button', { name: 'Next' }).click();

    // Step 2: travelers -- a +/- stepper (DR-273, no fillable number input,
    // mobile-unfriendly to edit) raises seats above 1, which then requires a
    // name for every other traveler (DR-271); the tour lead's own name is
    // collected later, at step 8.
    await page.getByRole('button', { name: 'Increase number of travelers' }).click();
    await expect(page.getByRole('button', { name: 'Next' })).toBeDisabled();
    await page.getByLabel("Traveler 2's name").fill('Second Traveler');
    await page.getByRole('button', { name: 'Next' }).click();

    // Step 3: preferences -- optional, skip.
    await page.getByRole('button', { name: 'Next' }).click();

    // Step 4: sites -- optional, skip (may have nothing to offer at all).
    await page.getByRole('button', { name: 'Next' }).click();

    // Step 5: your trip (free text) -- optional, skip.
    await page.getByRole('button', { name: 'Next' }).click();

    // Step 6: add-ons -- optional, but residence/citizenship ARE required
    // to advance (canAdvance[6]).
    await page.getByLabel('Country of residence').selectOption('NA');
    await page.getByLabel('Citizenship').selectOption('NA');
    await page.getByRole('button', { name: 'Next' }).click();

    // Step 7: special requests -- optional, skip.
    await page.getByRole('button', { name: 'Next' }).click();

    // Step 8: contact -- the real anonymous sign-in + submit happens here.
    await page.getByLabel('First name').fill('Plan');
    await page.getByLabel('Last name').fill('MyTrip');
    await page.getByLabel('Email').fill(`e2e-plan-my-trip-${Date.now()}@example.test`);
    await page.locator('input[type="tel"]').fill('811234567');

    const submitError = page.getByText('Something went wrong submitting your request');
    try {
      await Promise.all([
        page.waitForURL(/\/booking\/[0-9a-f-]+$/),
        page.getByRole('button', { name: 'Request my quotation' }).click(),
      ]);
    } catch (err) {
      if (await submitError.isVisible({ timeout: 2000 }).catch(() => false)) {
        throw new Error('plan-my-trip submission failed with a visible error');
      }
      throw err;
    }

    // DR-047: a fresh AWAITING_QUOTATION TAILOR_MADE booking shows a
    // reference-only confirmation, no price yet (staff hasn't quoted it).
    await expect(page.getByText("We've received your trip request")).toBeVisible();
    const bookingReference = await page.locator('p.font-mono.text-3xl.font-bold').innerText();
    expect(bookingReference).toMatch(/^[A-Z0-9]{6}$/);
  });
});
