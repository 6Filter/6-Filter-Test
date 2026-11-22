6 FILTER TEST: SUPPLIED FILES FOR CURSOR  (one bundle, laid out as it should sit in the repository)
=================================================================================================

NAME NOTE: the product is now called 6 Filter Test (it used to be called Primus.AI). A few technical names still say primus on purpose (the folder primus-secrets, backup files named primus-backup-*, the primus_session cookie, the Primus-AI_*.md file names): do not rename them.

HOW TO INSTALL
  1. Extract this zip INTO THE ROOT OF THE REPOSITORY (the folder that holds package.json) so that "scripts/", "reference/" and "docs/" merge with the existing folders.
  2. None of these files has the same name as a test already in the repo (the 28 that do were left out on purpose, so nothing is overwritten).
  3. Do NOT edit any file marked "supplied". If a supplied test fails, report the defect. If you think a test is wrong, say so and why; the owner decides.

FIRST THING TO RUN (Part 154: compress and cache; already passed)
  npm run build
  TEST_DATABASE_URL=postgres://postgres:...@127.0.0.1:5433/postgres node scripts/testHttpPerformance.mjs
  Expected: 7 checks pass. (On a server without Part 154, four of the seven fail.) It needs a LOCAL Postgres, never the live database.

VERSION NOTE (20 Nov, fifth refresh): the coverage gate now needs RUNTIME EVIDENCE. New: scripts/coverage/touches.mjs, scripts/coverage/recordTouches.mjs, an updated scripts/coverage/testCoverageMap.mjs (mandatory M6/M7: the test named for a control must have really touched it, so a table of control names inside a test no longer counts) and an updated scripts/uiHarness.mjs that records clicks, edits and requests when PRIMUS_TOUCH_LOG is set. testCoverageTouches.mjs (9 checks) proves it. Extract these TOGETHER: the harness imports touches.mjs.

VERSION NOTE (20 Nov, third refresh): probeMcpSurface.mjs now reports a switched-off endpoint as OFF (PASS) and has a signed-in mode: node scripts/probeMcpSurface.mjs --url https://<host>/mcp --login (you sign in once in your browser; the token is never printed) that proves the MCP token is refused on the website API and as a cookie, that no write/spend tool is advertised, and that refresh tokens rotate with reuse detection. testProbeMcpSurface.mjs now has 26 checks. Fourth refresh fix: a rate-limit reply (429) is never counted as a refusal in the refresh-token checks A5b/A5c: it is waited out once, and if it persists those lines are INCONCLUSIVE warnings, not passes.

VERSION NOTE (20 Nov, second refresh): the backup scripts and the MCP probe no longer call process.exit() after network work (a Windows-only crash, exit code 3221226505). Re-extract this zip over the earlier one; the manifest lists the new checksums.

