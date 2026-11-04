/**
 * Browser-safe output-page helpers. Does not score, classify, or rewrite narratives.
 * Point values use the fixed 15-slot table (100 / SCORE_CHECK_SLOTS_TOTAL).
 */
import { analysisCheckItems, isFormAdminCheck } from "./filterChecks.js";
import { fieldOwners } from "./fieldOwnership.js";
import { goNoGoIsFloorFailure, scoreAdvisoryChecks } from "./goNoGo.js";
import { SIX_FILTERS_FORM } from "./propositionFields.js";
import {
  GONOGO_SCORE_BANDS,
  SCORE_CHECK_SLOTS,
  SCORE_CHECK_SLOTS_TOTAL,
  isGoScore,
} from "./lockedConstants.js";
import { expectedSlotKeys, f2AnalyticalItems } from "./scoreSlots.js";
import { DIMENSION_LABELS } from "./techShiftRisk.js";

const FILTER_KEYS = ["f1", "f2", "f3", "f4"];
const FILTER_LABEL = { f1: "Filter 1", f2: "Filter 2", f3: "Filter 3", f4: "Filter 4" };

/** One cleared slot under the fixed-slot table. */
export function pointsPerSlot() {
  return 100 / SCORE_CHECK_SLOTS_TOTAL;
}

export function gainPctForSlots(slotCount = 1) {
  const n = Math.max(0, Number(slotCount) || 0);
  return Math.round(n * pointsPerSlot());
}

function fieldKeyForItem(filterKey, text) {
  const t = String(text || "");
  const k = String(filterKey || "").toLowerCase();
  if (k === "f1") {
    if (
      /attribute|purchase driver|primary research|category currently sells on|requires primary research/i.test(
        t
      )
    ) {
      return "declaredAttribute";
    }
    if (/benchmark/i.test(t)) return "benchmark";
    if (/declared gap|gap \d/i.test(t)) return "declaredGap";
    if (/growth|category size/i.test(t)) return "growthArgument";
  }
  if (k === "f2") {
    if (/net margin/i.test(t)) return "netMarginAtScale";
    if (/quick-commerce|q-com/i.test(t)) return "qcomTrajectory";
    if (/finance/i.test(t)) return "financeSigned";
    if (/mrp|grammage/i.test(t)) return "mrpInr";
  }
  if (k === "f3") return "marginElasticity";
  if (k === "f4") return "techShiftRisk";
  if (k === "f5") {
    if (/cmi signature/i.test(t)) return "cmiHeadSigned";
    if (/sizing|households|year-3 revenue/i.test(t)) return "householdsReachedY3Mn";
  }
  if (k === "f6") {
    if (/lab gap/i.test(t)) return "labGapVsBenchmark";
    if (/consumer panel/i.test(t)) return "consumerPanelBeaters";
    if (/pack standout/i.test(t)) return "packStandoutGap";
    if (/pack quality/i.test(t)) return "packQualityParity";
  }
  return null;
}

export function ownersForCheckItem(filterKey, text) {
  const fieldKey = fieldKeyForItem(filterKey, text);
  if (!fieldKey) return [];
  return fieldOwners(fieldKey) || [];
}

function improvementSeverity(item, advisoryChecks = {}) {
  const text = String(item?.text || "");
  const label = String(advisoryChecks[String(item?.filter || "").toLowerCase()]?.checkLabel || "");
  if (label === "Below floor" || /below the .+ floor|above the safe|safe ₹|volume loss|non-negotiable/i.test(text)) {
    return 0;
  }
  if (/not verified|requires primary research|High risk|first-mover claim|declared gap .+ below/i.test(text)) {
    return 1;
  }
  if (/Medium risk|category size|mitigation response/i.test(text)) return 2;
  return 3;
}

