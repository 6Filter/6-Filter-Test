/**
 * Part 148 D119 — India time (IST, UTC+5:30, no daylight saving). Browser-safe, no dependencies.
 * Every Log count (month, day, financial year) is bucketed with these helpers, never with UTC or the browser zone.
 */
export const IST_OFFSET_MIN = 330;
const MS_MIN = 60 * 1000;
const MS_DAY = 24 * 60 * MS_MIN;

const pad2 = (n) => String(n).padStart(2, "0");

function toMs(input) {
  if (input == null || input === "") return NaN;
  if (typeof input === "number") return Number.isFinite(input) ? input : NaN;
  if (input instanceof Date) return input.getTime();
  return Date.parse(String(input));
}

/** The calendar parts of an instant as seen in India. Returns null for a missing or invalid date. */
export function istParts(input) {
  const ms = toMs(input);
  if (!Number.isFinite(ms)) return null;
  const d = new Date(ms + IST_OFFSET_MIN * MS_MIN);
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  return {
    year,
    month,
    day,
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    dow: d.getUTCDay(),
    ymd: `${year}-${pad2(month)}-${pad2(day)}`,
    monthKey: `${year}-${pad2(month)}`,
    ms,
  };
}

export function ymdToDayNumber(ymd) {
  const m = String(ymd || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return NaN;
  return Math.floor(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / MS_DAY);
}

export function dayNumberToYmd(n) {
  const d = new Date(n * MS_DAY);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

export function addDays(ymd, days) {
  return dayNumberToYmd(ymdToDayNumber(ymd) + days);
}

export function daysBetween(fromYmd, toYmd) {
  return ymdToDayNumber(toYmd) - ymdToDayNumber(fromYmd);
}

export function monthKeyToIndex(key) {
  const m = String(key || "").match(/^(\d{4})-(\d{2})$/);
  return m ? Number(m[1]) * 12 + Number(m[2]) - 1 : NaN;
}

export function indexToMonthKey(i) {
  return `${Math.floor(i / 12)}-${pad2((i % 12) + 1)}`;
}

/** Every month key from `fromKey` to `toKey`, inclusive. */
export function monthKeysBetween(fromKey, toKey) {
  const a = monthKeyToIndex(fromKey);
  const b = monthKeyToIndex(toKey);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return [];
  const out = [];
  for (let i = a; i <= b; i += 1) out.push(indexToMonthKey(i));
  return out;
}

/** Financial year starts on 1 April: the year it starts in. */
export function fyStartYear(input) {
  const p = typeof input === "object" && input && "month" in input ? input : istParts(input);
  if (!p) return null;
  return p.month >= 4 ? p.year : p.year - 1;
}

/** "FY 2026-27" for any date from 1 April 2026 to 31 March 2027, India time. */
export function fyLabel(input) {
  const start = fyStartYear(input);
  if (start == null) return "";
  return `FY ${start}-${pad2((start + 1) % 100)}`;
}

export const PERIOD_OPTIONS = [
  { id: "this-month", label: "This month" },
  { id: "last-30", label: "Last 30 days" },
  { id: "last-90", label: "Last 90 days" },
  { id: "this-fy", label: "This financial year" },
  { id: "last-fy", label: "Last financial year" },
  { id: "all", label: "All time" },
  { id: "custom", label: "Custom" },
];

/**
 * The inclusive India-date range for a period. `from`/`to` are "YYYY-MM-DD" (null = open end).
 * "This financial year" is named with its FY label, e.g. "FY 2026-27".
 */
export function periodRange(id = "all", now = Date.now(), { from = "", to = "" } = {}) {
  const today = istParts(now)?.ymd;
  if (!today) return { id: "all", label: "All time", from: null, to: null };
  const parts = istParts(now);
  switch (id) {
    case "this-month":
      return { id, label: "This month", from: `${parts.monthKey}-01`, to: today };
    case "last-30":
      return { id, label: "Last 30 days", from: addDays(today, -29), to: today };
    case "last-90":
      return { id, label: "Last 90 days", from: addDays(today, -89), to: today };
    case "this-fy": {
      const y = fyStartYear(parts);
      return { id, label: fyLabel(parts), from: `${y}-04-01`, to: today };
    }
    case "last-fy": {
      const y = fyStartYear(parts) - 1;
      return { id, label: fyLabel(`${y}-04-01T12:00:00+05:30`), from: `${y}-04-01`, to: `${y + 1}-03-31` };
    }
    case "custom": {
      let a = /^\d{4}-\d{2}-\d{2}$/.test(from) ? from : null;
      let b = /^\d{4}-\d{2}-\d{2}$/.test(to) ? to : null;
      if (a && b && a > b) [a, b] = [b, a];
      return { id, label: a || b ? `${a || "…"} to ${b || "…"}` : "Custom", from: a, to: b };
    }
    default:
      return { id: "all", label: "All time", from: null, to: null };
  }
}

export function inRange(ymd, range) {
  if (!ymd) return false;
  if (range?.from && ymd < range.from) return false;
  if (range?.to && ymd > range.to) return false;
  return true;
}
