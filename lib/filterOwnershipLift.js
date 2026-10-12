/** Copy human-typed text out of server-owned research objects. Does not drop the stored copy. */

function isBlankMap(value) {
  return value == null || value === "";
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
  const current =
    next.f4MitigationResponses && typeof next.f4MitigationResponses === "object" && !Array.isArray(next.f4MitigationResponses)
      ? next.f4MitigationResponses
      : {};
  if (Object.keys(fromRisk).length || Object.keys(current).length) {
    next.f4MitigationResponses = { ...fromRisk, ...current };
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
    const fromPrevious = responsesFromRisk(previous?.techShiftRisk);
    const current =
      next.f4MitigationResponses && typeof next.f4MitigationResponses === "object" && !Array.isArray(next.f4MitigationResponses)
        ? next.f4MitigationResponses
        : {};
    const fromIncoming =
      !stale && writer !== "server" && incoming && !isBlankMap(incoming.f4MitigationResponses)
        ? responsesFromRisk(incoming.techShiftRisk)
        : {};
    const combined = { ...fromPrevious, ...current, ...fromIncoming };
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
