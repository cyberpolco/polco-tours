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

  // DR-015: booking-setup wizard. Stops at the passport step's upload form
  // rather than actually submitting a file -- the real Vercel Blob upload
  // (documentsService.uploadPassport) needs a live BLOB_READ_WRITE_TOKEN this
  // e2e environment does not provision, same category of gap as OI-05/06/07
  // for notification providers. Full upload+download coverage (with the Blob
  // gateway boundary mocked) lives in tests/api/booking-setup.api.test.ts.
  test('booking detail routes into the setup wizard and walks the traveler loop', async ({ page }) => {
    const { staffUserId, bookingId } = await seedStaffAndBooking({ seats: 2 });
    await page.context().addCookies(await sessionCookiesFor(staffUserId));

    await page.goto(`/staff/bookings/${bookingId}`);
    await expect(page.getByText('BOOKING SETUP')).toBeVisible();
    await expect(page.getByText('Travelers (0/2)')).toBeVisible();

    await page.getByRole('link', { name: 'Continue setup' }).click();
    await expect(page).toHaveURL(new RegExp(`/staff/bookings/${bookingId}/travelers/new`));
    await expect(page.getByRole('heading', { name: 'Traveler 1 of 2' })).toBeVisible();

    await page.getByLabel('First name').fill('Lead');
    await page.getByLabel('Last name').fill('Traveler');
    await page.getByLabel('Age').fill('35');
    await page.getByLabel('ID / passport number').fill('LEADE2E1');
    await expect(page.getByLabel(/Tour lead/)).toBeChecked();
    await page.getByRole('button', { name: 'Add traveler & continue' }).click();

    await expect(page.getByRole('heading', { name: 'Traveler 2 of 2' })).toBeVisible();
    await page.getByLabel('First name').fill('Companion');
    await page.getByLabel('Last name').fill('Traveler');
    await page.getByLabel('Age').fill('28');
    await page.getByLabel('ID / passport number').fill('COMPE2E1');
    await expect(page.getByLabel(/Tour lead/)).toBeDisabled();
    await page.getByRole('button', { name: 'Finish travelers' }).click();

    await expect(page).toHaveURL(new RegExp(`/staff/bookings/${bookingId}/passport`));
    await expect(page.getByText("Lead Traveler's passport")).toBeVisible();
    await expect(page.getByRole('button', { name: 'Upload & continue' })).toBeVisible();
  });
});
