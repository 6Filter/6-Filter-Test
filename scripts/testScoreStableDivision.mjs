/**
 * A verdict re-read must not drop a stored division and score the same
 * numbers as if no margin floor applied.
 */
import assert from "node:assert/strict";
import path from "node:path";
import { tmpdir } from "node:os";

process.env.PRIMUS_DATA_DIR = path.join(tmpdir(), `primus-score-${process.pid}`);
delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;

const { createProposition, getPropositionById, updateProposition } = await import("../lib/db.js");
const { divisionLockedForScore, handlePropositionGoNogo } = await import("../lib/propositionGateApi.js");
const { sendJson, redactSecrets } = await import("../lib/http.js");

assert.equal(
  divisionLockedForScore({ division: "Personal Care" }, { division: "" }),
  "Personal Care"
);
assert.equal(
  divisionLockedForScore({ division: "Foods" }, { division: "Personal Care" }),
  "Foods"
);
assert.equal(
  divisionLockedForScore({}, { name: "Herbal cooling hair oil", category: "Hair oils" }),
  "Personal Care"
);

const created = await createProposition({ submitterDepartment: "NPD" });
const fields = {
  submitterName: "Live Tester",
  submitterDepartment: "NPD",
  name: "Herbal cooling hair oil",
  category: "Hair oils",
  ideaDescription: "A herbal cooling hair oil with a menthol stick inside the pack.",
  division: "Personal Care",
  f1: {
    declaredAttribute: "cooling",
    benchmark: "Indulekha Bringha Hair Oil 100ml",
    declaredGap: 3,
    growthRoute: "penetration",
    growthArgument: "Low-penetration cooling format inside hair oils.",
  },
  f2: {
    cogsAtScale: 70,
    netMarginAtScale: 22,
    gstRatePct: 18,
    grammage: "100ml",
    mrpInr: "105.90",
    qcomTrajectory: "Flat terms for 3 years",
  },
  f3: { marginElasticity: { minMrpInr: 90, maxMrpInr: 130, minMarginPct: 12, maxMarginPct: 28 } },
  f4: {
    techShiftRisk: {
      overallRisk: "Low",
      dimensions: {
        functionalCoreStability: { risk: "Low", reason: "stable" },
        consumptionContextStability: { risk: "Low", reason: "stable" },
        manufacturingDisruptionRisk: { risk: "Low", reason: "stable" },
        userHabitShiftPotential: { risk: "Low", reason: "stable" },
        adjacentSubstitutionThreat: { risk: "Low", reason: "stable" },
        purchaseFrequencyShift: { risk: "Low", reason: "stable" },
        regulatoryDisruptionRisk: { risk: "Low", reason: "stable" },
      },
    },
  },
};
await updateProposition(created.id, fields);

function captureRes() {
  const captured = [];
  return {
    captured,
    res: {
      statusCode: 0,
      setHeader() {},
      end(body) {
        captured.push(JSON.parse(body));
      },
    },
  };
}

async function readVerdict(proposition) {
  const { captured, res } = captureRes();
  await handlePropositionGoNogo({ method: "POST" }, res, created.id, {
    readBody: async () => ({ proposition }),
    sendJson,
    redactSecrets,
  });
  return captured[0];
}

const withBlankDivision = await readVerdict({ ...fields, id: created.id, division: "" });
const again = await readVerdict({ ...fields, id: created.id, division: "" });
const stored = await getPropositionById(created.id);

assert.equal(withBlankDivision.classification, "NO-GO");
assert.equal(withBlankDivision.goNoGo.checkLabels.f2, "Below floor");
assert.equal(again.classification, withBlankDivision.classification);
assert.equal(again.goNoGo.score.pct, withBlankDivision.goNoGo.score.pct);
assert.equal(again.goNoGo.rationale, withBlankDivision.goNoGo.rationale);
assert.equal(stored.division, "Personal Care");
assert.equal(stored.goNoGo.classification, "NO-GO");
assert.equal(stored.goNoGo.score.pct, withBlankDivision.goNoGo.score.pct);
assert.equal(stored.f2.mrpInr, "105.90");
assert.equal(stored.f1.declaredAttribute, "cooling");

console.log("score stays NO-GO when a verdict re-read omits division");
