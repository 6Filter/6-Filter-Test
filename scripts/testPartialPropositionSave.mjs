import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  createProposition,
  getPropositionById,
  mergePropositionPatch,
  updateProposition,
} from "../lib/db.js";
import { computeGoNoGo, scoreAdvisoryChecks } from "../lib/goNoGo.js";
import { computeAllAdvisoryChecks } from "../lib/propositionScoring.js";

const src = readFileSync(new URL("../lib/db.js", import.meta.url), "utf8");
assert.match(src, /export function mergePropositionPatch/);
assert.doesNotMatch(src, /body\.name \?\? ""/);
assert.doesNotMatch(src, /stringifyFilter\(body\.f1\)/);

const stored = {
  name: "Live Check cooling stick",
  category: "Hair oils",
  division: "Personal Care",
  submitterName: "Live Check",
  submitterDepartment: "NPD",
  ideaDescription: "A herbal cooling hair oil stick.",
  attachment: { name: "qa-concept-card.csv", mediaType: "text/csv", data: "YQ==" },
  finalVerdict: "",
  finalVerdictNote: "kept",
  f1: { declaredAttribute: "Cooling feel", forumVerdict: "", verdictNote: "" },
  f2: { cogsAtScale: 40, netMarginAtScale: 55, gstRatePct: 18, grammage: "10g", mrpInr: "104.89" },
  f3: { forumVerdict: "", verdictNote: "" },
  f4: { forumVerdict: "", verdictNote: "" },
  f5: { householdsReachedY3Mn: 2 },
  f6: { forumVerdict: "", verdictNote: "" },
  goNoGo: null,
};

const verdictOnly = mergePropositionPatch(stored, {
  goNoGo: {
    classification: "NO-GO",
    rationale: "Floor.",
    score: { pct: 60, done: 6, total: 10 },
    ideaScale: "100g",
    checkLabels: { f1: "Cleared", f2: "Cleared", f3: "Cleared", f4: "Below floor" },
  },
});
assert.equal(verdictOnly.name, stored.name);
assert.equal(verdictOnly.category, stored.category);
assert.equal(verdictOnly.ideaDescription, stored.ideaDescription);
assert.equal(verdictOnly.attachment.name, "qa-concept-card.csv");
assert.equal(verdictOnly.f2.mrpInr, "104.89");
assert.equal(verdictOnly.f2.cogsAtScale, 40);
assert.equal(verdictOnly.f1.declaredAttribute, "Cooling feel");
assert.equal(verdictOnly.goNoGo.classification, "NO-GO");
assert.equal(verdictOnly.goNoGo.score.pct, 60);
assert.equal(verdictOnly.division, "Personal Care");

const cleared = mergePropositionPatch(stored, { name: "", attachment: null });
assert.equal(cleared.name, "");
assert.equal(cleared.attachment, null);
assert.equal(cleared.category, stored.category);

const locked = mergePropositionPatch(stored, { division: "Foods" });
assert.equal(locked.division, "Personal Care");

const created = await createProposition({ submitterDepartment: "NPD" });
const full = await updateProposition(created.id, {
  name: stored.name,
  category: stored.category,
  division: stored.division,
  submitterName: stored.submitterName,
  submitterDepartment: stored.submitterDepartment,
  ideaDescription: stored.ideaDescription,
  attachment: stored.attachment,
  finalVerdictNote: stored.finalVerdictNote,
  f1: stored.f1,
  f2: stored.f2,
  f5: stored.f5,
});
assert.equal(full.name, stored.name);

const afterVerdict = await updateProposition(created.id, {
  goNoGo: verdictOnly.goNoGo,
});
assert.equal(afterVerdict.name, stored.name);
assert.equal(afterVerdict.category, stored.category);
assert.equal(afterVerdict.ideaDescription, stored.ideaDescription);
assert.equal(afterVerdict.attachment?.name, "qa-concept-card.csv");
assert.equal(afterVerdict.attachment?.data, "YQ==");
assert.equal(String(afterVerdict.f2.gstRatePct), "18");
assert.equal(String(afterVerdict.f2.cogsAtScale), "40");
assert.equal(String(afterVerdict.f2.netMarginAtScale), "55");
assert.equal(afterVerdict.f2.grammage, "10g");
assert.equal(String(afterVerdict.f2.mrpInr), "104.89");
assert.equal(afterVerdict.f1.declaredAttribute, "Cooling feel");
assert.equal(afterVerdict.submitterName, "Live Check");
assert.equal(afterVerdict.goNoGo.classification, "NO-GO");
assert.equal(afterVerdict.goNoGo.score.pct, 60);

const reloaded = await getPropositionById(created.id);
assert.equal(reloaded.name, stored.name);
assert.equal(reloaded.f2.grammage, "10g");
assert.equal(reloaded.goNoGo.score.pct, 60);

async function scoreOf(doc) {
  const checks = await computeAllAdvisoryChecks(doc);
  const score = scoreAdvisoryChecks(checks);
  return `${computeGoNoGo(checks)}|${score.pct}`;
}

const firstScore = await scoreOf(reloaded);
const secondScore = await scoreOf(await getPropositionById(created.id));
assert.equal(firstScore, secondScore);
assert.notEqual(firstScore, "NO-GO|0");

const again = await updateProposition(created.id, { goNoGo: reloaded.goNoGo });
assert.equal(again.name, stored.name);
assert.equal(await scoreOf(again), firstScore);

console.log("partial proposition save keeps fields and the same score", firstScore);
