import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(import.meta.url), "..", "..");
const dir = mkdtempSync(join(tmpdir(), "primus-cal-"));

const provisional = join(dir, "prov.json");
writeFileSync(
  provisional,
  JSON.stringify({
    provisional: true,
    ideas: [{ id: "a", expected: { plan: "strong" }, assessments: { plan: { relevance: "strong", specific: true } } }],
  })
);
const refuse = spawnSync(process.execPath, [join(root, "scripts/measureRelevanceGrading.mjs"), provisional], {
  encoding: "utf8",
});
assert.equal(refuse.status, 2);
assert.match(refuse.stderr || "", /provisional/i);

const labelled = join(dir, "labelled.json");
writeFileSync(
  labelled,
  JSON.stringify({
    provisional: false,
    ideas: [
      {
        id: "ok",
        expected: { plan: "strong", route: "strong" },
        assessments: {
          plan: { relevance: "strong", specific: true },
          route: { matches: "yes", confidence: "high" },
        },
      },
      {
        id: "weak",
        expected: { plan: "weak" },
        assessments: { plan: { relevance: "strong", specific: false } },
      },
    ],
  })
);
const ok = spawnSync(process.execPath, [join(root, "scripts/measureRelevanceGrading.mjs"), labelled], {
  encoding: "utf8",
});
assert.equal(ok.status, 0, ok.stderr);
assert.match(ok.stdout, /plan:/);
assert.match(ok.stdout, /exact=/);

console.log("PASS testCalibrationScript");
