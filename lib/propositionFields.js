import { hydrateMarginElasticityMrp } from "./mrpFormula.js";
import { normalizeTechShiftRisk } from "./techShiftRisk.js";
import { asResearchDurationMs } from "./processTimer.js";
import { FMCG_CATEGORIES } from "./fmcgCategories.js";
import { computeIdeaRevenueCr } from "./ideaScale.js";
import { isFilterUnlocked } from "./filterUnlock.js";
import {
  DECLARED_GAP_FLOOR,
  F6_CONSUMER_PANEL_MIN,
  F6_LAB_GAP_FLOOR,
  F6_PANEL_TOTAL,
} from "./lockedConstants.js";

/** Pack-size option values used by F2 grammage select and cost-estimate rounding. */
export const GRAMMAGE_PACK_VALUES = [
  "10ml", "25ml", "50ml", "100ml", "150ml", "200ml", "250ml", "500ml", "1L",
  "10g", "25g", "50g", "100g", "200g", "250g", "500g", "1kg",
];

export const OWNER_COLORS = {
  BM:        { bg: "#2E12B0", fg: "#E4DCFF" },
  CMI:       { bg: "#1E2C55", fg: "#7EA7FF" },
  FINANCE:   { bg: "#16402C", fg: "#6FE0A3" },
  "R&D":     { bg: "#164140", fg: "#70D7E2" },
  SALES:     { bg: "#40300F", fg: "#E8B563" },
  PACKAGING: { bg: "#4A1E3D", fg: "#E778B9" },
  "BH FORUM":{ bg: "#3B1465", fg: "#C9A0E8" },
};

export const SUBMITTER_DEPARTMENTS = ["R&D", "NPD", "CIA", "Marketing"];

export function normalizeSubmitterDepartment(value) {
  const s = String(value || "").trim();
  return SUBMITTER_DEPARTMENTS.includes(s) ? s : "";
}

export function hasSubmitterIdentity(doc = {}) {
  return Boolean(String(doc.submitterName || "").trim() && normalizeSubmitterDepartment(doc.submitterDepartment));
}

export const PROPOSITION_TOP_FIELDS = [
  { key: "submitterName", label: "Your name", owners: [], type: "text", placeholder: "Enter your name" },
  { key: "submitterDepartment", label: "Your department", owners: [], type: "select",
    options: [
      { v: "", l: "— select department —" },
      { v: "R&D", l: "R&D" },
      { v: "NPD", l: "NPD" },
      { v: "CIA", l: "CIA" },
      { v: "Marketing", l: "Marketing" },
    ],
    helper: "Required to submit — Log Department column and category scoping. Anthropic billing uses your unlocked team session, not this dropdown." },
  { key: "name", label: "Proposition name", owners: ["BM"], type: "text", placeholder: "e.g. Herbal cooling hair oil" },
      { key: "category", label: "Category", owners: ["BM"], type: "text", placeholder: "e.g. Hair oils",
    datalist: FMCG_CATEGORIES,
    helper: "Starter list of common FMCG categories — CMI's real list is needed before this is exhaustive." },
  { key: "ideaDescription", label: "Idea / insight description", owners: ["BM"], type: "textarea",
    placeholder: "Describe the product idea, or attach a PDF, Word file, or image with the insight.",
    helper: "Used to run the research pass below — not a separate step." },
];

const FORUM_VERDICT_FIELD = {
  key: "forumVerdict", label: "Forum verdict", owners: ["BH FORUM"], type: "select",
  options: [{ v: "", l: "— select —" }, { v: "pass", l: "Cleared" }, { v: "fail", l: "Fail" }],
  helper: "Recorded at the paper-gate forum (F1–F5) or gate reading (F6). Binary (v4).",
};
const VERDICT_NOTE_FIELD = {
  key: "verdictNote", label: "Verdict date & note", owners: ["BH FORUM"], type: "text",
  placeholder: "e.g. 04 Sep forum — cleared; or FAIL: evidence named",
};

