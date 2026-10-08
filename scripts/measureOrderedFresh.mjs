/**
 * One fresh idea after the prefix gate. Prints token totals only.
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

const source = JSON.parse(await readFile("data/gold/ideas.json", "utf8"))[0];
const { initDb } = await import("../lib/db.js");
const { runPropositionResearch } = await import("../lib/propositionAiFirstPass.js");
const { composeProductIdeaText } = await import("../lib/gstRate.js");
const { runWithLlm } = await import("../lib/llmContext.js");
const { openSubmissionCost, currentSubmissionCost, closeSubmissionCost } = await import("../lib/submissionCost.js");
const { usdFromUsage } = await import("../lib/goldBudget.js");

await initDb();
const row = {
  ...source,
  id: randomUUID(),
  name: "Ordered fresh",
  f2: { ...(source.f2 || {}), cogsAtScale: "", netMarginAtScale: "", gstRatePct: "", grammage: "", mrpInr: "" },
};
openSubmissionCost(row.id);
await runWithLlm(
  "claude",
  () =>
    runPropositionResearch({
      ideaText: composeProductIdeaText({
        name: row.name,
        category: row.category,
        ideaDescription: row.ideaDescription,
      }),
      proposition: row,
      division: row.division || "",
      forceFresh: true,
    }),
  { department: "R&D" }
);
const bag = currentSubmissionCost() || {};
closeSubmissionCost();
const usd = usdFromUsage({
  inputTokens: bag.inputTokens || 0,
  outputTokens: bag.outputTokens || 0,
  cacheRead: bag.cacheRead || 0,
  cacheWrite: bag.cacheWrite || 0,
  searches: bag.searches || 0,
});
const events = bag.events || [];
let overlapWrites = 0;
for (let i = 0; i < events.length; i += 1) {
  for (let j = i + 1; j < events.length; j += 1) {
    const a = events[i];
    const b = events[j];
    if (!a.prefixHash || a.prefixHash !== b.prefixHash) continue;
    if (!(a.cacheWrite > 0 && b.cacheWrite > 0)) continue;
    if (a.startedAt < b.endedAt && b.startedAt < a.endedAt) overlapWrites += 1;
  }
}
console.log(
  `after calls=${bag.calls || 0} in=${bag.inputTokens || 0} out=${bag.outputTokens || 0} ` +
    `cache_read=${bag.cacheRead || 0} cache_write=${bag.cacheWrite || 0} searches=${bag.searches || 0} ` +
    `usd=${usd.toFixed(4)} overlap_writes=${overlapWrites}`
);
for (const event of events) {
  console.log(
    `call label=${event.label} prefix=${event.prefixHash || "-"} read=${event.cacheRead} write=${event.cacheWrite} ` +
      `start=${event.startedAt} end=${event.endedAt}`
  );
}
