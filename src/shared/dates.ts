const pad = (n: number): string => String(n).padStart(2, "0");
/** Local calendar date as YYYY-MM-DD (not UTC). */
export const localDate = (d: Date = new Date()): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const addDays = (d: Date, n: number): Date => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
