import assert from "node:assert/strict";
import {
  coalescePropositionUpdate,
  createProposition,
  deleteProposition,
  getPropositionById,
  markResearchRun,
  setPropositionDivision,
  updateProposition,
} from "../lib/db.js";
import { computeAllAdvisoryChecks, scoreAdvisoryChecks } from "../lib/propositionScoring.js";
import { researchHashFor } from "../lib/researchCache.js";
import { mergeWorkingProposition, researchPayloadForHash } from "../lib/propositionsApi.js";

const attachment = {
  name: "concept-card-live-check.csv",
  mediaType: "text/csv",
  data: Buffer.from("category,Hair oils\n", "utf8").toString("base64"),
};

const f1 = {
  declaredAttribute: "cooling sensation on the scalp",
  benchmark: "Parachute Advansed",
  declaredGap: 2,
  gapDerivation: "Beat cooling feel by 2 points.",
  growthRoute: "penetration",
  growthArgument: "Summer hair-oil occasions are the growth route.",
  forumVerdict: "",
  verdictNote: "",
};

const f2 = {
  cogsAtScale: 40,
  netMarginAtScale: 20,
  grammage: "100ml",
  gstRatePct: 18,
  mrpInr: "59.00",
  qcomTrajectory: "Commission stays near 15 percent for three years.",
  forumVerdict: "",
  verdictNote: "",
};

const f4 = {
  techShiftRisk: {
    overallRisk: "Medium",
    dimensions: {
      format: { risk: "Low", reason: "Hair oil format stays in daily use" },
    },
  },
  forumVerdict: "",
  verdictNote: "",
};

const findings = {
  f1: {
    benchmarkVerified: true,
    benchmarkEvidence: "Parachute Advansed is a sold hair-oil SKU",
    categorySizeFound: true,
    categorySizeEvidence: "Hair oil is a large Indian category",
    attributeValidation: [
      { stated: "cooling sensation on the scalp", status: "aligned" },
    ],
  },
};

const created = await createProposition({ submitterDepartment: "NPD" });
try {
  const saved = await updateProposition(created.id, {
    name: "ZZ score stability cooling hair oil",
    category: "Hair oils",
    ideaDescription: "A cooling herbal hair oil with menthol.",
    submitterName: "Live Check",
    submitterDepartment: "NPD",
    attachment,
    f1,
    f2,
    f4,
  });
  assert.equal(saved.name, "ZZ score stability cooling hair oil");
  assert.equal(saved.attachment.data, attachment.data);

  await setPropositionDivision(created.id, "Personal Care");
  await markResearchRun(created.id, findings);

  const verdictOnly = await updateProposition(created.id, {
    goNoGo: {
      classification: "NO-GO",
      rationale: "Margin is below the floor.",
      score: { pct: 43, done: 6, total: 14 },
      ideaScale: "10g",
    },
  });
  assert.equal(verdictOnly.name, "ZZ score stability cooling hair oil");
  assert.equal(verdictOnly.category, "Hair oils");
  assert.equal(verdictOnly.ideaDescription, "A cooling herbal hair oil with menthol.");
  assert.equal(verdictOnly.submitterName, "Live Check");
  assert.equal(verdictOnly.attachment?.data, attachment.data);
  assert.equal(verdictOnly.f1.benchmark, "Parachute Advansed");
  assert.equal(verdictOnly.f1.declaredGap, 2);
  assert.equal(Number(verdictOnly.f2.cogsAtScale), 40);
  assert.equal(verdictOnly.f2.grammage, "100ml");
  assert.equal(verdictOnly.division, "Personal Care");
  assert.equal(verdictOnly.goNoGo.classification, "NO-GO");
  assert.equal(verdictOnly.researchFindings.f1.benchmarkVerified, true);

  const reloaded = await getPropositionById(created.id);
  assert.equal(reloaded.name, verdictOnly.name);
  assert.equal(reloaded.attachment.data, attachment.data);
  assert.equal(reloaded.f1.growthArgument, f1.growthArgument);

  const clientResubmit = {
    ...reloaded,
    division: "",
    researchFindings: null,
    researchRunAt: null,
    f4: { forumVerdict: "", verdictNote: "" },
    f3: { marginElasticity: null },
  };
  const merged = mergeWorkingProposition(reloaded, clientResubmit);
  assert.equal(merged.researchFindings.f1.benchmarkVerified, true);
  assert.equal(merged.division, "Personal Care");
  assert.equal(merged.f4.techShiftRisk.overallRisk, "Medium");
  assert.equal(merged.f1.benchmark, "Parachute Advansed");
  assert.equal(Number(merged.f2.cogsAtScale), 40);

  const bare = { ...merged, researchFindings: null };
  const withFindings = await scoreAdvisoryChecks(await computeAllAdvisoryChecks(merged));
  const withoutFindings = await scoreAdvisoryChecks(await computeAllAdvisoryChecks(bare));
  assert.ok(withFindings.pct > withoutFindings.pct, "stored research must change the score");
  const again = await scoreAdvisoryChecks(await computeAllAdvisoryChecks(merged));
  assert.equal(again.pct, withFindings.pct);
  assert.equal(again.done, withFindings.done);
  assert.equal(again.total, withFindings.total);
  assert.deepEqual(again.byFilter, withFindings.byFilter);

  const hashed = researchPayloadForHash(reloaded, clientResubmit);
  assert.equal(researchHashFor(hashed), researchHashFor(reloaded));

  const kept = coalescePropositionUpdate(reloaded, {
    goNoGo: { classification: "WATCH" },
  });
  assert.equal(kept.name, reloaded.name);
  assert.equal(kept.ideaDescription, reloaded.ideaDescription);
  assert.equal(kept.f1.benchmark, "Parachute Advansed");
  assert.equal(kept.attachment.data, attachment.data);

  console.log(
    `PASS score stability: verdict save kept the idea; repeat score ${withFindings.pct}% (${withFindings.done}/${withFindings.total})`
  );
} finally {
  await deleteProposition(created.id);
}
