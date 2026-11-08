import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BriefingSchema, FeedbackInput, SectionSchema } from "../src/shared/schema.js";
import { fixturePath } from "../src/shared/paths.js";
import { addBullet, readSections } from "../src/shared/mdConfig.js";

const fixture = () => JSON.parse(fs.readFileSync(fixturePath(), "utf8"));

describe("briefing schema", () => {
  it("accepts the fixture", () => {
    expect(BriefingSchema.safeParse(fixture()).success).toBe(true);
  });
  it("rejects wrong section order", () => {
    const f = fixture();
    f.sections.reverse();
    expect(BriefingSchema.safeParse(f).success).toBe(false);
  });
  it("rejects a news item without link/date unless unverified", () => {
    const bad = { id: "work", title: "t", status: "ok", items: [{ id: "1", title: "x" }] };
    expect(SectionSchema.safeParse(bad).success).toBe(false);
    bad.items = [{ id: "1", title: "x", unverified: true } as never];
    expect(SectionSchema.safeParse(bad).success).toBe(true);
  });
  it("validates API input", () => {
    expect(FeedbackInput.safeParse({ kind: "down", target: "source", value: "a.com\n- evil" }).success).toBe(false);
    expect(FeedbackInput.safeParse({ kind: "down", target: "source", value: "a.com" }).success).toBe(true);
  });
});

describe("md config", () => {
  it("adds bullets once and keeps other content", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kipcfg-"));
    process.env.KIP_CONFIG_DIR = dir;
    fs.writeFileSync(`${dir}/b.md`, "# Title\nnote\n\n## Outlets\n- a.com\n\n## Topics\n");
    expect(addBullet("b.md", "Outlets", "b.com")).toBe(true);
    expect(addBullet("b.md", "Outlets", "B.com")).toBe(false);
    expect(readSections("b.md").Outlets).toEqual(["a.com", "b.com"]);
    expect(fs.readFileSync(`${dir}/b.md`, "utf8")).toContain("note");
    delete process.env.KIP_CONFIG_DIR;
  });
});
