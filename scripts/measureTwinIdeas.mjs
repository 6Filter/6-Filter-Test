/**
 * Two new propositions, same research inputs, different names and teams.
 * Prints scores and ledger rows only. Does not print idea text.
 */
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";

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

const ideas = JSON.parse(await readFile("data/gold/ideas.json", "utf8"));
const source = ideas[0];
const { initDb, saveResearchCache } = await import("../lib/db.js");
const { runPropositionResearch } = await import("../lib/propositionAiFirstPass.js");
const { researchHashFor } = await import("../lib/researchCache.js");
const { composeProductIdeaText } = await import("../lib/gstRate.js");
const { runWithLlm } = await import("../lib/llmContext.js");
const { openSubmissionCost, currentSubmissionCost, closeSubmissionCost } = await import("../lib/submissionCost.js");
const { listLlmCalls } = await import("../lib/llmUsage.js");
const { computeAllAdvisoryChecks } = await import("../lib/propositionScoring.js");
const { computeGoNoGo, scoreAdvisoryChecks } = await import("../lib/goNoGo.js");
const { computeIdeaRevenueCr } = await import("../lib/ideaScale.js");
const { computeDerivedMrp } = await import("../lib/f2Derived.js");
const { usdFromUsage } = await import("../lib/goldBudget.js");

function blankCost(proposition, name, id) {
  return {
    ...proposition,
    id,
    name,
    submitterDepartment: "",
    f2: {
      ...(proposition.f2 || {}),
      cogsAtScale: "",
      netMarginAtScale: "",
      gstRatePct: "",
      grammage: "",
      mrpInr: "",
      qcomTrajectory: "",
    },
    f3: { ...(proposition.f3 || {}), marginElasticity: null },
    f5: {
      forumVerdict: proposition.f5?.forumVerdict || "",
      verdictNote: proposition.f5?.verdictNote || "",
    },
    researchFindings: null,
    researchRunAt: null,
  };
}

function snapshot(proposition, research) {
  const suggestions = research?.suggestions || {};
  const f2 = suggestions.f2 || {};
  const range = suggestions.f3?.marginElasticity || {};
  const f5 = { ...(proposition.f5 || {}), ...(suggestions.f5 || {}) };
  const mrp =
    Number(f2.mrpInr) > 0
      ? Number(f2.mrpInr)
      : computeDerivedMrp(f2.cogsAtScale, f2.netMarginAtScale, f2.gstRatePct);
  const merged = {
    ...proposition,
    f1: { ...(proposition.f1 || {}), ...(suggestions.f1 || {}) },
    f2: { ...(proposition.f2 || {}), ...f2 },
    f3: { ...(proposition.f3 || {}), ...(suggestions.f3 || {}) },
    f4: { ...(proposition.f4 || {}), ...(suggestions.f4 || {}) },
    f5,
    researchFindings: research?.researchFindings || null,
  };
  return computeAllAdvisoryChecks(merged).then((checks) => ({
    grammage: f2.grammage || "",
    mrp: mrp == null ? null : Math.round(Number(mrp) * 100) / 100,
    f3Min: range.minMrpInr ?? null,
    f3Max: range.maxMrpInr ?? null,
    f5Revenue: computeIdeaRevenueCr(f5),
    score: scoreAdvisoryChecks(checks).pct,
    verdict: computeGoNoGo(checks),
  }));
}

await initDb();
const first = blankCost(source, "Twin A", randomUUID());
const second = blankCost(source, "Twin B", randomUUID());
const inputHash = researchHashFor(first);
const ideaFor = (row) =>
  composeProductIdeaText({
    name: row.name,
    category: row.category,
    ideaDescription: row.ideaDescription,
  });

async function runOne(row, department, forceFresh) {
  openSubmissionCost(row.id);
  const research = await runWithLlm(
    "claude",
    () =>
      runPropositionResearch({
        ideaText: ideaFor(row),
        proposition: row,
        division: row.division || "",
        inputHash,
        forceFresh,
      }),
    { department }
  );
  const bag = currentSubmissionCost() || {};
  closeSubmissionCost();
  if (forceFresh) {
    await saveResearchCache(inputHash, {
      researchFindings: research.researchFindings || {},
      suggestions: research.suggestions,
      sources: research.sources,
      notCovered: research.notCovered,
      division: row.division || research.division || "",
      providerUsed: "claude",
    });
  }
  const fields = await snapshot(row, research);
  return {
    id: row.id,
    department,
    calls: bag.calls || 0,
    usd: usdFromUsage({
      inputTokens: bag.inputTokens || 0,
      outputTokens: bag.outputTokens || 0,
      cacheRead: bag.cacheRead || 0,
      cacheWrite: bag.cacheWrite || 0,
      searches: bag.searches || 0,
    }),
    events: bag.events || [],
    fields,
  };
}

const a = await runOne(first, "R&D", true);
const b = await runOne(second, "CIA", false);
console.log(`twin-a id=${a.id} department=R&D calls=${a.calls} usd=${a.usd.toFixed(4)}`);
console.log(`twin-b id=${b.id} department=CIA calls=${b.calls} usd=${b.usd.toFixed(4)}`);
console.log(`fields-a ${JSON.stringify(a.fields)}`);
console.log(`fields-b ${JSON.stringify(b.fields)}`);
console.log(`fields-match=${JSON.stringify(a.fields) === JSON.stringify(b.fields)}`);
const ledger = await listLlmCalls();
const ids = new Set([a.id, b.id]);
for (const row of ledger.filter((item) => ids.has(item.proposition_id))) {
  console.log(
    `ledger dept=${row.department} label=${row.label} prefix=${row.prefix_hash || "-"} ` +
      `read=${row.cache_read_tokens} write=${row.cache_write_tokens} ` +
      `start=${row.started_at} end=${row.ended_at} prop=${row.proposition_id === a.id ? "A" : "B"}`
  );
}
