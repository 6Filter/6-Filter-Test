/**
 * Map legacy /api/ideas rows onto the 6 Filter Log (propositions).
 * Browser-safe — no DB imports.
 */

const VERDICTS = new Set(["GO", "NO-GO", "WATCH"]);
const SCALES = new Set(["10g", "100g", "1000g"]);

export function ideaNameFromText(text) {
  const line = String(text || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!line) return "Untitled idea";
  return line.length > 80 ? `${line.slice(0, 77).trim()}…` : line;
}

export function mapIdeaVerdict(idea = {}) {
  const raw = String(idea.overallVerdict || idea.overall_verdict || "").trim();
  const upper = raw.toUpperCase();
  if (VERDICTS.has(raw)) return raw;
  if (upper === "FAIL" || upper.includes("NO-GO") || upper.includes("NOGO") || upper.includes("STOPPED")) {
    return "NO-GO";
  }
  if (upper === "NEEDS_INPUT" || upper.includes("WATCH") || upper.includes("HOLD")) return "WATCH";
  if (upper === "CLEARED" || upper === "PASS" || upper === "GO") return "GO";
  return "WATCH";
}

export function ideaScaleFromLegacy(idea = {}) {
  const raw = String(idea.gramClass || idea.ideaWeight || idea.gram_class || "").trim();
  return SCALES.has(raw) ? raw : "10g";
}

export function goNoGoFromIdea(idea = {}) {
  const ideaText = String(idea.idea || idea.idea_text || "").trim();
  const name = ideaNameFromText(ideaText);
  const classification = mapIdeaVerdict(idea);
  const ideaScale = ideaScaleFromLegacy(idea);
  const at = idea.ts ? new Date(idea.ts).toISOString() : new Date().toISOString();
  const stored = String(idea.overallVerdict || "").trim();
  return {
    classification,
    rationale: stored
      ? `${name} is ${classification} from the stored screen (${stored}).`
      : `${name} is ${classification} from the stored screen.`,
    ideaScale,
    ideaName: name,
    at,
  };
}

export function propositionDocFromIdea(idea = {}) {
  const ideaText = String(idea.idea || idea.idea_text || "").trim();
  const name = ideaNameFromText(ideaText);
  const createdAt = idea.ts ? new Date(idea.ts).toISOString() : new Date().toISOString();
  const blank = { forumVerdict: "", verdictNote: "" };
  return {
    id: idea.id,
    name,
    category: String(idea.category || "").trim(),
    division: "",
    createdByUserId: null,
    submitterName: "Historical screen",
    submitterDepartment: "",
    ideaDescription: ideaText,
    attachment: null,
    marketResearchProof: null,
    goNoGo: goNoGoFromIdea({ ...idea, idea: ideaText }),
    researchRunAt: createdAt,
    researchDurationMs: null,
    researchFindings: null,
    managerReview: null,
    managerApproval: null,
    finalSummary: null,
    finalVerdict: "",
    finalVerdictNote: "",
    f1: { ...blank },
    f2: { ...blank },
    f3: { ...blank },
    f4: { ...blank },
    f5: { ...blank },
    f6: { ...blank },
    version: 1,
    createdAt,
    updatedAt: createdAt,
  };
}

export function logRowFromIdea(idea = {}) {
  const doc = propositionDocFromIdea(idea);
  return {
    id: doc.id,
    name: doc.name,
    category: doc.category,
    division: doc.division,
    createdByUserId: null,
    submitterName: doc.submitterName,
    submitterDepartment: doc.submitterDepartment,
    ideaDescription: doc.ideaDescription,
    finalVerdict: "",
    finalSummary: null,
    classification: doc.goNoGo.classification,
    goNoGo: doc.goNoGo,
    managerReview: null,
    managerApproval: null,
    managerReviewRequested: false,
    advisoryChecks: {},
    researchRunAt: doc.researchRunAt,
    version: 1,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export function mergeIdeaHistoryIntoLog(propositions = [], ideas = [], cap = 2000) {
  const rows = Array.isArray(propositions) ? [...propositions] : [];
  const seen = new Set(rows.map((r) => r.id));
  for (const idea of Array.isArray(ideas) ? ideas : []) {
    if (!idea?.id || seen.has(idea.id)) continue;
    seen.add(idea.id);
    rows.push(logRowFromIdea(idea));
  }
  rows.sort((a, b) => String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || "")));
  const limit = Number.isFinite(Number(cap)) ? Math.max(1, Math.floor(Number(cap))) : 2000;
  return rows.slice(0, limit);
}
