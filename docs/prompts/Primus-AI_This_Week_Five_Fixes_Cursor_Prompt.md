# 6 Filter Test — The five things for this week (prompt for Cursor)

Five jobs, in this order. Two of them need a decision or an action from the owner; the prompt says where. Stop and report at the end of each job. Never print a password, connection string, SAS URL or key, and never write one into the repo.

## Rules for all five

- Test data only for tests. Do not touch the live database except for the read-only checks named below. Do not change anything in the Render dashboard; the owner does that.
- **The scoring files are locked** (v5.7, fingerprint `ba0156d2`). Do not change them unless the owner has written an approval in `docs/DECISIONS.md` (job 3).
- Do not edit the supplied tests (`testAnswerGuard.mjs`, `testReportedIssues.mjs`, `testQueryCount.mjs`, `testQualityNotQuantity.mjs`, `testImprovementPathValid.mjs`, the Part 144 tests and the rest). If one fails, record the defect. If you think a test is wrong, say so and why; the owner decides.
- Every defect you find or fix is reported with an ID, a severity (S1 data loss or wrong verdict, S2 a feature broken, S3 wrong or confusing, S4 cosmetic), the test that shows it, and the file and line.

---

## Job 1 — The database is safe: upgrade, backup, restore, alert

**Status (live, 20 Nov 2026):** the Render database is on the paid plan; `/api/health` shows no `dbExpiresInDays` and `lastBackupAt: null` (**no off-platform backup has ever run**). The app already contains an encrypted export (`GET /api/admin/backup/export`) and the restore scripts (`decryptBackup.mjs`, `importExport.mjs`); this job switches them on and proves them. The supplied `Primus-AI_Backup_Setup_Runbook.md` has every step; follow it.

1. **Safety copy:** keep the encrypted `pg_dump` on D: and verify it with `pg_restore --list` (done).
2. **Baseline, read-only** (done): size, tables, row counts, health. Re-run it after any change.
3. **Switch the backup on.** The owner generates `BACKUP_TOKEN` and `BACKUP_ENCRYPTION_KEY` **themself** and sets them, plus `OPS_ALERT_WEBHOOK_URL`, in Render. **Cursor must never generate, write down or store these values** (a file `D:\\Primus-safety\\render-backup-secrets.txt` made earlier must be deleted and its values retired). Then take one export and confirm `lastBackupAt` appears on `/api/health`.
4. **Copy it off Render, nightly.** The owner runs Render alone with no company cloud storage yet, so the **first choice is the supplied `scripts/pullBackupToFolder.mjs`** (saves the encrypted backup into a synced folder the owner controls, Windows Task Scheduler, Slack alert, a `status` check): install it with `scripts/testPullBackupToFolder.mjs` and run the test untouched (no database needed, 10 checks); the owner follows `Primus-AI_Solo_Owner_Guide.md` section 2 to schedule it. **Second choice, when storage exists:** install the supplied `scripts/exportToBlob.mjs` and `scripts/testExportToBlob.mjs`; run the test untouched (it needs **no database**, only Node: all 12 checks must pass). Then, with the owner's container SAS (Create + Write only), run `check` and `backup`, and set up the nightly run (a Render Cron Job, or a company machine) with the three variables in the scheduler's secret store and an alert on any non-zero exit. The Power Automate flow in `docs/BACKUP_TO_SHAREPOINT.md` is an alternative (its HTTP action is a premium connector).
5. **Prove the restore** into a **scratch** database (never the live one) with the runbook's section 5: `fetch`, `decryptBackup`, `importExport`, then `verifyDatabaseCopy.mjs --timestamps ms --ignore-table backup_exports` must end `ALL MATCH`, and the uploaded files must match byte for byte. Report it. (`blobBackup.mjs` with `pg_dump` is an optional second method and needs a **real** local PostgreSQL, not PGLite; do not spend time on it now.)
6. **Measure the export's memory** during a quiet hour on the live service (Render Metrics) and report the peak.
7. **Write `docs/OPERATIONS.md`**: how to restore step by step, how to fail over if the database is lost, a monthly restore drill, and the **names** (never the values) of every secret the app needs and who holds each copy.

**Done when:** `lastBackupAt` is fresh, one nightly run has stored a verified backup in Blob, one restore into a scratch database matches (files byte for byte), and a failed run has been shown to raise an alert.

