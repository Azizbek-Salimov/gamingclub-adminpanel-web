import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  workers: 1,
  retries: 0,
  timeout: 90000,
  use: {
    baseURL: process.env.ADMIN_WEB_URL || "http://localhost:5175",
    viewport: { width: 1440, height: 1000 },
  },
  reporter: "list",
});
