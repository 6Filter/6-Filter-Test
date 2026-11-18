/**
 * Part 148 — The Log by team, month, person and date, plus fixed-rule insights. Browser-safe, no AI, no network.
 *
 * Everything here is computed only from the rows it is given (D125): a person or team that is not in the rows
 * cannot appear in a table, a chart, a CSV or an insight.
 *
 * Submitted (D118) = Submit has produced an evaluation; draft = not evaluated yet. Charts count submitted ideas only;
 * drafts sit beside them and are never inside the submitted figures.
 */
import { reviewDisplayState } from "./managerReview.js";
import { classificationOf, isSubmitted, researchWasUsed, rowDateIso, rowEvaluationState, rowPerson, rowTeam, formatMonthLabel } from "./logStatus.js";
import {
  addDays,
  daysBetween,
  fyLabel,
  inRange,
  istParts,
  monthKeysBetween,
  periodRange,
  PERIOD_OPTIONS,
} from "./istTime.js";

export { istParts, periodRange, fyLabel, isSubmitted, PERIOD_OPTIONS };

/** D123 — every number a rule uses lives here, and the Log page lists them under "How this is worked out". */
export const THRESHOLDS = Object.freeze({
  maxInsights: 6,
  /** Month-on-month change is only reported when the previous month had at least this many ideas ... */
  monthChangeMinPrevious: 5,
  /** ... and the move is at least this many percent. */
  monthChangePercent: 20,
  /** Months in a row of rising (or falling) submissions, and the smallest month allowed in that run. */
  streakMonths: 3,
  streakMinIdeas: 5,
  /** NO-GO share must jump by this many percentage points over the previous three months. */
  nogoJumpPoints: 15,
  nogoBaselineMonths: 3,
  nogoMinVerdicts: 5,
  /** A team holding at least this percent of submitted ideas (needs this many ideas overall). */
  concentrationPercent: 40,
  concentrationMinIdeas: 10,
  /** Best GO-or-WATCH rate: teams with this many evaluated ideas, this many points above the overall rate. */
  bestRateMinEvaluated: 5,
  bestRateMarginPoints: 15,
  /** A team that has not submitted for this many days (and has at least this many ideas on record). */
  quietDays: 30,
  quietMinIdeas: 3,
  maxQuietTeams: 2,
  /** Share of started ideas never submitted (needs this many started ideas). */
  draftSharePercent: 30,
  draftShareMinStarted: 10,
  /** Busiest team line needs this many submitted ideas overall. */
  busiestMinIdeas: 10,
});

export const VERDICT_KEYS = ["GO", "WATCH", "NO-GO", "INCOMPLETE"];

export const SUMMARY_TABS = [
  { id: "team", label: "Team", column: "Team" },
  { id: "month", label: "Month", column: "Month" },
  { id: "person", label: "Person", column: "Person" },
  { id: "date", label: "Date", column: "Date" },
];

const NO_TEAM = "No team";
const NO_PERSON = "Unknown";

/** One of GO / WATCH / NO-GO / INCOMPLETE for a submitted idea; "" for a draft. */
export function verdictOf(row = {}) {
  const state = rowEvaluationState(row);
  if (state === "not-evaluated") return "";
  if (state === "incomplete") return "INCOMPLETE";
  const c = classificationOf(row).toUpperCase();
  return c === "GO" || c === "WATCH" || c === "NO-GO" ? c : "INCOMPLETE";
}

function pct1(n, d) {
  return d > 0 ? Math.round((1000 * n) / d) / 10 : null;
}

function emptyGroup(key, label, extra = {}) {
  return { key, label, submitted: 0, drafts: 0, GO: 0, WATCH: 0, "NO-GO": 0, INCOMPLETE: 0, aiUsed: 0, ...extra };
}

function finish(group) {
  const verdicted = group.GO + group.WATCH + group["NO-GO"];
  return {
    ...group,
    started: group.submitted + group.drafts,
    verdicted,
    goRate: pct1(group.GO, verdicted),
    goOrWatchRate: pct1(group.GO + group.WATCH, verdicted),
  };
}

function add(group, row) {
  if (isSubmitted(row)) {
    group.submitted += 1;
    group[verdictOf(row)] += 1;
  } else {
    group.drafts += 1;
  }
  if (researchWasUsed(row)) group.aiUsed += 1;
}

function rowYmd(row) {
  return istParts(rowDateIso(row))?.ymd || "";
}

