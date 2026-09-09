import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as XLSX from "xlsx";
import {
  FULL_EXPORT_COLUMNS,
  buildExportWorkbook,
  flattenProposition,
  getNestedValue,
} from "../lib/logExport.js";
import {
  applyScopedFilters,
  filterLogRows,
  uniqueLogValues,
  rowPerson,
  rowTeam,
} from "../lib/logStatus.js";

const rows = [
  {
    id: "a",
    name: "Plex shot",
    submitterName: "Anita",
    submitterDepartment: "NPD",
    ideaDescription: "in-shower booster",
    classification: "WATCH",
  },
  {
    id: "b",
    name: "ThermaScent",
    submitterName: "Rahul",
    submitterDepartment: "R&D",
    ideaDescription: "adaptive patch",
    classification: "NO-GO",
  },
  {
    id: "c",
    name: "Hair oil",
    submitterName: "Anita",
    submitterDepartment: "NPD",
    ideaDescription: "cooling oil",
    classification: "GO",
  },
];

assert.deepEqual(uniqueLogValues(rows, rowTeam), ["NPD", "R&D"]);
assert.deepEqual(uniqueLogValues(rows, rowPerson), ["Anita", "Rahul"]);

const npd = applyScopedFilters(rows, { teamFilter: "NPD" });
assert.equal(npd.length, 2);
assert.ok(npd.every((r) => r.submitterDepartment === "NPD"));

const anita = applyScopedFilters(rows, { personFilter: "Anita" });
assert.equal(anita.length, 2);
assert.ok(anita.every((r) => r.submitterName === "Anita"));

const both = applyScopedFilters(rows, { teamFilter: "NPD", personFilter: "Rahul" });
assert.equal(both.length, 0);

const search = applyScopedFilters(rows, { searchText: "patch" });
assert.equal(search.length, 1);
assert.equal(search[0].name, "ThermaScent");

const together = applyScopedFilters(rows, {
  teamFilter: "NPD",
  personFilter: "Anita",
  searchText: "booster",
});
assert.equal(together.length, 1);
assert.equal(together[0].name, "Plex shot");

assert.equal(filterLogRows(rows, { teamFilter: "NPD", status: "STOPPED" }).length, 0);
assert.equal(filterLogRows(rows, { teamFilter: "R&D", status: "STOPPED" }).length, 1);

const foodsRd = {
  id: "d",
  name: "Low sodium Pickle variants",
  division: "Foods",
  submitterDepartment: "R&D",
  submitterName: "Sushmitha S",
  ideaDescription: "pickle",
  classification: "WATCH",
};
assert.equal(applyScopedFilters([foodsRd], { teamFilter: "R&D" }).length, 1);
assert.equal(applyScopedFilters([foodsRd], { teamFilter: "Foods" }).length, 0);

assert.equal(getNestedValue({ f2: { mrpInr: 210 } }, "f2.mrpInr"), 210);

const deo = {
  id: "deo-1",
  name: "48-Hour Roll-On Deodorant",
  category: "Deodorant",
  division: "Personal Care",
  submitterName: "Priya",
  submitterDepartment: "NPD",
  ideaDescription: "48-hour roll-on",
  version: 2,
  createdAt: "2026-09-01T10:00:00.000Z",
  updatedAt: "2026-09-04T10:00:00.000Z",
  f1: {
    declaredAttribute: "48-hour odour control",
    declaredAttribute2: "no white marks",
    declaredAttribute3: "",
    benchmark: "Nivea Men Cool Kick 25ml",
    declaredGap: 2.4,
    gapDerivation: "perceivability vs Nivea",
    parityExceptions: "none",
    growthRoute: "penetration",
    growthArgument: "under-served long-wear",
    evidenceSourceDate: "https://example.com/ua",
    pureCommodity: false,
  },
  f2: {
    cogsAtScale: 42,
    netMarginAtScale: 52,
    gstRatePct: 18,
    grammage: "50ml",
    mrpInr: 121,
    qcomTrajectory: "take-rate stable",
    financeSigned: true,
  },
  f3: { marginElasticity: { minMrpInr: 98, maxMrpInr: 140 } },
  f4: {
    techShiftRisk: {
      overallRisk: "Low",
      dimensions: {
        functionalCoreStability: { risk: "Low", reason: "alcohol-based roll-on stays" },
        consumptionContextStability: { risk: "Low", reason: "daily grooming" },
        manufacturingDisruptionRisk: { risk: "Low", reason: "standard filling" },
        userHabitShiftPotential: { risk: "Medium", reason: "solid sticks rising", userResponse: "roll-on still majority" },
        adjacentSubstitutionThreat: { risk: "Low", reason: "limited overlap" },
        purchaseFrequencyShift: { risk: "Low", reason: "same cadence" },
        regulatoryDisruptionRisk: { risk: "Low", reason: "no pending ban" },
      },
    },
  },
  f5: {
    householdsReachedY3Mn: 3.2,
    trialRatePct: 45,
    repeatConversionPct: 30,
    purchaseFrequencyYr: 5,
    avgPackValueInr: 120,
    computedRevenue: 25.92,
    cmiHeadSigned: false,
  },
  f6: {
    labGapVsBenchmark: 2.3,
    consumerPanelBeaters: 19,
    packStandoutGap: 2.1,
    bmAttendedAll30: true,
    forumVerdict: "",
  },
  goNoGo: {
    classification: "WATCH",
    score: { pct: 73 },
    checkLabels: { f1: "Cleared", f2: "Cleared", f4: "Evidence missing" },
    filterNarratives: { f1: "Gap holds vs Nivea." },
  },
  advisoryChecks: {
    f1: { checkLabel: "Cleared" },
    f2: { checkLabel: "Cleared" },
    f4: { checkLabel: "Evidence missing" },
  },
  managerReview: { comment: "Proceed to proof", managerName: "BH Forum" },
  finalSummary: { summaryText: "", expectedBusinessImpact: "" },
};

