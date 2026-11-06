/**
 * Part 138 H — the narrative guard now enforces by default: a paragraph that names a number, date, brand or
 * regulation not found in the inputs or returned sources is rejected and the deterministic fallback is used.
 * Set NARRATIVE_GUARD=shadow to log without rejecting, or off to skip the check.
 */
export function narrativeGuardMode() {
  const mode = String(process.env.NARRATIVE_GUARD || "enforce").trim().toLowerCase();
  if (mode === "enforce" || mode === "off" || mode === "shadow") return mode;
  return "enforce";
}
