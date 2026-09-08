import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  applyLogStatusFilter,
  applyScopedFilters,
  filterLogRows,
  rowTeam,
} from "../lib/logStatus.js";

const rows = [
  {
    id: "foods-rd",
    name: "Low sodium Pickle variants",
    division: "Foods",
    submitterDepartment: "R&D",
    submitterName: "Sushmitha S",
    ideaDescription: "pickle",
    classification: "WATCH",
    managerReviewRequested: true,
    managerReview: { requestedAt: "2026-09-01T00:00:00.000Z" },
  },
  {
    id: "snacks-npd",
    name: "Crispy Garlic Dal Topper",
    division: "Snacks",
    submitterDepartment: "NPD",
    submitterName: "Anita",
    ideaDescription: "dal",
    classification: "GO",
  },
  {
    id: "pc-rd",
    name: "Dishwashing system",
    division: "Personal Care",
    submitterDepartment: "R&D",
    submitterName: "Sajini",
    ideaDescription: "curry-stained plastics",
    classification: "NO-GO",
  },
];

assert.equal(rowTeam(rows[0]), "R&D");
assert.notEqual(rowTeam(rows[0]), rows[0].division);

const scoped = applyScopedFilters(rows, { teamFilter: "R&D" });
assert.equal(scoped.length, 2);
assert.ok(scoped.every((r) => rowTeam(r) === "R&D"));
assert.ok(scoped.some((r) => r.division === "Foods"));
assert.ok(scoped.some((r) => r.division === "Personal Care"));
assert.ok(!scoped.some((r) => r.submitterDepartment === "NPD"));

const filteredRows = applyLogStatusFilter(scoped, "ALL");
assert.equal(filteredRows.length, scoped.length, "table rows must be the same array length as All count");

const review = applyLogStatusFilter(scoped, "REVIEW");
assert.equal(review.length, 1);
assert.equal(review[0].name, "Low sodium Pickle variants");
assert.equal(filterLogRows(rows, { teamFilter: "R&D", status: "REVIEW" }).length, 1);
assert.equal(filterLogRows(rows, { teamFilter: "R&D", status: "STOPPED" }).length, 1);

const searched = applyScopedFilters(rows, { teamFilter: "R&D", searchText: "pickle" });
assert.equal(searched.length, 1);
assert.equal(applyLogStatusFilter(searched, "ALL").length, 1);

const pageSrc = readFileSync(new URL("../src/LogPage.jsx", import.meta.url), "utf8");
assert.match(pageSrc, /const scopedRows = useMemo/);
assert.match(pageSrc, /applyLogStatusFilter\(scopedRows, status\)/);
assert.match(pageSrc, /filteredRows\.map\(/);
assert.match(pageSrc, /logStats\(scopedRows\)/);
assert.doesNotMatch(pageSrc, /h\.division \|\| h\.submitterDepartment/);
assert.match(pageSrc, /rowTeam\(h\)/);
assert.doesNotMatch(
  pageSrc,
  /applyScopedFilters\(rows, \{ teamFilter, personFilter \}\)/,
  "pills must not re-filter rows independently of search"
);

console.log("PASS Part 86: one scoped array feeds counts and rows; team filter is submitter department, not division");