export function computeImprovementPointValues(advisoryChecks = {}) {
  const path = buildPathToGo({ advisoryChecks, scoreStatus: "current" });
  const fromPath = [...(path.blockers || []), ...(path.actions || [])].map((a) => ({
    status: "pending",
    text: a.text,
    filter: a.filter || "",
    pointValue: a.gainPct,
    gainPct: a.gainPct,
    owners: ownersForCheckItem(a.filter, a.text),
    blocker: Boolean(a.blocker),
  }));
  // Prefer path rows (includes unrun filters + floors). Fall back to pending checklist rows.
  const rows = fromPath.length
    ? fromPath
    : FILTER_KEYS.flatMap((k) =>
        analysisCheckItems(advisoryChecks[k]?.items)
          .filter((item) => item.status === "pending")
          .map((item) => ({
            ...item,
            filter: k.toUpperCase(),
            pointValue: gainPctForSlots(1),
            gainPct: gainPctForSlots(1),
            owners: ownersForCheckItem(k, item.text),
          }))
      );
  return rows.sort((a, b) => {
    if (Boolean(a.blocker) !== Boolean(b.blocker)) return a.blocker ? -1 : 1;
    const sev = improvementSeverity(a, advisoryChecks) - improvementSeverity(b, advisoryChecks);
    if (sev !== 0) return sev;
    return b.pointValue - a.pointValue;
  });
}

function isNotYetRunCheck(check) {
  const label = String(check?.checkLabel || "");
  if (label === "Not yet run") return true;
  const items = Array.isArray(check?.items) ? check.items : [];
  return !items.length && label !== "Cleared" && label !== "Exempt";
}

function floorFixCopy(filterKey, itemText, checkLabel) {
  const t = String(itemText || "");
  const margin = t.match(
    /Net margin\s+([\d.]+)%[^]*?(?:below|clears)?[^]*?(?:floor|minimum)[^]*?([\d.]+)?%/i
  );
  if (margin) {
    const actual = margin[1];
    const floor = margin[2];
    const div = t.match(/\(([^)]+)\)/);
    if (floor) {
      return `Net margin ${actual}%: needs at least ${floor}%${div ? ` (${div[1]})` : ""}`;
    }
  }
  const marginAlt = t.match(/Net margin\s+([\d.]+)%\s+is below the\s+([\d.]+)%\s+floor/i);
  if (marginAlt) {
    return `Net margin ${marginAlt[1]}%: needs at least ${marginAlt[2]}%`;
  }
  const gap = t.match(/Declared gap\s+([\d.]+).*?(?:below|needs|floor).*?([\d.]+)/i);
  if (gap) return `Declared gap ${gap[1]}: needs ${gap[2]} or more`;
  const gapShort = t.match(/Declared gap\s+([\d.]+)/i);
  if (gapShort && /below/i.test(t)) return `Declared gap ${gapShort[1]}: needs 2.0 or more`;
  const mrp = t.match(/MRP[^\d]*₹?\s*([\d.]+).*?(?:outside|below|above).*?₹?\s*([\d.]+).*?₹?\s*([\d.]+)/i);
  if (mrp) return `MRP ₹${mrp[1]} is outside ₹${mrp[2]} to ₹${mrp[3]}`;
  const mrpFloor = t.match(/(?:below|above) the safe ₹?\s*([\d.,]+)/i);
  if (mrpFloor && /MRP|price/i.test(t)) {
    const live = t.match(/₹\s*([\d.]+)/);
    return live
      ? `MRP ₹${live[1]} is outside the safe range (safe ₹${mrpFloor[1]})`
      : t;
  }
  const highDim = t.match(/^([^:]+):\s*High risk/i);
  if (highDim) return `${highDim[1].trim()} is High — clear it with a mitigation response`;
  if (checkLabel === "Below floor" && t) return t;
  return t || `${FILTER_LABEL[filterKey] || filterKey} is below a floor`;
}

/**
 * Turn a checklist status line into a clear "what to do" action.
 * Never returns bare state like "Benchmark named: X".
 */
