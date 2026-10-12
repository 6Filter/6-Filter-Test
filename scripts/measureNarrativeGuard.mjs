/**
 * Read-only measurement of the retuned narrative guard on the restored copy.
 * Prints counts and tokens. Never prints a paragraph.
 */
import { readFileSync } from "node:fs";
import { validateNarrativeParagraph, staticBrandUniverse, benchmarkFromChecks, ideaOwnsBrand, acceptsFigure, distinctiveWords } from "../lib/narrativeCheck.js";
import { evidenceLineForFilter, PRECHANGE_EVIDENCE_LINE } from "../lib/evidenceProvenance.js";
import { storedVerdictWithoutInputs } from "../lib/storedVerdict.js";

function loadEnv(file) {
  try {
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!match || process.env[match[1]]) continue;
      process.env[match[1]] = match[2].replace(/^"|"$/g, "");
    }
  } catch {
    /* optional */
  }
}

loadEnv(".env.local");
delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;

const { readRestoredTable } = await import("./restoredCopy.mjs");
const { publicProposition } = await import("../lib/db.js");
const { computeAllAdvisoryChecks } = await import("../lib/propositionScoring.js");

function brandsOn(doc) {
  const names = [];
  const benchmark = String(doc?.f1?.benchmark || "").trim();
  if (benchmark) names.push(benchmark);
  const competitors = doc?.researchFindings?.f1?.noCompetitorCheck?.majorCompetitorsFound;
  if (Array.isArray(competitors)) names.push(...competitors.map((name) => String(name || "").trim()).filter(Boolean));
  return names;
}

const rows = await readRestoredTable();
const propositions = rows.map((row) => publicProposition(row)).filter(Boolean);

const { randomBytes } = await import("node:crypto");
const pg = (await import("pg")).default;
const { restoredDatabaseUrl } = await import("./restoredCopy.mjs");
const clone = `primus_clone_${randomBytes(6).toString("hex")}`;
const admin = new pg.Client({ connectionString: restoredDatabaseUrl() });
await admin.connect();
await admin.query(`CREATE SCHEMA ${clone}`);
await admin.query(
  `CREATE TABLE ${clone}.division_thresholds (LIKE primus_restored.division_thresholds INCLUDING ALL)`
);
await admin.query(
  `INSERT INTO ${clone}.division_thresholds SELECT * FROM primus_restored.division_thresholds`
);
await admin.end();
process.env.DATABASE_URL = restoredDatabaseUrl();
process.env.PRIMUS_SCHEMA = clone;
const { initDb } = await import("../lib/db.js");
await initDb();
const universe = [...staticBrandUniverse(), ...propositions.flatMap(brandsOn)];
const prepared = [];
for (const proposition of propositions) {
  const narratives = proposition.goNoGo?.filterNarratives;
  if (!narratives) continue;
  const checks = await computeAllAdvisoryChecks(proposition);
  const competitors = Array.isArray(proposition.researchFindings?.f1?.noCompetitorCheck?.majorCompetitorsFound)
    ? proposition.researchFindings.f1.noCompetitorCheck.majorCompetitorsFound
    : [];
  prepared.push({ checks, competitors, narratives });
}

let paragraphs = 0;
let rejected = 0;
let contamination = 0;
const examples = [];
const trials = { brand: 0, rupee: 0, benchmark: 0, status: 0 };
const caught = { brand: 0, rupee: 0, benchmark: 0, status: 0 };

