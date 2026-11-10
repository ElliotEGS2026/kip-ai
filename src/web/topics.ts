/** Words that say nothing about what a story is about, so they are never offered as a topic to block. */
const STOP = new Set(("a an and are as at be been but by can could did do does for from had has have he her his how i if in into is it its " +
  "just more most new no not now of on or our out over says said she so than that the their them then there these they this " +
  "to up us was we were what when where which while who why will with would you your after before about amid against back " +
  "being first get gets got last make makes may might must only own set sets still take takes very via year years week day days " +
  "here live latest update updates news report reports").split(" "));

const isName = (w: string): boolean => /^\p{Lu}/u.test(w) && !STOP.has(w.toLowerCase());

/**
 * Suggested topics for "Block topic": names first (runs of up to three capitalised words, e.g. "Rachel Reeves"),
 * then other meaningful words from the headline. A headline in Title Case Throughout gives single words instead
 * of one long phrase. Lower-cased, de-duplicated, at most `max`.
 */
export function topicSuggestions(title: string, max = 6): string[] {
  const toWords = (s: string): string[] => s.split(/[^\p{L}\p{N}'-]+/u).map((w) => w.replace(/^['-]+|['-]+$/g, "").replace(/'s$/i, "")).filter(Boolean);
  const clean = title.replace(/[‘’]/g, "'");
  const words = toWords(clean);
  // Names never run across punctuation ("Budget: Rachel Reeves" is not one name).
  const clauses = clean.split(/[:;,.!?|()"“”–—]+|\s-\s/).map(toWords).filter((c) => c.length > 0);
  const titleCase = words.length > 3 && words.filter((w) => /^\p{Lu}/u.test(w)).length / words.length > 0.7;
  const out: string[] = [];
  const add = (s: string) => { const v = s.toLowerCase(); if (v.length >= 3 && !STOP.has(v) && !/^\d+$/.test(v) && !out.includes(v)) out.push(v); };
  const inPhrase = new Set<string>();
  if (!titleCase) {
    let run: string[] = [];
    const flush = () => { if (run.length >= 2 && run.length <= 3) { add(run.join(" ")); run.forEach((w) => inPhrase.add(w.toLowerCase())); } run = []; };
    // A clause's first word is often capitalised anyway, so it only starts a name when the next word is capitalised too.
    for (const c of clauses) {
      c.forEach((w, i) => { if (isName(w) && (i > 0 || isName(c[1] ?? ""))) run.push(w); else flush(); });
      flush();
    }
  }
  // Then the other words in headline order; the separate parts of a name ("reeves") come last.
  for (const w of words) if (!inPhrase.has(w.toLowerCase())) add(w);
  for (const w of words) add(w);
  return out.slice(0, max);
}
