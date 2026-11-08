/** Small display helpers and lookup tables shared by the UI components. */
export const host = (u?: string): string => { try { return new URL(u ?? "").hostname.replace(/^www\./, ""); } catch { return ""; } };
export const time = (iso?: string): string => (iso ? new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "");

/** "today" / "yesterday" / "N days ago" for a YYYY-MM-DD date. */
export const ago = (d?: string): string => {
  const ms = d ? Date.parse(d) : NaN;
  if (Number.isNaN(ms)) return "";
  const days = Math.max(0, Math.floor((Date.now() - ms) / 86400000));
  return days === 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;
};

export const SECTION_ICON: Record<string, string> = { chess: "🧩", notes: "📝", meetings: "📅", email: "✉️", work: "🛡️", world: "🌍", today: "✅" };
export const TAG_ICON: Record<string, string> = { meeting: "🕒", task: "☐", reply: "↩", review: "🔎", security: "⚠️", release: "🚀", "open-loop": "↻", "awaiting-reply": "↩", unread: "✉️", breaking: "💥", major: "📣", news: "📰", politics: "🏛️", world: "🌍", finance: "💷", priority: "⭐", reminder: "🔔", note: "📝" };
export const TAG_MEANING: Record<string, string> = {
  breaking: "Breaking change — may need action in your code or setup.",
  major: "New major version — worth reading what changed before upgrading.",
  security: "Security issue — check whether you are affected.",
  release: "New release of something you track.",
  news: "Industry news that may affect your work.",
  politics: "Politics story.", world: "World story.", finance: "Government or economy money news.",
  priority: "You marked this as a priority — it stays at the top until you clear it.", reminder: "You asked to be reminded about this again.",
  note: "A note you wrote earlier.",
  meeting: "On your calendar today.", reply: "Someone is waiting for your reply.", "open-loop": "A task you noted but haven't ticked off.",
};
