/**
 * Part 139 A — every form box has a plain-words role, and each role does what it says
 * when run through the real scoring (computeAllAdvisoryChecks) with over-generous web assessments.
 */
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;
process.env.PRIMUS_DATA_DIR = mkdtempSync(path.join(tmpdir(), "primus-field-roles-"));
process.env.REQUIRE_AUTH = "false";

const { initDb } = await import("../lib/db.js");
await initDb();

const roles = await import("../lib/fieldRoles.js");
const {
  FIELD_ROLES,
  ROLE_LABEL,
  ROLE_MEANING,
  ROLE_KEYS,
  ROLES_RESERVED_UNUSED,
  SKIPPABLE_GROUPS,
  assertEveryFormFieldHasRole,
  effectiveRole,
  formFieldPaths,
  getFieldRole,
  isNewMarketRoute,
  roleKeyFor,
  roleLabel,
  roleMeaning,
  roleNote,
  submitBarMessage,
  submitChecklist,
} = roles;
const { SIX_FILTERS_FORM, PROPOSITION_TOP_FIELDS, emptyPropositionDoc } = await import("../lib/propositionFields.js");
const { computeAllAdvisoryChecks } = await import("../lib/propositionScoring.js");
const { scoreAdvisoryChecks, computeGoNoGo } = await import("../lib/goNoGo.js");
const { TECH_SHIFT_DIMENSIONS } = await import("../lib/techShiftRisk.js");

let checks = 0;
async function check(name, fn) {
  try {
    await fn();
    checks += 1;
  } catch (e) {
    e.message = `${name}: ${e.message}`;
    throw e;
  }
}

// computeAllAdvisoryChecks logs every recompute — keep the test output readable.
async function quietly(fn) {
  const log = console.log;
  console.log = () => {};
  try {
    return await fn();
  } finally {
    console.log = log;
  }
}

// ───────────────────────────── the over-generous idea ─────────────────────────────

const SRC = "https://fieldroles.example/evidence";
const strongClaim = { relevance: "strong", specific: true, supported: true, source_url: SRC, quote: "q" };
const okAssess = (raw) => ({ status: "ok", searchUsed: true, raw, returnedSources: [SRC] });

function f4Assessments() {
  const out = {};
  for (const k of TECH_SHIFT_DIMENSIONS) {
    out[k] = okAssess({ rating: "Low", supported: true, source_url: SRC, quote: "q" });
  }
  return out;
}

function fullDoc() {
  const doc = emptyPropositionDoc("field-roles");
  Object.assign(doc, {
    name: "Cooling hair oil",
    category: "Hair oils",
    division: "Beverages",
    ideaDescription: "A cooling herbal hair oil for hot-weather use.",
    submitterName: "Tester",
    submitterDepartment: "R&D",
  });
  doc.f1 = {
    ...doc.f1,
    declaredAttribute: "Hair feels soft after wash",
    declaredAttribute2: "Fragrance that lasts",
    declaredAttribute3: "No residue feel",
    evidenceSourceDate: "https://fieldroles.example/source",
    evidenceSourceFile: { name: "study.pdf", size: 1200 },
    benchmark: "Lipton Ice Tea Lemon 250 ml",
    declaredGap: 3,
    gapDerivation: "We beat the benchmark on softness after wash by three points.",
    parityExceptions: "May lose on price versus the benchmark.",
    targetConsumer: "Young urban users new to the brand",
    growthRoute: "penetration",
    growthArgument: "Penetration is low and a cooling claim is unserved in this category.",
    pureCommodity: false,
  };
  doc.f2 = {
    ...doc.f2,
    cogsAtScale: 8,
    netMarginAtScale: 30,
    gstRatePct: 12,
    grammage: "250 ml",
    mrpInr: 20,
    qcomTrajectory: "Flat commission expected",
    financeSigned: true,
  };
  doc.f3 = { ...doc.f3, plannedAnnualIncreasePct: 5 };
  doc.f4 = {
    ...doc.f4,
    techShiftRisk: {
      dimensions: Object.fromEntries(
        TECH_SHIFT_DIMENSIONS.map((k) => [k, { risk: "Low", reason: `Stable for ${k}` }])
      ),
      aiSourced: false,
    },
    f4MitigationResponses: { functionalCoreStability: "Contracts signed with two suppliers." },
  };
  doc.f5 = {
    ...doc.f5,
    householdsReachedY3Mn: 5,
    trialRatePct: 20,
    repeatConversionPct: 40,
    purchaseFrequencyYr: 6,
    avgPackValueInr: 60,
    computedRevenue: 14.4,
    cmiHeadSigned: true,
  };
  doc.f6 = {
    ...doc.f6,
    labGapVsBenchmark: 2.5,
    consumerPanelBeaters: 19,
    availabilityCount: 8,
    packStandoutGap: 2,
    bmAttendedAll30: true,
    packQualityParity: true,
  };
  doc.researchFindings = {
    f1: {
      benchmarkVerified: true,
      assessments: {
        benchmark: okAssess({ relevance: "strong", source_url: SRC, reason: "same shelf" }),
        attributes: okAssess({ relevance: "strong", specific: true }),
        derivation: okAssess(strongClaim),
        parity: okAssess(strongClaim),
        route: okAssess({ matches: "yes", confidence: "high", expected: "penetration" }),
        argument: okAssess(strongClaim),
      },
    },
    f2: { assessments: { gst: okAssess({ verdict: "supported" }) } },
    // No fixed price point is crossed, so Filter 3 clears with no volume-loss evidence needed.
    f3: { priceEvents: { annualIncreasePct: 0, events: [] } },
    f4: { assessments: f4Assessments() },
  };
  return doc;
}

