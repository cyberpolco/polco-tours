import { test, expect } from '@playwright/test';
import { seedQuotedTailorMadeBooking } from './helpers/complete-booking-fixture';

/**
 * DR-257: the quotation email's landing flow for a guest whose 30-minute
 * anonymous session is long gone -- verify (3 factors) -> accept quote ->
 * add-ons -> travellers -> pay. Never exercised by any e2e spec before
 * this (found by an architecture audit) despite running on a materially
 * different auth model (a signed, single-booking `booking_setup` cookie,
 * not a real session) from every other guest journey this suite covers.
 */
test.describe('complete-booking (DR-257)', () => {
  test('verify -> accept quote -> add-ons -> travellers -> pay', async ({ page }) => {
    // Longest journey after guest-checkout -- several real page navigations
    // plus a real invoice/payment round trip, same headroom rationale.
    test.setTimeout(60000);
    const { bookingReference, contactLastName, contactEmail } = await seedQuotedTailorMadeBooking();

    await page.goto('/complete-booking');
    await page.getByLabel('Booking reference').fill(bookingReference);
    await page.getByLabel('Surname on the booking').fill(contactLastName);
    await page.getByLabel('Email address on the booking').fill(contactEmail);

    const verifyError = page.getByText("couldn't find a booking");
    try {
      await Promise.all([page.waitForURL(/\/complete-booking\/setup$/), page.getByRole('button', { name: 'Continue' }).click()]);
    } catch (err) {
      if (await verifyError.isVisible({ timeout: 2000 }).catch(() => false)) {
        throw new Error("Verify step rejected the fixture booking's own reference/surname/email");
      }
      throw err;
    }

    await expect(page.getByRole('heading', { name: 'Your quotation' })).toBeVisible();
    await expect(page.getByText(bookingReference)).toBeVisible();
    await page.getByRole('button', { name: 'Accept quotation' }).click();

    // Accepting redirects back to /complete-booking/setup -- now the
    // checklist, since add-ons aren't finalized yet.
    await expect(page).toHaveURL(/\/complete-booking\/setup$/);
    await expect(page.getByRole('heading', { name: 'Finish your booking' })).toBeVisible();
    await Promise.all([page.waitForURL(/\/setup\/addons$/), page.getByRole('link', { name: 'Continue' }).click()]);

    // Picking nothing is a valid answer and still finalizes the step (same
    // as the session-gated wizard's own add-ons step) -- this booking has
    // no package, so it lists every org-active add-on with no obligation
    // to select any of them.
    const addonsError = page.locator('form p.text-amber');
    try {
      await Promise.all([page.waitForURL(/\/setup\/travelers$/), page.getByRole('button', { name: 'Continue' }).click()]);
    } catch (err) {
      if (await addonsError.isVisible({ timeout: 2000 }).catch(() => false)) {
        throw new Error(`Add-ons step showed an error: ${await addonsError.innerText()}`);
      }
      throw err;
    }

    await expect(page.getByRole('heading', { name: 'Traveler 1 of 1' })).toBeVisible();
    // Prefilled from the booking's own guest-typed contact fields -- no
    // earlier "your details" step exists in this flow to have typed them
    // into, unlike the session-gated wizard.
    await expect(page.getByLabel('First name')).toHaveValue('Quote');
    await expect(page.getByLabel('Last name')).toHaveValue(contactLastName);
    await page.getByLabel('Age').fill('30');
    await page.getByLabel('ID / passport number').fill('CBE2E1');
    await page.getByLabel('Email').fill(contactEmail);
    await page.getByLabel('Country of residence').selectOption('NA');
    await expect(page.getByLabel(/Tour lead/)).toBeChecked();
    await page.getByRole('button', { name: 'Finish travelers' }).click();

    // No VISA_ASSISTANCE add-on selected -- requiresPassportUpload stays
    // false, so this booking skips straight back to the checklist, which
    // now shows the pay section (setup is complete).
    await expect(page).toHaveURL(/\/complete-booking\/setup$/);
    await expect(page.getByText("That's everything we need for now")).toBeVisible();
    await expect(page.getByRole('button', { name: /Pay deposit/ })).toBeVisible();
  });
});
