/**
 * Hand-run accuracy check for AI-first division detection (costs a few cents).
 * Usage: node scripts/measureDivisionDetection.mjs
 * Exits 1 if accuracy < 90%.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(fileURLToPath(import.meta.url));
const seedPath = path.join(root, "division-detection-gold-seed.json");
const seed = JSON.parse(readFileSync(seedPath, "utf8"));
const items = Array.isArray(seed.items) ? seed.items : [];
if (!items.length) {
  console.error("No gold items in division-detection-gold-seed.json");
  process.exit(1);
}

const { resolveDivisionSilently } = await import("../lib/filters/resolveDivisionSilent.js");
const { LOCKED_DIVISION_NAMES } = await import("../lib/lockedConstants.js");

const labels = [...LOCKED_DIVISION_NAMES, null];
const matrix = Object.fromEntries(labels.map((a) => [String(a), Object.fromEntries(labels.map((b) => [String(b), 0]))]));

let correct = 0;
let abstained = 0;
const misses = [];

for (const item of items) {
  const expected = item.expectedDivision || null;
  const result = await resolveDivisionSilently({
    name: item.name || "",
    category: item.category || "",
    ideaDescription: item.description || "",
  });
  const got = result.division || null;
  matrix[String(expected)][String(got)] += 1;
  if (!got) abstained += 1;
  if (got === expected) {
    correct += 1;
    console.log(`OK  ${item.id}: ${got}`);
  } else {
    misses.push({ id: item.id, expected, got, reason: result.reason, confidence: result.confidence });
    console.log(`MISS ${item.id}: got=${got} expected=${expected} conf=${result.confidence}`);
  }
}

const accuracy = correct / items.length;
console.log("\nConfusion matrix (rows=expected, cols=predicted):");
const header = ["expected\\pred", ...labels.map(String)];
console.log(header.join("\t"));
for (const exp of labels) {
  console.log([String(exp), ...labels.map((pred) => matrix[String(exp)][String(pred)])].join("\t"));
}
console.log(`\nAccuracy: ${(accuracy * 100).toFixed(1)}% (${correct}/${items.length}); abstained=${abstained}`);
if (misses.length) {
  console.log("Misses:");
  for (const m of misses) console.log(`  ${m.id}: expected=${m.expected} got=${m.got} (${m.confidence}) ${m.reason || ""}`);
}

if (accuracy < 0.9) {
  console.error("FAIL: accuracy below 90%");
  process.exit(1);
}
console.log("PASS measureDivisionDetection ≥ 90%");
process.exit(0);
