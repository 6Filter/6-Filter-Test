/**
 * The failing-set gate itself: exact match, a new failure is refused, a silent pass is refused.
 */
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { diffRegressionFailures, expectedRegressionFailures, loadRegressionBaseline } from "./regressionBaseline.mjs";

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const baseline = loadRegressionBaseline(scriptsDir);
let failed = 0;
const check = (id, n, ok, d = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${id}  ${n}${d ? "  [" + d + "]" : ""}`);
  if (!ok) failed += 1;
};

check("G0", "the committed baseline lists exactly 14 unique names", baseline.names.length === 14, `${baseline.names.length}`);

const exact = diffRegressionFailures(baseline.names, baseline.names);
check("G1", "the recorded set against itself is an exact match (the hook would pass)", exact.ok && exact.extra.length === 0 && exact.missing.length === 0);

const negative = diffRegressionFailures([...baseline.names, "testDeliberateFail.mjs"], baseline.names);
check(
  "G2",
  "NEGATIVE: add a deliberately failing test and the hook fails (extra name, set grew)",
  !negative.ok && negative.extra.length === 1 && negative.extra[0] === "testDeliberateFail.mjs" && negative.missing.length === 0,
  negative.message.replace(/\n/g, " | ")
);

const silent = diffRegressionFailures(baseline.names.slice(1), baseline.names);
check(
  "G3",
  "a baseline test that starts passing silently is a refused push",
  !silent.ok && silent.missing.length === 1 && silent.missing[0] === baseline.names[0] && silent.extra.length === 0,
  silent.message.replace(/\n/g, " | ")
);

const both = diffRegressionFailures(["testBrandNewFail.mjs"], baseline.names);
check(
  "G4",
  "a grown set and a silent pass together are both reported",
  !both.ok && both.extra.includes("testBrandNewFail.mjs") && both.missing.length === 14,
  `extra ${both.extra.length} missing ${both.missing.length}`
);

assert.equal(typeof baseline.byName[baseline.names[0]], "string");
check("G5", "every baseline row carries a one-line reason", baseline.names.every((n) => String(baseline.byName[n] || "").length > 8));

const pgExpected = expectedRegressionFailures(baseline, { postgres: true });
check(
  "G6",
  "the Postgres half keeps the clone-14 and only the documented Postgres-only extras",
  pgExpected.length === baseline.names.length + baseline.postgresNames.length &&
    baseline.postgresNames.includes("testTeamAndFieldAccess.mjs") &&
    !baseline.names.includes("testTeamAndFieldAccess.mjs")
);

const pgExtra = diffRegressionFailures([...pgExpected, "testDeliberateFail.mjs"], pgExpected);
check(
  "G7",
  "NEGATIVE on the Postgres half: an extra failing name is still refused",
  !pgExtra.ok && pgExtra.extra.length === 1 && pgExtra.extra[0] === "testDeliberateFail.mjs"
);

const pgSilent = diffRegressionFailures(pgExpected.filter((n) => n !== "testTeamAndFieldAccess.mjs"), pgExpected);
check(
  "G8",
  "a Postgres-only baseline row that starts passing silently is a refused push",
  !pgSilent.ok && pgSilent.missing.length === 1 && pgSilent.missing[0] === "testTeamAndFieldAccess.mjs"
);

console.log(failed ? `\n${failed} CHECK(S) FAILED` : "\nPASS regression baseline gate (including the negative extra-failure case)");
process.exitCode = failed ? 1 : 0;
