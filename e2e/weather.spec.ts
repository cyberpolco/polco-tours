import { test, expect } from '@playwright/test';

// DR-113: guest-facing Weather feature. Fully public, no fixtures needed.
// GOOGLE_MAPS_SERVER_API_KEY is not a CI secret (same category gap as
// OI-05/06/07 for notification providers), so in this environment the
// gateway takes the "key missing -> throw before any network call" path
// deterministically -- this really does exercise charter rule 8's graceful
// degradation end-to-end (town + seasonal notes still render, live
// current/forecast sections quietly say "unavailable" instead of crashing),
// not just a happy-path render.
test.describe('weather (DR-113)', () => {
  test('the footer Weather link navigates to /weather and shows a town card', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Weather' }).click();
    await expect(page).toHaveURL(/\/weather$/);
    await expect(page.getByRole('heading', { name: 'Weather where we operate' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Windhoek' })).toBeVisible();
  });

  test('a town detail page renders (degrading gracefully) rather than crashing', async ({ page }) => {
    await page.goto('/weather/windhoek');
    await expect(page.getByRole('heading', { name: 'Windhoek' })).toBeVisible();
    await expect(page.getByText('Seasonal notes')).toBeVisible();
    // No live Weather API key in this environment -- proves the degraded
    // path renders cleanly instead of an "Application error" crash page.
    await expect(page.getByText('Live weather temporarily unavailable')).toBeVisible();
  });

  test('an unrecognized town slug 404s instead of crashing', async ({ page }) => {
    const res = await page.goto('/weather/not-a-real-town');
    expect(res?.status()).toBe(404);
  });
});
