# 6 Filter Test — Platform scorecard (20 November 2026; v2 at the top)

**Build checked:** the latest zip (`ck6filter-main__1_`, reported as commit `703493c`), run on a real PostgreSQL and in real browsers (Chromium), plus the earlier builds for comparison. **The Render database was upgraded to the $6 paid plan** (reported by the owner; I could not see the Render account).

## SCORECARD v2 — where the platform stands now (20 November 2026, evening)

The per-aspect tables further down are the **baseline** taken earlier today. This section is the **current** position after everything that has changed since: Part 154 shipped, the MCP connector built and probed, the database on the paid plan, and what the live health page shows. Where a score rests on something I could not check myself it is marked *provisional*.

| Aspect | Baseline | **Now** | Target after the score sprint | What moved it |
|---|---|---|---|---|
| **Data safety** | 59 | **76** | ~90 | **A restore has been proven on a copy** (Cursor's drill, 21 Nov, reported with full evidence): the newest backup decrypts and authenticates; a damaged file and a wrong key both fail; all 35 tables restore with exactly the recorded row counts (6,433 rows; 497 ideas, 33 users, 26 uploaded files whose sizes and SHA-256 all match); the app boots on the restored copy, health is ok, the fingerprint is `ba0156d2` and a stored NO-GO verdict reopens as NO-GO; plaintext and scratch data deleted. Credit held back because the repository's own restore script (`importExport.mjs`) **refused the clean target** and could not restore the MCP tables (they are not created until the connector runs), so Cursor used equivalent logic in a temporary script that has since been deleted. **The scheduled run is now proven too:** Windows started the backup task itself at 19:12 IST and it stored a third verified backup (19,751,306 bytes, 35 tables, 6,434 rows, `LastTaskResult 0`); the row count grows by exactly one each time (the app's own log row), which also shows no new ideas were created that day. Still open: an alert (no Slack address yet), and the live backup export includes sensitive short-lived tables. Plus Render's 3-day point-in-time recovery. |
| **Scoring and verdict rules** | 65 | **72** *(prov.)* | ~85 | An independent oracle (it never imports the app's scoring code; it restates the band, hard-stop and cap rules from `lockedConstants`) now covers the verdict too: bands at 59/60/80/81, the Filter 4 hard stop, the GO cap, INCOMPLETE, mark-downs, 25 identical repeats, 5,000 random boards (reported, local branch, not verified by me). New tests now kill the verdict-bearing mutants (bands 59/60/80/81, the Filter 4 hard stop, the GO cap, INCOMPLETE, mark-downs, the fixed 18-slot denominator): behavioural mutation score 48.1% over `goNoGo.js` (59.2%), `scoreSlots.js` (43.6%) and `propositionScoring.js` (37.2%), up from 16% and still below the 90% bar (reported, local branch `t1-mutation-kill`). Part 142 and the margin decision are still open. v5.7, `ba0156d2`. |
| **AI output quality** | 47 | **45** | ~78 | **Unfinished research is 22% of evaluated ideas** (70 of 320 incomplete, plus 43 marked failed; 14% of all 497), mostly Filter 1 steps with no stored error, a Filter 3 "research failed" cluster, and a spike on 2 November, concentrated in R&D and NPD (Cursor's analysis of a restored copy). **The stored data does not record the cause**, so my theory that rate limits and timeouts are to blame is plausible but unproven. **What the code shows:** the central AI call (`lib/callAnthropic.js`, not a locked file) has no timeout, no automatic retry and no concurrency limit; my independent test (`testAnthropicRetryContract.mjs`, 14 checks) fails 10 of 14 on the live code and passes 14 of 14 on a correct fix, with four deliberate breaks caught. The fix on branch `m3-anthropic-reliability` (53b96c3) **passes my independent test 14 of 14** (run untouched by Cursor; defaults: 4 attempts, 4 in flight, timeouts 90 s and 240 s with web search, queue wait 120 s), the logic lock and the scoring fingerprint, but it is **not deployed** and not yet measured against the real API. The live preflight (21 Nov) reports GO with one warning: 70 of 497 ideas unfinished. No credit until it is live and measured. Accuracy has never been measured against labelled ideas. |
| **Functionality** | 67 | **69** | ~88 | A read-only MCP connector now exists (a new feature, partial). The Part 142, 144 and 145-second-half gaps are unchanged. **New finding (21 Nov, my independent test `testOrgVisibility.mjs`):** the org model (roster `MEMBER`/`TEAM_LEAD`/`BUSINESS_HEAD` and the business-head-to-teams mapping) works for Individual contributors, Business Heads and Admin, but on the live site a **Team Lead cannot see their reports' ideas in the Log list** (they can open them by address): the list query omits `created_by_email`, so every list row has no owner email. A one-line fix makes all eight visibility checks pass. The roster and the mapping are empty in production, there is no screen to map a Business Head to teams, and the titles BM and BH FORUM are still shown. |
| **Testing** | 45 | **57** *(prov.)* | ~85 | The supplied tests now run in the repo (HTTP performance, backup scripts, the 26-check MCP probe, allowlist and panel tests), and the pre-push check exists. The inventory covers 63 routes and 389 controls on 16 screens (identical on three runs) and an oracle exists. The coverage gate now passes with real runtime evidence (M1 to M7, reported: 62 of 62 routes and 191 of 191 controls, two exemptions), but two caveats keep the credit partial: the 191 controls look like the original 7-screen inventory, not the extended 16-screen one with 389 controls reported earlier, and the single test that maps everything *touches* each control without necessarily asserting its effect. The mutation score is 48.1% on the three verdict files (below 90%). All on local branches. |
| **Security** | 55 (prov.) | **68** *(prov.)* | ~86 | The provisional MCP deduction comes off: an MCP token flaw (the token was the website session) was found, fixed, and the signed-in probe then passed all 26 checks live; sessions were all invalidated by rotating `SESSION_SECRET`. A permanent no-login sweep (70 routes, none leaking), a role matrix of every live route by anonymous, BM, BH FORUM and ADMIN with the expected statuses written down, and tests of what each role may see (a BM sees only their own ideas; another team's or a teammate's idea answers 404) now exist (reported, local branches). The `npm audit` is triaged (one high, `xlsx`, write-only use, kept). Held back by: the public mirror and the AI coding agent's Render key that can read every production secret. |
| **Performance** | 59 | **77** | ~88 | Verified earlier: compression and caching live, the Log's database calls constant. **New, at live scale (my test, 21 Nov):** with 506 ideas the admin's Log is 6.4 MB raw (1.03 MB gzipped) and costs about 0.3 s of server CPU; ten admins at once wait about 3 s and peak memory is 360 to 390 MB; **twenty at once peak at about 483 MB of the 512 MB limit**; a Business Manager costs a fifth of an admin. Fine for a handful of staggered users, a risk for many broad-role users at once; the fix (Part 155, the Log in pages) is built but not deployed. Score held at 77. |
| **Operations** | 38 | **48** | ~82 | A tested backup script runs on a schedule and a scheduled run has been proven (21 Nov, 19:12 IST). Still no alert, uptime monitor or CI gate; the health page is not polled by anything. `docs/OPERATIONS.md` is live. |
| **Overall (average)** | 54 | **64** | **~85** | |

**Cross-check against the code in GitHub (21 November, from the zip you uploaded).** I unpacked the live code and ran my own checks on it instead of relying on reports:
- **Verified in GitHub, by me:** all 28 locked scoring files are byte-identical to the build I tested (fingerprint `ba0156d2`); my Part 154 test passes 7 of 7; my MCP safety probe passes 8 of 8 (including the eight hostile registration forms and the rate limit) with the connector on, and reports "switched off" correctly with it off; the repo's own MCP test passes 39 of 40 (the one failure needs the internet to fetch Claude's identity document, which my sandbox lacks); the backup export route is present and the health page proves it works.
- **Reported but NOT in GitHub (local branches or untracked files on one PC):** the MCP admin panel, the audit-email fix and the fail-closed allowlist; the diagnostics endpoint; the runtime-evidence coverage gate and its tests; the mutation tests; the access-matrix tests; the CI files; the backup script `pullBackupToFolder.mjs`, my probe and my supplied tests; `docs/MCP_PILOT.md`.
- **Still wrong in GitHub:** the connector's allowlist is **fail-open** (`pilotAllows` returns true when `MCP_ALLOWED_EMAILS` is unset or empty); `.cursor/` is still public and not in `.gitignore`; `render.yaml` still says `plan: free`; `package.json` has a `verify:all` script that points to a file that is not there; about 20 files hold company email addresses.
- **What that does to my scores:** counting only what I verified, the overall is **about 60** (Data safety 76, Scoring 65, AI 45, Functionality 69, Testing 48, Security 62, Performance 77, Operations 46). The 63 above also counts reported work that lives only on local branches. The two numbers converge once those branches are pushed and I can check them.

**The biggest single gaps, in order of points available:** the backup (Data safety and Operations, about 35 points together), the public mirror and the access matrix (Security, about 25), the coverage gate with mutation and an oracle (Testing, about 35), the AI golden-set evaluation and the 70 incomplete screenings (AI, about 33), Part 142 with the margin decision (Scoring, about 20).

---

## How the scores work

Each aspect is worth 100 points, split into sub-criteria with visible points, so any score can be challenged line by line. Every line says how it is known:
- **Measured**: I ran it and counted.
- **Reported**: the owner or Cursor said so; I could not check.
- **Unknown**: nobody has looked; scored conservatively (low), because an unchecked safeguard is not a safeguard.

These are my judgments against that rubric, not an audit certificate. A score of 55 means "works, and a pilot with supervision is reasonable". 85 means "I would let it run unattended for the whole company". 100 is not claimed for any software.

## The scores

| Aspect | Now | After the improvements below | One-line verdict |
|---|---|---|---|
| **Data safety** | **59** | ~90 | The database no longer expires, but no backup is scheduled or proven on your side. |
| **Scoring and verdict rules** | **65** | ~87 | The rules run exactly as written; the gaps are in what is not built and not independently tested. |
| **AI output quality** | **47** | ~80 | Good guardrails, but accuracy has never been measured. |
| **Functionality** | **67** | ~90 | Most requested features exist; Parts 142, 144 and 145 (second half) do not. |
| **Testing** | **45** | ~85 | Many tests pass, but they touch only a third of the routes and 40% of the controls. |
| **Security** | **55** (provisional) | ~85 | Authentication is solid; the whole source is public, and roles were never tested. |
| **Performance** | **59** | ~87 | The database side is excellent; what the server sends is not compressed or cached. |
| **Operations** | **38** | ~81 | There is a good health page and almost nothing else a night-time failure would need. |
| **Overall (average)** | **54** | **~85** | A solid pilot, not yet production. |

(The "after" column is a projection that assumes the actions in this document are done and verified. It is not a promise.)

---

## 1. Data safety — 59 / 100

| Sub-criterion | Points | Evidence |
|---|---|---|
| The live database is durable and does not expire | **17 / 20** | Upgraded to the paid $6 plan (**reported**). It no longer carries the 30-day expiry. Not seen by me. |
| Backups: automated, off-platform, alerting | **6 / 25** | **Correction:** the app **already has** an encrypted nightly export (`GET /api/admin/backup/export`, AES-256-GCM, every table except the research cache), a documented Power Automate flow to SharePoint at 02:30 IST, and a Slack alert when no backup has landed in 36 hours (`docs/BACKUP_TO_SHAREPOINT.md`, `lib/healthApi.js`). The schedule lives outside the repo, so **whether it is switched on is unknown**: the live `/api/health` field `lastBackupAt` tells. If it is within the last day, this line is worth about 18 of 25 and Operations gains about 8; if it is empty, it is worth 6. Other evidence: `blobBackup.mjs` (my second layer) is tested (13 checks) but not deployed; one encrypted manual dump is on D:; Render's own backup retention is **unknown**. |
| A restore has been proven | **8 / 15** | **Measured:** I restored the app's own backup into an empty database (60 ideas, three uploaded files, 30 tables): every table matched and the files came back byte for byte. **Not** yet done on your machine or the live data. |
| Integrity protections in the code | **13 / 15** | **Measured:** counters repaired at start-up, an empty database now starts, archive and audit in one transaction, `verifyDatabaseCopy.mjs` exists. |
| Secrets and the runbook to rebuild | **3 / 10** | **Measured:** `docs/OPERATIONS.md` does not exist; the secret `DEPARTMENT_KEY_ENCRYPTION_SECRET` is needed to read department passwords and its copy is **unknown**. |
| Protection from accidental deletion | **12 / 15** | Deleted ideas are kept 90 days and audited (**measured**); no "recently deleted, restore" screen. |

**Update (live health, 20 Nov):** `lastBackupAt` is **null**: no backup has ever run, so the backup line stays at 6. **Raise it:** switch on the app's own nightly export and copy it off Render (+19), repeat the restore drill on your side (+4), write `OPERATIONS.md` and store the secrets list (+6), add the restore screen (+3). *Runbook: `Primus-AI_Backup_Setup_Runbook.md`; prompt: "five fixes" Job 1; tools: `exportToBlob.mjs`, `testExportToBlob.mjs`.*

## 2. Scoring and verdict rules — 65 / 100

| Sub-criterion | Points | Evidence |
|---|---|---|
| Rules written down, locked and fingerprinted | **19 / 20** | **Measured:** v5.7, fingerprint `ba0156d2`, every scoring file byte-identical across the last two builds. |
| Behaviour matches the rules when run | **23 / 25** | **Measured:** the fixed denominator of 18 (4/18 with no research), the Filter 4 hard stop (61% still NO-GO), INCOMPLETE, the GO cap (96% with weak evidence is WATCH; adequate does not cap), mark-downs, bands at 59/60/80/81. |
| Depth of tests on the scoring | **12 / 25** | Cursor's scoring tests exist; five of them are still pinned to older rules and fail. No independent rules model, no property tests, no mutation testing. |
| Known gaps closed | **8 / 20** | **Open:** a fooled AI gives junk 3 of 7 Filter 1 credits (Part 142); the margin rule disagrees with v4 (mark-down vs hard stop); pure commodity is not yet scored out of 11; no final verdict over Filters 1 to 5 (Part 144). |
| Evidence the verdicts are right | **3 / 10** | **Unknown:** 2 GO of about 320 screened ideas in the Log; no outcomes recorded to check against; strictness never calibrated. |

**Raise it:** Part 142 (+8), the margin decision and Part 144 (+5), an independent oracle with property and mutation tests (+10), a calibration review against ideas with known outcomes (+4). *Prompts: Part 142, Part 144, "five fixes" Job 3, the verification prompt 4C.*

## 3. AI output quality — 47 / 100

| Sub-criterion | Points | Evidence |
|---|---|---|
| Guardrails | **22 / 30** | **Measured:** nine guard modules (placeholder, narrative, relevance grading, replay, write guard); credit is graded by code after the AI answers; a cited source must be one the search returned. |
| Measured accuracy | **3 / 30** | **Unknown:** no golden set, no accuracy figure, no run-to-run variance, no source audit. |
| Failure handling | **12 / 15** | **Measured:** unfinished research ends INCOMPLETE with "Screen again", never a guessed score; the three reported issues now behave. |
| Robustness to hostile input | **5 / 15** | Only one test mentions prompt injection; no adversarial set. |
| Reliability in production | **5 / 10** | **Reported:** about 6% of screened ideas ended INCOMPLETE (20 of ~320); why Filter 4 sometimes does not finish is unexplained; a full screening took 156 s. |

**Raise it:** the budget-capped golden-set evaluation (+22), the injection and adversarial tests (+8), diagnosing the Filter 4 failures (+3). *Prompt: the verification prompt, section 4D.*

## 4. Functionality — 67 / 100

| Sub-criterion | Points | Evidence |
|---|---|---|
| Requested features built | **35 / 50** | About 17 of the 24 requirements are built (short form, text size, the theme, the two-column layout, the Log views and charts, placeholder guard, fewer database calls, the manager flow). **Not built:** Part 142, Part 144, the scoring half of Part 145, and the parity tick. |
| Open defects | **13 / 20** | **Measured:** three of **my supplied tests** (written to earlier specs; they are not in Cursor's repo) fail on the build: `testInputReview` (the corrected-name suggestion), `testInputReviewSubmit` (a nonsense benchmark returns HTTP 400 where the spec says 422) and `testManagerReviewFirstTimeHead` (a business head who has never signed in gets no Slack message). Each is a possible deviation from an earlier spec that has not yet been judged: fix the build or update the spec. Also: the opening form is 1,048 px tall; the Filter 4 "web check" column is not shown for an unevaluated idea. |
| Checked in a real browser | **12 / 15** | **Measured:** 12 Required labels on the right boxes, cost behind Adjust, no teal, two-column layout passes most checks, the reported issues pass. |
| Edge cases and files | **7 / 15** | **Unknown:** the file-recognition matrix (types, limits, corrupt files) has not been systematically run. |

**Raise it:** build the missing parts (+12), close the open defects (+5), run the file matrix (+6). *Prompts: Parts 142, 144, 145; "five fixes" Job 4.*

## 5. Testing — 45 / 100

| Sub-criterion | Points | Evidence |
|---|---|---|
| The existing suite: breadth and pass rate | **17 / 20** | **Measured:** Cursor's own 190 tests, **177 pass (93%)**; of the 13 failures, five are old rule-pinned tests and a few are missing files in the zip. |
| Coverage of the platform's surface | **8 / 25** | **Measured:** of 60 API routes, **20 are mentioned by any test (33%)**; of 188 controls, **75 (40%)**; 113 controls have no test at all (Sign out, Clean up untouched drafts, and others). Mentioned is a ceiling, not proof. |
| Independent verification | **6 / 25** | Playwright and Stryker are installed but not yet used; no code coverage figure; no mutation score; no independent rules model. |
| Can the tests be trusted | **8 / 15** | **Measured:** 28 test files in the repo share names with my supplied tests but differ (19 are Cursor's own longer tests, so "supplied tests pass" was never true); six tests were edited (legitimately, back to the stricter version). |
| Gates and CI | **6 / 15** | A pre-push dry run exists; no CI workflow in the repo; the coverage gate (supplied) fails until filled. |

**Raise it:** map every route and control to a test (+14), run coverage and mutation and an oracle (+14), rename the colliding tests and stop adapting supplied ones (+5), add CI (+7). *Tools: `inventory.mjs`, `testCoverageMap.mjs`, the verification prompt.*

## 6. Security — 55 / 100 (provisional)

| Sub-criterion | Points | Evidence |
|---|---|---|
| Authentication on data routes | **23 / 25** | **Measured:** 120 requests to every route with **no login**: **104 refused (401)**, 9 method-not-allowed, 1 bad request; only login, logout, "who am I", department lock and health answered; **0 server errors**. |
| Headers, cookies, lockouts | **17 / 20** | **Measured:** nosniff, no framing, no referrer, HSTS, a content security policy; HttpOnly/SameSite/Secure cookie settings, lockouts and constant-time comparisons are in the code. CSP still allows inline styles. |
| Authorisation by role tested | **8 / 20** | **Unknown:** no route × role matrix, no "another team's idea" test beyond a few existing ones. |
| Secret hygiene and exposure | **6 / 20** | **Measured:** the current files hold no real secret (the scanner flags were placeholders and examples). **But** the whole application, its prompts and 17 files with employee emails sit in a **public GitHub mirror**, a Cursor rule file lists internal service IDs and an account email, and the mirror's history has not been scanned. |
| **New: the MCP endpoint (live, unreviewed)** | **−5** (provisional) | A new internet-facing OAuth sign-in and tool endpoint went live on 20 Nov, ahead of the gates. It had a real S1 (the MCP token was the website session) and an open-registration flaw; both were found and fixed, and the connector is now switched OFF. Tokens issued before the fix stay valid up to 24 hours unless `SESSION_SECRET` is changed. The deduction comes off when the signed-in probe (`--login`) passes with the connector on (see `Primus-AI_MCP_Plan_Reviewed.md`). |
| Dependencies and hardening | **6 / 15** | Six high `npm audit` findings, not triaged; no automated scanning in CI. |

**Raise it:** make the mirror private, connect Render to the private repo and rotate anything exposed (+10), a route × role access matrix (+10), triage the npm findings and scan in CI (+5). *Prompts: "five fixes" Job 5; the verification prompt 4F; tool: `scanForSecrets.mjs`.*

## 7. Performance — 59 / 100 (77 with Part 154)

| Sub-criterion | Points | Evidence |
|---|---|---|
| Database efficiency | **24 / 25** | **Measured:** the Log makes **7 database calls whatever the number of ideas** (it was about 7 per idea); 1.8 s with the database 250 ms away (was 16 s). |
| Speed in the same region | **14 / 15** | **Measured:** the Log of 500 ideas takes **7 ms** in the database. |
| What the server sends | **8 / 30** → **26** | **Measured:** nothing is compressed or cached: the app bundle is 1.65 MB raw (480 KB gzipped), the Log is about 6 MB at 508 ideas (an evaluated idea is about 17 KB). **I built the fix** (Part 154): bundle 1.65 MB to 0.5 MB, a Log of 60 ideas 73 KB to 2.7 KB, assets cached for a year, API answers never cached; 7 checks and 4 deliberate breaks caught. |
| Scalability of the Log | **7 / 20** | **Measured:** the Log loads every idea into the browser (cap 2,000, about 23 MB); no paging; a 0.1 CPU database. |
| Screening time | **6 / 10** | About 156 s per idea, mostly the AI. |

**Raise it:** apply Part 154 (+18), server-side paging and filtering of the Log (+10). *Prompt: Part 154.*

## 8. Operations — 38 / 100

| Sub-criterion | Points | Evidence |
|---|---|---|
| Health endpoint | **16 / 20** | **Measured:** it reports the database, provider, counters, research failures, scoring fingerprint and `lastBackupAt`, and exposes no secret. |
| Scheduled backups with an alert | **2 / 25** | **Unknown, not measured as none:** the backup-lag Slack alert exists in the code (36 hours; it needs `OPS_ALERT_WEBHOOK_URL` or `SLACK_WEBHOOK_URL` set) and `lastBackupAt` is on the health page; whether the schedule and the alert are switched on in production is unknown. Score shown assumes they are not. |
| Safe deployment | **7 / 20** | **Measured:** `render.yaml` still says `plan: free`, while the live service is the $7 plan (a blueprint sync could revert it); no CI workflow in the repo; deploys go through a public mirror. A pre-push dry run exists. |
| Runbooks | **5 / 15** | `DATABASE_MIGRATION.md` and `BACKUP_TO_SHAREPOINT.md` exist; no `OPERATIONS.md`, no restore or failover steps. |
| Monitoring and alerting | **2 / 10** | No uptime monitor, error alert or backup alert is documented. |
| Cost controls | **6 / 10** | A usage endpoint exists; no spend alert or per-team cap is documented. |

**Raise it:** the nightly backup with an alert (+20), fix `render.yaml`, add CI and a keep-alive workflow (+9), write `OPERATIONS.md` (+8), an uptime and backup-age monitor (+6). *Prompt: "five fixes" Job 1.*

---

## Biggest risks right now, in order

1. **No backup is scheduled or proven.** The database no longer expires, but it can still be deleted, corrupted or lost to a payment problem.
2. **The whole application is in a public repository.** It holds the scoring logic, prompts and employee emails; the history is unchecked.
3. **Almost two thirds of the routes and controls have never been tested**, and the tests that pass cannot be fully trusted yet.
4. **The AI's accuracy has never been measured**, and a fooled AI can still hand junk some credit.
5. **The margin rule contradicts your own v4 document**, and the verdict strictness has never been calibrated.

## The ten actions that move the score most (points per effort)

| # | Action | Who | Raises |
|---|---|---|---|
| 1 | Nightly encrypted backup + alert + a real restore test | Cursor + you (SAS, passphrase) | Data safety +27, Operations +20 |
| 2 | Make the mirror private, rotate anything exposed | You (Render and GitHub) | Security +10 |
| 3 | Part 154: compress and cache | Cursor | Performance +18 |
| 4 | Run the coverage gate and fill the map; add coverage, mutation and an oracle | Cursor | Testing +33, Scoring +10 |
| 5 | Part 142 (fooled AI earns nothing) | Cursor | Scoring +8, AI +3 |
| 6 | The AI golden-set evaluation | Cursor + you (labels, a capped key) | AI +30 |
| 7 | Decide the margin rule; build Part 144 | You, then Cursor | Scoring +5, Functionality +6 |
| 8 | `OPERATIONS.md`, `render.yaml`, CI, an uptime monitor | Cursor | Operations +23 |
| 9 | Route × role access tests; triage `npm audit` | Cursor | Security +15 |
| 10 | Server-side paging for the Log | Cursor | Performance +10 |

## What changed in this round

I built and proved Part 154 (HTTP compression and caching; reference diff, prompt and test), and measured everything above directly rather than estimating. The earlier tools, `blobBackup.mjs`, `verifyDatabaseCopy.mjs`, `inventory.mjs` with `testCoverageMap.mjs`, `scanForSecrets.mjs`, `testQueryCount.mjs` and the others, are what the actions above use.
