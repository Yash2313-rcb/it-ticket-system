/** Turns a spreadsheet cell (Date object or text) into YYYY-MM-DD, or null when it is not a real date. */
export function toYmd(v: unknown): string | null {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return new Date(v.getTime() + 6 * 3600 * 1000).toISOString().slice(0, 10); // +6h absorbs Excel time-zone drift
  const s = String(v ?? '').trim();
  let y: number, m: number, d: number;
  let mm = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s].*)?$/);
  if (mm) { y = +mm[1]; m = +mm[2]; d = +mm[3]; }
  else if ((mm = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/))) { d = +mm[1]; m = +mm[2]; y = +mm[3]; } // Indian order: day first
  else return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? dt.toISOString().slice(0, 10) : null;
}