---

## Job 2 — The coverage gate can run

1. Confirm these supplied files are in the repo under their own names: `scripts/coverage/inventory.mjs`, `scripts/coverage/testCoverageMap.mjs`, `scripts/uiHarness.mjs`, the updated `validateRelease.mjs`, `testFormLayout.py`, `blobBackup.mjs`, `testBlobBackup.mjs` and the tests listed in the rules. Keep your own `testQueryCount152.mjs` and `testFormLayout149.mjs` as extra files.
2. Run `inventory.mjs` **three times** and confirm identical output (the supplied one gives 60 routes and 186 controls on 7 screens). Extend it with the screens it lacks: the member and team-unlock screens, NO-GO and INCOMPLETE outputs, the manager inbox, the Settings tabs, the import dialogs and the proof stage. Attach `inventory.json`.
3. Run `testCoverageMap.mjs --report` and `validateRelease.mjs`. Report: routes and controls mapped, the unmapped lists, and the **DRIFT list** (supplied tests that differ from the repo's copy; the repo's versions are kept in `scripts/.repo-versions/`). Explain every drift, especially the four tests you changed earlier.
4. Do not start filling the map yet; report the numbers.

**Done when:** the gate has run and its report (counts, unmapped lists, drift) is delivered.

---

## Job 3 — The margin rule: write it down, measure it, then (only when approved) build it

**The question.** The owner's frozen v4 document says the Filter 2 and Filter 5 thresholds are non-negotiable at the AI clearance stage, with exceptions escalated to CKR. The platform today treats a net margin below the division minimum as a **mark-down**: the idea can still reach WATCH, which a manager can approve forward. Both cannot be true.

| Option | A margin below the division minimum means |
|---|---|
| **A (today)** | A mark-down: the idea is capped at WATCH and can be approved forward by a manager with a comment. |
| **B (the v4 text)** | A hard stop: NO-GO, no manager override, with an exception note to CKR (the same as the Filter 4 High-risk stop). |

Do this, in order:
1. **Do not change any scoring file.** Create `docs/DECISIONS.md` with this question, the two options, the date, and an empty line: `OWNER'S DECISION: ______` (the owner fills it).
2. **Measure the effect read-only.** Replay the stored ideas (a copy, never the live data) under both rules and report: how many ideas change verdict under B, from which verdict to which (for example WATCH to NO-GO), listed by team and by division. Include the ideas that a manager already approved forward.
3. **Write tests for both options** (boundary at the division minimum for all ten divisions; the International Business case; the manager flow), switched by one constant, so that either can be turned on without further work. Option A's test must pass today.
4. **Only when the owner has written the decision**, implement it: a new ruleset version (v5.8), the fingerprint updated, `docs/SCORING_SPEC.md` and the golden file updated, the logic lock refreshed and approved in `approved.json`. If A is chosen, add a test that pins today's behaviour and one sentence to the spec saying so.

**Done when:** the decision record, the impact report and the two-option tests exist. The implementation waits for the owner.

---

## Job 4 — Part 142, the failing tests, and the defects found in the last build

Do these in this order, each reported separately.

**4a. Three of the supplied tests fail on the build. They are not in your repo yet (they come in the supplied bundle): `testInputReview.mjs`, `testInputReviewSubmit.mjs` and `testManagerReviewFirstTimeHead.mjs`. Each states a behaviour the owner specified in an earlier part. For each, decide whether the build has drifted from the spec (then fix the build) or the spec is out of date (then tell the owner and do not change the test yourself).**
- `testInputReview.mjs` (Part 132, input review): "'dOVE SCALP SERUM' is flagged for its capitals and a corrected name is suggested".
- `testInputReviewSubmit.mjs`: R1, "a nonsense benchmark: Submit answers **422** and names the problem" gets **HTTP 400**. Part 150 appears to have changed the status code. Restore 422, or show where the API documents 400, and explain.
- `testManagerReviewFirstTimeHead.mjs` (Part 120): "the head of PC, who has never signed in, receives a Slack DM" sends 0 messages. This one may be a real regression of the manager-review flow: check it first.
For each: the cause, the fix or the question for the owner, and the file and line.

