import { test, expect } from '@playwright/test';

// Phase 0 smoke: the app boots and the health endpoint is green.
test('landing page renders', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Tourism Operating System/i })).toBeVisible();
});

test('health endpoint is ok', async ({ request }) => {
  const res = await request.get('/api/v1/health');
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  expect(body.status).toBe('ok');
});
