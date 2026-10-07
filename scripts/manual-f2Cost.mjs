import fs from "fs";

for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (!m) continue;
  const k = m[1].trim();
  let v = m[2].trim();
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1);
  }
  if (!process.env[k]) process.env[k] = v;
}

import { runWithLlm } from "../lib/llmContext.js";
import { runCostEstimate } from "../lib/filters/runCostEstimate.js";
import { buildSuggestions } from "../lib/propositionAiFirstPass.js";

const idea =
  "100ml ayurvedic herbal hair oil, mid-premium, vs Parachute Advansed, South India MT + qcom.";

function applyF2AutoFill(currentF2, suggestedF2) {
  const current = currentF2 && typeof currentF2 === "object" ? currentF2 : {};
  const suggested = suggestedF2 && typeof suggestedF2 === "object" ? suggestedF2 : {};
  const next = { ...current };
  const sourced = {};
  for (const key of ["cogsAtScale", "netMarginAtScale", "mrpInr", "grammage", "qcomTrajectory"]) {
    const empty = current[key] == null || current[key] === "";
    if (empty && suggested[key] != null && suggested[key] !== "") {
      next[key] = suggested[key];
      sourced[key] = true;
    }
  }
  return { next, sourced };
}

try {
  const cost = await runWithLlm("claude", () =>
    runCostEstimate({ ideaText: idea, division: "Personal Care" })
  );
  console.log("runCostEstimate =>", JSON.stringify(cost, null, 2));
  if (!cost) {
    console.log("No cost result");
    process.exit(2);
  }
  const sug = buildSuggestions({}, {}, null, null, cost);
  console.log("suggestions.f2 =>", JSON.stringify(sug.f2, null, 2));
  const filled = applyF2AutoFill({}, sug.f2);
  console.log("autofill =>", JSON.stringify(filled, null, 2));
  const required = ["cogsAtScale", "netMarginAtScale", "mrpInr", "grammage", "qcomTrajectory"];
  const missing = required.filter((k) => filled.next[k] == null || filled.next[k] === "");
  if (missing.length) {
    console.log("MISSING", missing.join(","));
    process.exit(3);
  }
  console.log("PASS F2 AI fill wiring + live Groq cost estimate");
} catch (e) {
  console.log("FAIL", e.status || "", e.message);
  process.exit(1);
}
