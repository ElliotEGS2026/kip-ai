/** Shortens text to at most `n` characters, ending with an ellipsis when cut. */
export const clip = (s: string, n: number): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
