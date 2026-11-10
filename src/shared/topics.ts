/**
 * Topic keywords (config/blocklist.md "## Topics", config/sources.md "## Favourite topics") match whole words or
 * phrases in a headline, case-insensitively: "war" matches "War in Sudan" but not "warning" or "software".
 */
const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function topicMatches(text: string, topic: string): boolean {
  const t = topic.trim();
  if (!t) return false;
  // Unicode-aware word edges: not preceded/followed by a letter or digit.
  return new RegExp(`(?<![\\p{L}\\p{N}])${escape(t).replace(/\s+/g, "\\s+")}(?![\\p{L}\\p{N}])`, "iu").test(text);
}
