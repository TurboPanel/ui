import { defineConfig, devices } from '@playwright/test'

// Smoke harness for the web export: one browser, one project, the API mocked
// in the page (e2e/fixtures/api.ts), so no control plane or server is needed.
// Build first: `pnpm export`, then `pnpm test:e2e`.
const port = Number(process.env.E2E_PORT ?? 4173)

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: !!process.env.CI,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  outputDir: 'test-results',
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'node e2e/serve-dist.mjs',
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
    env: { E2E_PORT: String(port) },
  },
})
