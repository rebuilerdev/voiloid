import { defineConfig, devices } from "@playwright/test"

const PORT = 3100

/**
 * E2E テスト（モックモード）。事前に `npm run build` しておくこと。
 * CI では Playwright のブラウザを `npx playwright install --with-deps chromium` で入れる。
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    locale: "ja-JP",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "mobile", use: { ...devices["Pixel 7"] }, grep: /@mobile/ },
  ],
  webServer: {
    // standalone 出力をそのまま起動する（本番の Docker イメージと同じ起動方法）
    command: `node .next/standalone/apps/web/server.js`,
    port: PORT,
    env: { PORT: String(PORT), HOSTNAME: "127.0.0.1", NEXT_PUBLIC_USE_MOCK: "true" },
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
