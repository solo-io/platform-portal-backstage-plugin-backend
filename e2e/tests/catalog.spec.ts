import { test, expect } from '@playwright/test';

const API_DOCS_URL =
  '/api-docs?filters%5Bkind%5D=api&filters%5Buser%5D=all';

test('catalog shows all APIs from the mock portal', async ({ page }) => {
  // Navigate to the app — may redirect to login
  await page.goto('/');

  // If guest login is shown, click ENTER
  const enterButton = page.getByRole('button', { name: /enter/i });
  if (await enterButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await enterButton.click();
  }

  // Wait for the app to load after login
  await page.waitForURL('**/catalog**', { timeout: 30_000 }).catch(() => {});

  // Navigate to the API docs page and wait for catalog sync.
  // The catalog provider syncs every 10s, so we may need to reload a few times.
  await page.goto(API_DOCS_URL);

  const apisLocator = page.getByText(/All apis \(3\)/i);
  const deadline = Date.now() + 120_000;

  while (Date.now() < deadline) {
    if (await apisLocator.isVisible().catch(() => false)) break;
    await page.waitForTimeout(5_000);
    await page.reload();
  }

  await expect(apisLocator).toBeVisible({ timeout: 10_000 });

  // Verify petstore-api-v2 appears in the list
  await expect(page.getByText('petstore-api-v2')).toBeVisible();

  // Capture a screenshot of the loaded API docs page
  await page.screenshot({ path: 'test-results/api-docs-page.png', fullPage: true });
});
