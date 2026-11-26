/** Copy human-typed text out of server-owned research objects. Does not drop the stored copy. */
import { TECH_SHIFT_DIMENSIONS } from "./techShiftRisk.js";

function isBlankMap(value) {
  return value == null || value === "";
}

function responsesFromUserInputs(userInputs) {
  if (!userInputs || typeof userInputs !== "object" || Array.isArray(userInputs)) return {};
  const out = {};
  for (const key of TECH_SHIFT_DIMENSIONS) {
    const text = String(userInputs?.[key]?.pov || "").trim();
    if (text) out[key] = text;
  }
  return out;
}

export function responsesFromRisk(risk) {
  const dimensions = risk?.dimensions;
  if (!dimensions || typeof dimensions !== "object") return {};
  const out = {};
  for (const [key, cell] of Object.entries(dimensions)) {
    const text = String(cell?.userResponse || "").trim();
    if (text) out[key] = text;
  }
  return out;
}

export function liftStoredMitigations(f4) {
  const next = f4 && typeof f4 === "object" ? { ...f4 } : {};
  const fromRisk = responsesFromRisk(next.techShiftRisk);
  const fromViews = responsesFromUserInputs(next.userInputs);
  const current =
    next.f4MitigationResponses && typeof next.f4MitigationResponses === "object" && !Array.isArray(next.f4MitigationResponses)
      ? next.f4MitigationResponses
      : {};
  // Explicit mitigations win over Your view when both are present (import / dual boxes).
  const combined = { ...fromRisk, ...fromViews, ...current };
  if (Object.keys(combined).length) {
    next.f4MitigationResponses = combined;
  }
  return next;
}

/**
 * A client edit of the F3 ends, or a response typed inside techShiftRisk,
 * is stored on the human-owned key. The server-owned object is left as merged.
 */
export function liftHumanFilterKeys(column, merged, incoming, { stale = false, writer = "client", previous = null } = {}) {
  if (!merged || typeof merged !== "object") return merged;
  const next = { ...merged };
  if (column === "f4") {
    const fromPrevious = {
      ...responsesFromRisk(previous?.techShiftRisk),
      ...responsesFromUserInputs(previous?.userInputs),
    };
    const current =
      next.f4MitigationResponses && typeof next.f4MitigationResponses === "object" && !Array.isArray(next.f4MitigationResponses)
        ? next.f4MitigationResponses
        : {};
    const fromIncomingRisk =
      !stale && writer !== "server" && incoming && !isBlankMap(incoming.f4MitigationResponses)
        ? responsesFromRisk(incoming.techShiftRisk)
        : {};
    const fromIncomingViews = responsesFromUserInputs(incoming?.userInputs || next.userInputs);
    // Your view fills gaps; an explicit mitigation response still wins when present.
    const combined = { ...fromPrevious, ...fromIncomingViews, ...current, ...fromIncomingRisk };
    if (Object.keys(combined).length) next.f4MitigationResponses = combined;
  }
  if (stale || writer === "server" || !incoming || typeof incoming !== "object") return next;
  if (column === "f3" && incoming.marginElasticity && incoming.marginElasticity.aiSourced === false) {
    const ends = {};
    if (incoming.marginElasticity.minMrpInr != null && incoming.marginElasticity.minMrpInr !== "") {
      ends.minMrpInr = incoming.marginElasticity.minMrpInr;
    }
    if (incoming.marginElasticity.maxMrpInr != null && incoming.marginElasticity.maxMrpInr !== "") {
      ends.maxMrpInr = incoming.marginElasticity.maxMrpInr;
    }
    if (Object.keys(ends).length) {
      const current = next.f3RangeOverride && typeof next.f3RangeOverride === "object" ? next.f3RangeOverride : {};
      next.f3RangeOverride = { ...current, ...ends };
    }
  }
  return next;
}
