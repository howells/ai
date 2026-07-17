import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  expect: { timeout: 5000 },
  forbidOnly: Boolean(process.env.CI),
  fullyParallel: true,
  reporter: process.env.CI ? "github" : "list",
  retries: process.env.CI ? 1 : 0,
  testDir: "./e2e",
  use: {
    baseURL: "http://127.0.0.1:23010",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "pnpm start",
    env: {
      BENCHMARK_CANONICAL_ORIGIN: "http://127.0.0.1:23010",
      BENCHMARK_HASH_SECRET: "test-hash-secret-that-is-at-least-32-characters",
      BENCHMARK_SESSION_PEPPER: "test-session-pepper-at-least-32-characters",
      BENCHMARK_SHARED_SECRET: "test-shared-secret",
      DATABASE_URL: "postgresql://unused:unused@127.0.0.1:1/unused",
      NODE_ENV: "production",
    },
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
    url: "http://127.0.0.1:23010/login",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chromium", use: { ...devices["iPhone 13"], browserName: "chromium" } },
  ],
});