export function actionFixCopy(filterKey, slotKey, itemText) {
  const t = String(itemText || "").trim();
  const fk = String(filterKey || "").toLowerCase();
  const sk = String(slotKey || "");

  if (fk === "f1") {
    if (sk === "benchmark" || /benchmark/i.test(t)) {
      if (!t || /benchmark not named/i.test(t)) {
        return "Name a competitor benchmark brand that sells in India";
      }
      const named =
        t.match(/Benchmark named\s*\(([^)]+)\)/i)?.[1] ||
        t.match(/Benchmark named:\s*([^—–.\n]+)/i)?.[1] ||
        t.match(/Benchmark verified:\s*([^—–.\n]+)/i)?.[1];
      const brand = named ? String(named).trim() : "";
      if (/not verified|research failed|research has not|did not complete/i.test(t) || /^Benchmark named:/i.test(t)) {
        return brand
          ? `Verify that benchmark "${brand}" sells in India — Screen again so research can finish`
          : "Verify the named benchmark sells in India — Screen again so research can finish";
      }
      if (brand && !/verified/i.test(t)) {
        return `Verify that benchmark "${brand}" sells in India — Screen again so research can finish`;
      }
    }
    if (sk === "growth" || /growth|category size/i.test(t)) {
      if (/not selected|missing|not entered/i.test(t)) {
        return /route not selected/i.test(t)
          ? "Select a growth route (penetration, frequency, or new market) and write the argument"
          : "Write a growth argument with numbers traceable to a CMI source";
      }
      const route = t.match(/growth route\s*[\"“]?([^\"”]+)[\"”]?/i)?.[1];
      return route
        ? `Substantiate category size for growth route "${route.trim()}" — Screen again so research can finish`
        : "Substantiate category size for the growth route — Screen again so research can finish";
    }
    if (sk === "attribute" || /attribute|purchase driver|primary research/i.test(t)) {
      if (/not|missing|enter|requires primary/i.test(t)) {
        return t.length > 8 ? t : "Enter the purchase-driver attribute the category sells on";
      }
    }
    if (sk === "declaredGapOrFirstMover" || /declared gap|first-mover/i.test(t)) {
      return floorFixCopy("f1", t, "") || "Raise declared gap to 2.0 or more, or clear the first-mover claim";
    }
  }

  if (fk === "f2") {
    if (sk === "mrpGrammage" || /\bMRP\b|grammage/i.test(t)) {
      if (/not entered|missing|blank/i.test(t) || !t) return "Enter MRP (₹) and pack grammage";
      return floorFixCopy("f2", t, "") || t;
    }
    if (sk === "netMarginFloor" || /net margin/i.test(t)) {
      if (/not entered|missing|blank/i.test(t) || !t) return "Enter net margin at scale (%)";
      return floorFixCopy("f2", t, "Below floor");
    }
    if (sk === "qcomTrajectory" || /quick-commerce|q-?com/i.test(t)) {
      if (/not |missing|blank/i.test(t) || !t) return "Record quick-commerce terms / take-rate assumption";
      return t;
    }
  }

  if (fk === "f3") {
    if (/not yet|not computed|missing|not entered/i.test(t) || !t) {
      return "Compute Filter 3 safe MRP range (Screen again if research did not finish)";
    }
    return floorFixCopy("f3", t, "") || t;
  }

  if (fk === "f4") {
    const dim = DIMENSION_LABELS[sk] || sk;
    if (/not assessed|not yet|missing/i.test(t) || !t) {
      return `${dim}: run Filter 4 research to assess this dimension`;
    }
    const high = t.match(/^([^:]+):\s*High risk/i);
    if (high) {
      return `${high[1].trim()} is High — add a mitigation response (contracts, lab proof, or dated certification)`;
    }
    if (/Medium risk/i.test(t)) {
      const label = t.split(":")[0]?.trim() || dim;
      return `${label}: lower the risk or document why Medium is acceptable`;
    }
    return t;
  }

  if (!t) return `Complete ${FILTER_LABEL[fk] || fk} ${sk || "check"}`;
  // Strip status-only "Named: X" style leftovers
  if (/^[A-Za-z ]+ named:\s*.+/i.test(t) && !/not verified|verify|needs|raise|enter|screen/i.test(t)) {
    const what = t.match(/^([A-Za-z ]+)\s+named:\s*(.+)$/i);
    if (what) {
      return `Verify ${what[1].trim().toLowerCase()} "${what[2].trim()}" — Screen again so research can finish`;
    }
  }
  return t;
}

function blankSlotCopy(filterKey, slotKey) {
  const fk = String(filterKey || "").toLowerCase();
  if (fk === "f3") return "Compute Filter 3 safe MRP range";
  if (fk === "f4") {
    return `${DIMENSION_LABELS[slotKey] || slotKey}: run Filter 4 research to assess this dimension`;
  }
  if (fk === "f1") {
    if (slotKey === "attribute") return "Enter the purchase-driver attribute the category sells on";
    if (slotKey === "benchmark") return "Name a competitor benchmark brand that sells in India";
    if (slotKey === "declaredGapOrFirstMover") return "Enter declared gap (needs 2.0 or more) or a first-mover claim";
    if (slotKey === "growth") return "Select a growth route and write the argument with CMI-traceable numbers";
  }
  if (fk === "f2") {
    if (slotKey === "mrpGrammage") return "Enter MRP (₹) and pack grammage";
    if (slotKey === "netMarginFloor") return "Enter net margin at scale (%)";
    if (slotKey === "qcomTrajectory") return "Record quick-commerce terms / take-rate assumption";
  }
  return `${FILTER_LABEL[fk] || fk} ${slotKey} not filled`;
}

function openSlotActions(advisoryChecks = {}) {
  const blockers = [];
  const actions = [];
  const keys = expectedSlotKeys();

  for (const fk of FILTER_KEYS) {
    const check = advisoryChecks[fk] || {};
    const slots = Number(SCORE_CHECK_SLOTS[fk] || keys[fk]?.length || 0);
    const floor = String(check.checkLabel || "") === "Below floor";

    if (isNotYetRunCheck(check)) {
      const gainPct = gainPctForSlots(slots);
      const text =
        fk === "f4"
          ? "Run Filter 4 research (all 7 tech-shift dimensions)"
          : fk === "f3"
            ? "Compute Filter 3 safe MRP range"
            : `Complete ${FILTER_LABEL[fk]} inputs and Screen again`;
      const row = {
        id: `${fk}:not-run`,
        filter: fk.toUpperCase(),
        text,
        gainPct,
        blocker: false,
        slots,
      };
      actions.push(row);
      continue;
    }

    if (fk === "f1" && String(check.checkLabel || "") === "Exempt") {
      continue;
    }

    const items =
      fk === "f2"
        ? f2AnalyticalItems(check)
        : Array.isArray(check.items)
          ? check.items.filter((it) => !isFormAdminCheck(it) || it.status === "pending")
          : [];

    if (floor) {
      const pending = items.filter((it) => it.status !== "done");
      const use = pending.length ? pending : items.slice(0, 1);
      for (const it of use) {
        blockers.push({
          id: `${fk}:floor:${String(it.text || "").slice(0, 40)}`,
          filter: fk.toUpperCase(),
          text: floorFixCopy(fk, it.text, "Below floor"),
          gainPct: gainPctForSlots(1),
          blocker: true,
          slots: 1,
        });
      }
    }

    // Named open slots (pending / missing)
    const slotList = keys[fk] || [];
    const used = new Set();
    for (const slotKey of slotList) {
      let matchIdx = -1;
      for (let i = 0; i < items.length; i++) {
        if (used.has(i)) continue;
        const t = String(items[i]?.text || "");
        let hit = false;
        if (fk === "f1") {
          if (slotKey === "attribute") hit = /attribute|purchase driver|primary research/i.test(t);
          else if (slotKey === "benchmark") hit = /benchmark/i.test(t);
          else if (slotKey === "declaredGapOrFirstMover")
            hit = /declared gap|gap \d|first-mover|no established competitor/i.test(t);
          else if (slotKey === "growth") hit = /growth|category size/i.test(t);
        } else if (fk === "f2") {
          if (slotKey === "mrpGrammage") hit = /\bMRP\b|grammage|pack size/i.test(t);
          else if (slotKey === "netMarginFloor") hit = /net margin|division floor|minimum/i.test(t);
          else if (slotKey === "qcomTrajectory") hit = /quick-commerce|q-?com/i.test(t);
        } else if (fk === "f3") {
          hit = true;
        } else if (fk === "f4") {
          const label = DIMENSION_LABELS[slotKey] || "";
          hit = label && t.toLowerCase().includes(String(label).toLowerCase());
        }
        if (hit) {
          matchIdx = i;
          break;
        }
      }
      if (matchIdx < 0) {
        for (let i = 0; i < items.length; i++) {
          if (!used.has(i)) {
            matchIdx = i;
            break;
          }
        }
      }
      if (matchIdx < 0) {
        // Blank / missing named slot with no checklist row yet
        if (!floor) {
          actions.push({
            id: `${fk}:${slotKey}:blank`,
            filter: fk.toUpperCase(),
            text: blankSlotCopy(fk, slotKey),
            gainPct: gainPctForSlots(1),
            blocker: false,
            slots: 1,
          });
        }
        continue;
      }
      used.add(matchIdx);
      const it = items[matchIdx];
      if (it.status === "done") continue;
      if (floor) continue; // already in blockers
      actions.push({
        id: `${fk}:${slotKey}`,
        filter: fk.toUpperCase(),
        text: actionFixCopy(fk, slotKey, it.text),
        gainPct: gainPctForSlots(1),
        blocker: false,
        slots: 1,
      });
    }
  }

  // Deduplicate by id
  const seen = new Set();
  const dedupe = (list) =>
    list.filter((row) => {
      if (seen.has(row.id)) return false;
      seen.add(row.id);
      return true;
    });
  return { blockers: dedupe(blockers), actions: dedupe(actions) };
}

/**
 * Part 130 — single source for Path to GO panel and "What to do next".
 * Never mixes sealed % with live counts when scoreStatus is not current.
 */
export function buildPathToGo({
  advisoryChecks = {},
  sealedScore = null,
  scoreStatus = "current",
  screenedAt = null,
} = {}) {
  const status = String(scoreStatus || "current").trim() || "current";
  const live = scoreAdvisoryChecks(advisoryChecks);
  const hasSeal =
    sealedScore &&
    typeof sealedScore === "object" &&
    Number(sealedScore.total) > 0 &&
    Number.isFinite(Number(sealedScore.pct));

  if (status === "older-ruleset" || status === "edited-since-screening") {
    const currentPct = hasSeal ? Number(sealedScore.pct) : live.pct;
    const when = screenedAt || sealedScore?.screenedAt || sealedScore?.at || null;
    let dateBit = "an older release";
    if (status === "edited-since-screening") dateBit = "before the latest edits";
    else if (when) {
      try {
        dateBit = new Date(when).toLocaleDateString("en-GB", {
          day: "numeric",
          month: "short",
          year: "numeric",
        });
      } catch {
        dateBit = "an older release";
      }
    }
    return {
      kind: "recompute",
      currentPct,
      toGo: { count: 0, pct: currentPct },
      allDonePct: 100,
      blockers: [],
      actions: [],
      headline: `This score is from ${dateBit}. Recompute to see the path to GO.`,
      message: `This score is from ${dateBit}. Recompute to see the path to GO.`,
    };
  }

  const currentPct = hasSeal ? Number(sealedScore.pct) : Number(live.pct) || 0;
  let { blockers, actions } = openSlotActions(advisoryChecks);
  const hasFloor = goNoGoIsFloorFailure(advisoryChecks) || blockers.length > 0;

  // Below GO with no discovered open slots — never leave a silent / same→same panel.
  if (!hasFloor && !actions.length && !isGoScore(currentPct)) {
    const done = hasSeal ? Number(sealedScore.done) || 0 : Number(live.done) || 0;
    const missing = Math.max(1, SCORE_CHECK_SLOTS_TOTAL - done);
    actions = [
      {
        id: "rescreen:open",
        filter: "F1–F4",
        text: `Screen again — ${missing} of ${SCORE_CHECK_SLOTS_TOTAL} checks still open; research must finish and every input must clear`,
        gainPct: gainPctForSlots(missing),
        blocker: false,
        slots: missing,
      },
    ];
  }

  const openGain = [...blockers, ...actions].reduce((s, a) => s + Number(a.gainPct || 0), 0);
  let allDonePct = Math.min(100, currentPct + openGain);
  if (actions.length + blockers.length > 0 && allDonePct <= currentPct) {
    allDonePct = Math.min(100, currentPct + gainPctForSlots(actions.length + blockers.length));
  }

  if (hasFloor) {
    let projected = currentPct;
    for (const a of [...blockers, ...actions]) {
      projected = Math.min(100, projected + Number(a.gainPct || 0));
    }
    if (projected <= currentPct && blockers.length + actions.length > 0) {
      projected = Math.min(100, currentPct + gainPctForSlots(blockers.length + actions.length));
    }
    return {
      kind: "blockers",
      currentPct,
      toGo: { count: blockers.length, pct: projected },
      allDonePct,
      blockers,
      actions,
      headline:
        "Fix these first. The verdict stays NO-GO until they pass, whatever the percent.",
      message:
        "Fix these first. The verdict stays NO-GO until they pass, whatever the percent.",
    };
  }

  if (isGoScore(currentPct)) {
    return {
      kind: "go",
      currentPct,
      toGo: { count: 0, pct: currentPct },
      allDonePct: actions.length ? allDonePct : currentPct,
      blockers: [],
      actions,
      headline: "GO, above 80%.",
      message: "GO, above 80%.",
    };
  }

  // Path: fewest actions that push past GO, each with a real gain.
  let projected = currentPct;
  const pathSlice = [];
  for (const a of actions) {
    pathSlice.push(a);
    projected = Math.min(100, projected + Number(a.gainPct || 0));
    if (isGoScore(projected)) break;
  }
  if (!pathSlice.length && actions.length) {
    pathSlice.push(...actions);
    projected = allDonePct;
  }
  // NEVER render X% → X% when there is work left.
  if (pathSlice.length && projected <= currentPct) {
    projected = Math.min(100, currentPct + Math.max(gainPctForSlots(pathSlice.length), 1));
  }

  const n = pathSlice.length;
  const short = !isGoScore(projected);
  const headline = n
    ? `${currentPct}% → ${projected}% if these ${n} check${n === 1 ? "" : "s"} clear${
        short ? " — still short of GO" : ""
      }`
    : `${currentPct}% — open checks still needed for GO`;

  return {
    kind: "path",
    currentPct,
    toGo: { count: n, pct: projected },
    allDonePct,
    blockers: [],
    actions: pathSlice.length ? pathSlice : actions,
    allActions: actions,
    headline,
    message: headline,
  };
}

/** Filters 1–4 that never produced a scored checklist (so "nothing outstanding" would be misleading). */
export function unscoredFilterLabels(advisoryChecks = {}) {
  return FILTER_KEYS.filter((k) => {
    const label = String(advisoryChecks[k]?.checkLabel || "");
    const items = analysisCheckItems(advisoryChecks[k]?.items);
    return label === "Not yet run" || (!items.length && label !== "Cleared" && label !== "Exempt");
  }).map((k) => k.toUpperCase());
}

export function emptyImprovementReason(advisoryChecks = {}, improvementItems = []) {
  if (Array.isArray(improvementItems) && improvementItems.length) return "";
  const score = scoreAdvisoryChecks(advisoryChecks);
  if (isGoScore(score.pct)) return "";
  const unscored = unscoredFilterLabels(advisoryChecks);
  // Placeholder weight for unrun filters makes total > 0 — treat "all unscored" like a blank score.
  const onlyUnscoredPlaceholders =
    unscored.length === FILTER_KEYS.length ||
    (score.total > 0 &&
      FILTER_KEYS.every((k) => score.byFilter?.[k]?.unscored) &&
      Number(score.done) === 0);
  if (!score.total || onlyUnscoredPlaceholders) {
    return unscored.length
      ? `${unscored.join(", ")} ${unscored.length === 1 ? "has" : "have"} not been scored yet — complete those inputs and Submit so feedback can cite your numbers and research.`
      : "No scored Filter 1–4 checks yet — enter the idea fields and Submit so feedback can cite your inputs and research.";
  }
  if (unscored.length) {
    return `${unscored.join(", ")} ${unscored.length === 1 ? "is" : "are"} still unscored — finish those filters before treating the checklist as clear.`;
  }
  return "No open analytical gaps on the scored Filter 1–4 checklist for this idea.";
}

export function projectedScoreIfTopResolved(advisoryChecks, improvementItems, count = 2) {
  const score = scoreAdvisoryChecks(advisoryChecks);
  const add = Math.min(
    Number(count) || 0,
    Array.isArray(improvementItems) ? improvementItems.length : 0
  );
  if (!score.total) return Number.isFinite(Number(score.pct)) ? Number(score.pct) : 0;
  return Math.round((100 * Math.min(score.total, score.done + add)) / score.total);
}

/**
 * @deprecated Part 130 — prefer buildPathToGo. Kept as a thin adapter for older callers.
 */
export function closestPathToGo(advisoryChecks, improvementItems, sealedScore = null, scoreStatus = "current") {
  const path = buildPathToGo({ advisoryChecks, sealedScore, scoreStatus });
  if (path.kind === "recompute") {
    return {
      currentPct: path.currentPct,
      projectedPct: path.currentPct,
      items: [],
      reachesGo: false,
      emptyReason: path.message,
      projectionHidden: true,
      path,
    };
  }
  const items = [
    ...(path.blockers || []),
    ...(path.actions || []),
  ].map((a) => ({
    status: "pending",
    text: a.text,
    filter: a.filter,
    pointValue: a.gainPct,
    gainPct: a.gainPct,
  }));
  const projectedPct = path.kind === "go" ? path.currentPct : path.toGo?.pct ?? path.currentPct;
  return {
    currentPct: path.currentPct,
    projectedPct,
    items: path.kind === "go" ? [] : items.slice(0, path.toGo?.count || items.length),
    reachesGo: path.kind === "go" || isGoScore(projectedPct),
    emptyReason: path.kind === "go" ? "" : path.message || "",
    path,
  };
}

/**
 * Part 128 — the only number shown for a screened idea is the sealed snapshot.
 * Live checks may still drive improvement points; they never replace goNoGo.score.
 * Preview callers with no stored score still receive the live aggregate.
 */
export function resolveOutputScore(advisoryChecks, storedScore, doc = null, lockKey = null) {
  const live = scoreAdvisoryChecks(advisoryChecks || {});
  const key = String(
    (storedScore && storedScore.scoreInputKey) || lockKey || ""
  ).trim();
  const stored =
    storedScore && typeof storedScore === "object" && Number(storedScore.total) > 0
      ? {
          done: Number(storedScore.done) || 0,
          total: Number(storedScore.total) || 0,
          pct: Number.isFinite(Number(storedScore.pct)) ? Number(storedScore.pct) : 0,
          byFilter: storedScore.byFilter || {},
          scoreInputKey: key || storedScore.scoreInputKey,
        }
      : null;

  if (stored) return stored;
  return live;
}

export function scoreArcColor(pct) {
  const n = Number(pct);
  const score = Number.isFinite(n) ? n : 0;
  if (score > GONOGO_SCORE_BANDS.WATCH_MAX) return "var(--pass)";
  if (score >= GONOGO_SCORE_BANDS.NOGO_MAX) return "var(--watch)";
  return "var(--fail)";
}

function valueFilled(v) {
  if (typeof v === "boolean") return v === true;
  if (v == null) return false;
  if (typeof v === "object") {
    return Object.values(v).some((x) => valueFilled(x));
  }
  return String(v).trim() !== "";
}

export function filterHasEvidence(values, spec) {
  if (!values || typeof values !== "object" || !spec) return false;
  for (const field of spec.fields || []) {
    if (field.key === "forumVerdict" || field.key === "verdictNote") continue;
    if (valueFilled(values[field.key])) return true;
  }
  return false;
}

export function countFiltersWithEvidence(doc = {}) {
  let have = 0;
  for (const spec of SIX_FILTERS_FORM) {
    if (filterHasEvidence(doc[spec.key], spec)) have += 1;
  }
  return { have, total: SIX_FILTERS_FORM.length };
}

/** F2 actual vs division floor already written into check copy — not a new floor lookup. */
export function f2ActualVsFloor(doc = {}, check = {}) {
  const actual = Number(doc?.f2?.netMarginAtScale);
  if (!Number.isFinite(actual)) return null;
  const items = Array.isArray(check?.items) ? check.items : [];
  for (const it of items) {
    const m = String(it.text || "").match(
      /Net margin ([\d.]+)% (?:is below|clears) the ([\d.]+)% floor/i
    );
    if (m) {
      const floor = Number(m[2]);
      if (!Number.isFinite(floor)) return null;
      return { actual, floor, unit: "%" };
    }
  }
  return null;
}

/** F3 implied shelf price (stored Filter 2 MRP) vs already-computed safe max MRP. */
export function f3ActualVsCeiling(doc = {}) {
  const actual = Number(doc?.f2?.mrpInr);
  const ceiling = Number(doc?.f3?.marginElasticity?.maxMrpInr);
  if (!Number.isFinite(actual) || !Number.isFinite(ceiling)) return null;
  return { actual, ceiling, unit: "₹" };
}

export function formatScreenedDuration(ms) {
  if (ms == null || ms === "") return null;
  const n = Number(ms);
  if (!Number.isFinite(n) || n < 0) return null;
  const sec = Math.max(1, Math.round(n / 1000));
  return `${sec}s`;
}

export function formatOutputDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
