import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  globalSetup: './setup.ts',
  globalTeardown: './teardown.ts',
  timeout: 180_000,
  // globalSetup builds the frontend bundle and the Docker image before any
  // test runs, which dominates the wall clock on a cold cache. Kept under the
  // 20-minute job timeout in .github/workflows/e2e.yaml so Playwright reports
  // the timeout and the report/screenshot uploads still run.
  globalTimeout: 18 * 60_000,
  expect: {
    timeout: 30_000,
  },
  retries: 0,
  reporter: [['html', { open: 'never' }]],
  use: {
    // The image serves the app and the API from one port via
    // @backstage/plugin-app-backend; there is no separate dev server on 3000.
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:7007',
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
    video: 'on',
  },
});
