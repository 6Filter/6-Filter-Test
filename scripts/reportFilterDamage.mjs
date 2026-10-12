/**
 * Read-only damage report for the empty-filter wipe. Writes the owner CSV only.
 * Stdout is counts. It does not print idea text or names.
 */
import { createReadStream } from "node:fs";
import { mkdirSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import path from "node:path";
import { filterHasContent, parseFilterValue } from "../lib/filterWriteGuard.js";
import { backupDir } from "./planResubmit.mjs";

const AFTER_8202332 = "2026-10-06T09:27:55.000Z";
const AFTER_FIX = "2026-10-08T12:01:43.000Z";
const WINDOW_START = "2026-09-25T00:00:00.000Z";
const WINDOW_END = "2026-10-06T02:48:06.020Z";
const FILTERS = ["f1", "f2", "f3", "f4"];

function weekOf(iso) {
  if (!iso) return "draft";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "draft";
  const day = date.getUTCDay();
  date.setUTCDate(date.getUTCDate() - ((day + 6) % 7));
  return date.toISOString().slice(0, 10);
}

function present(value) {
  if (value == null || value === "") return false;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return String(value).trim().length > 0;
}

function parse(raw) {
  if (!raw) return {};
  return typeof raw === "string" ? parseFilterValue(raw) : raw;
}

async function loadRows() {
  const file = path.join(backupDir(), "propositions.jsonl");
  const rows = [];
  const rl = createInterface({ input: createReadStream(file), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    const row = JSON.parse(line);
    const findings = row.research_findings_json;
    rows.push({
      id: row.id,
      name: row.name || "",
      category: row.category || "",
      description: row.idea_description || "",
      team: row.submitter_department || "",
      submitter: row.submitter_name || "",
      researchRunAt: row.research_run_at || null,
      f1: parse(row.f1_json),
      f2: parse(row.f2_json),
      f3: parse(row.f3_json),
      f4: parse(row.f4_json),
      hasFindings: Boolean(findings && String(findings).length > 4),
      proof: Boolean(row.proof_json && String(row.proof_json).length > 4),
      attachment: Boolean(row.attachment_json && String(row.attachment_json).length > 4),
      finalVerdict: Boolean(String(row.final_verdict || "").trim()),
      manager: Boolean(row.manager_review_json && String(row.manager_review_json).length > 4),
      finalSummary: Boolean(row.final_summary_json && String(row.final_summary_json).length > 4),
      goNoGo: Boolean(row.go_nogo_json && String(row.go_nogo_json).length > 4),
    });
  }
  return rows;
}

const rows = await loadRows();
const buckets = new Map();
const affected = [];
let afterCommit = 0;
let afterFix = 0;
let afterCommitResearched = 0;
let afterCommitIntact = 0;
let afterFixResearched = 0;
let afterFixIntact = 0;
const windowByTeam = new Map();
const other = {
  allEmpty: { n: 0, proof: 0, attachment: 0, finalVerdict: 0, manager: 0, finalSummary: 0, goNoGo: 0 },
  intact: { n: 0, proof: 0, attachment: 0, finalVerdict: 0, manager: 0, finalSummary: 0, goNoGo: 0 },
};
let first = "";
let last = "";

for (const doc of rows) {
  const empty = FILTERS.filter((key) => !filterHasContent(doc[key]));
  const kind = empty.length === 4 ? "allEmpty" : empty.length ? "partial" : "intact";
  const week = weekOf(doc.researchRunAt);
  const team = doc.team || "(none)";
  const key = `${week}|${team}`;
  const bag = buckets.get(key) || {
    week, team, n: 0, allEmpty: 0, partial: 0, intact: 0, withFindings: 0, withoutFindings: 0,
  };
  bag.n += 1;
  bag[kind] += 1;
  if (doc.hasFindings) bag.withFindings += 1;
  else bag.withoutFindings += 1;
  buckets.set(key, bag);

  if (!doc.researchRunAt) continue;
  if (doc.researchRunAt >= WINDOW_START && doc.researchRunAt <= WINDOW_END) {
    const team = doc.team || "(none)";
    const bag = windowByTeam.get(team) || { team, researched: 0, affected: 0 };
    bag.researched += 1;
    if (kind !== "intact") bag.affected += 1;
    windowByTeam.set(team, bag);
  }
  if (doc.researchRunAt >= AFTER_8202332) {
    afterCommitResearched += 1;
    if (kind === "intact") afterCommitIntact += 1;
    else afterCommit += 1;
  }
  if (doc.researchRunAt >= AFTER_FIX) {
    afterFixResearched += 1;
    if (kind === "intact") afterFixIntact += 1;
    else afterFix += 1;
  }
  if (kind === "intact") {
    other.intact.n += 1;
    if (doc.proof) other.intact.proof += 1;
    if (doc.attachment) other.intact.attachment += 1;
    if (doc.finalVerdict) other.intact.finalVerdict += 1;
    if (doc.manager) other.intact.manager += 1;
    if (doc.finalSummary) other.intact.finalSummary += 1;
    if (doc.goNoGo) other.intact.goNoGo += 1;
    continue;
  }
  affected.push(doc);
  if (!first || doc.researchRunAt < first) first = doc.researchRunAt;
  if (!last || doc.researchRunAt > last) last = doc.researchRunAt;
  if (kind === "allEmpty") {
    other.allEmpty.n += 1;
    if (doc.proof) other.allEmpty.proof += 1;
    if (doc.attachment) other.allEmpty.attachment += 1;
    if (doc.finalVerdict) other.allEmpty.finalVerdict += 1;
    if (doc.manager) other.allEmpty.manager += 1;
    if (doc.finalSummary) other.allEmpty.finalSummary += 1;
    if (doc.goNoGo) other.allEmpty.goNoGo += 1;
  }
}

const lines = ["week | team | n | allEmpty | partial | intact | withFindings | withoutFindings"];
for (const bag of [...buckets.values()].sort((a, b) => `${a.week}${a.team}`.localeCompare(`${b.week}${b.team}`))) {
  lines.push(
    [bag.week, bag.team, bag.n, bag.allEmpty, bag.partial, bag.intact, bag.withFindings, bag.withoutFindings].join(" | ")
  );
}
lines.push(`affected=${affected.length} allEmpty=${other.allEmpty.n} first=${first || "-"} last=${last || "-"}`);
const windowResearched = [...windowByTeam.values()].reduce((sum, bag) => sum + bag.researched, 0);
const windowAffected = [...windowByTeam.values()].reduce((sum, bag) => sum + bag.affected, 0);
lines.push(
  `window 2026-09-25 to 2026-10-06T02:48:06Z researched=${windowResearched} affected=${windowAffected}`
);
for (const bag of [...windowByTeam.values()].sort((a, b) => a.team.localeCompare(b.team))) {
  lines.push(`window team ${bag.team} researched=${bag.researched} affected=${bag.affected}`);
}
lines.push(
  `after8202332 researched=${afterCommitResearched} intact=${afterCommitIntact} affected=${afterCommit}`
);
lines.push(`afterFix researched=${afterFixResearched} intact=${afterFixIntact} affected=${afterFix}`);
lines.push(
  "unknown attachment: the old verdict statement could clear attachment_json, and an empty column cannot separate never-uploaded from cleared."
);
lines.push(
  "unknown forum: forum verdicts lived inside the wiped filter columns, so a missing verdict cannot be told from one that was cleared."
);
lines.push(
  `allEmpty extras proof=${other.allEmpty.proof} attachment=${other.allEmpty.attachment} finalVerdict=${other.allEmpty.finalVerdict} manager=${other.allEmpty.manager} finalSummary=${other.allEmpty.finalSummary} goNoGo=${other.allEmpty.goNoGo}`
);
lines.push(
  `intact extras proof=${other.intact.proof} attachment=${other.intact.attachment} finalVerdict=${other.intact.finalVerdict} manager=${other.intact.manager} finalSummary=${other.intact.finalSummary} goNoGo=${other.intact.goNoGo}`
);
const allEmptyDocs = affected.filter((doc) => FILTERS.every((key) => !filterHasContent(doc[key])));
const partialDocs = affected.filter((doc) => !allEmptyDocs.includes(doc));
function filled(list, key) {
  return list.filter((doc) => String(doc[key] || "").trim()).length;
}
lines.push(
  `allEmpty columns name=${filled(allEmptyDocs, "name")} category=${filled(allEmptyDocs, "category")} description=${filled(allEmptyDocs, "description")} submitter=${filled(allEmptyDocs, "submitter")} of ${allEmptyDocs.length}`
);
lines.push(
  `partial columns name=${filled(partialDocs, "name")} category=${filled(partialDocs, "category")} description=${filled(partialDocs, "description")} submitter=${filled(partialDocs, "submitter")} of ${partialDocs.length}`
);
console.log(lines.join("\n"));

const outDir = path.join(path.dirname(backupDir()), "..", "reports");
mkdirSync(outDir, { recursive: true });
const csv = [
  "id,name,team,submitter,researchRunAt,emptyFilters,likelyProbe,note",
  ...affected
    .sort((a, b) => String(a.researchRunAt).localeCompare(String(b.researchRunAt)))
    .map((doc) => {
      const empty = FILTERS.filter((key) => !filterHasContent(doc[key])).join(" ");
      const fullyEmpty = empty.split(" ").filter(Boolean).length >= 4;
      const note = [
        fullyEmpty
          ? "Name, category, description and all filters are blank. Still stored: submitter, team, research date, and the findings (benchmark evidence text, F2 cost estimate, F5 sizing factors, F4 overall risk). Try an old Excel export, Slack messages or screenshots, and use the findings text to recognise the idea."
          : "Name, category and description are intact. Lost F3 and F4 results.",
        doc.submitter === "Gyana" ? "please confirm whether this was a real idea" : "",
      ].filter(Boolean).join(" ");
      const likelyProbe = doc.submitter === "Live Check" || doc.submitter === "Primus QA Probe" || doc.submitter === "Nishanth" ? "yes" : "";
      return [doc.id, doc.name, doc.team, doc.submitter, doc.researchRunAt, empty, likelyProbe, note]
        .map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`)
        .join(",");
    }),
].join("\n");
const file = path.join(outDir, "affected-ideas.csv");
writeFileSync(file, csv);
console.log(`csv rows=${affected.length} wrote=${path.relative(process.cwd(), file)}`);
