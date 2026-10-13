import { test, expect } from '@playwright/test';

const API_DOCS_URL =
  '/api-docs?filters%5Bkind%5D=api&filters%5Buser%5D=all';

// The API versions served by mock-portal-api/data.js.
const MOCK_PORTAL_APIS = ['tracks-api-v1', 'petstore-api-v2', 'orders-api-v1'];

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

  // Assert on the mock portal's APIs by name rather than the total count, so
  // other catalog locations (e.g. the bundled examples) don't break the test.
  const apiLocators = MOCK_PORTAL_APIS.map(name =>
    page.getByText(name, { exact: true }),
  );
  const allVisible = async () => {
    for (const locator of apiLocators) {
      if (!(await locator.isVisible().catch(() => false))) return false;
    }
    return true;
  };
  const deadline = Date.now() + 120_000;

  while (Date.now() < deadline) {
    if (await allVisible()) break;
    await page.waitForTimeout(5_000);
    await page.reload();
  }

  for (const locator of apiLocators) {
    await expect(locator).toBeVisible({ timeout: 10_000 });
  }

  // Capture a screenshot of the loaded API docs page
  await page.screenshot({ path: 'test-results/api-docs-page.png', fullPage: true });
});
