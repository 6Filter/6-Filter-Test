import { computeGoNoGo, goNoGoTone, goNoGoIsFloorFailure } from "../lib/goNoGo.js";
import { stripCavinKareMentions } from "../lib/sanitizeAiText.js";
import { buildResearchFindings } from "../lib/researchFindings.js";
import { buildSuggestions } from "../lib/propositionAiFirstPass.js";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const missing = computeGoNoGo({});
assert(missing === "NO-GO", `incomplete evidence should be NO-GO, got ${missing}`);
assert(goNoGoTone(missing) === "fail", "incomplete should use fail tone");
assert(!goNoGoIsFloorFailure({}), "empty checks are incompleteness, not a floor failure");

const go = computeGoNoGo({
  f1: { checkLabel: "Cleared" },
  f2: { checkLabel: "Exempt" },
  f3: { checkLabel: "Cleared" },
  f4: { checkLabel: "Cleared" },
});
assert(go === "GO", `all clear should be GO, got ${go}`);
assert(goNoGoTone(go) === "pass", "GO should use pass tone");

const incomplete = computeGoNoGo({
  f1: { checkLabel: "Evidence missing" },
  f2: { checkLabel: "Cleared" },
  f3: { checkLabel: "Cleared" },
  f4: { checkLabel: "Cleared" },
});
assert(incomplete === "NO-GO", "Evidence missing should fold into NO-GO");
assert(
  !goNoGoIsFloorFailure({
    f1: { checkLabel: "Evidence missing" },
    f2: { checkLabel: "Cleared" },
    f3: { checkLabel: "Cleared" },
    f4: { checkLabel: "Cleared" },
  }),
  "Evidence missing is not a floor failure"
);

const floorChecks = {
  f1: { checkLabel: "Below floor" },
  f2: { checkLabel: "Cleared" },
  f3: { checkLabel: "Cleared" },
  f4: { checkLabel: "Cleared" },
};
assert(computeGoNoGo(floorChecks) === "NO-GO", "Below floor should be NO-GO");
assert(goNoGoIsFloorFailure(floorChecks), "Below floor should count as a floor failure");

let warned = 0;
const origWarn = console.warn;
console.warn = (...args) => {
  if (String(args[0] || "").includes("[primus/sanitize]")) warned += 1;
  origWarn(...args);
};

const leaked =
  "Herbal hair oil is a growing India category. This would be a new category for CavinKare. Pack size is typically 100ml.";
const stripped = stripCavinKareMentions(leaked);
assert(!/cavinkare/i.test(stripped), `CavinKare mention still present: ${stripped}`);
assert(stripped.includes("Herbal hair oil"), "innocent first sentence was dropped");
assert(stripped.includes("Pack size"), "innocent last sentence was dropped");
assert(warned >= 1, "console.warn did not fire when a CavinKare sentence was stripped");

const divisionCopy =
  "Net margin 18% vs the 15% division floor. Hair Care is the matched division.";
assert(stripCavinKareMentions(divisionCopy) === divisionCopy, "division language should be left alone");

const findings = buildResearchFindings({
  filter1: {
    verdictReason: "Looks like a CavinKare-adjacent hair oil. Category size is thin.",
    benchmarkName: "",
  },
  filter4: {
    verdictReason: "Format is rising. CavinKare already sells a similar pack.",
  },
});
assert(!/cavinkare/i.test(findings.f1.benchmarkEvidence || ""), "benchmarkEvidence was not sanitized");
assert(!/cavinkare/i.test(findings.f4.threatEvidence || ""), "threatEvidence was not sanitized");

const suggestions = buildSuggestions(
  { generalCategory: "Ready-to-eat snacks. New for CavinKare." },
  { threatRegister: "Private-label threat is rising." }
);
assert(!/cavinkare/i.test(suggestions.top?.category || ""), "generalCategory/category was not sanitized");

console.warn = origWarn;
console.log("part42 ok");