function personKey(row) {
  const email = String(row.createdByEmail || row.created_by_email || "").trim().toLowerCase();
  const name = rowPerson(row);
  return email || (name ? `name:${name.toLowerCase()}` : "");
}

/**
 * Group rows by "team" | "month" | "person" | "date" within an optional India-date range.
 * Month and date are zero-filled (chronological); team and person are sorted by submitted ideas, biggest first.
 * Returns { by, range, groups, totals } and groups/totals share one shape.
 */
export function summarize(rows = [], by = "team", { range = null, now = Date.now() } = {}) {
  const list = (Array.isArray(rows) ? rows : []).filter((row) => {
    const ymd = rowYmd(row);
    return ymd && (!range || inRange(ymd, range));
  });
  const totals = emptyGroup("__all__", "All");
  for (const row of list) add(totals, row);

  const map = new Map();
  const names = new Map();
  const getGroup = (key, label, extra) => {
    if (!map.has(key)) map.set(key, emptyGroup(key, label, extra));
    return map.get(key);
  };

  for (const row of list) {
    if (by === "month") {
      const key = istParts(rowDateIso(row)).monthKey;
      add(getGroup(key, formatMonthLabel(key), { filterValue: key }), row);
    } else if (by === "date") {
      const key = rowYmd(row);
      add(getGroup(key, key, { filterValue: key }), row);
    } else if (by === "person") {
      const key = personKey(row);
      const name = rowPerson(row) || String(row.createdByEmail || "").trim() || NO_PERSON;
      const g = getGroup(key || `name:${NO_PERSON.toLowerCase()}`, name, { filterValue: rowPerson(row) });
      add(g, row);
      if (!names.has(name)) names.set(name, new Set());
      names.get(name).add(g.key);
    } else {
      const team = rowTeam(row) || NO_TEAM;
      add(getGroup(team, team, { filterValue: rowTeam(row) }), row);
    }
  }

  // Two different people sharing a name are told apart by their email, never merged.
  if (by === "person") {
    for (const [name, keys] of names) {
      if (keys.size > 1) {
        for (const k of keys) {
          const g = map.get(k);
          const email = k.startsWith("name:") ? "" : k;
          if (email) g.label = `${name} (${email})`;
        }
      }
    }
  }

  let groups;
  if (by === "month" || by === "date") {
    const keys = [...map.keys()].sort();
    const todayYmd = istParts(now)?.ymd || "";
    const hiCap = range?.to && todayYmd && range.to < todayYmd ? range.to : todayYmd;
    const firstKey = keys[0] || "";
    const lastKey = keys[keys.length - 1] || "";
    const loYmd = range?.from || (firstKey ? (by === "month" ? `${firstKey}-01` : firstKey) : "");
    const lastKeyYmd = lastKey ? (by === "month" ? `${lastKey}-01` : lastKey) : "";
    const hiYmd = [hiCap, lastKeyYmd].filter(Boolean).sort().pop() || "";
    if (loYmd && hiYmd && loYmd <= hiYmd) {
      if (by === "month") {
        groups = monthKeysBetween(loYmd.slice(0, 7), hiYmd.slice(0, 7)).map(
          (k) => map.get(k) || emptyGroup(k, formatMonthLabel(k), { filterValue: k })
        );
      } else {
        groups = [];
        for (let d = loYmd; d <= hiYmd && groups.length < 4000; d = addDays(d, 1)) {
          groups.push(map.get(d) || emptyGroup(d, d, { filterValue: d }));
        }
      }
    } else {
      groups = keys.map((k) => map.get(k));
    }
  } else {
    groups = [...map.values()].sort(
      (a, b) => b.submitted - a.submitted || b.drafts - a.drafts || a.label.localeCompare(b.label)
    );
  }
  return { by, range, groups: groups.map(finish), totals: finish(totals) };
}

/** Month-by-month submitted ideas with change vs the previous month and a three-month average. */
export function monthlyTrend(rows = [], { range = null, now = Date.now() } = {}) {
  const currentKey = istParts(now)?.monthKey || "";
  const { groups } = summarize(rows, "month", { range, now });
  return groups.map((g, i) => {
    const prev = i > 0 ? groups[i - 1] : null;
    const inProgress = g.key === currentKey;
    let change = null;
    let changePercent = null;
    if (prev && !inProgress) {
      change = g.submitted - prev.submitted;
      changePercent = prev.submitted > 0 ? Math.round((1000 * change) / prev.submitted) / 10 : null;
    }
    let average = null;
    if (!inProgress) {
      const window = groups.slice(Math.max(0, i - 2), i + 1);
      average = Math.round((10 * window.reduce((s, x) => s + x.submitted, 0)) / window.length) / 10;
    }
    return { ...g, inProgress, change, changePercent, average };
  });
}

