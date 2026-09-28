import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  advisoryChecksFromLabels,
  compactAdvisoryForLog,
  filterLogRows,
  filterSegments,
  filterStageLabel,
  hasAnyFloorFailure,
  logRowForCsv,
  logStats,
  matchesLogQuery,
  propositionStatus,
  propositionsToCsv,
} from "../lib/logStatus.js";

const openDraft = { name: "Cooling mist", ideaDescription: "menthol", submitterDepartment: "NPD" };
assert.equal(propositionStatus(openDraft), "OPEN");

const cleared = { finalSummary: { summaryText: "Closed.", expectedBusinessImpact: "₹2.0 Cr" } };
assert.equal(propositionStatus(cleared), "CLEARED");

const stoppedScore = { classification: "NO-GO" };
assert.equal(propositionStatus(stoppedScore), "STOPPED");

const stoppedFloor = {
  classification: "WATCH",
  advisoryChecks: { f2: { checkLabel: "Below floor" } },
};
assert.equal(hasAnyFloorFailure(stoppedFloor), true);
assert.equal(propositionStatus(stoppedFloor), "STOPPED");

const review = {
  goNoGo: { classification: "WATCH" },
  managerReviewRequested: true,
  managerReview: { requestedAt: "2026-09-01T00:00:00.000Z" },
};
assert.equal(propositionStatus(review), "REVIEW");
assert.equal(
  propositionStatus({
    ...review,
    managerApproval: { comment: "Go ahead" },
  }),
  "OPEN",
  "approved WATCH is no longer REVIEW — it is in progress toward proof"
);

const realChecks = {
  f1: { checkLabel: "Cleared", items: [{ status: "done", text: "gap holds" }] },
  f2: { checkLabel: "Below floor", items: [{ status: "pending", text: "margin 12% vs 35%" }] },
  f3: { checkLabel: "Evidence missing" },
  f4: { checkLabel: "Cleared" },
  f5: { checkLabel: "Locked" },
  f6: { checkLabel: "Awaiting panels" },
};
assert.deepEqual(filterSegments({}, realChecks), ["pass", "fail", "review", "pass", "none", "none"]);
assert.equal(filterStageLabel({ advisoryChecks: realChecks }, realChecks), "Stopped at F2 — margin below floor");

const f3Review = {
  f1: { checkLabel: "Cleared" },
  f2: { checkLabel: "Cleared" },
  f3: { checkLabel: "Evidence missing" },
  f4: { checkLabel: "Locked" },
  f5: { checkLabel: "Locked" },
  f6: { checkLabel: "Awaiting panels" },
};
assert.equal(filterStageLabel({ advisoryChecks: f3Review }, f3Review), "F3 in review");

const proto = {
  f1: { checkLabel: "Cleared" },
  f2: { checkLabel: "Cleared" },
  f3: { checkLabel: "Cleared" },
  f4: { checkLabel: "Cleared" },
  f5: { checkLabel: "Cleared" },
  f6: { checkLabel: "Awaiting panels" },
};
assert.equal(filterStageLabel({ advisoryChecks: proto }, proto), "At prototype panel");

const labels = compactAdvisoryForLog(
  { goNoGo: { classification: "WATCH" } },
  { f1: { checkLabel: "Cleared" }, f2: { checkLabel: "Evidence missing" } }
);
assert.equal(labels.f5.checkLabel, "Locked");
assert.equal(labels.f6.checkLabel, "Awaiting panels");
assert.deepEqual(advisoryChecksFromLabels({ f1: "Cleared", f2: "Below floor" }).f2, { checkLabel: "Below floor" });

const now = Date.parse("2026-09-15T12:00:00.000Z");
const statsRows = [
  { createdAt: "2026-09-04T10:00:00.000Z", updatedAt: "2026-09-14T10:00:00.000Z", name: "A" },
  { createdAt: "2026-08-01T10:00:00.000Z", updatedAt: "2026-08-02T10:00:00.000Z", name: "B" },
  {
    createdAt: "2026-09-01T10:00:00.000Z",
    updatedAt: "2026-09-02T10:00:00.000Z",
    finalSummary: { summaryText: "done" },
    name: "C",
  },
  { createdAt: "2026-09-03T10:00:00.000Z", classification: "NO-GO", name: "D" },
];
const stats = logStats(statsRows, now);
assert.equal(stats.submittedThisMonth, 3);
assert.equal(stats.cleared, 1);
assert.equal(stats.clearedRate, 25);
assert.equal(stats.open, 2);
assert.equal(stats.staleOpen, 1, "August draft untouched 7+ days");
assert.equal(stats.stopped, 1);

assert.equal(matchesLogQuery({ name: "Herbal oil", submitterDepartment: "R&D", ideaDescription: "menthol" }, "menthol"), true);
assert.equal(matchesLogQuery({ name: "Herbal oil", division: "Personal Care" }, "personal"), true);
assert.equal(matchesLogQuery({ name: "Herbal oil" }, "snacks"), false);

const mixed = [
  { name: "Alpha", classification: "NO-GO", ideaDescription: "x" },
  { name: "Beta", finalSummary: { summaryText: "ok" }, ideaDescription: "cooling" },
  { name: "Gamma", ideaDescription: "cooling mist", submitterDepartment: "NPD" },
];
assert.equal(filterLogRows(mixed, { status: "STOPPED" }).length, 1);
assert.equal(filterLogRows(mixed, { query: "cooling", status: "ALL" }).length, 2);
assert.equal(filterLogRows(mixed, { query: "cooling", status: "CLEARED" })[0].name, "Beta");

const csv = propositionsToCsv([
  {
    status: "OPEN",
    name: 'Oil "plus"',
    owner: "Asha",
    dept: "Personal Care",
    idea: "menthol, cooling",
    stage: "F1 in review",
    date: "04 Sep 2026",
    time: "15:01",
  },
]);
assert.match(csv, /^Status,Research,Proposition,Owner,Department,Idea,Stage,Submitted\n/);
assert.match(csv, /"Oil ""plus"""/);
assert.match(csv, /"04 Sep 2026 15:01"/);

const csvRow = logRowForCsv({
  name: "Oil",
  submitterName: "Asha",
  division: "Personal Care",
  ideaDescription: "menthol",
  createdAt: "2026-09-04T10:00:00.000Z",
  advisoryChecks: f3Review,
});
assert.equal(csvRow.status, "OPEN");
assert.equal(csvRow.stage, "F3 in review");

const logSrc = readFileSync(new URL("../src/LogPage.jsx", import.meta.url), "utf8");
assert.match(logSrc, /--bg:#F2EFE5/);
assert.match(logSrc, /Plus Jakarta Sans/);
assert.match(logSrc, /IBM Plex Mono/);
assert.match(logSrc, /Export all/);
assert.match(
  logSrc,
  /Kindly export your ideas to make sure you always have a copy of the same as the ideas will be wiped out because of no storage/
);
assert.match(logSrc, /log-scoped-filters/);
assert.match(logSrc, /Export this idea/);
assert.match(logSrc, /Delete all/);
assert.doesNotMatch(logSrc, /#120818/);

const appSrc = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
assert.match(appSrc, /confirmAndDeleteAll/);
assert.match(appSrc, /deleteAllPropositions/);
assert.match(appSrc, /confirmDeleteProposition/);
assert.match(appSrc, /bulk-delete/);
assert.match(appSrc, /screen-log/);
assert.match(appSrc, /#F2EFE5/);

console.log("PASS Part 65 log status, segments, search, CSV, light theme");
