import os from "node:os";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests run against a real Kip server on throwaway data/config dirs (never the real data/ or config/).
 * Run `npm run test:e2e` (builds the web app first). Two servers: the main one, and a disposable one for the shutdown test.
 */
export const MAIN = { port: 47831, root: path.join(os.tmpdir(), "kip-e2e-main") };
export const SPARE = { port: 47832, root: path.join(os.tmpdir(), "kip-e2e-spare") };

const server = (s: { port: number; root: string }) => ({
  command: "npx tsx src/server/index.ts",
  url: `http://127.0.0.1:${s.port}/`,
  reuseExistingServer: false,
  timeout: 60_000,
  env: {
    KIP_PORT: String(s.port),
    KIP_DATA_DIR: path.join(s.root, "data"),
    KIP_CONFIG_DIR: path.join(s.root, "config"),
    KIP_MS_CLIENT_ID: "",
  },
});

export default defineConfig({
  testDir: "tests/e2e",
  workers: 1, // tests share one server's data dir
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: { baseURL: `http://127.0.0.1:${MAIN.port}`, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [server(MAIN), server(SPARE)],
});