export const SIX_FILTERS_FORM = [
  {
    key: "f1", num: "F1", title: "Success possibility & growth", subtitle: `attribute · benchmark · gap ≥ ${DECLARED_GAP_FLOOR} (v4)`,
    accentBg: "#301A4F", accentFg: "#C9AEEF", defaultStatus: "Evidence missing",
    fields: [
      { key: "declaredAttribute", label: "Declared attribute 1 (consumer language)", owners: ["BM"], type: "text",
        placeholder: "how soft hair feels after wash", helper: "Required — your intended USP. Research will check this against the category's real purchase drivers." },
      { key: "declaredAttribute2", label: "Declared attribute 2 (optional)", owners: ["BM"], type: "text",
        placeholder: "e.g. fragrance that lasts", helper: "Optional — 2nd of the top-3" },
      { key: "declaredAttribute3", label: "Declared attribute 3 (optional)", owners: ["BM"], type: "text",
        placeholder: "e.g. no residue feel", helper: "Optional — 3rd of the top-3" },
      { key: "evidenceSourceDate", label: "Evidence Source link", owners: ["CMI"], type: "text",
        placeholder: "https://…",
        helper: "Paste a source link — no market-research study required. Or upload Word, PDF, or Excel.",
        fileKey: "evidenceSourceFile",
        fileAccept: ".pdf,.doc,.docx,.xls,.xlsx,.xlsm,.csv",
        fileLabel: "Upload source file (Word, PDF, or Excel)" },
      { key: "benchmark", label: "Benchmark (brand · variant · pack)", owners: ["BM", "CMI"], type: "text", placeholder: "single strongest — no composites" },
      { key: "declaredGap", label: "Declared gap (points on 10-pt scale)", owners: ["BM"], type: "number", helper: `Floor ${DECLARED_GAP_FLOOR} (v4)` },
      { key: "gapDerivation", label: "Gap Derivation (what we intend to beat)", owners: ["BM", "CMI"], type: "textarea", placeholder: "perceivability · rating spread · share precedent · erosion headroom" },
      { key: "parityExceptions", label: "Parity exceptions (attributes we may lose on)", owners: ["BM", "R&D"], type: "textarea", placeholder: "none, or name them" },
      { key: "growthRoute", label: "Growth Route", owners: ["BM"], type: "select",
        options: [
          { v: "", l: "— select —" },
          { v: "penetration", l: "Penetration" },
          { v: "frequency", l: "Frequency" },
          { v: "new-market", l: "New market" },
        ] },
      { key: "growthArgument", label: "Growth argument (one paragraph)", owners: ["BM"], type: "textarea", placeholder: "every number traceable to a CMI source" },
      { key: "pureCommodity", label: "Pure commodity — differentiation requirement does not apply (v4). Any formulation added ends this exception.", owners: [], type: "checkbox" },
    ],
  },
  {
    key: "f2", num: "F2", title: "Net margin", subtitleFromDivision: (div, target) => `path to ${target}% division floor (v4)`,
    accentBg: "#1A3E2D", accentFg: "#7EDCA8", defaultStatus: "Evidence missing",
    fields: [
      { key: "cogsAtScale", label: "COGS at scale (₹/unit)", owners: ["FINANCE", "R&D"], type: "number" },
      { key: "netMarginAtScale", label: "Net margin at scale (%)", owners: ["FINANCE"], type: "number",
        helperFromDivision: (div, target) => `Division floor: ${target}% (v4, non-negotiable)` },
      { key: "gstRatePct", label: "GST rate (%)", owners: ["FINANCE"], type: "number",
        placeholder: "e.g. 18",
        helper: "Food is usually 5% or 18%; packaged snacks typically 18%. Confirm against the actual HSN rate." },
      { key: "grammage", label: "Grammage / pack size", owners: ["BM"], type: "text",
        placeholder: "e.g. 100ml, or type a custom value like 330g",
        datalist: GRAMMAGE_PACK_VALUES },
      { key: "mrpInr", label: "MRP (₹)", owners: ["BM"], type: "number", placeholder: "e.g. 210",
        helper: "Auto-fills from COGS, net margin and GST as you type. Override only if you already have a decided shelf price." },
      { key: "qcomTrajectory", label: "Quick-commerce 3-year terms assumption", owners: ["SALES", "FINANCE"], type: "textarea", placeholder: "where take-rate, commission and delivery-fee are heading over 3 years — not today's rate card",
        helper: "Q-com check: will 3-year marketplace terms still leave the Filter 2 net margin intact at this pack's MRP? Research the trajectory, not today's Blinkit/Instamart card." },
      { key: "financeSigned", label: "Finance controller has signed the margin computation", owners: [], type: "checkbox" },
    ],
  },
  {
    key: "f3", num: "F3", title: "Price resilient",
    subtitle: "safe MRP range vs a one-in-ten volume-loss cap over 5 years",
    accentBg: "#3D2C12", accentFg: "#E8B563", defaultStatus: "Evidence missing",
    fields: [
      { key: "marginElasticity", label: "Safe MRP range", owners: ["CMI", "FINANCE"],
        type: "computed-range",
        helper: "Min and max recast live around the Filter 2 MRP from COGS, net margin and GST. Min cannot go below the division-floor MRP. Override either end if you have better data." },
    ],
  },
  {
    key: "f4", num: "F4", title: "Survives tech & habit shift",
    subtitle: "structural risk of the underlying format becoming obsolete, not just current trend direction",
    accentBg: "#1C2C4D", accentFg: "#8FB8E8", defaultStatus: "Evidence missing",
    fields: [
      { key: "techShiftRisk", label: "Technology & habit shift risk", owners: ["CMI", "R&D"],
        type: "computed-risk",
        helper: "Scored on the seven points below. Medium or High dimensions can take a written response — AI judges whether it is specific enough to change the rating. Vague reassurance will not." },
    ],
  },
  {
    key: "f5", num: "F5", title: "Revenue target", subtitleFromDivision: (div, target) => `credible path to ₹${target} Cr in year 3 (v4)`,
    accentBg: "#1E2A4B", accentFg: "#F0A8C8", defaultStatus: "Evidence missing",
    fields: [
      { key: "householdsReachedY3Mn", label: "Households reached, year 3 (millions)", owners: ["CMI"], type: "number" },
      { key: "trialRatePct", label: "Trial rate (%)", owners: ["CMI"], type: "number" },
      { key: "repeatConversionPct", label: "Repeat conversion (%)", owners: ["CMI"], type: "number" },
      { key: "purchaseFrequencyYr", label: "Purchase frequency (per year)", owners: ["CMI"], type: "number" },
      { key: "avgPackValueInr", label: "Average pack value (₹)", owners: ["BM"], type: "number" },
      { key: "computedRevenue", label: "Computed year-3 revenue", owners: [], type: "computed" },
      { key: "cmiHeadSigned", label: "CMI head has signed the model factors and their ranges (out-of-range factors argued in writing)", owners: [], type: "checkbox" },
    ],
  },
  {
    key: "f6", num: "F6", title: "Prototype gate — after panels", subtitle: `not part of the paper check · lab · ${F6_CONSUMER_PANEL_MIN}/${F6_PANEL_TOTAL} · pack (v4)`,
    accentBg: "#401731", accentFg: "#D9A0C9", defaultStatus: "Awaiting panels",
    fields: [
      { key: "labGapVsBenchmark", label: "Lab gap vs benchmark (points, 1 decimal)", owners: ["R&D"], type: "number", helper: `Floor ${F6_LAB_GAP_FLOOR}; report the margin, never just "pass" (v4)` },
      { key: "consumerPanelBeaters", label: `Consumer panel: 2-point beaters (k of ${F6_PANEL_TOTAL})`, owners: ["CMI"], type: "number", helper: `Gate: ${F6_CONSUMER_PANEL_MIN} of ${F6_PANEL_TOTAL}. Seventeen is a fail (v4)` },
      { key: "availabilityCount", label: `Availability count (unprompted asks, of ${F6_PANEL_TOTAL})`, owners: ["CMI"], type: "number", helper: "Reported, never gated. 8 marks strength (v4)" },
      { key: "packStandoutGap", label: "Pack standout gap vs strongest pack", owners: ["PACKAGING"], type: "number", helper: "2-point beater, mandatory (v4)" },
      { key: "bmAttendedAll30", label: "BM attended all 30 consumer interviews — attendance log complete (report invalid without it, v4)", owners: [], type: "checkbox" },
      { key: "packQualityParity", label: "Pack perceived quality at parity or better (v4)", owners: [], type: "checkbox" },
    ],
  },
];