const flat = flattenProposition(deo);
for (const col of FULL_EXPORT_COLUMNS) {
  assert.ok(Object.prototype.hasOwnProperty.call(flat, col), `missing column ${col}`);
}
assert.equal(flat.name, "48-Hour Roll-On Deodorant");
assert.equal(flat["f1.declaredAttribute"], "48-hour odour control");
assert.equal(flat["f1.evidenceSourceLink"], "https://example.com/ua");
assert.equal(flat["f2.mrpInr"], 121);
assert.equal(flat["f2.grammage"], "50ml");
assert.equal(flat["f3.minMrpInr"], 98);
assert.equal(flat["f3.maxMrpInr"], 140);
assert.match(String(flat["f4.userHabitShiftPotential"]), /Medium/);
assert.match(String(flat["f4.userHabitShiftPotential"]), /Response: roll-on still majority/);
assert.equal(flat["f4.overallRisk"], "Low");
assert.equal(flat["f5.householdsReachedY3Mn"], 3.2);
assert.equal(flat["f5.computedRevenue"], 25.92);
assert.equal(flat["f5.cmiSigned"], "No");
assert.equal(flat["f6.labGap"], 2.3);
assert.equal(flat["f6.bmAttendedAll30"], "Yes");
assert.equal(flat.classification, "WATCH");
assert.equal(flat.scorePercent, 73);
assert.equal(flat.ideaSizeTier, "1000g");
assert.equal(flat.ideaSizeEstimatedOrConfirmed, "estimated");
assert.equal(flat.managerReviewComment, "Proceed to proof");
assert.equal(flat.managerApprovedBy, "BH Forum");
assert.equal(flat["f1.checkLabel"], "Cleared");
assert.equal(flat["f1.narrative"], "Gap holds vs Nivea.");

const book = buildExportWorkbook([deo, rows[1]]);
const out = XLSX.write(book, { type: "buffer", bookType: "xlsx" });
assert.ok(out.slice(0, 2).toString() === "PK", "xlsx must be a real zip/Office file");
const parsed = XLSX.read(out, { type: "buffer" });
assert.ok(parsed.SheetNames.includes("Propositions"));
const sheetRows = XLSX.utils.sheet_to_json(parsed.Sheets.Propositions);
assert.equal(sheetRows.length, 2);
assert.equal(sheetRows[0].name, "48-Hour Roll-On Deodorant");
assert.equal(sheetRows[0]["f5.avgPackValueInr"], 120);
assert.equal(sheetRows[1].name, "ThermaScent");

const scopedBook = buildExportWorkbook(applyScopedFilters(rows, { personFilter: "Anita" }));
const scopedOut = XLSX.read(XLSX.write(scopedBook, { type: "buffer", bookType: "xlsx" }), { type: "buffer" });
assert.equal(XLSX.utils.sheet_to_json(scopedOut.Sheets.Propositions).length, 2);

const logSrc = readFileSync(new URL("../src/LogPage.jsx", import.meta.url), "utf8");
assert.match(logSrc, /log-scoped-filters/);
assert.match(logSrc, /LOG_UNLOCK_OPTIONS/);
assert.match(logSrc, /isMasterUnlock/);
assert.match(logSrc, /uniqueSubmitters/);
assert.match(logSrc, /Export this idea/);
assert.match(logSrc, /exportPropositionsToExcel/);
assert.doesNotMatch(logSrc, /Export CSV/);

console.log("PASS Part 82 team/person filters and full-detail xlsx");
