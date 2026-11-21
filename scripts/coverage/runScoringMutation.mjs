/**
 * Fast scoring/verdict suite for Stryker. No Postgres. Exit 1 on any failure.
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

process.env.REQUIRE_POSTGRES_TESTS = "0";
process.env.SCORING_MUTATION = "1";
delete process.env.TEST_DATABASE_URL;
delete process.env.DATABASE_URL;

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const files = [
  "scripts/testGoNoGoMutationKill.mjs",
  "scripts/testScoreSlotsMutationKill.mjs",
  "scripts/testPropositionScoringMutationKill.mjs",
  "scripts/testScoringGolden.mjs",
  "scripts/coverage/testScoringOracle.mjs",
];
if (process.env.SCORING_MUTATION !== "1") {
  files.push(
    "scripts/testHardScoreLock.mjs",
    "scripts/testScoringSpecAdherence.mjs",
    "scripts/testJunkDropsCredit.mjs",
    "scripts/testSealOutputHelpers.mjs",
    "scripts/testFilter3Helpers.mjs",
    "scripts/testScoreStability.mjs",
    "scripts/testScoreInputLock.mjs",
  );
}

for (const file of files) {
  const r = spawnSync(process.execPath, [file], { cwd: root, stdio: "inherit", env: process.env });
  if ((r.status ?? 1) !== 0) process.exit(r.status ?? 1);
}
process.exit(0);