export { FORUM_VERDICT_FIELD, VERDICT_NOTE_FIELD };

export function emptyFilterState(spec) {
  const o = { forumVerdict: "", verdictNote: "" };
  for (const f of spec.fields) {
    if (f.type === "checkbox") o[f.key] = false;
    else if (f.type === "computed" || f.type === "computed-range" || f.type === "computed-risk") o[f.key] = null;
    else o[f.key] = "";
  }
  return o;
}

/** Best-effort migrate legacy f2.mrpGrammage free text into mrpInr + grammage. */
export function migrateF2Shape(f2 = {}) {
  const next = { ...f2 };
  if ((next.mrpInr != null && next.mrpInr !== "") || next.grammage) {
    return next;
  }
  const raw = String(next.mrpGrammage || "").trim();
  if (!raw) return next;
  const mrpMatch = raw.match(/([\d.]+)/);
  if (mrpMatch) next.mrpInr = Number(mrpMatch[1]);
  const gMatch = raw.match(/(\d+(?:\.\d+)?)\s*(ml|g|kg|l)\b/i) || raw.match(/\b(1L|1kg|10ml|25ml|50ml|100ml|150ml|200ml|250ml|500ml|10g|25g|50g|100g|200g|250g|500g)\b/i);
  if (gMatch) {
    if (gMatch[2]) {
      const n = gMatch[1];
      const u = gMatch[2].toLowerCase();
      const candidate = u === "l" && Number(n) === 1 ? "1L" : u === "kg" && Number(n) === 1 ? "1kg" : `${n}${u}`;
      if (GRAMMAGE_PACK_VALUES.includes(candidate)) next.grammage = candidate;
    } else if (GRAMMAGE_PACK_VALUES.includes(gMatch[1])) {
      next.grammage = gMatch[1];
    }
  }
  return next;
}

