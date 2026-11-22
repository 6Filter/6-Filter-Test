# 6 Filter Test — Score sprint: raise every aspect to the target (prompt for Cursor)

This is the score-targeted layer on top of `docs/prompts/Primus-AI_Ten_Actions_Master_Prompt.md`. **Every rule in that prompt still applies** (no secrets generated, stored or printed by you; test data only; never edit a supplied test; scoring files locked at v5.7 / `ba0156d2` unless `docs/DECISIONS.md` carries the owner's written approval; one commit per item; report honestly; stop at OWNER gates). Where this prompt and the master prompt differ, the master prompt wins. Re-extract the latest `primus-supplied-files.zip` first and check the manifest.

## 1. The scoreboard

The owner and I will rescore from the evidence you send, using `docs/prompts/Primus-AI_Platform_Scorecard.md` (the v2 table at the top and the sub-criteria below it). Current and target:

| Aspect | Now | Target | Points still available, and where they come from |
|---|---|---|---|
| Data safety | 59 | ~90 | backups running with an alert (+16), a restore proven on the owner's side (+7), OPERATIONS.md with the secrets list and key custody (+6), a "recently deleted" restore screen (+3) |
| Scoring and verdict | 65 | ~85 | Part 142 (+8), the margin decision built as v5.8 (+5), an independent rules model with property and mutation tests (+10), a calibration review (+4) |
| AI output quality | 45 | ~78 | the golden-set evaluation (+22), injection and adversarial tests (+8), the incomplete-research rate diagnosed and fixed (+5) |
| Functionality | 69 | ~88 | Part 142, the commodity half of Part 145 and the parity tick (+10), open defects closed (+5), the file-recognition matrix (+6) |
| Testing | 50 | ~85 | the coverage gate passing (+14), coverage, mutation and the oracle (+14), unique test names and a drift report (+5), CI that blocks a bad merge (+7) |
| Security | 60 | ~86 | the mirror private and exposed secrets rotated (+10), the route-by-role matrix (+10), the `npm audit` triage (+5), safe handling of the Render key (+3) |
| Performance | 73 | ~88 | the live headers verified (+4), server-side paging for the Log (+10) |
| Operations | 40 | ~82 | the nightly backup with an alert (+20), CI, `render.yaml` and an uptime monitor (+9), runbooks (+6), monitoring (+6) |

Overall now about **58**, target about **85**. Points that depend on an owner decision or input are marked **OWNER**; do not stall on them: do the parallel work and report what you are waiting for.

## 2. The evidence I need after each wave (so the rescoring is quick and honest)

Send for each task: the command and its **final line** (secrets masked); the test file and its pass count, run **untouched**; the commit hash on the private repository and on the mirror, and the live hash from `/api/health`; any defect found (ID, severity S1 to S4); and what you are waiting for. For the numbers below, send exactly the figure named. No claim without its evidence; "NOT DONE" is an acceptable answer.

## 3. Housekeeping first (half a day; it unblocks everything)

**H1. Split the unpushed work.** The working tree mixes MCP, the Log layout, and hygiene files (`render.yaml`, `.github/workflows/*`, `.gitignore`, `verifyDatabaseCopy.mjs`). Make three branches and three commits: MCP only; Log layout only (say whether Part 155 will replace it); hygiene only. Deploy only after the owner says so. Keep `.cursor/` and `docs/RENDER_ENV_CHANGES.md` out of anything that reaches the public mirror (and out of git: `.gitignore`).
**H2. Verify Part 154 live.** Run, and send the output of, `curl -I -H "Accept-Encoding: gzip" https://ck-6-filter-test-88wu.onrender.com/` and the same for the app bundle under `/assets/`: expect `Content-Encoding: gzip` on the bundle, `Cache-Control: public, max-age=31536000, immutable` on hashed files, `no-cache` on the page, `no-store` on `/api/*`. (+4 Performance)
**H3. Which hash is live?** Report the live commit from `/api/health`, the private repository's head and the mirror's head, and what `221abe5` is. They must be explainable.
**H4. Render access hygiene** (+3 Security): the Render API key in `%USERPROFILE%\.render\cli.yaml` can read every production secret. From now on: no environment change unless the owner's message names it; use a single-variable update if the Render API offers one (check the current docs), otherwise compare the variable count before and after and abort on any difference; log every change (names only) in `docs/RENDER_ENV_CHANGES.md`; never read or print a secret value. Propose how to remove standing access (logout when not deploying, a key rotated after each session) and wait for the owner's choice.

## 4. Wave 1 — Safety (the largest block of points; most of it needs the owner)

**W1-1. Backup (Data safety +16, Operations +20).** Follow Item 1 of the master prompt and `Primus-AI_Solo_Owner_Guide.md` section 2. **OWNER:** generate the backup token and key yourself, set `BACKUP_TOKEN`, `BACKUP_ENCRYPTION_KEY` and `OPS_ALERT_WEBHOOK_URL` in Render, save the token and webhook files, confirm the synced folder, run the first backup by hand. **You:** the launchers and the two scheduled tasks already exist; make sure they use the **latest** `pullBackupToFolder.mjs`; run `testPullBackupToFolder.mjs` untouched (11 checks); prove an alert with a deliberately failed run on the scratch setup; do the **restore drill** into a scratch database with the files byte for byte. **Evidence:** live `/api/health` showing a `lastBackupAt` within the last day; the restore drill's `ALL MATCH` line; the alert message with no secret; the export's peak memory from Render Metrics.
**W1-2. The mirror (Security +10).** Item 2 of the master prompt. **OWNER:** the GitHub and Render steps in the Solo Owner Guide section 3. **You:** the history scan of a fresh clone, the rotation list (never advise changing `DEPARTMENT_KEY_ENCRYPTION_SECRET` or `BACKUP_ENCRYPTION_KEY` without a re-encryption plan), the sync allowlist, `.gitignore`, removing real emails from fixtures, the scanner in CI. **Evidence:** the masked scan summary; the old address "not found" signed out; a deploy from the private source.
**W1-3. Delete `D:\Primus-safety\render-backup-secrets.txt`** only after the owner confirms their own backup secrets are set. Its values are retired.

## 5. Wave 2 — Operations and Security hygiene (Cursor, 2 to 4 days; no OWNER blocker except two dashboard clicks)

**W2-1. Item 8 (Operations +9, +6 with monitoring).** `render.yaml` matching the live plan (**OWNER** names the plan); `.github/workflows/ci.yml` and the keep-alive workflow (the **OWNER** adds them through GitHub if the token lacks the workflow scope); add `backupAgeHours` and `backupStale` to `/api/health` (nothing else changes) and test that a stale backup flips the flag; **OWNER** sets a free uptime monitor on `/api/health` that alerts on `"ok":false` or `"backupStale":true`. Update `docs/OPERATIONS.md`. **Evidence:** a failing test blocks a merge; a test alert reached the owner.
**W2-2. Item 9 (Security +10, +5).** The unauthenticated sweep as a permanent test (today 104 of 120 requests refused, 6 allowed, none leaking), the route-by-role matrix including `/mcp`, the OAuth and discovery paths and the MCP tools; XSS in exports; SQL injection; cookie flags; the `npm audit --omit=dev` triage with no `--force`. **Evidence:** the matrix size and pass line; the audit table (fixed, not reachable, accepted with a reason).

## 6. Wave 3 — Reliability (new finding; Cursor, start now, no owner input)

**W3-1. The incomplete-research rate (AI +5, and Functionality).** Live `/api/health` shows `researchIncomplete: 70` with 495 ideas (earlier about 6% of screened ideas). Diagnose before changing anything: for every incomplete idea, which filter did not finish and why (provider rate limit or error, timeout, malformed output, a guard refusing, Filter 4 never starting), and the date it happened (a single bad day, or a trend). Send a table by cause and by filter, and the share of **evaluated** ideas (not of all ideas). Then propose fixes that do not change scoring (retry with backoff, saving partial results, a clear "Screen again" state, a health field `researchIncompleteRate` and an alert above 5%); anything that changes a score or a verdict needs `docs/DECISIONS.md` approval. **Target:** under 3% of new screenings. **Evidence:** the cause table; the rate before and after a fix on new screenings.

## 7. Wave 4 — Verdict and AI quality (needs the owner's decisions and inputs)

**W4-1. The margin decision and Part 142 (Scoring +13).** Items 7 and 5 of the master prompt: `docs/DECISIONS.md`, the read-only impact replay on a copy of the data, the tests for both options; implement only after the owner writes the decision; one ruleset v5.8 with the new fingerprint, golden file and logic lock; Part 142 (a fooled AI earns nothing) with `testQualityNotQuantity.mjs` and `testImprovementPathValid.mjs` passing untouched. **Evidence:** the impact report; both supplied tests' final lines; the new fingerprint; nothing deployed before approval.
**W4-2. The calibration review (Scoring +4).** With the owner and NPD heads: 30 to 50 past ideas with known outcomes against the platform's verdict. Prepare the comparison table; any threshold change is the owner's decision.
**W4-3. The golden-set evaluation (AI +22, +8).** Item 6 of the master prompt. **OWNER:** a capped test key, at least 30 labelled ideas in `golden_set_labels_template.csv`, the acceptance thresholds. **You:** the cost estimate first and the owner's approval; the stubbed-AI contract tests with injection cases; the three-run live evaluation; the 100-citation source audit; the adversarial set of 10. **Evidence:** the accuracy per check against the thresholds; the run-to-run variance; the cost and time per idea; the audit result.

## 8. Wave 5 — Testing (Cursor; the biggest block of points that needs no owner input)

**W5-1. Item 4 of the master prompt (Testing +33).** Run the inventory three times (identical), extend it to every screen, fill the coverage map until `testCoverageMap.mjs` passes (exemptions under 5%, each with a reason the owner approves), test every control's effect, build the independent rules model on at least 5,000 generated ideas with property tests, run Stryker on the scoring and verdict files (at least 90%) and c8 (at least 95% lines and 90% branches there), rename the colliding test files. **Evidence:** the gate's final line and its mapped percentages; the oracle's disagreement count (zero, or each one explained); the mutation score; the c8 numbers per file.

## 9. Wave 6 — Scale (Performance +10; after W1-1 and W2-2)

**W6-1. Part 155** (`Primus-AI_Part155_LogPaging_Cursor_Prompt.md`): the Log in pages, exact summaries, visibility applied before the page is cut and before any count, filters and exports on the server. Its eight tests are the acceptance criteria, and its budgets (first page under 150 KB and 10 database calls; within 2 seconds at 2,000 ideas with the database 250 ms away) must be shown. **Evidence:** the eight passing test lines and the measured budgets.

## 10. Functionality leftovers (fold into the waves above, in this order)

The Part 145 pure-commodity scoring over 11 checks and the parity tick (after the margin decision), the opening form within 1.25 screens, the Filter 4 "web check" column state, the Log layout (once H1 has isolated it), the file-recognition matrix of the verification prompt (types, both size limits, corrupt, password-protected, wrong extension, Unicode, injection in CSV) and a "recently deleted, restore" screen. Close each against its supplied test where one exists.

## 11. What stays frozen

The MCP connector stays at the pilot (two allowlisted people, three read tools, `save_draft`, `upload_evidence` and `screen_idea` off). No new MCP work until the access matrix and the audit email fix are deployed and the owner has run the signed-in probe again. Do not start new features. Part 144 waits for the owner's written timing.

## 12. Order, and what to send back

Run H1 to H4 now; W1 as soon as the owner's secrets are in; W2, W3 and W5 in parallel with whatever W1 is waiting for; W4 as the owner's decisions and labels arrive; W6 last. **After each wave send me the evidence in section 2 and I will rescore.** Stop rule: no wave starts a feature while an S1 is open.