const FULL_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "2026-11" -> "November" (full name, for chart titles). */
export function fullMonthName(monthKey) {
  const m = String(monthKey || "").match(/^(\d{4})-(\d{2})$/);
  return m ? FULL_MONTHS[Number(m[2]) - 1] || "" : "";
}

function previousMonthKey(monthKey) {
  const m = String(monthKey || "").match(/^(\d{4})-(\d{2})$/);
  if (!m) return "";
  const y = Number(m[1]);
  const mo = Number(m[2]);
  return mo === 1 ? `${y - 1}-12` : `${y}-${String(mo - 1).padStart(2, "0")}`;
}

/**
 * Part 150 — the numbers on the Log dashboard (always the whole log, never the period picker below it):
 * submitted ideas, how many were screened and the GO / NO-GO / WATCH split, ideas waiting for the business head,
 * this month against last month, the top 5 submitters this month and the ideas per team this month.
 * "Screened" = submitted ideas with a GO, WATCH or NO-GO verdict (incomplete ones are submitted but not screened).
 * Waiting for approval = ideas whose business-head review was requested and not yet answered (the same count as the
 * "Waiting for business head's approval" chip in the list below).
 */
export function dashboardStats(rows = [], { now = Date.now(), topPeople = 5 } = {}) {
  const list = Array.isArray(rows) ? rows : [];
  const monthKey = istParts(now)?.monthKey || "";
  const prevKey = previousMonthKey(monthKey);
  const all = summarize(list, "team", { now }).totals;
  const month = monthKey ? summarize(list, "month", { now }).groups : [];
  const thisMonth = month.find((g) => g.key === monthKey)?.submitted || 0;
  const lastMonth = month.find((g) => g.key === prevKey)?.submitted || 0;
  const range = monthKey ? { from: `${monthKey}-01`, to: `${monthKey}-31` } : null;
  const people = summarize(list, "person", { range, now }).groups.filter((g) => g.submitted > 0);
  const teams = summarize(list, "team", { range, now }).groups.filter((g) => g.submitted > 0);
  const waiting = list.filter((row) => reviewDisplayState(row, { now }).statusKey === "waiting").length;
  return {
    monthKey,
    monthName: fullMonthName(monthKey),
    prevMonthKey: prevKey,
    prevMonthName: fullMonthName(prevKey),
    submitted: all.submitted,
    drafts: all.drafts,
    thisMonth,
    lastMonth,
    screened: all.GO + all.WATCH + all["NO-GO"],
    GO: all.GO,
    WATCH: all.WATCH,
    "NO-GO": all["NO-GO"],
    incomplete: all.INCOMPLETE,
    waiting,
    topPeople: people.slice(0, topPeople),
    teams,
  };
}
const fmtPct = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
const monthName = (key) => formatMonthLabel(key);

/**
 * Up to THRESHOLDS.maxInsights plain-English findings, every one with its numbers. Fixed rules only; small samples
 * raise no alarm. The same rows give the same insights in any order.
 */