/** Blank one box the way a person clearing it would. */
function blankBox(doc, p) {
  const next = structuredClone(doc);
  const [fk, key] = p.includes(".") ? p.split(".") : [null, p];
  const target = fk ? next[fk] : next;
  const was = target[key];
  if (p === "f4.techShiftRisk" || p === "f4.f4MitigationResponses") target[key] = null;
  else if (typeof was === "boolean") target[key] = false;
  else target[key] = "";
  if (p === "f1.evidenceSourceDate") target.evidenceSourceFile = null;
  return next;
}

async function scoreOf(doc) {
  const advisory = await quietly(() => computeAllAdvisoryChecks(doc));
  const score = scoreAdvisoryChecks(advisory);
  return { advisory, pct: score.pct, points: score.points, classification: computeGoNoGo(advisory) };
}

const FIXED_EPS = 1e-6;
const full = fullDoc();
const base = await scoreOf(full);

// ───────────────────────────── 1. coverage ─────────────────────────────

await check("R1 every form path has a role", () => {
  const n = assertEveryFormFieldHasRole();
  const expected =
    PROPOSITION_TOP_FIELDS.length + SIX_FILTERS_FORM.reduce((sum, s) => sum + s.fields.length, 0);
  assert.equal(n, expected);
  assert.equal(formFieldPaths().length, expected);
  for (const p of formFieldPaths()) assert.ok(getFieldRole(p), `role for ${p}`);
});

await check("assertEveryFormFieldHasRole throws when a box has no role", () => {
  const spec = SIX_FILTERS_FORM.find((s) => s.key === "f3");
  const extra = { key: "madeUpBox", label: "x", owners: [], type: "text" };
  spec.fields.push(extra);
  try {
    assert.throws(() => assertEveryFormFieldHasRole(), /f3\.madeUpBox/);
  } finally {
    spec.fields.pop();
  }
  assert.doesNotThrow(() => assertEveryFormFieldHasRole());
});

await check("every role appears on at least one box (filled-by-ai is reserved, kept for completeness)", () => {
  const used = new Set(Object.values(FIELD_ROLES).map((e) => e.role));
  for (const r of ROLE_KEYS) {
    if (ROLES_RESERVED_UNUSED.includes(r)) continue;
    assert.ok(used.has(r), `no box has the role "${r}"`);
  }
  assert.deepEqual([...ROLES_RESERVED_UNUSED], ["filled-by-ai"], "only filled-by-ai may be unused");
  assert.equal(effectiveRole("f2.cogsAtScale", full), "needed-for-verdict", "D59: COGS is needed for a verdict");
  for (const e of Object.values(FIELD_ROLES)) assert.ok(ROLE_LABEL[e.role] && ROLE_MEANING[e.role]);
});

