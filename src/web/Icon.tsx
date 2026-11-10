/** Monochrome line icons (inherit currentColor, so they pick up the red theme and stay legible on the dark glass). */
const P: Record<string, string> = {
  puzzle: "M10 3h4v3a2 2 0 1 0 4 0h3v5h-3a2 2 0 1 0 0 4h3v6H3V3h4v0M10 3v3M3 11h3a2 2 0 1 1 0 4H3",
  note: "M6 3h9l4 4v14H6zM14 3v5h5M9 12h7M9 16h7",
  calendar: "M4 6h16v14H4zM4 10h16M8 3v5M16 3v5",
  mail: "M3 6h18v13H3zM3 7l9 7 9-7",
  shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM9 12l2 2 4-4",
  globe: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18",
  check: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM8 12l3 3 5-6",
  clock: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2",
  box: "M5 5h14v14H5z",
  reply: "M9 8L4 13l5 5M4 13h10a6 6 0 0 0 6-6V6",
  search: "M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM15.5 15.5L20 20",
  warning: "M12 3l10 18H2zM12 10v5M12 18v.5",
  rocket: "M14 4c3 0 6 1 6 1s1 3 1 6c-2 3-5 5-8 6l-5-5c1-3 3-6 6-8zM9 14l-4 1 1-4M10 15l-1 4 4-1M15 9.5a1 1 0 1 0 0 .1",
  loop: "M5 12a7 7 0 0 1 12-5l2 2M19 4v5h-5M19 12a7 7 0 0 1-12 5l-2-2M5 20v-5h5",
  flame: "M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-9z",
  megaphone: "M4 10v4h3l8 4V6L7 10zM18 9a4 4 0 0 1 0 6",
  news: "M5 4h12v16H5zM17 8h3v10a2 2 0 0 1-2 2M8 8h6M8 12h6M8 16h4",
  bank: "M3 9l9-5 9 5zM5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18",
  pound: "M16 6a4 4 0 0 0-8 1v4H6m2 0v5c0 2-1 3-2 4h12M8 12h6",
  star: "M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z",
  bell: "M6 17V11a6 6 0 0 1 12 0v6l2 2H4zM10 21h4",
  mic: "M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3",
  plug: "M9 3v5M15 3v5M6 8h12v3a6 6 0 0 1-12 0zM12 17v4",
  sparkle: "M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2zM19 3v4M17 5h4",
  trash: "M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6M14 11v6",
  flag: "M5 21V4M5 4h13l-3 4 3 4H5",
  thumbup: "M7 11v10H3V11zM7 11l4-8c2 0 3 1 3 3v4h6l-1 9a2 2 0 0 1-2 2H7",
  tag: "M3 12V3h9l9 9-9 9zM7.5 7.5h.01",
  eye:"M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
  notePlus: "M6 3h9l4 4v14H6zM14 3v5h5M12.5 11v6M9.5 14h6",
  thumbdown:"M7 13V3H3v10zM7 13l4 8c2 0 3-1 3-3v-4h6l-1-9a2 2 0 0 0-2-2H7",
};

/** Emoji replaced by icons: map of tag/section keys to icon names. */
export function Icon({ name, label }: { name: string; label?: string }) {
  const d = P[name] ?? P.puzzle!;
  return (
    <svg className="svg-ico" viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true} focusable="false">
      <path d={d} />
    </svg>
  );
}
