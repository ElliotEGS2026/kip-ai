import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { loadEnv, port as getPort } from "../shared/env.js";
import { dataDir } from "../shared/paths.js";
import { buildApp } from "./app.js";

loadEnv();
const port = getPort();
const token = crypto.randomBytes(24).toString("hex");
const pidFile = path.join(dataDir(), "kip.pid");

const app = buildApp({
  port, token,
  onShutdown: () => {
    fs.rmSync(pidFile, { force: true });
    void app.close().then(() => process.exit(0));
  },
});

try {
  await app.listen({ host: "127.0.0.1", port });
} catch (e) {
  const err = e as NodeJS.ErrnoException;
  console.error(err.code === "EADDRINUSE" ? `Port ${port} is busy. Set KIP_PORT in .env or run scripts/stop.sh` : String(e));
  process.exit(1);
}
fs.mkdirSync(dataDir(), { recursive: true });
fs.writeFileSync(pidFile, String(process.pid));
for (const sig of ["SIGINT", "SIGTERM"] as const) process.on(sig, () => { fs.rmSync(pidFile, { force: true }); process.exit(0); });
console.log(`Kip is running at http://127.0.0.1:${port}`);
