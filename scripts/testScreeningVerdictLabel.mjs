/**
 * Display-only wording for screening verdicts. Does not change scoring.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as XLSX from "xlsx";
import { RESEARCH_DID_NOT_FINISH_COPY, SCREENING_VERDICT_LABEL } from "../lib/researchFailureCopy.js";
import { CLASSIFICATION_EXPORT_LABEL, buildExportWorkbook, flattenProposition } from "../lib/logExport.js";

const formSrc = readFileSync(new URL("../src/PropositionForm.jsx", import.meta.url), "utf8");
const logSrc = readFileSync(new URL("../src/LogPage.jsx", import.meta.url), "utf8");
const exportSrc = readFileSync(new URL("../lib/logExport.js", import.meta.url), "utf8");

assert.equal(SCREENING_VERDICT_LABEL, "Screening verdict (Filters 1 to 4)");
assert.equal(RESEARCH_DID_NOT_FINISH_COPY, "Research did not finish");

assert.match(formSrc, /SCREENING_VERDICT_LABEL/);
assert.match(formSrc, /RESEARCH_DID_NOT_FINISH_COPY/);
assert.match(formSrc, /data-testid="screening-verdict-label"/);
assert.match(formSrc, /data-testid="screening-verdict-hidden"/);
assert.match(formSrc, /hideScreeningVerdict/);
assert.match(formSrc, /Screen again/);
assert.match(formSrc, /no score and no screening verdict/);

assert.match(logSrc, /SCREENING_VERDICT_LABEL/);
assert.match(logSrc, /data-testid="screening-verdict-label"/);
assert.match(logSrc, /RESEARCH_DID_NOT_FINISH_COPY/);

assert.equal(CLASSIFICATION_EXPORT_LABEL, SCREENING_VERDICT_LABEL);
assert.match(exportSrc, /CLASSIFICATION_EXPORT_LABEL/);
assert.match(exportSrc, /blankWhenUnfinished/);

const unfinished = flattenProposition({
  researchFindings: { stepsExpected: ["F1", "F2", "F3", "F4"], stepsDone: ["F1"], stepsFailed: [] },
  goNoGo: { classification: "WATCH", score: { pct: 72, total: 18, points: 13 } },
});
assert.equal(unfinished.classification, "");
assert.equal(unfinished.scorePercent, "");

const finished = flattenProposition({
  researchRunAt: "2026-11-01T00:00:00Z",
  researchFindings: {
    stepsExpected: ["F1", "F2", "F3", "F4"],
    stepsDone: ["F1", "F2", "F3", "F4"],
    stepsFailed: [],
  },
  goNoGo: { classification: "GO", score: { pct: 88, total: 18, points: 16 } },
});
assert.equal(finished.classification, "GO");

const book = buildExportWorkbook([
  {
    researchFindings: { stepsExpected: ["F1", "F2", "F3", "F4"], stepsDone: ["F1"], stepsFailed: [] },
    goNoGo: { classification: "WATCH", score: { pct: 72, total: 18, points: 13 } },
  },
]);
const sheet = book.Sheets.Propositions;
const headers = XLSX.utils.sheet_to_json(sheet, { header: 1 })[0];
assert.ok(headers.includes("classification"), "import still uses the classification column key");
const data = XLSX.utils.sheet_to_json(sheet);
assert.equal(data[0].classification, "");
assert.equal(data[0].scorePercent, "");
assert.equal(CLASSIFICATION_EXPORT_LABEL, "Screening verdict (Filters 1 to 4)");

console.log("PASS testScreeningVerdictLabel");
