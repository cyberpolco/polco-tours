import { test, expect } from '@playwright/test';
import { prisma } from '../src/lib/db';
import { sessionCookiesFor } from './helpers/session-cookie';
import { seedStaffForFleet } from './helpers/fleet-fixture';

test.describe('staff fleet dashboard (DR-017)', () => {
  test('unauthenticated visit to the fleet page redirects to login', async ({ page }) => {
    await page.goto('/staff/fleet');
    await expect(page).toHaveURL(/\/staff\/login/);
  });

  test('authenticated fleet page renders vehicle and driver sections', async ({ page }) => {
    const { staffUserId } = await seedStaffForFleet();
    await page.context().addCookies(await sessionCookiesFor(staffUserId));

    await page.goto('/staff/fleet');
    await expect(page.getByRole('heading', { name: 'Vehicles' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Drivers' })).toBeVisible();
  });

  test('staff registers a vehicle through the form', async ({ page }) => {
    const { staffUserId } = await seedStaffForFleet();
    await page.context().addCookies(await sessionCookiesFor(staffUserId));

    await page.goto('/staff/fleet/vehicles/new');
    await page.getByLabel('Plate number').fill('E2E-PLATE-1');
    await page.getByLabel('Make').fill('Toyota');
    await page.getByLabel('Model').fill('Land Cruiser');
    await page.getByLabel('Type').fill('4x4');
    await page.getByLabel('Seat capacity').fill('7');
    await page.getByRole('button', { name: 'Register vehicle' }).click();

    await expect(page.getByRole('heading', { name: /Toyota Land Cruiser · E2E-PLATE-1/ })).toBeVisible();
    // Compliance docs start MISSING until a document is uploaded (no live
    // BLOB_READ_WRITE_TOKEN in this e2e environment, same category of gap as
    // the passport-upload step in e2e/staff-dashboard.spec.ts -- upload+
    // download coverage with the Blob gateway mocked lives in
    // tests/api/fleet.api.test.ts instead).
    await expect(page.getByText('MISSING').first()).toBeVisible();

    await page.goto('/staff/fleet');
    await expect(page.getByText('E2E-PLATE-1')).toBeVisible();
  });

  test('staff adds a driver profile for an existing DRIVER-role account', async ({ page }) => {
    const { staffUserId, driverUserId } = await seedStaffForFleet();
    await page.context().addCookies(await sessionCookiesFor(staffUserId));
    const driverUser = await prisma.user.findUniqueOrThrow({ where: { id: driverUserId } });

    await page.goto('/staff/fleet/drivers/new');
    await page.getByLabel("Driver's account email").fill(driverUser.email);
    await page.getByLabel('License number').fill('DL-E2E-1');
    await page.getByRole('button', { name: 'Add driver' }).click();

    await expect(page.getByText('DL-E2E-1')).toBeVisible();

    await page.goto('/staff/fleet');
    await expect(page.getByText(driverUser.email)).toBeVisible();
  });

  test('adding a driver profile for an unknown email shows an error', async ({ page }) => {
    const { staffUserId } = await seedStaffForFleet();
    await page.context().addCookies(await sessionCookiesFor(staffUserId));

    await page.goto('/staff/fleet/drivers/new');
    await page.getByLabel("Driver's account email").fill('no-such-driver@example.test');
    await page.getByLabel('License number').fill('DL-MISSING');
    await page.getByRole('button', { name: 'Add driver' }).click();

    await expect(page).toHaveURL(/error=driver_not_found/);
    await expect(page.getByText('No DRIVER-role account found for that email.')).toBeVisible();
  });
});
