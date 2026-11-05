/**
 * Part 134 D30 — unconfirmed AI COGS estimate detection.
 * Browser-safe. No I/O.
 */

function asNum(v) {
  if (v == null || String(v).trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * True when COGS still equals the AI suggestion and has not been confirmed.
 */
export function cogsIsUnconfirmedAiEstimate(f2 = {}, autofillStatus = {}) {
  const status = autofillStatus?.["f2.cogsAtScale"] || autofillStatus?.["f2.cogs"] || null;
  if (!status || typeof status !== "object") return false;
  if (status.confirmed === true) return false;
  const current = asNum(f2?.cogsAtScale);
  if (current == null) return false;
  const suggested = asNum(status.aiSuggested ?? status.value);
  if (suggested == null) return false;
  // Still the AI figure (within paisa)
  return Math.abs(current - suggested) < 0.005;
}
