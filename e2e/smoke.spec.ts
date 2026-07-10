import { test, expect } from '@playwright/test';

// Smoke: the app boots and the health endpoint is green. Home page content
// is the DR-016 tourist self-serve landing page (replaced the Phase-0
// placeholder this same increment).
test('landing page renders', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /worth crossing a border for/i })).toBeVisible();
});

test('health endpoint is ok', async ({ request }) => {
  const res = await request.get('/api/v1/health');
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  expect(body.status).toBe('ok');
});
