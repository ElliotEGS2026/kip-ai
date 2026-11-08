import { loadEnv } from "../shared/env.js";
import { generate } from "./run.js";

loadEnv();
const b = await generate();
console.log(`Kip brief for ${b.date} written to data/briefings/`);
for (const s of b.sections) console.log(`  ${s.id.padEnd(9)} ${s.status}${s.status === "ok" ? ` (${s.puzzle ? `theme ${s.puzzle.theme}` : `${s.items.length} items`})` : s.message ? `: ${s.message}` : ""}`);
