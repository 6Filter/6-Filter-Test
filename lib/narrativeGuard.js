/** ffa9c1f enforced every failure. The default is now shadow: save the paragraph and log the reason. */
export function narrativeGuardMode() {
  const mode = String(process.env.NARRATIVE_GUARD || "shadow").trim().toLowerCase();
  if (mode === "enforce" || mode === "off" || mode === "shadow") return mode;
  return "shadow";
}
