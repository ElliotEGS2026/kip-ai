import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { chess, PUZZLES_PER_DAY } from "../src/generator/collectors/chess.js";
import { THEMES, pickThemes, readChess, recordResult, seeded } from "../src/shared/chessState.js";

let dir: string;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "kip-chess-")); process.env.KIP_DATA_DIR = path.join(dir, "data"); });
afterEach(() => { delete process.env.KIP_DATA_DIR; });

describe("three puzzles a day", () => {
  it("picks different themes, the same ones all day, and different ones on other days", async () => {
    const a = await chess({ today: "2026-11-08", now: new Date() });
    expect(PUZZLES_PER_DAY).toBe(3);
    expect(a.puzzles).toHaveLength(3);
    expect(new Set(a.puzzles?.map((p) => p.theme)).size).toBe(3);
    expect(a.puzzle).toEqual(a.puzzles?.[0]);
    for (const p of a.puzzles ?? []) { expect(THEMES).toContain(p.theme); expect(p.url).toBe(`https://lichess.org/training/${p.theme}`); expect(p.id).toBe(`2026-11-08-${p.theme}`); }
    expect((await chess({ today: "2026-11-08", now: new Date() })).puzzles).toEqual(a.puzzles); // stable all day
    const other = new Set<string>();
    for (let d = 1; d <= 20; d++) (await chess({ today: `2026-12-${String(d).padStart(2, "0")}`, now: new Date() })).puzzles?.forEach((p) => other.add(p.theme));
    expect(other.size).toBeGreaterThan(6); // really rotates
  });

  it("never repeats a theme within a day and leans towards the themes you miss", () => {
    const state = readChess();
    state.themes.pin = { attempts: 20, fails: 20, lastSeen: "" }; // always missed
    let withPin = 0, withFork = 0;
    for (let i = 0; i < 300; i++) {
      const t = pickThemes(state, seeded(`day-${i}`), 3);
      expect(new Set(t).size).toBe(3);
      if (t.includes("pin")) withPin++;
      if (t.includes("fork")) withFork++;
    }
    expect(withPin).toBeGreaterThan(withFork * 1.5);
  });
});

describe("recording how a puzzle went", () => {
  it("solved / helped / missed / skipped affect the weakness stats differently", () => {
    recordResult("a", "fork", "solved", { seconds: 30, index: 1 });
    recordResult("b", "pin", "helped", { seconds: 90, index: 2 });
    recordResult("c", "skewer", "missed", { seconds: 60, index: 3 });
    const s = recordResult("d", "mateIn1", "skipped");
    expect(s.themes.fork).toMatchObject({ attempts: 1, fails: 0, seconds: 30 });
    expect(s.themes.pin).toMatchObject({ attempts: 1, fails: 0.5, seconds: 90 });
    expect(s.themes.skewer).toMatchObject({ attempts: 1, fails: 1 });
    expect(s.themes.mateIn1).toMatchObject({ attempts: 0, fails: 0, skips: 1 });
    expect(s.history.map((h) => [h.outcome, h.solved, h.index])).toEqual([["solved", true, 1], ["helped", true, 2], ["missed", false, 3], ["skipped", false, undefined]]);
  });

  it("the older boolean form still works", () => {
    expect(recordResult("x", "fork", false).themes.fork).toMatchObject({ attempts: 1, fails: 1 });
  });

  it("answering the same puzzle again today replaces the earlier answer", () => {
    recordResult("p", "fork", "missed", { seconds: 40 });
    const s = recordResult("p", "fork", "solved", { seconds: 20 });
    expect(s.themes.fork).toMatchObject({ attempts: 1, fails: 0, seconds: 20 });
    expect(s.history).toHaveLength(1);
    expect(s.history[0]?.outcome).toBe("solved");
  });
});
