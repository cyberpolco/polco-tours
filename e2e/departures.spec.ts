import { test, expect } from '@playwright/test';
import { sessionCookiesFor } from './helpers/session-cookie';
import { seedStaffWithDepartureAndFleet } from './helpers/assignment-fixture';

test.describe('staff departures + assignments (DR-018)', () => {
  test('unauthenticated visit to the departures page redirects to login', async ({ page }) => {
    await page.goto('/staff/departures');
    await expect(page).toHaveURL(/\/staff\/login/);
  });

  test('staff browses from a package down to a departure', async ({ page }) => {
    const { staffUserId, departureId } = await seedStaffWithDepartureAndFleet();
    await page.context().addCookies(await sessionCookiesFor(staffUserId));

    await page.goto('/staff/departures');
    // "CHOOSE PACKAGE" is the eyebrow <p>, not an <h1> -- getByRole('heading')
    // never matches it (caught by CI, same class of locator bug as the
    // fleet driver e2e test fixed earlier this session).
    await expect(page.getByText(/CHOOSE PACKAGE/)).toBeVisible();
    await page.getByText('E2E Assignment Fixture Safari').click();

    await expect(page).toHaveURL(/packageId=/);
    await page.getByRole('link', { name: /capacity 5/ }).click();

    await expect(page).toHaveURL(new RegExp(`/staff/departures/${departureId}`));
    await expect(page.getByText('Seats covered by assigned vehicles: 0/5')).toBeVisible();
  });

  test('staff assigns a vehicle + driver + guide, then removes it', async ({ page }) => {
    const { staffUserId, departureId, guideEmail } = await seedStaffWithDepartureAndFleet();
    await page.context().addCookies(await sessionCookiesFor(staffUserId));

    await page.goto(`/staff/departures/${departureId}`);
    await expect(page.getByText('No assignments yet.')).toBeVisible();

    await page.getByLabel('Vehicle').selectOption({ index: 1 });
    await page.getByLabel('Driver').selectOption({ index: 1 });
    await page.getByLabel(/Guide email/).fill(guideEmail);
    await page.getByRole('button', { name: 'Add assignment' }).click();

    await expect(page).toHaveURL(new RegExp(`/staff/departures/${departureId}$`));
    await expect(page.getByText('No assignments yet.')).toHaveCount(0);
    await expect(page.getByText(/Seats covered by assigned vehicles: 5\/5/)).toBeVisible();
    await expect(page.getByText('Remove')).toBeVisible();

    await page.getByRole('button', { name: 'Remove' }).click();
    await expect(page.getByText('No assignments yet.')).toBeVisible();
  });

  test('an unknown guide email shows an error and does not create the assignment', async ({ page }) => {
    const { staffUserId, departureId } = await seedStaffWithDepartureAndFleet();
    await page.context().addCookies(await sessionCookiesFor(staffUserId));

    await page.goto(`/staff/departures/${departureId}`);
    await page.getByLabel('Vehicle').selectOption({ index: 1 });
    await page.getByLabel('Driver').selectOption({ index: 1 });
    await page.getByLabel(/Guide email/).fill('no-such-guide@example.test');
    await page.getByRole('button', { name: 'Add assignment' }).click();

    await expect(page).toHaveURL(/error=guide_not_found/);
    await expect(page.getByText('No TOUR_GUIDE account found for that email.')).toBeVisible();
    await expect(page.getByText('No assignments yet.')).toBeVisible();
  });
});