START HERE: docs/prompts/Primus-AI_Ten_Actions_Master_Prompt.md  (one prompt that closes the ten open actions in order)
AI CALL RELIABILITY TEST: scripts/testAnthropicRetryContract.mjs (independent, 14 checks: retries, no retry on 4xx, Retry-After, timeout signal, concurrency limit of 4, no secret in logs)
MONDAY SPRINT (the business heads test on Monday 23 Nov): docs/prompts/Monday_Readiness_Plan.md and docs/prompts/Cursor_Monday_AI_Quality_Prompt.md ; scripts/mondayPreflight.mjs (read-only: is the live site ready? 15-check test: scripts/testMondayPreflight.mjs)
STATUS AND NEXT STEPS FOR CURSOR (read first): docs/prompts/Cursor_Status_And_Next_Steps_Prompt.md
OWNER CHECKLIST (step by step: where to go, what to do, what each item is worth): docs/prompts/6-Filter-Test_Owner_Checklist.md
SCORE SPRINT 2 (current): docs/prompts/Primus-AI_Score_Sprint_2_Cursor_Prompt.md  (everything Cursor can do now, plus the owner's ranked unlock list)
SCORE SPRINT: docs/prompts/Primus-AI_Score_Sprint_Cursor_Prompt.md  (the score-targeted layer: current and target scores, points per task, waves, evidence needed)

WHAT IS IN HERE
  scripts/            the supplied tests and tools (see the list below)
  scripts/coverage/   inventory.mjs and testCoverageMap.mjs (the coverage gate)
  reference/          reference implementations and scratch diffs (NOT production code): read, do not paste
  docs/prompts/       the prompts for the open jobs (start with Primus-AI_Ten_Actions_Master_Prompt.md); golden_set_labels_template.csv is the labelling sheet for the AI evaluation

SUPPLIED TESTS AND WHAT EACH PROVES
  testHttpPerformance.mjs        Part 154: the server compresses and caches, bytes unchanged (7 checks)
  testQueryCount.mjs             Part 152: the Log makes a constant number of database calls, fast even with the database 250 ms away (5 checks)
  testReportedIssues.mjs         the three user reports: Filter 4 wording, the Submit bar and Why panel agree, no circular advice (10 checks)
  testAnswerGuard.mjs            Part 150: placeholder answers refused, never suggested. Contract: answerProblem returns {code,message} or null; sanitizeSuggestion returns {offer,text|reason}; submitBarSummary is the bar helper
  testQualityNotQuantity.mjs, testImprovementPathValid.mjs        Part 142 (NOT BUILT yet)
  testProofAnalysis.mjs, testFinalScoring.mjs, testProofFlowApi.mjs   Part 144 (NOT BUILT yet; reference/proofAnalysis.reference.mjs and proofEndpoint.scratch.mjs)
  pullBackupToFolder.mjs + testPullBackupToFolder.mjs  saves the app's OWN encrypted backup into a folder the owner controls (OneDrive/SharePoint sync or a drive); no cloud account, no database; Slack alert on failure; a 'status' staleness check (11 checks). USE THIS FIRST. See docs/prompts/Primus-AI_Solo_Owner_Guide.md
  exportToBlob.mjs + testExportToBlob.mjs  copies the app's OWN encrypted backup into Azure Blob, verified, restorable; needs NO database (13 checks). USE THIS ONE for the nightly backup. See docs/prompts/Primus-AI_Backup_Setup_Runbook.md
  testBlobBackup.mjs + blobBackup.mjs      an optional second method (pg_dump); needs a REAL PostgreSQL (not PGLite): not needed now
  testInputReview.mjs, testInputReviewSubmit.mjs, testManagerReviewFirstTimeHead.mjs
        three tests of EARLIER specs (Parts 132 and 120) that the current build fails. They are NOT your own tests: they are new to the repo. For each decide: the build drifted (fix it) or the spec is out of date (tell the owner).
  testDraftSaveAndFilter4.mjs, testTypedValuesNeverRevert.mjs      drafts always save, typed values never revert (each has one known older failure: a bare-API GST save, and the "Draft saved" time label)
  probeMcpSurface.mjs + testProbeMcpSurface.mjs   a black-box SAFETY PROBE for the live MCP endpoint and its OAuth sign-in: run it against https://<host>/mcp (read-only; logs in as nobody); proven against a safe fake server and 12 flawed ones (including a prefix-style redirect allowlist). A FAIL means switch /mcp off until fixed. See docs/prompts/Primus-AI_MCP_Plan_Reviewed.md
  verifyDatabaseCopy.mjs         compares two databases table by table (use after any restore or move). New options: --timestamps ms (a restore from the app's backup loses microseconds) and --ignore-table backup_exports
  scanForSecrets.mjs             read-only scan for secrets, personal data and stray files; never prints a whole secret
  testFormLayout.py              the two-column layout, measured in a real browser (pip install playwright; playwright install chromium)
  uiHarness.mjs                  the page harness the tests share (it presses "Adjust cost and margin" so cost boxes can be typed into)
  validateRelease.mjs            runs the acceptance tests per Part; it BACKS UP and reports (DRIFT) any file it would replace

THE COVERAGE GATE
  node scripts/coverage/inventory.mjs            lists every API route and every control (run it three times: it must give identical output)
  node scripts/coverage/testCoverageMap.mjs --report    fails until every route and control has a test or a written exemption

NOTES
  - Never print or commit a password, connection string, SAS URL or key.
  - The scoring files are locked (v5.7, fingerprint ba0156d2). Do not change them without the owner's written approval.
  - Every file's SHA-256 is in MANIFEST.sha256, so you can tell if one has been changed.
