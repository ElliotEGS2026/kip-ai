import { describe, expect, it } from "vitest";
import { topicMatches } from "../src/shared/topics.js";
import { topicSuggestions } from "../src/web/topics.js";

describe("topicMatches", () => {
  it("matches whole words, any case, with punctuation edges", () => {
    expect(topicMatches("Crypto crash: what next?", "crypto")).toBe(true);
    expect(topicMatches("CRYPTO, again", "crypto")).toBe(true);
    expect(topicMatches("Cryptography explained", "crypto")).toBe(false);
    expect(topicMatches("Storm warning", "war")).toBe(false);
  });
  it("treats regex characters literally and ignores empty topics", () => {
    expect(topicMatches("C++ 26 lands", "c++")).toBe(true);
    expect(topicMatches("anything", "  ")).toBe(false);
  });
});

describe("topicSuggestions", () => {
  it("offers names first, then meaningful words, skipping filler", () => {
    const s = topicSuggestions("Budget: Rachel Reeves says taxes will rise for the Bank of England");
    expect(s[0]).toBe("rachel reeves");
    expect(s).toContain("taxes");
    expect(s).not.toContain("says");
    expect(s).not.toContain("the");
    expect(s.length).toBeLessThanOrEqual(6);
  });
  it("spots a name at the very start of a headline", () => {
    expect(topicSuggestions("Rachel Reeves says AI chip export rules will tighten")[0]).toBe("rachel reeves");
    expect(topicSuggestions("Floods hit northern towns")).not.toContain("floods hit");
  });
  it("gives single words for Title Case headlines instead of one long phrase", () => {
    const s = topicSuggestions("Premier League Clubs Agree New Spending Rules");
    expect(s).toContain("premier");
    expect(s.every((x) => !x.includes(" "))).toBe(true);
  });
  it("drops possessives and numbers, de-duplicates", () => {
    const s = topicSuggestions("Trump's tariffs: Trump hits 2026 tariffs again");
    expect(s.filter((x) => x === "trump")).toHaveLength(1);
    expect(s).toContain("tariffs");
    expect(s).not.toContain("2026");
  });
});
