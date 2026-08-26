import { defineConfig, devices } from '@playwright/test';

const externalBaseURL = process.env.HEXRUNNER_WEB_URL?.trim();
const localBaseURL = 'http://127.0.0.1:4173';
const baseURL = externalBaseURL || localBaseURL;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  retries: 0,
  reporter: 'line',
  use: {
    ...devices['iPhone 13'],
    browserName: 'chromium',
    baseURL,
    trace: 'retain-on-failure',
  },
  webServer: externalBaseURL
    ? undefined
    : {
        command:
          'CI=1 EXPO_PUBLIC_DOMAIN=127.0.0.1:8080 pnpm exec expo start --web --port 4173',
        url: localBaseURL,
        reuseExistingServer: false,
        timeout: 120_000,
      },
});