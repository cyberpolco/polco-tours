import { test, expect } from '@playwright/test';
import { createVerifiedStaffUser } from './helpers/staff-user';
import { sessionCookiesFor } from './helpers/session-cookie';
import { seedStaffAndBooking } from './helpers/booking-fixture';

test.describe('staff dashboard (DR-014)', () => {
  test('unauthenticated visit to the dashboard redirects to login', async ({ page }) => {
    await page.goto('/staff/bookings');
    await expect(page).toHaveURL(/\/staff\/login/);
  });

  test('/staff/login renders a real sign-in form', async ({ page }) => {
    await page.goto('/staff/login');
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
  });

  // Exercises the real mounted /api/auth/[...all] route and password
  // comparison end-to-end -- not a session-cookie shortcut. Known gap,
  // explicitly accepted: the email-verification-LINK flow itself (nobody
  // clicks a real verification email) is not covered here.
  test('real credential login succeeds and lands on the bookings list', async ({ page }) => {
    const { email, password } = await createVerifiedStaffUser();

    await page.goto('/staff/login');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page).toHaveURL(/\/staff\/bookings/);
    await expect(page.getByRole('heading', { name: 'Bookings' })).toBeVisible();
  });

  test('authenticated dashboard renders a real seeded booking', async ({ page }) => {
    const { staffUserId, bookingId } = await seedStaffAndBooking();
    // cookies are already Playwright-addCookies-shaped, domain derived from
    // BETTER_AUTH_URL (http://localhost:3000, matching this config's baseURL).
    await page.context().addCookies(await sessionCookiesFor(staffUserId));

    await page.goto('/staff/bookings');
    await expect(page.getByRole('heading', { name: 'Bookings' })).toBeVisible();

    await page.goto(`/staff/bookings/${bookingId}`);
    await expect(page.getByText('HELD')).toBeVisible();
  });
});
