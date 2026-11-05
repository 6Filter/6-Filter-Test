/**
 * Live sidebar counts and submit-bar gaps — same filled() rules as filter unlock.
 * Browser-safe. No new form state.
 */
import { SIX_FILTERS_FORM } from "./propositionFields.js";
import { isNamedBenchmark } from "./benchmarkName.js";
import { isFilterUnlocked } from "./filterUnlock.js";
import { TECH_SHIFT_DIMENSIONS, normalizeRiskLevel } from "./techShiftRisk.js";

function filled(value) {
  if (typeof value === "boolean") return value === true;
  if (value == null) return false;
  return String(value).trim() !== "";
}

const HERO_KEYS = [
  { key: "name", label: "Proposition name" },
  { key: "category", label: "Category" },
  { key: "ideaDescription", label: "Idea description" },
];

const SUBMIT_GAPS = [
  { key: "submitterName", label: "Your name" },
  { key: "submitterDepartment", label: "Your department" },
  ...HERO_KEYS,
];

const F1_COUNT_KEYS = [
  "declaredAttribute",
  "evidenceSourceDate",
  "benchmark",
  "declaredGap",
  "gapDerivation",
  "growthRoute",
  "growthArgument",
];

const F2_COUNT_KEYS = [
  "cogsAtScale",
  "netMarginAtScale",
  "gstRatePct",
  "grammage",
  "mrpInr",
  "qcomTrajectory",
];

const F5_COUNT_KEYS = [
  "householdsReachedY3Mn",
  "trialRatePct",
  "repeatConversionPct",
  "purchaseFrequencyYr",
  "avgPackValueInr",
];

const F6_COUNT_KEYS = ["labGapVsBenchmark", "consumerPanelBeaters", "packStandoutGap"];

function countKeys(obj, keys, extraFilled) {
  const total = keys.length;
  let have = 0;
  for (const key of keys) {
    const ok = extraFilled && extraFilled[key] ? extraFilled[key](obj?.[key], obj) : filled(obj?.[key]);
    if (ok) have += 1;
  }
  return { have, total, label: `${have}/${total}` };
}

export function submitRequiredGaps(doc = {}) {
  return SUBMIT_GAPS.filter((f) => !filled(doc[f.key])).map((f) => f.label);
}

export function submitProgress(doc = {}) {
  const missingFieldLabels = submitRequiredGaps(doc);
  const total = SUBMIT_GAPS.length;
  const requiredLeft = missingFieldLabels.length;
  const pct = total ? Math.round((100 * (total - requiredLeft)) / total) : 0;
  return { requiredLeft, missingFieldLabels, pct, total };
}

export function heroFieldCount(doc = {}) {
  return countKeys(doc, HERO_KEYS.map((f) => f.key));
}

export function filterSidebarCount(filterKey, doc = {}) {
  const f1 = doc.f1 || {};
  const f2 = doc.f2 || {};
  const f3 = doc.f3 || {};
  const f4 = doc.f4 || {};
  const f5 = doc.f5 || {};
  const f6 = doc.f6 || {};

  if (filterKey === "f1") {
    if (f1.pureCommodity) return { have: 1, total: 1, label: "1/1" };
    return countKeys(f1, F1_COUNT_KEYS, {
      benchmark: (v) => isNamedBenchmark(v),
      evidenceSourceDate: (v, obj) =>
        filled(v) || Boolean(obj?.evidenceSourceFile?.name || obj?.evidenceSourceFile?.data),
    });
  }
  if (filterKey === "f2") return countKeys(f2, F2_COUNT_KEYS);
  if (filterKey === "f3") {
    if (!isFilterUnlocked("f3", doc)) return { have: 0, total: 1, label: "—" };
    // Part 135 — one human input: planned inflation-cover %. MRP comes from Filter 2.
    const hasPlan = filled(f3.plannedAnnualIncreasePct);
    return { have: hasPlan ? 1 : 0, total: 1, label: hasPlan ? "1/1" : "0/1" };
  }
  if (filterKey === "f4") {
    if (!isFilterUnlocked("f4", doc)) {
      return { have: 0, total: TECH_SHIFT_DIMENSIONS.length, label: "—" };
    }
    const dims =
      f4.techShiftRisk?.dimensions && typeof f4.techShiftRisk.dimensions === "object"
        ? f4.techShiftRisk.dimensions
        : {};
    const have = TECH_SHIFT_DIMENSIONS.filter((k) => normalizeRiskLevel(dims[k]?.risk)).length;
    const total = TECH_SHIFT_DIMENSIONS.length;
    return { have, total, label: `${have}/${total}` };
  }
  if (filterKey === "f5") {
    if (!isFilterUnlocked("f5", doc)) return { have: 0, total: F5_COUNT_KEYS.length, label: "—" };
    return countKeys(f5, F5_COUNT_KEYS);
  }
  if (filterKey === "f6") {
    if (!isFilterUnlocked("f6", doc)) return { have: 0, total: F6_COUNT_KEYS.length, label: "—" };
    return countKeys(f6, F6_COUNT_KEYS);
  }
  return { have: 0, total: 0, label: "—" };
}

export function sidebarNavItems(doc = {}) {
  const hero = heroFieldCount(doc);
  return [
    { id: "the-proposition", label: "The proposition", count: hero.label, dot: "required" },
    ...SIX_FILTERS_FORM.map((spec) => ({
      id: spec.key,
      label: spec.num,
      title: spec.title,
      count: filterSidebarCount(spec.key, doc).label,
      dot: spec.key,
    })),
  ];
}
