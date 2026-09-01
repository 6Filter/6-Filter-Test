/**
 * Browser-safe GO / NO-GO / WATCH helpers. No DB, no Node APIs.
 */

export function computeGoNoGoWatch(advisoryChecks = {}) {
  const relevant = ["f1", "f2", "f3", "f4"].map(
    (k) => advisoryChecks[k] || { checkLabel: "Evidence missing" }
  );
  const anyBelowFloor = relevant.some((c) => c.checkLabel === "Below floor");
  const allClearOrExempt = relevant.every(
    (c) => c.checkLabel === "Cleared" || c.checkLabel === "Exempt"
  );
  if (anyBelowFloor) return "NO-GO";
  if (allClearOrExempt) return "GO";
  return "WATCH";
}

export function goNoGoTone(classification) {
  if (classification === "GO") return "pass";
  if (classification === "NO-GO") return "fail";
  return "watch";
}

export function summarizeChecksForPrompt(advisoryChecks = {}) {
  return ["f1", "f2", "f3", "f4"]
    .map((k) => {
      const c = advisoryChecks[k] || {};
      const items = Array.isArray(c.items)
        ? c.items.map((it) => `  - [${it.status}] ${it.text}`).join("\n")
        : "";
      return `${k.toUpperCase()}: ${c.checkLabel || "Evidence missing"}\n${items}`;
    })
    .join("\n\n");
}
