/**
 * Closed-case summary after Filter 6's Forum verdict. Describes the result; does not decide it.
 */
import { callLlm } from "./callLlm.js";
import { getDivisionRevenueTarget } from "./divisionConfig.js";
import { computeIdeaRevenueCr } from "./ideaScale.js";
import { hasManagerApproval } from "./filterUnlock.js";
import { stripCavinKareMentions } from "./sanitizeAiText.js";

function formatCr(n) {
  if (n == null || n === "") return null;
  const v = Number(n);
  if (!Number.isFinite(v)) return null;
  return v.toFixed(1);
}

export function expectedBusinessImpactCopy(proposition = {}, targetCr = null) {
  const revenue = computeIdeaRevenueCr(proposition.f5 || {});
  const target = targetCr != null ? Number(targetCr) : Number(proposition.f5?.targetRevenue);
  const rev = formatCr(revenue);
  const tgt = formatCr(target);
  if (rev && tgt) {
    return `₹${rev} Cr projected Year-3 revenue vs a ₹${tgt} Cr division target`;
  }
  if (rev) return `₹${rev} Cr projected Year-3 revenue`;
  return "Revenue projection not available";
}

export function fallbackSummaryNarrative({ name, path, f5Summary, f6Result } = {}) {
  const idea = String(name || "This idea").trim() || "This idea";
  const via = String(path || "GO").trim();
  const impact = String(f5Summary || "Revenue projection not available").trim();
  const verdict = String(f6Result || "").toLowerCase() === "pass" ? "Pass" : "Fail";
  return `${idea} completed the 6 Filter Test via ${via}. ${impact}. Filter 6 Forum verdict: ${verdict}.`;
}

async function callSummaryNarrative(userText) {
  const { text } = await callLlm({
    system:
      "You write a short closed-case NPD summary. Statuses are already determined — do not question, re-derive, or upgrade them. " +
      "Return plain sentences, no JSON, no emoji, no bullet list. The word CavinKare must never appear. 80–140 words.",
    userText,
    useWebSearch: false,
    maxTokens: 400,
    temperature: 0,
    tier: "light",
    label: "final-summary",
  });
  return stripCavinKareMentions(String(text || "").trim());
}

export async function generateSummaryNarrative(
  { name, path, f5Summary, f6Result } = {},
  { callNarrative = callSummaryNarrative } = {}
) {
  const fallback = fallbackSummaryNarrative({ name, path, f5Summary, f6Result });
  try {
    const text = await callNarrative(
      `Write a brief closed-case summary. Do not decide GO/NO-GO or Pass/Fail — those are already recorded.\n` +
        `Idea: ${name || "Untitled"}\n` +
        `Path to Filters 5–6: ${path}\n` +
        `Business impact (already computed): ${f5Summary}\n` +
        `Filter 6 Forum verdict (already recorded): ${f6Result}\n` +
        `Describe what was completed. Do not invent a different verdict or a rupee figure that is not in the impact line.`
    );
    return String(text || "").trim() || fallback;
  } catch {
    return fallback;
  }
}

export function shouldGenerateFinalSummary(prev, next) {
  if (next?.finalSummary?.summaryText) return false;
  const v = String(next?.f6?.forumVerdict || "").trim();
  return v === "pass" || v === "fail";
}

export async function generateFinalSummary(proposition, opts = {}) {
  const f6Result = String(proposition?.f6?.forumVerdict || "").trim();
  let targetCr = proposition?.f5?.targetRevenue ?? null;
  if (targetCr == null && typeof opts.getRevenueTarget === "function") {
    const row = await opts.getRevenueTarget(proposition?.division);
    targetCr = row?.allChannels ?? null;
  } else if (targetCr == null && proposition?.division && opts.skipDivisionLookup !== true) {
    try {
      const row = await getDivisionRevenueTarget(proposition.division);
      targetCr = row?.allChannels ?? null;
    } catch {
      targetCr = null;
    }
  }
  const expectedBusinessImpact = expectedBusinessImpactCopy(proposition, targetCr);
  const path = hasManagerApproval(proposition) ? "WATCH, manager-approved" : "GO";
  const summaryText = await generateSummaryNarrative(
    {
      name: proposition?.name,
      path,
      f5Summary: expectedBusinessImpact,
      f6Result,
    },
    { callNarrative: opts.callNarrative }
  );
  return {
    expectedBusinessImpact,
    summaryText,
    generatedAt: new Date().toISOString(),
    f6Result,
    path,
  };
}
