import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  testMatch: '*.e2e.ts',
  timeout: 60_000,
  use: { baseURL: 'http://localhost:8020', channel: 'chrome' },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1360, height: 820 } } },
    { name: 'phone', use: { ...devices['Pixel 7'], channel: 'chrome' } },
  ],
  webServer: { command: 'pnpm dev', url: 'http://localhost:8020', reuseExistingServer: true, timeout: 120_000 },
});