await check("the roles are the ones the owner listed", () => {
  const expect = {
    submitterName: "required",
    submitterDepartment: "required",
    name: "required",
    category: "required",
    ideaDescription: "required",
    "f1.declaredAttribute": "scored",
    "f1.declaredAttribute2": "optional",
    "f1.declaredAttribute3": "optional",
    "f1.evidenceSourceDate": "optional",
    "f1.benchmark": "scored",
    "f1.declaredGap": "scored",
    "f1.gapDerivation": "scored",
    "f1.parityExceptions": "scored",
    "f1.growthRoute": "scored",
    "f1.growthArgument": "scored",
    "f1.targetConsumer": "optional",
    "f1.pureCommodity": "changes-checks",
    "f2.cogsAtScale": "needed-for-verdict",
    "f2.netMarginAtScale": "needed-for-verdict",
    "f2.gstRatePct": "needed-for-verdict",
    "f2.grammage": "scored",
    "f2.mrpInr": "optional",
    "f2.qcomTrajectory": "optional",
    "f2.financeSigned": "optional",
    "f3.plannedAnnualIncreasePct": "optional",
    "f4.techShiftRisk": "scored",
    "f4.f4MitigationResponses": "optional",
  };
  for (const [p, r] of Object.entries(expect)) assert.equal(getFieldRole(p).role, r, p);
  for (const spec of SIX_FILTERS_FORM) {
    if (spec.key !== "f5" && spec.key !== "f6") continue;
    for (const f of spec.fields) {
      assert.equal(getFieldRole(`${spec.key}.${f.key}`).role, "not-in-score", `${spec.key}.${f.key}`);
    }
  }
});

await check("lookups: roleKeyFor, label, meaning, note", () => {
  assert.equal(roleKeyFor("f1.benchmark"), "f1.benchmark");
  assert.equal(roleKeyFor("name"), "name");
  assert.equal(roleKeyFor("top.name"), "name");
  assert.equal(roleKeyFor("f1.nope"), null);
  assert.equal(getFieldRole("f1.nope"), null);
  assert.equal(roleLabel("f2.grammage", full), "Scored");
  assert.equal(roleMeaning("f2.grammage", full), ROLE_MEANING.scored);
  assert.equal(roleNote("f1.declaredAttribute", full), "Your intended USP — research checks it.");
  assert.equal(roleNote("f1.declaredAttribute2", full), "2nd of the top-3");
  assert.equal(roleNote("f1.declaredAttribute3", full), "3rd of the top-3");
  assert.equal(roleNote("f2.cogsAtScale", full), "The AI fills this; type it if the AI could not.");
  assert.match(roleNote("f2.netMarginAtScale", full), /^Starts at the division minimum/);
  assert.match(roleNote("f2.gstRatePct", full), /^You enter this\./);
  assert.equal(roleNote("f2.grammage", full), "Needs a number and a unit (g, ml, …).");
  assert.equal(roleLabel("zzz", full), "");
});

await check("benchmark: Scored normally, Optional under New market", () => {
  const nm = { ...full, f1: { ...full.f1, growthRoute: "new-market" } };
  assert.equal(isNewMarketRoute(full), false);
  assert.equal(isNewMarketRoute(nm), true);
  assert.equal(isNewMarketRoute({ f1: { growthRoute: "New market" } }), true);
  assert.equal(effectiveRole("f1.benchmark", full), "scored");
  assert.equal(effectiveRole("f1.benchmark", nm), "optional");
  assert.equal(roleLabel("f1.benchmark", nm), "Optional");
  assert.equal(roleNote("f1.benchmark", full), "Not needed when your growth route is New market");
  assert.match(roleNote("f1.benchmark", nm), /New market/);
  assert.equal(effectiveRole("f1.benchmark", {}), "scored");
});

// ───────────────────────────── 2. roles do what they say (real scoring) ─────────────────────────────

await check("baseline: the over-generous idea scores full marks and reads GO", () => {
  assert.equal(base.classification, "GO");
  assert.equal(base.pct, 100);
  assert.ok(base.points >= 18 - FIXED_EPS, `points ${base.points}`);
});