/** Map legacy F1 growth-route values onto penetration | frequency | new-market. */
export function migrateF1GrowthRoute(f1 = {}) {
  const next = { ...f1 };
  const legacy = {
    "low-penetration": "penetration",
    "mature-share-take": "frequency",
    "mature-cluttered": "frequency",
  };
  const current = String(next.growthRoute || "").trim();
  if (legacy[current]) next.growthRoute = legacy[current];
  return next;
}

export function emptyPropositionDoc(id = "") {
  const p = {
    id,
    name: "",
    category: "",
    division: "",
    submitterName: "",
    submitterDepartment: "",
    ideaDescription: "",
    attachment: null,
    marketResearchProof: null,
    goNoGo: null,
    researchRunAt: null,
    researchDurationMs: null,
    researchFindings: null,
    managerReview: null,
    managerApproval: null,
    finalSummary: null,
    finalVerdict: "",
    finalVerdictNote: "",
    version: 1,
    createdAt: null,
    updatedAt: null,
  };
  for (const spec of SIX_FILTERS_FORM) {
    p[spec.key] = emptyFilterState(spec);
  }
  return p;
}

export function mergeProposition(raw) {
  const base = emptyPropositionDoc(raw?.id || "");
  if (!raw || typeof raw !== "object") return base;
  const next = {
    ...base,
    id: raw.id || base.id,
    name: raw.name ?? "",
    category: raw.category ?? "",
    division: raw.division ?? "",
    submitterName: String(raw.submitterName ?? "").trim(),
    submitterDepartment: normalizeSubmitterDepartment(raw.submitterDepartment),
    ideaDescription: raw.ideaDescription ?? "",
    attachment: raw.attachment && typeof raw.attachment === "object" ? raw.attachment : null,
    marketResearchProof:
      raw.marketResearchProof && typeof raw.marketResearchProof === "object"
        ? raw.marketResearchProof
        : null,
    goNoGo: raw.goNoGo && typeof raw.goNoGo === "object" ? raw.goNoGo : null,
    researchRunAt: raw.researchRunAt ?? null,
    researchDurationMs: asResearchDurationMs(raw.researchDurationMs),
    researchFindings:
      raw.researchFindings && typeof raw.researchFindings === "object" ? raw.researchFindings : null,
    managerReview: raw.managerReview && typeof raw.managerReview === "object" ? raw.managerReview : null,
    managerApproval:
      raw.managerApproval && typeof raw.managerApproval === "object"
        ? raw.managerApproval
        : raw.managerReview && String(raw.managerReview.comment || "").trim()
          ? {
              comment: String(raw.managerReview.comment).trim(),
              managerUserId: raw.managerReview.managerUserId || null,
              approvedAt: raw.managerReview.approvedAt || null,
            }
          : null,
    finalSummary: raw.finalSummary && typeof raw.finalSummary === "object" ? raw.finalSummary : null,
    finalVerdict: raw.finalVerdict ?? "",
    finalVerdictNote: raw.finalVerdictNote ?? "",
    version: Number(raw.version) || 1,
    createdAt: raw.createdAt ?? null,
    updatedAt: raw.updatedAt ?? null,
  };
  for (const spec of SIX_FILTERS_FORM) {
    const incoming = raw[spec.key] && typeof raw[spec.key] === "object" ? raw[spec.key] : {};
    const merged = { ...emptyFilterState(spec), ...incoming };
    if (spec.key === "f2") next[spec.key] = migrateF2Shape(merged);
    else if (spec.key === "f1") next[spec.key] = migrateF1GrowthRoute(merged);
    else if (spec.key === "f3") {
      const range = merged.marginElasticity;
      next[spec.key] = {
        ...merged,
        marginElasticity:
          range && typeof range === "object"
            ? hydrateMarginElasticityMrp(range, next.f2?.cogsAtScale)
            : range,
      };
    } else if (spec.key === "f4") {
      const {
        formatTrajectory: _ft,
        threatRegister: _tr,
        threatsAnswered: _ta,
        channelShiftExposure: _cse,
        ...rest
      } = merged;
      next[spec.key] = {
        ...rest,
        techShiftRisk: normalizeTechShiftRisk(merged.techShiftRisk),
      };
    } else next[spec.key] = merged;
  }
  if (isFilterUnlocked("f5", next)) {
    const cr = computeIdeaRevenueCr(next.f5 || {});
    if (cr != null) next.f5 = { ...next.f5, computedRevenue: cr };
  }
  return next;
}

export function filterStatus(filterKey, values, forumVerdict, unlocked = true) {
  if (filterKey === "f6" && !unlocked) return { label: "Awaiting panels", tone: "watch" };
  if (forumVerdict === "pass") return { label: "Cleared", tone: "pass" };
  if (forumVerdict === "fail") return { label: "Failed", tone: "fail" };
  return { label: "Evidence missing", tone: "watch" };
}

export function f6Unlocked(doc) {
  return ["f1", "f2", "f3", "f4", "f5"].every((k) => doc?.[k]?.forumVerdict === "pass");
}