export function generateInsights(rows = [], { now = Date.now() } = {}) {
  const T = THRESHOLDS;
  const out = [];
  const push = (id, tone, text, numbers) => out.push({ id, tone, icon: tone === "down" ? "↓" : tone === "up" ? "↑" : tone === "warn" ? "!" : "i", text, numbers });

  const all = summarize(rows, "month", { now });
  const totals = all.totals;
  const trend = monthlyTrend(rows, { now }).filter((m) => !m.inProgress);
  const today = istParts(now)?.ymd;

  // 1. Month-on-month change (last complete month against the one before it).
  if (trend.length >= 2) {
    const cur = trend[trend.length - 1];
    const prev = trend[trend.length - 2];
    if (prev.submitted >= T.monthChangeMinPrevious && prev.submitted > 0) {
      const pct = (100 * (cur.submitted - prev.submitted)) / prev.submitted;
      if (Math.abs(pct) >= T.monthChangePercent) {
        const rounded = Math.round(Math.abs(pct));
        push(
          "month-change",
          pct < 0 ? "down" : "up",
          `Ideas ${pct < 0 ? "fell" : "rose"} ${rounded}% in ${monthName(cur.key)} (${cur.submitted} vs ${prev.submitted} in ${monthName(prev.key)}).`,
          { month: cur.key, current: cur.submitted, previousMonth: prev.key, previous: prev.submitted, percent: rounded }
        );
      }
    }
  }

  // 2. Rising or falling for several complete months in a row.
  if (trend.length >= T.streakMonths + 1) {
    const run = trend.slice(-(T.streakMonths + 1));
    const counts = run.map((m) => m.submitted);
    const rising = counts.every((c, i) => i === 0 || c > counts[i - 1]);
    const falling = counts.every((c, i) => i === 0 || c < counts[i - 1]);
    if ((rising || falling) && Math.min(...counts) >= T.streakMinIdeas) {
      push(
        "streak",
        rising ? "up" : "down",
        `Ideas have ${rising ? "risen" : "fallen"} ${T.streakMonths} months in a row (${counts.join(" → ")}, ${monthName(run[0].key)} to ${monthName(run[run.length - 1].key)}).`,
        { months: run.map((m) => m.key), counts }
      );
    }
  }

  // 3. NO-GO share jump against the previous three months.
  if (trend.length >= T.nogoBaselineMonths + 1) {
    const cur = trend[trend.length - 1];
    const base = trend.slice(-(T.nogoBaselineMonths + 1), -1);
    const baseNo = base.reduce((s, m) => s + m["NO-GO"], 0);
    const baseVer = base.reduce((s, m) => s + m.verdicted, 0);
    if (cur.verdicted >= T.nogoMinVerdicts && baseVer >= T.nogoMinVerdicts) {
      const curShare = (100 * cur["NO-GO"]) / cur.verdicted;
      const baseShare = (100 * baseNo) / baseVer;
      if (curShare - baseShare >= T.nogoJumpPoints) {
        push(
          "nogo-jump",
          "warn",
          `NO-GO share rose to ${fmtPct(Math.round(curShare * 10) / 10)}% in ${monthName(cur.key)} (${cur["NO-GO"]} of ${cur.verdicted}), against ${fmtPct(Math.round(baseShare * 10) / 10)}% over the previous ${T.nogoBaselineMonths} months.`,
          { month: cur.key, noGo: cur["NO-GO"], verdicted: cur.verdicted, share: curShare, baselineShare: baseShare }
        );
      }
    }
  }

  const teams = summarize(rows, "team", { now }).groups.filter((g) => g.submitted + g.drafts > 0);
  const topTeam = teams[0];

  // 4. Concentration.
  if (topTeam && totals.submitted >= T.concentrationMinIdeas) {
    const share = (100 * topTeam.submitted) / totals.submitted;
    if (share >= T.concentrationPercent) {
      push(
        "concentration",
        "warn",
        `Submissions are concentrated: ${topTeam.label} accounts for ${fmtPct(Math.round(share * 10) / 10)}% of ideas.`,
        { team: topTeam.label, submitted: topTeam.submitted, total: totals.submitted, share }
      );
    }
  }

  // 5. Best GO-or-WATCH rate.
  if (totals.verdicted > 0) {
    const overall = (100 * (totals.GO + totals.WATCH)) / totals.verdicted;
    const eligible = teams
      .filter((g) => g.verdicted >= T.bestRateMinEvaluated)
      .map((g) => ({ g, rate: (100 * (g.GO + g.WATCH)) / g.verdicted }))
      .filter((x) => x.rate - overall >= T.bestRateMarginPoints)
      .sort((a, b) => b.rate - a.rate || b.g.verdicted - a.g.verdicted || a.g.label.localeCompare(b.g.label));
    if (eligible.length) {
      const { g, rate } = eligible[0];
      push(
        "best-rate",
        "info",
        `${g.label}: ${fmtPct(Math.round(rate * 10) / 10)}% of evaluated ideas read GO or WATCH, against ${fmtPct(Math.round(overall * 10) / 10)}% overall.`,
        { team: g.label, evaluated: g.verdicted, rate, overall }
      );
    }
  }

  // 6. Teams gone quiet.
  if (today) {
    const lastByTeam = new Map();
    for (const row of Array.isArray(rows) ? rows : []) {
      if (!isSubmitted(row)) continue;
      const ymd = rowYmd(row);
      if (!ymd) continue;
      const team = rowTeam(row) || NO_TEAM;
      const prev = lastByTeam.get(team);
      if (!prev || ymd > prev) lastByTeam.set(team, ymd);
    }
    const quiet = teams
      .filter((g) => g.submitted >= T.quietMinIdeas && lastByTeam.has(g.label))
      .map((g) => ({ g, last: lastByTeam.get(g.label), days: daysBetween(lastByTeam.get(g.label), today) }))
      .filter((x) => x.days > T.quietDays)
      .sort((a, b) => b.days - a.days || a.g.label.localeCompare(b.g.label))
      .slice(0, T.maxQuietTeams);
    for (const q of quiet) {
      push("quiet-team", "warn", `${q.g.label} has not submitted since ${q.last}.`, { team: q.g.label, since: q.last, days: q.days });
    }
  }

  // 7. Drafts never submitted.
  const started = totals.submitted + totals.drafts;
  if (started >= T.draftShareMinStarted) {
    const share = (100 * totals.drafts) / started;
    if (share >= T.draftSharePercent) {
      push(
        "drafts",
        "info",
        `${fmtPct(Math.round(share * 10) / 10)}% of started ideas were never submitted (${totals.drafts} drafts).`,
        { drafts: totals.drafts, started, share }
      );
    }
  }

  // 8. Busiest team.
  if (topTeam && topTeam.submitted > 0 && totals.submitted >= T.busiestMinIdeas) {
    push(
      "busiest",
      "info",
      `${topTeam.label} submitted ${topTeam.submitted} of ${totals.submitted} ideas (${fmtPct(Math.round((1000 * topTeam.submitted) / totals.submitted) / 10)}%).`,
      { team: topTeam.label, submitted: topTeam.submitted, total: totals.submitted }
    );
  }

  return out.slice(0, T.maxInsights);
}

