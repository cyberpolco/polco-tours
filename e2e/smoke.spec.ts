import { test, expect } from '@playwright/test';

// Smoke: the app boots and the health endpoint is green. Home page content
// is the DR-016 tourist self-serve landing page (replaced the Phase-0
// placeholder this same increment). DR-068 replaced the old static hero
// headline with a rotating 3-slide HeroCarousel -- assert on its stable
// tablist landmark plus a visible h1 rather than pinning to one slide's
// copy, which will keep changing as destinations/wording are revised.
test('landing page renders', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('tablist', { name: /featured destinations/i })).toBeVisible();
});

test('health endpoint is ok', async ({ request }) => {
  const res = await request.get('/api/v1/health');
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  expect(body.status).toBe('ok');
});
