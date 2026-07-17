import { test, expect } from '@playwright/test';
import { sessionCookiesFor } from './helpers/session-cookie';
import { seedStaffWithDepartureAndFleet } from './helpers/assignment-fixture';

test.describe('staff departures + assignments (DR-018)', () => {
  // The bare /staff/departures list-browse page was removed in DR-033 (an
  // explicit design decision, not an oversight -- browsing into a departure
  // now happens via links from the itinerary page and the booking-detail
  // page instead). /staff/departures/[departureId] itself (the working
  // assignment page) is unchanged, so the redirect check below targets that
  // real route with a placeholder id -- the auth gate runs before any DB
  // lookup, so the id doesn't need to resolve to a real departure.
  test('unauthenticated visit to a departure detail page redirects to login', async ({ page }) => {
    await page.goto('/staff/departures/00000000-0000-0000-0000-000000000000');
    await expect(page).toHaveURL(/\/staff\/login/);
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