for (const row of prepared) {
  for (const key of ["f1", "f2", "f3", "f4"]) {
    const text = String(row.narratives[key] || "").trim();
    if (!text) continue;
    paragraphs += 1;
    const verdict = validateNarrativeParagraph(text, {
      checks: row.checks,
      check: row.checks[key] || {},
      competitors: row.competitors,
      brandUniverse: universe,
    });
    if (!verdict.ok) {
      rejected += 1;
      if (verdict.reasons.some((reason) => reason === "foreign-brand" || reason === "unknown-rupee" || reason === "unknown-percent")) {
        contamination += 1;
      }
      examples.push(`${key} reason=${verdict.reasons.join("|")} token=${verdict.token} check=${verdict.checkValue}`);
    }

    const ownBenchmark = benchmarkFromChecks({ f1: row.checks[key] || {} });
    const other = universe.find((name) => (
      name.length >= 4
      && !text.toLowerCase().includes(name.toLowerCase())
      && !ideaOwnsBrand(name, ownBenchmark, row.competitors)
    ));
    if (other) {
      trials.brand += 1;
      const injected = validateNarrativeParagraph(`${text} ${other} leads.`, {
        checks: row.checks,
        check: row.checks[key] || {},
        competitors: row.competitors,
        brandUniverse: universe,
      });
      if (!injected.ok && injected.reasons.includes("foreign-brand")) caught.brand += 1;
    }

    const rupee = text.match(/(?:₹|Rs\.?)\s*([0-9][0-9,]*(?:\.[0-9]+)?)/i);
    if (rupee) {
      const doubledValue = Number(rupee[1].replace(/,/g, "")) * 2;
      if (!acceptsFigure(doubledValue, row.checks)) {
        trials.rupee += 1;
        const doubled = text.replace(rupee[0], `₹${doubledValue}`);
        const injected = validateNarrativeParagraph(doubled, {
          checks: row.checks,
          check: row.checks[key] || {},
          competitors: row.competitors,
          brandUniverse: universe,
        });
        if (!injected.ok && injected.reasons.includes("unknown-rupee")) caught.rupee += 1;
      }
    }

    if (ownBenchmark && distinctiveWords(ownBenchmark).some((word) => text.toLowerCase().includes(word))) {
      trials.benchmark += 1;
      let stripped = text;
      for (const word of distinctiveWords(ownBenchmark)) {
        stripped = stripped.replace(new RegExp(word, "ig"), "product");
      }
      const injected = validateNarrativeParagraph(stripped, {
        checks: row.checks,
        check: row.checks[key] || {},
        competitors: row.competitors,
        brandUniverse: universe,
      });
      if (!injected.ok && injected.reasons.includes("missing-benchmark")) caught.benchmark += 1;
    }

    const label = row.checks[key]?.checkLabel;
    if (label === "Cleared" || label === "Below floor") {
      trials.status += 1;
      const flipped = label === "Cleared" ? `${text} This sits below the floor.` : `${text} This filter is cleared.`;
      const injected = validateNarrativeParagraph(flipped, {
        checks: row.checks,
        check: row.checks[key] || {},
        competitors: row.competitors,
        brandUniverse: universe,
      });
      if (!injected.ok && injected.reasons.includes("contradicts-status")) caught.status += 1;
    }
  }
}

const lineTypes = { "not-recorded": 0, "recorded": 0, "no-line": 0 };
let missingInputs = 0;
for (const proposition of propositions) {
  if (storedVerdictWithoutInputs(proposition)) missingInputs += 1;
  const lines = ["f1", "f2", "f3", "f4", "f5"].map((key) => evidenceLineForFilter(key, proposition)).filter(Boolean);
  if (!lines.length) lineTypes["no-line"] += 1;
  else if (lines.every((line) => line === PRECHANGE_EVIDENCE_LINE)) lineTypes["not-recorded"] += 1;
  else lineTypes.recorded += 1;
}

const trialTotal = Object.values(trials).reduce((sum, count) => sum + count, 0);
const caughtTotal = Object.values(caught).reduce((sum, count) => sum + count, 0);
console.log(`ideas=${propositions.length} paragraphs=${paragraphs} rejected=${rejected} falsePositiveRate=${paragraphs ? (rejected / paragraphs).toFixed(4) : "0"}`);
console.log(`contamination=${contamination}`);
console.log(`recallTrials=${trialTotal} recallCaught=${caughtTotal} recall=${trialTotal ? (caughtTotal / trialTotal).toFixed(4) : "0"}`);
for (const key of Object.keys(trials)) console.log(`recall.${key}=${caught[key]}/${trials[key]}`);
console.log(`missingInputs=${missingInputs}`);
for (const [kind, count] of Object.entries(lineTypes)) console.log(`line.${kind}=${count}`);
console.log("rejections:");
for (const line of examples) console.log(line);
const { closeDatabase } = await import("../lib/db.js");
await closeDatabase();
const drop = new pg.Client({ connectionString: restoredDatabaseUrl() });
await drop.connect();
await drop.query(`DROP SCHEMA IF EXISTS ${clone} CASCADE`);
await drop.end();
process.exit(0);
