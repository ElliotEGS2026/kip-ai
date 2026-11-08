import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./paths.js";

/** Loads .env (if present) without a dependency. Real env vars win. */
export function loadEnv(): void {
  const file = path.join(ROOT, ".env");
  if (fs.existsSync(file)) process.loadEnvFile(file);
}

export const port = (): number => Number(process.env.KIP_PORT) || 47821;
