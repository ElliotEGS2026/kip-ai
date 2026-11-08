import fs from "node:fs";
import path from "node:path";
import { configDir } from "./paths.js";

/** Parses "## Heading" sections with "- bullet" items. Everything else is preserved on write. */
export function readSections(file: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  let current = "";
  const p = path.join(configDir(), file);
  if (!fs.existsSync(p)) return out;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const h = /^##\s+(.+?)\s*$/.exec(line);
    if (h) { current = h[1] ?? ""; out[current] ??= []; continue; }
    const b = /^-\s+(.+?)\s*$/.exec(line);
    if (b && current) (out[current] ??= []).push(b[1] ?? "");
  }
  return out;
}

/** Adds "- value" under "## section" (creating it if needed). Returns false if already present. */
export function addBullet(file: string, section: string, value: string): boolean {
  const p = path.join(configDir(), file);
  const text = fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "";
  const lines = text.split(/\r?\n/);
  if (readSections(file)[section]?.some((v) => v.toLowerCase() === value.toLowerCase())) return false;
  const idx = lines.findIndex((l) => new RegExp(`^##\\s+${section}\\s*$`).test(l));
  if (idx === -1) {
    lines.push("", `## ${section}`, `- ${value}`);
  } else {
    let end = idx + 1;
    while (end < lines.length && !/^##\s/.test(lines[end] ?? "")) end++;
    let insertAt = end;
    while (insertAt > idx + 1 && (lines[insertAt - 1] ?? "").trim() === "") insertAt--;
    lines.splice(insertAt, 0, `- ${value}`);
  }
  fs.writeFileSync(p, lines.join("\n").replace(/\n*$/, "\n"));
  return true;
}

export const hostOf = (url: string): string => {
  try { return new URL(url).hostname.replace(/^www\./, "").toLowerCase(); } catch { return ""; }
};