const OPTION_LIKE = ["optional", "not-in-score", "filled-by-ai"];
const scoredPaths = Object.keys(FIELD_ROLES).filter((p) => FIELD_ROLES[p].role === "scored");

await check("blanking any optional / not-in-score / filled-by-ai box changes neither the percent nor the verdict", async () => {
  let n = 0;
  for (const p of Object.keys(FIELD_ROLES)) {
    if (!OPTION_LIKE.includes(effectiveRole(p, full))) continue;
    const r = await scoreOf(blankBox(full, p));
    assert.equal(r.pct, base.pct, `${p}: pct`);
    assert.ok(Math.abs(r.points - base.points) < FIXED_EPS, `${p}: points ${r.points} vs ${base.points}`);
    assert.equal(r.classification, base.classification, `${p}: classification`);
    n += 1;
  }
  assert.ok(n >= 20, `tested ${n} boxes`);
});

await check("blanking any scored box loses at least one point", async () => {
  assert.ok(scoredPaths.length >= 9);
  for (const p of scoredPaths) {
    const r = await scoreOf(blankBox(full, p));
    const lost = base.points - r.points;
    assert.ok(lost >= 1 - FIXED_EPS, `${p}: lost only ${lost} point(s)`);
    assert.ok(r.pct < base.pct, `${p}: percent did not fall`);
  }
});

await check("blanking a needed-for-verdict box leaves the verdict INCOMPLETE (no GO)", async () => {
  const ps = Object.keys(FIELD_ROLES).filter((p) => FIELD_ROLES[p].role === "needed-for-verdict");
  assert.deepEqual(ps.sort(), ["f2.cogsAtScale", "f2.gstRatePct", "f2.netMarginAtScale"]);
  for (const p of ps) {
    const r = await scoreOf(blankBox(full, p));
    assert.equal(r.classification, "INCOMPLETE", `${p}: ${r.classification}`);
    assert.notEqual(r.classification, "GO", `${p}: still GO`);
  }
});

await check("benchmark left blank under New market does not cost a point", async () => {
  const nm = { ...structuredClone(full), f1: { ...full.f1, growthRoute: "new-market" } };
  const nmBase = await scoreOf(nm);
  assert.equal(nmBase.classification, "GO");
  const blanked = await scoreOf(blankBox(nm, "f1.benchmark"));
  assert.equal(blanked.pct, nmBase.pct);
  assert.ok(Math.abs(blanked.points - nmBase.points) < FIXED_EPS, "points unchanged");
  assert.equal(blanked.classification, nmBase.classification);
  // …but the same blank box on a Penetration idea does cost.
  const cost = await scoreOf(blankBox(full, "f1.benchmark"));
  assert.ok(base.points - cost.points >= 1 - FIXED_EPS);
});

await check("a changes-the-checks switch changes which checks apply", async () => {
  const weak = blankBox(full, "f1.gapDerivation");
  const before = await scoreOf(weak);
  const after = await scoreOf({ ...weak, f1: { ...weak.f1, pureCommodity: true } });
  assert.ok(after.points > before.points, "pure commodity exempts the differentiation checks");
  assert.equal(getFieldRole("f1.pureCommodity").role, "changes-checks");
});

// ───────────────────────────── 3. plain words ─────────────────────────────

await check("role words are exactly the D58 words", () => {
  assert.deepEqual(
    { ...ROLE_LABEL },
    {
      required: "Required",
      "needed-for-verdict": "Needed for a verdict",
      scored: "Scored",
      "filled-by-ai": "Filled by AI",
      optional: "Optional",
      "changes-checks": "Changes the checks",
      "not-in-score": "Not in the score",
    }
  );
  assert.deepEqual(Object.keys(ROLE_MEANING).sort(), Object.keys(ROLE_LABEL).sort());
  assert.equal(ROLE_MEANING.required, "You cannot submit without this.");
  assert.equal(ROLE_MEANING["needed-for-verdict"], "Without this, no GO / NO-GO / WATCH verdict can be given.");
  assert.equal(ROLE_MEANING.scored, "Blank, or found wrong by the web check, loses a point.");
  assert.equal(ROLE_MEANING["filled-by-ai"], "Check it or type over it; you do not have to fill it yourself.");
  assert.equal(ROLE_MEANING.optional, "Skip it and your score does not change.");
  assert.equal(ROLE_MEANING["changes-checks"], "A switch, not a question — it changes which checks apply.");
  assert.equal(ROLE_MEANING["not-in-score"], "Sizes the idea or gates the prototype; it is outside the percent score.");
  assert.ok(Object.isFrozen(ROLE_LABEL) && Object.isFrozen(ROLE_MEANING));
});