/** Plain-English list of the rules, for the "How this is worked out" panel. */
export function insightRuleLines() {
  const T = THRESHOLDS;
  return [
    `Month on month: the last full month against the one before, when the earlier month had at least ${T.monthChangeMinPrevious} ideas and the change is ${T.monthChangePercent}% or more.`,
    `Trend: ${T.streakMonths} full months in a row of rising or falling ideas, with at least ${T.streakMinIdeas} ideas in every month.`,
    `NO-GO share: the last full month is at least ${T.nogoJumpPoints} points above the previous ${T.nogoBaselineMonths} months, with at least ${T.nogoMinVerdicts} evaluated ideas in each.`,
    `Concentration: one team holds ${T.concentrationPercent}% or more of submitted ideas (at least ${T.concentrationMinIdeas} ideas overall).`,
    `Best GO-or-WATCH rate: a team with at least ${T.bestRateMinEvaluated} evaluated ideas, ${T.bestRateMarginPoints} points or more above the overall rate.`,
    `Quiet team: no submission for more than ${T.quietDays} days (team has at least ${T.quietMinIdeas} submitted ideas).`,
    `Drafts: ${T.draftSharePercent}% or more of started ideas never submitted (at least ${T.draftShareMinStarted} started).`,
    `Busiest team: the team with most submitted ideas (at least ${T.busiestMinIdeas} ideas overall).`,
    `At most ${T.maxInsights} insights are shown. Small samples raise no alarm. No AI is used.`,
  ];
}

function csvCell(value) {
  const s = String(value ?? "");
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV for one summary tab: UTF-8 byte-order mark (so Excel opens it right), header, rows, then an All row; CRLF. */
export function summaryToCsv(summary, { column } = {}) {
  const first = column || SUMMARY_TABS.find((t) => t.id === summary?.by)?.column || "Group";
  const header = [first, "Submitted", "Drafts", "GO", "WATCH", "NO-GO", "INCOMPLETE", "AI used", "GO rate"];
  const line = (g) =>
    [
      g.label,
      g.submitted,
      g.drafts,
      g.GO,
      g.WATCH,
      g["NO-GO"],
      g.INCOMPLETE,
      g.aiUsed,
      g.goRate == null ? "" : `${fmtPct(g.goRate)}%`,
    ]
      .map(csvCell)
      .join(",");
  const lines = [header.map(csvCell).join(","), ...(summary?.groups || []).map(line), line({ ...(summary?.totals || emptyGroup("", "All")), label: "All" })];
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}
