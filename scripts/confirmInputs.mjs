/**
 * Deterministic checks: locked file, same inputs score twice, every form field round-trips.
 * Prints counts and field names only.
 */
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { computeAllAdvisoryChecks } from "../lib/propositionScoring.js";
import { computeGoNoGo, scoreAdvisoryChecks } from "../lib/goNoGo.js";
import { ideaSizeTier, computeIdeaRevenueCr } from "../lib/ideaScale.js";
import {
  SIX_FILTERS_FORM,
  PROPOSITION_TOP_FIELDS,
  mergeProposition,
  emptyPropositionDoc,
} from "../lib/propositionFields.js";
import { initDb } from "../lib/db.js";

const live = execSync("git show 820233258b4a29cd2db46612782715f9e19e8111:lib/lockedConstants.js").toString();
const now = readFileSync("lib/lockedConstants.js", "utf8");
console.log(`lockedConstants-identical=${live === now}`);

await initDb();

function scoreRecord(proposition) {
  return computeAllAdvisoryChecks(proposition).then((checks) => ({
    classification: computeGoNoGo(checks),
    pct: scoreAdvisoryChecks(checks).pct,
    labels: {
      f1: checks.f1?.checkLabel || "",
      f2: checks.f2?.checkLabel || "",
      f3: checks.f3?.checkLabel || "",
      f4: checks.f4?.checkLabel || "",
    },
    items: ["f1", "f2", "f3", "f4"].map((key) => (checks[key]?.items || []).length),
    sizeTier: ideaSizeTier(computeIdeaRevenueCr(proposition.f5 || {}))?.tier || null,
  }));
}

const raw = JSON.parse(readFileSync("data/propositions.json", "utf8"));
const rows = (Array.isArray(raw) ? raw : Object.values(raw)).map((row) => mergeProposition(row));
let identical = 0;
for (const row of rows) {
  const a = JSON.stringify(await scoreRecord(row));
  const b = JSON.stringify(await scoreRecord(row));
  if (a === b) identical += 1;
  else console.log(`score-mismatch id=${row.id}`);
}
console.log(`local-propositions=${rows.length} scored-twice-identical=${identical}`);

function sampleFor(field) {
  if (field.type === "checkbox") return true;
  if (field.type === "number") return 18;
  if (field.key === "growthRoute") return "penetration";
  if (field.key === "forumVerdict") return "pass";
  if (field.key === "submitterDepartment") return "R&D";
  if (field.type === "computed-range" || field.key === "marginElasticity") {
    return { minMrpInr: 40, maxMrpInr: 90 };
  }
  if (field.type === "computed-risk" || field.key === "techShiftRisk") {
    return {
      dimensions: {
        functionalCoreStability: { risk: "Low" },
        consumptionContextStability: { risk: "Low" },
        manufacturingDisruptionRisk: { risk: "Low" },
        userHabitShiftPotential: { risk: "Low" },
        adjacentSubstitutionThreat: { risk: "Low" },
        purchaseFrequencyShift: { risk: "Low" },
        regulatoryDisruptionRisk: { risk: "Low" },
      },
    };
  }
  if (field.type === "computed") return 12;
  return "field-ok";
}

function readBack(doc, filterKey, key) {
  if (!filterKey) return doc[key];
  return doc[filterKey]?.[key];
}

const fields = [
  ...PROPOSITION_TOP_FIELDS.map((field) => ({ ...field, filterKey: "" })),
  ...SIX_FILTERS_FORM.flatMap((spec) => [
    { key: "forumVerdict", type: "select", filterKey: spec.key },
    { key: "verdictNote", type: "text", filterKey: spec.key },
    ...spec.fields.map((field) => ({ ...field, filterKey: spec.key })),
  ]),
];

const emptyScore = JSON.stringify(await scoreRecord(emptyPropositionDoc("field-test")));
let roundTrip = 0;
let movesScore = 0;
const broken = [];
const storedOnly = [];
for (const field of fields) {
  const input = emptyPropositionDoc("field-test");
  const value = sampleFor(field);
  if (field.filterKey) input[field.filterKey][field.key] = value;
  else input[field.key] = value;
  const merged = mergeProposition(input);
  const got = readBack(merged, field.filterKey, field.key);
  const kept =
    field.type === "computed-range" || field.key === "marginElasticity"
      ? Number(got?.minMrpInr) === 40 && Number(got?.maxMrpInr) === 90
      : field.type === "computed-risk" || field.key === "techShiftRisk"
        ? got?.dimensions?.functionalCoreStability?.risk === "Low"
        : field.type === "checkbox"
          ? got === true
          : field.type === "computed"
            ? got === 12 || got === null || Number.isFinite(Number(got))
            : got === value;
  if (!kept) broken.push(`${field.filterKey || "top"}.${field.key}`);
  else roundTrip += 1;
  const changed = JSON.stringify(await scoreRecord(merged)) !== emptyScore;
  if (changed) movesScore += 1;
  else storedOnly.push(`${field.filterKey || "top"}.${field.key}`);
}
console.log(`fields=${fields.length} round-trip=${roundTrip} broken=${broken.length} score-moving=${movesScore}`);
if (broken.length) console.log(`broken-fields ${broken.join(" ")}`);
console.log(`stored-only ${storedOnly.join(" ")}`);