const JARGON = /\b(slot|credit|relevance|denominator|assessment|mark-?down|marked down|shadow|adequate|formAdmin|sentinel|D\d{2}|Part \d+|null|undefined|JSON|payload|enum|boolean)\b/i;

await check("no jargon in role words, meanings, notes, box names or the submit message", () => {
  const texts = [...Object.values(ROLE_LABEL), ...Object.values(ROLE_MEANING)];
  for (const e of Object.values(FIELD_ROLES)) texts.push(e.label, e.note || "", e.unless?.note || "");
  const empty = emptyPropositionDoc("x");
  texts.push(submitBarMessage(empty), submitBarMessage(full), ...SKIPPABLE_GROUPS.map((g) => g.label));
  texts.push(submitChecklist(empty).skippableSummary);
  for (const t of texts) assert.doesNotMatch(t, JARGON, `jargon in: ${t}`);
});

await check("helper text no longer repeats the role (Required — / Optional — / Optional but recommended —)", () => {
  const helpers = [];
  for (const f of PROPOSITION_TOP_FIELDS) if (f.helper) helpers.push(f.helper);
  for (const s of SIX_FILTERS_FORM) for (const f of s.fields) if (f.helper) helpers.push(f.helper);
  for (const h of helpers) {
    assert.doesNotMatch(h, /^\s*(Required|Optional)\b/i, h);
    assert.doesNotMatch(h, /^\s*Optional but recommended/i, h);
  }
  const f1 = SIX_FILTERS_FORM.find((s) => s.key === "f1").fields;
  const f2 = SIX_FILTERS_FORM.find((s) => s.key === "f2").fields;
  assert.match(f1.find((f) => f.key === "declaredAttribute").helper, /^Your intended USP\. Research will check/);
  assert.equal(f1.find((f) => f.key === "declaredAttribute2").helper, "2nd of the top-3");
  assert.equal(f1.find((f) => f.key === "declaredAttribute3").helper, "3rd of the top-3");
  assert.match(f1.find((f) => f.key === "targetConsumer").helper, /^Helps the AI check/);
  const grammage = f2.find((f) => f.key === "grammage").helper;
  assert.doesNotMatch(grammage, /Not scored/i, "pack size is scored — helper must not say otherwise");
  assert.match(grammage, /number and a unit/);
});

// ───────────────────────────── 4. the Before-you-submit card ─────────────────────────────

const D60_ALL = "Attributes 2 and 3, Evidence source, Who is this for?, Quick-commerce notes, Filter 5, Filter 6";

await check("submitChecklist on an empty idea", () => {
  const c = submitChecklist(emptyPropositionDoc("x"));
  assert.equal(c.requiredLeftCount, 5);
  assert.equal(c.requiredEmpty.length, 5);
  assert.equal(c.requiredLeft.length, 5);
  assert.deepEqual(
    c.requiredEmpty.map((i) => i.path).sort(),
    ["category", "ideaDescription", "name", "submitterDepartment", "submitterName"]
  );
  assert.ok(c.requiredEmpty.every((i) => i.label));
  assert.equal(c.verdictEmptyCount, 3);
  assert.deepEqual(
    c.verdictEmpty.map((i) => i.path).sort(),
    ["f2.cogsAtScale", "f2.gstRatePct", "f2.netMarginAtScale"]
  );
  assert.equal(c.scoredEmptyCount, 8);
  assert.deepEqual(
    c.scoredEmpty.map((i) => i.path).sort(),
    [
      "f1.benchmark",
      "f1.declaredAttribute",
      "f1.declaredGap",
      "f1.gapDerivation",
      "f1.growthArgument",
      "f1.growthRoute",
      "f1.parityExceptions",
      "f2.grammage",
    ]
  );
  assert.equal(c.skippableSummary, D60_ALL);
  assert.equal(SKIPPABLE_GROUPS.map((g) => g.label).join(", "), D60_ALL);
});

