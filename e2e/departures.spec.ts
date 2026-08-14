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
    await page.getByLabel(/Guide/).fill(guideEmail);
    await page.getByRole('option', { name: new RegExp(guideEmail) }).click();
    await page.getByRole('button', { name: 'Add assignment' }).click();

    await expect(page).toHaveURL(new RegExp(`/staff/departures/${departureId}$`));
    await expect(page.getByText('No assignments yet.')).toHaveCount(0);
    await expect(page.getByText(/Seats covered by assigned vehicles: 5\/5/)).toBeVisible();
    await expect(page.getByText('Remove')).toBeVisible();

    // DR-086/109: every destructive action shows a confirm dialog before
    // submitting -- an in-app modal (DR-109), not a native window.confirm(),
    // so it's just another button click, not a page.once('dialog', ...) handler.
    await page.getByRole('button', { name: 'Remove' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Confirm' }).click();
    await expect(page.getByText('No assignments yet.')).toBeVisible();
  });

  // DR-078/079: the guide field is a searchable picker over the
  // recommendation's own eligible-guide list, not a free-text email --
  // there's no "unknown guide" error path anymore (unmatched search text
  // just leaves nothing selected). Guide is now mandatory (DR-079): the
  // hidden input can't use the native `required` attribute (it's excluded
  // from constraint validation by spec), so SearchableSelect enforces it
  // via setCustomValidity -- submitting with nothing selected must block,
  // not silently create a guide-less assignment.
  test('guide picker searches by name/email and is required to submit', async ({ page }) => {
    const { staffUserId, departureId, guideEmail } = await seedStaffWithDepartureAndFleet();
    await page.context().addCookies(await sessionCookiesFor(staffUserId));

    await page.goto(`/staff/departures/${departureId}`);
    await page.getByLabel('Vehicle').selectOption({ index: 1 });
    await page.getByLabel('Driver').selectOption({ index: 1 });

    const guideInput = page.getByLabel(/Guide/);
    await guideInput.fill(guideEmail.slice(0, 10));
    await expect(page.getByRole('option', { name: new RegExp(guideEmail) })).toBeVisible();
    await guideInput.fill('no-such-guide-anywhere');
    await expect(page.getByText('No matches')).toBeVisible();

    // Leaving it unselected blocks native form submission -- no navigation.
    await page.getByRole('button', { name: 'Add assignment' }).click();
    await expect(page.getByText('No assignments yet.')).toBeVisible();

    // Picking a real guide from the search results lets the assignment through.
    await guideInput.fill(guideEmail);
    await page.getByRole('option', { name: new RegExp(guideEmail) }).click();
    await page.getByRole('button', { name: 'Add assignment' }).click();

    await expect(page).toHaveURL(new RegExp(`/staff/departures/${departureId}$`));
    await expect(page.getByText('No assignments yet.')).toHaveCount(0);
  });
});
