import type { Item, Puzzle } from "../shared/schema.js";

export interface Ctx { today: string; now: Date }
export interface Result {
  status?: "ok" | "error" | "not_configured";
  message?: string;
  warnings?: string[];
  items?: Item[];
  puzzle?: Puzzle;
  puzzles?: Puzzle[];
}
export type Collector = (ctx: Ctx) => Promise<Result>;
/** Throw from a collector when its source isn't set up (renders as a "not set up" card, not an error). */
export class NotConfigured extends Error {}