await check("submitChecklist on the full idea has nothing left", () => {
  const c = submitChecklist(full);
  assert.equal(c.requiredLeftCount, 0);
  assert.equal(c.scoredEmptyCount, 0);
  assert.equal(c.verdictEmptyCount, 0);
  assert.equal(c.skippableSummary, "");
  assert.equal(submitBarMessage(full), "Ready to submit. Every scored box is filled.");
});

await check("submitChecklist counts New market correctly", () => {
  const empty = emptyPropositionDoc("x");
  const plain = submitChecklist(empty);
  const nm = submitChecklist({ ...empty, f1: { ...empty.f1, growthRoute: "new-market" } });
  // Route is now filled (−1) and the benchmark is no longer needed (−1).
  assert.equal(nm.scoredEmptyCount, plain.scoredEmptyCount - 2);
  assert.ok(!nm.scoredEmpty.some((i) => i.path === "f1.benchmark"));
  assert.ok(!nm.scoredEmpty.some((i) => i.path === "f1.growthRoute"));
  // Same route chosen, only the benchmark empty vs filled.
  const nmFull = { ...structuredClone(full), f1: { ...full.f1, growthRoute: "new-market", benchmark: "" } };
  assert.equal(submitChecklist(nmFull).scoredEmptyCount, 0);
  const penFull = { ...structuredClone(full), f1: { ...full.f1, benchmark: "" } };
  const pen = submitChecklist(penFull);
  assert.equal(pen.scoredEmptyCount, 1);
  assert.equal(pen.scoredEmpty[0].path, "f1.benchmark");
});

await check("submitChecklist counts each empty box once, and skips what is filled", () => {
  const partial = structuredClone(full);
  partial.submitterName = "  ";
  partial.f1.declaredGap = "";
  partial.f1.declaredAttribute2 = "";
  partial.f1.evidenceSourceDate = "";
  partial.f1.evidenceSourceFile = null;
  partial.f2.cogsAtScale = "";
  partial.f5.trialRatePct = "";
  const c = submitChecklist(partial);
  assert.equal(c.requiredLeftCount, 1);
  assert.equal(c.requiredEmpty[0].path, "submitterName");
  assert.deepEqual(c.scoredEmpty.map((i) => i.path), ["f1.declaredGap"]);
  assert.deepEqual(c.verdictEmpty.map((i) => i.path), ["f2.cogsAtScale"]);
  assert.equal(c.skippableSummary, "Attribute 2, Evidence source, Filter 5");
  // An uploaded file counts as an evidence source.
  const withFile = structuredClone(partial);
  withFile.f1.evidenceSourceFile = { name: "a.pdf", size: 5 };
  assert.ok(!submitChecklist(withFile).skippableSummary.includes("Evidence source"));
});

await check("submitBarMessage uses plain words for each state", () => {
  const empty = emptyPropositionDoc("x");
  assert.equal(
    submitBarMessage(empty),
    "5 required boxes left before you can submit. Cost to make one unit (COGS), Net margin at scale, GST rate are needed for a verdict."
  );
  const oneLeft = { ...structuredClone(full), name: "" };
  assert.equal(submitBarMessage(oneLeft), "1 required box left before you can submit.");

  const noCost = structuredClone(full);
  noCost.f2.cogsAtScale = "";
  const m1 = submitBarMessage(noCost);
  assert.match(m1, /^Ready to submit\./);
  assert.match(m1, /Cost to make one unit \(COGS\) is needed for a verdict\.$/);

  const noGap = structuredClone(full);
  noGap.f1.declaredGap = "";
  const m2 = submitBarMessage(noGap);
  assert.equal(m2, "Ready to submit. 1 scored box is still empty — each one costs a point.");
});

console.log(
  `testFieldRoles: ${checks} checks passed — ${formFieldPaths().length} form boxes, ` +
    `${scoredPaths.length} scored, baseline ${base.classification} ${base.pct}% (${base.points} points)`
);