**4b. The defects found in the last build (S2 and S3):**
1. The output page still shows `Replace "No benchmark available currently" with a closer competitor…` in a second place; the main list already says "Name the closest competitor you know in the same category and pack size". Fix every place. (`lib/itemCopy.js` and `lib/improvementPoints.js` are locked: fix it at the display layer.)
2. Three placeholders are still accepted as a benchmark: "Currently not available", "Currently unavailable", "Benchmark not available". Refuse them; real answers like "No palm oil, made with rice bran oil" must stay accepted. `testAnswerGuard.mjs` must pass untouched (its contract: `answerProblem` returns `{ code, message }` or `null`, `sanitizeSuggestion` returns `{ offer, text | reason }`, `submitBarSummary` is the bar helper).
3. The advice says "Clarify who this is for in Target consumer" and "matches the target consumer", but that box is hidden on the form. Either show it as an Optional box or reword the advice at the display layer.
4. **Required labels are missing** on the form (0 "Required", 5 "Optional"). Every box must show Required or Optional (Parts 139 and 143).
5. COGS, Net margin and MRP are on the form in bright teal "AI fills this" panels; they belong behind one **Adjust cost and margin** button, in the theme colours (Part 145).
6. The opening form is about 1,088 px tall; tighten it so the whole opening state fits within 1.25 screens at laptop size.

**4c. Build Part 142** from `Primus-AI_Part142_ClosingTheGaps_Cursor_Prompt.md`: `testQualityNotQuantity.mjs` and `testImprovementPathValid.mjs` must pass untouched. In particular, junk or placeholder answers in Filter 1 must earn nothing **even when the AI is fooled into rating them strong** (today a fooled AI gives 3.00 of 7 credits to junk).

**Done when:** the three failing tests pass or have a written explanation for the owner, defects 1 to 6 are closed, and the two Part 142 tests pass.

---

## Job 5 — The public mirror

Cursor reported that a sync copied untracked scratch scripts into a **public mirror**. Treat everything that was ever in it as published.

1. **Find out what the mirror is and how it is fed:** its address, the workflow or script that syncs it, who can see it, and what it copies (all files, or only tracked ones).
2. **Scan it, read-only.** Make a fresh clone of the mirror (not the working repo) and run the supplied `scripts/scanForSecrets.mjs <the clone> --compare <the real repo>` and also `scanForSecrets.mjs <the real repo>`. It never prints a whole secret. Report its HIGH findings (database addresses with passwords, SAS signatures, API keys, private keys, tokens, files like `.env`, `*.dump`, `dest-database-url.txt`), the company email addresses (personal data), and the list of files that are **only in the mirror**. Also run a scan of the mirror's **git history** (a tool such as gitleaks or trufflehog, or `git log -p` through the scanner) because a file deleted later is still public.
3. **Fix the feed.** Change the sync to an **allowlist** (copy only `git ls-files`), exclude `scripts/_*`, `*.dump`, `*.dump.enc`, `*-database-url.txt`, `.env*`, and keep the safety dump and every connection-string file outside any project folder. Add those patterns to `.gitignore`. Add `scanForSecrets.mjs` as a pre-commit hook and as a CI job that fails on any HIGH finding.
4. **Clean the mirror.** Remove the stray files. If the history holds a secret, **do not rewrite history until the owner approves**, and tell the owner exactly which secrets (by type, file and the first 4 characters only) must be treated as exposed.
5. **Cursor cannot rotate secrets; the owner does.** For each exposed secret say what to rotate and where (the database password, the Slack token, the AI key, the SAS URL, the backup passphrase). Recommend making the mirror private if it does not need to be public.

**Done when:** the scan of the clone and the history is reported, the feed is an allowlist, the scan runs in CI, and the owner has the list of what to rotate.

---

## What the owner does

1. Upgrade the Render database and tell Cursor (Job 1); create the Blob container SAS and the backup passphrase; check an alert reaches you.
2. Fill in `OWNER'S DECISION` in `docs/DECISIONS.md` (Job 3), after reading the impact report.
3. Rotate every secret Cursor lists as exposed (Job 5) and decide whether the mirror should be private.
4. Read each report before the next job starts.

## Final report

For each job: what was done, the evidence (counts, command output with secrets masked, test results), the defects (ID, severity), what could not be done and why, and the questions that need the owner.
