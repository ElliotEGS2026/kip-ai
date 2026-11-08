import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
/** Private runtime data (gitignored). Override with KIP_DATA_DIR (used by tests). */
export const dataDir = (): string => process.env.KIP_DATA_DIR ?? path.join(ROOT, "data");
export const configDir = (): string => process.env.KIP_CONFIG_DIR ?? path.join(ROOT, "config");
export const fixturePath = (): string => path.join(ROOT, "fixtures", "briefing.sample.json");
export const webDist = (): string => path.join(ROOT, "dist", "web");
