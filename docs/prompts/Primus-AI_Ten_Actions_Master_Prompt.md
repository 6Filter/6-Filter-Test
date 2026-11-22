# 6 Filter Test — Master prompt for Cursor: close the ten actions

You will close ten actions, in the order below, and prove each one with evidence. The owner runs this platform alone on Render. Where an action needs a decision, a secret or a click in a dashboard that only the owner can make, this prompt says **OWNER**; you prepare everything else, then stop and say exactly what you are waiting for.

**Before anything else:** extract the latest `primus-supplied-files.zip` into the repository root (it adds `scripts/`, `scripts/coverage/`, `reference/` and `docs/prompts/`), read its `README.txt`, and check `MANIFEST.sha256`. Do not rename or edit any supplied file.

## Rules that apply to everything

1. **You never generate, write down, store, echo or commit a secret**: no backup token or key, no SAS, no password, no connection string, no API key, no webhook address. The owner creates them. If you meet a secret, say where, with at most its first 4 characters. **Delete `D:\Primus-safety\render-backup-secrets.txt`** (you created it; its values are retired) once the owner confirms new ones are in place.
2. **Test data only.** Use the local scratch database. Never run a test, a restore or a probe against the live database, and never change live data.
3. **Never edit a supplied test** and never claim one passes unless you ran it untouched in this repository and quote its final line. If you think a supplied test is wrong, say so and why; the owner decides.
4. **The scoring files are locked** (ruleset v5.7, fingerprint `ba0156d2`). Change them only when `docs/DECISIONS.md` carries the owner's written approval for that exact change, and then bump the ruleset, update the fingerprint, the golden file and the logic lock.
5. **One commit per item**, with the item number in the message. Deploy an item only when its own acceptance checklist is complete. Nothing that changes scoring is deployed without the owner's written approval.
6. **Report honestly.** After each item send: what you did; the evidence (command output with secrets masked, test final lines); defects you found (ID, severity S1 data loss or wrong verdict, S2 a feature broken, S3 wrong or confusing, S4 cosmetic, the test that shows it); what you could not do and why; what you are waiting for from the owner. Say "NOT DONE" plainly. Do not mark an item done on the strength of a test you wrote yourself.
7. **Stop rules:** no new feature work while an S1 is open; do not start an item before its prerequisites are met; stop at each **OWNER** gate and wait.

## The order, and why

| Step | Item | Waits for |
|---|---|---|
| **P0** | Contain the live MCP endpoint (urgent, same day), then **P0b** the follow-ups from Cursor's report | nothing |
| 1 | Nightly encrypted backup, alert, proven restore | OWNER: secrets, folder, Slack webhook |
| 2 | Mirror private, exposed secrets rotated | OWNER: GitHub and Render steps |
| 8 | OPERATIONS.md, render.yaml, CI, uptime monitor | OWNER: plan name, two dashboard steps |
| 9 | Route-by-role tests, npm audit triage | item 8's CI |
| 4 | Coverage map, mutation tests, independent oracle | item 9 |
| 7 | Margin decision, then Part 144 | OWNER: written decisions |
| 5 | Part 142: a fooled AI earns nothing | OWNER: written approval (same ruleset bump as 7) |
| 6 | Golden-set evaluation of the AI | OWNER: labels, capped test key |
| 10 | Server-side paging for the Log (Part 155) | items 1 and 9 |
| 3 | Part 154 (compress and cache) is live: keep it true | nothing |

Items 3 and 8's quick parts can run alongside the others. Never start item 10 before item 1 is proven and item 9's access tests pass.

---

## P0 — Contain the live MCP endpoint (same day)

The endpoint `https://ck-6-filter-test-88wu.onrender.com/mcp` (an OAuth sign-in and tools) went live before its gates. Treat it as an unreviewed internet-facing door.

1. Run the supplied probe against the live address and report every line: `node scripts/probeMcpSurface.mjs --url https://ck-6-filter-test-88wu.onrender.com/mcp --try-registration`. Also run `scripts/testProbeMcpSurface.mjs` untouched (it must pass). **Any FAIL means: switch the endpoint off now**, report, fix, re-run.
2. Report in writing: the full tool list, each tool marked read or write; exactly what "screen this idea" does and its limits per person, per team and per key; token lifetime, refresh and revocation, and whether tokens are stored hashed; which redirect addresses and client identities are accepted and what "Claude's published identity" means in the code; whether dynamic registration is on; how the Slack-code login is protected against guessing inside this flow; whether logs ever contain a token; the audit record per call.
3. **An off switch:** an environment variable (off means `/mcp`, the OAuth and the discovery paths return 404). If there is none, add it first. Leave the switch ON only if the probe passes.
4. **Until reviewed, disable every tool that writes or spends** (save a draft, upload, screen). Keep read-only tools. Every tool must go through the same access functions as the website. No tool may accept a key as an argument (test it).
5. Add `/mcp`, the OAuth and the discovery paths to item 9's access matrix, and add a test that Part 154's compression never buffers or compresses an event stream.
**Done when:** the probe passes against the live address, the off switch exists and is tested, write and spend tools are off, and the owner has the written answers.

---

## P0b — What Cursor's own report leaves open (do this before the MCP connector is promoted to anyone else)

**Status reported:** the live registration endpoint accepted `https://evil.example/steal` and was fixed (new registrations limited to Claude, Cursor and a localhost callback); save-draft, upload-evidence and screen are off; the remaining tools are read-only; `MCP_ENABLED=false` is the off switch (not set, so the connector is up). The supplied probe was **not in the repository**, which means the zip was not yet extracted: extract it first (item 0 of the rules). The checks below are what is still missing.

0. **Re-extract the refreshed `primus-supplied-files.zip` first** and confirm it replaced `probeMcpSurface.mjs`, `exportToBlob.mjs`, `pullBackupToFolder.mjs` and their three tests. The probe you ran on 20 Nov was an older version (its M7 only tried two hostile redirects); the refreshed one tries eight, including the prefix-allowlist bypasses. The same refresh fixes a bug in **my** scripts: they called `process.exit()` right after network work, which on Windows can abort the process (`Assertion failed ... src\win\async.c`, exit code 3221226505). That was the cause of `testPullBackupToFolder` P2 and every `testProbeMcpSurface` check failing for you; **do not edit those tests**, they now pass with the fixed scripts (and each has a guard that fails if `process.exit()` is reintroduced).
1. **Run the supplied probe against the live address** with `--try-registration`, and its own test (`testProbeMcpSurface.mjs`, 26 checks) untouched. It now tries eight hostile redirect forms, including the allowlist bypasses `https://claude.ai.evil.example/cb`, `https://claude.ai@evil.example/cb` and a good redirect mixed with a bad one. Any FAIL: set `MCP_ENABLED=false`, fix, re-run.
2. **A permanent regression test for the registration fix** in the repository: strict URL parsing (an exact host match, https only for Claude and Cursor, http only for `localhost` and `127.0.0.1`, no user-info, and **every** redirect in a registration must pass), covering the same eight forms. A prefix or substring check must fail the test.
3. **The client-metadata fetch is a server-side request to a URL a stranger chooses** (the `client_id`). Only the exact allowed address (`https://claude.ai/oauth/mcp-oauth-client-metadata`) may ever be fetched; any other `client_id` that looks like a URL is refused **without any fetch**. If a fetch is kept: https only, no redirects followed, a short timeout, a size cap, private, loopback and link-local addresses blocked, the result cached. Test it: a `client_id` URL pointing at a local fake server must produce **zero** requests to it.
4. **Separate the MCP token from the website session.** Today the access token **is** the website session, so whoever holds it has everything that user can do on the website, including admin actions if that user is an admin, not just the three read tools. Required: a token issued by the MCP flow must be refused on `/api/*` (list, create, admin, export), and the website cookie must not be accepted as an MCP token, or the token must carry an audience and a scope that the server enforces. Test: with a valid MCP token, `GET /api/propositions`, `POST /api/propositions` and an `/api/admin/*` route all answer 401 or 403. **If the token currently works on `/api/*`, that is an S1: set `MCP_ENABLED=false` until it is separated.**
5. **Token lifetime and replay.** Access token at most 1 hour (today 24). The refresh token is rotated on use (good): add reuse detection (a used refresh token that appears again revokes that whole chain and signs the user out). The owner sets the absolute session length (suggest 7 days).
6. **An admin revoke and an audit record.** An admin action to revoke a person's MCP tokens (today only raising the token version does it, with no screen). Record every tool call: who, which tool, which idea id, when, how many results, success or failure; never the content and never a token; visible to an admin; retention stated.
7. **Rate-limit the token endpoint** (the probe warns today if it does not): for example 10 failures per address per minute, answering 429.
8. **Access tests for the three read tools**, added to item 9's matrix: a member of team A cannot list, open or read the verdict of team B's idea; adding ideas the member may not see changes no list and no count; `open_idea` returns the text labelled as untrusted data, with a size cap and no file contents; nothing the website hides is returned.
9. **Make the switch default OFF.** Today the connector is on unless `MCP_ENABLED` is `false`. Invert it: it serves only when `MCP_ENABLED` is `true`. The owner keeps the read-only connector up **only after items 1 to 4 pass**; until then set it to false in Render.
10. **The spending and writing tools stay off** until: the screening tool starts a job and returns a job id with a separate status tool (it must never wait for a whole research run, as the old one did); per-person and per-team daily caps and a per-key cap; idempotency (an unchanged recently screened idea returns its verdict); a confirmation step; every call audited; and the owner approves in `docs/DECISIONS.md`.
**Update after Cursor's second report (20 Nov):** the MCP token **was** the website session (an S1: anyone holding one could do anything that person can do, including admin actions). Cursor fixed it (audience `mcp`, scope `mcp:read`; refused on `/api/*`; a website session refused on `/mcp`), added one-hour access tokens, refresh rotation with reuse detection, an admin revoke and an audit record, and set `MCP_ENABLED=false`, so `/mcp` answers 404. **The connector stays OFF.** Two things remain:
- **Tokens issued before the fix are still live website sessions for up to 24 hours.** The owner signs everyone out now by changing `SESSION_SECRET` in Render to a **new value the owner generates** (Cursor never generates or sees it). Everyone signs in again with a Slack code. `LOGIN_CODE_SECRET` stays.
- **Cursor ran an OLDER probe and test** (13 checks; the refreshed ones are in the latest zip). Re-extract, then: (a) with the endpoint **off**, the refreshed probe must report `OFF PASS` (not four failures); (b) `testProbeMcpSurface.mjs` must pass untouched (26 checks; the Windows crash is fixed in the scripts).

**Pilot allowlist (add before the owner asks the Claude admin to add the connector).** A Claude admin may be able to add the connector for the whole workspace, which would let **everyone** try to sign in. Add a server-side allowlist, **failing closed**: an environment variable `MCP_ALLOWED_EMAILS` (a comma-separated list the owner sets in Render; emails are trimmed and compared in lower case, exact match). **Unset or empty = nobody can use the connector. A single `*` = every signed-in company user (the owner must write it deliberately). A list = only those people.** Enforce it **when the authorization code is issued** (after the normal sign-in, a person not on the list sees "This connector is in a limited pilot" and no authorization code or token is issued) **and on every MCP call**, so removing an email stops that person's existing tokens at their next call. Audit every refusal. The full specification and tests are in `Primus-AI_MCP_Pilot_Readiness_Cursor_Prompt.md`.

**How the connector may be turned back on (the owner decides, never Cursor):** (1) the refreshed probe and its test pass; (2) set `MCP_ENABLED=true` for **two company-managed accounts only**; (3) the **owner runs the signed-in probe once** from their own PC, signing in in the browser: `node scripts/probeMcpSurface.mjs --url https://ck-6-filter-test-88wu.onrender.com/mcp --login --try-registration` (the token stays in memory and is never printed). It must pass **A1** (no write, spend or admin tool advertised), **A2** and **A3** (the MCP token is refused on the website API and as a website cookie: the S1 fix, proven from outside), **A4** (an API-key argument is refused and not echoed), and **A5** (an access token of at most one hour; a refresh token rotated; a replayed one refused and the new one killed). Any FAIL: set `MCP_ENABLED=false` at once. **A5b and A5c can show INCONCLUSIVE (a warning)** if the token endpoint's rate limit answers 429 even after the probe waited: a 429 does not prove a replayed token was refused, so wait a few minutes and run again until both show PASS; do not accept INCONCLUSIVE as a pass. If `--login` reports that the loopback registration was refused, ask Cursor for a test client that the allowlist permits, not for the allowlist to be loosened. (4) Check the audit record shows the calls and the revoke action works; (5) only then add teams, one at a time.

**Done when:** the live probe passes, the regression and token-separation tests are in the repository, the audit record and the revoke action exist, and the owner has decided whether the read-only connector stays on.

---

## Item 1 — Nightly encrypted backup, an alert, a proven restore

**Why:** `lastBackupAt` on the live `/api/health` is null: no backup has ever run.

**OWNER first:** generate two secrets yourself (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` twice: the backup token and the backup key), keep both in the password manager, give the key to a second named person; set `BACKUP_TOKEN`, `BACKUP_ENCRYPTION_KEY` and `OPS_ALERT_WEBHOOK_URL` in Render; save the token (and the webhook address) as one-line files under `%USERPROFILE%\primus-secrets\`; create a synced backup folder. Steps: `Primus-AI_Solo_Owner_Guide.md` section 2.

**Cursor:**
1. Run `scripts/testPullBackupToFolder.mjs` untouched (11 checks must pass). (If the owner later chooses Azure Blob, also `scripts/testExportToBlob.mjs`, 13 checks.) Neither needs a database.
2. Prepare the launcher `run-primus-backup.cmd` and the two scheduled tasks (daily backup; a second "status" check) as in the guide, **without opening or printing the secret files** (the script reads them itself). The owner runs the first backup by hand and confirms `BACKUP STORED AND VERIFIED` and a fresh `lastBackupAt` on the live health page.
3. Prove an **alert**: make a backup fail on purpose (a wrong token on the scratch setup, never the live one) and show the Slack message arrived and contained no secret.
4. **Restore drill into a scratch database**, never the live one: `decryptBackup.mjs`, `importExport.mjs`, then `verifyDatabaseCopy.mjs --timestamps ms --ignore-table backup_exports` must end `ALL MATCH`, with the uploaded files byte for byte (compare SHA-256). The key is read from a file outside the repository into the process environment only and never printed; delete the scratch data afterwards.
5. Measure the export's memory on the live service during a quiet hour (Render Metrics) and report the peak. If it is high, open a "stream the export" task.
6. Update `docs/OPERATIONS.md` (it exists): restore steps, failover, the monthly drill, and the **names** of every secret and who holds each copy.
**Done when:** one scheduled run has stored a verified backup, `lastBackupAt` is fresh, the restore drill matched (files byte for byte), and a deliberate failure raised an alert. (Render's own Recovery tab: the owner reports what it shows.)

---

## Item 2 — Mirror private, exposed secrets rotated

**OWNER:** follow `Primus-AI_Solo_Owner_Guide.md` section 3 in order: check the mirror's forks; give Render's GitHub app access to the repository; confirm Render can see it; make it private; manual deploy; confirm the old address says "not found" signed out. Then rotate what the scan finds (section 4 there).

**Cursor:**
1. On a **fresh clone of the mirror** and of the private repository, run `scripts/scanForSecrets.mjs <folder> --compare <real repo>` and a history scanner (gitleaks or trufflehog, or `git log -p` through the scanner). Report masked findings by type and file, the company email addresses (personal data), and the files that are only in the mirror.
2. Produce the **rotation list**: for each finding, what to rotate and where. Do not recommend changing `DEPARTMENT_KEY_ENCRYPTION_SECRET` or `BACKUP_ENCRYPTION_KEY` without a safe re-encryption plan (they decrypt stored data and old backups); if either is exposed, write that plan and wait.
3. Fix the feed: the sync copies **tracked files only**; add `.gitignore` entries (`*.dump`, `*.dump.enc`, `*-database-url.txt`, `.env*`, `scripts/_*`, `.cursor/`); remove `.cursor/` from the repository and the mirror; replace real employee emails in test fixtures with example addresses; never rewrite history without the owner's approval.
4. Add `scanForSecrets.mjs` as a pre-commit hook and a CI check that fails on any HIGH finding (item 8 hosts the CI).
5. After the owner flips the repository: confirm a deploy from the private repository succeeds, `/api/health` shows the new commit, and the scanner exits 0.
**Done when:** the old mirror address is not reachable signed out, a deploy from the private source works, the history scan is reported, and every secret on the rotation list is marked rotated by the owner.

---

## Item 8 — OPERATIONS.md, render.yaml, CI, uptime monitor

1. **`render.yaml`:** it says the free plan; the live web service is paid. **OWNER** tells you the exact plan name; set it, and confirm nothing in the blueprint would revert the live settings or the database plan on a sync.
2. **CI:** write `.github/workflows/ci.yml` (install, build, the regression suite, `testHttpPerformance.mjs`, the logic lock, `scanForSecrets.mjs`) and the keep-alive workflow that `testPart70Health` expects. The deploy mirror and your token lack the workflow scope, so **OWNER** adds the files through the GitHub website in the private repository; a failing test must block a merge.
3. **Uptime and backup monitor:** add to `/api/health` two fields, `backupAgeHours` and `backupStale` (true when older than 26 hours or never taken); no other change. **OWNER** sets a free uptime monitor on `/api/health` that alerts when it is not `"ok":true` or when `"backupStale":true`. Test that a stale backup flips the flag.
4. Render notifications on for failed deploys; an Anthropic spend limit per key; a billing alert. **OWNER** confirms each.
5. Update `docs/OPERATIONS.md` to match what now exists.
**Done when:** `render.yaml` matches the live service, a failing test blocks a merge, and a test alert from the uptime monitor reached the owner.

---

## Item 9 — Route-by-role tests, npm audit triage

1. **Unauthenticated sweep as a permanent test:** every API route, GET and POST, with no login, must answer 401 except login, logout, `auth/me`, `department-auth/me` and `lock`, and `health` (today: 104 of 120 refused, 6 allowed, none leaking, no 5xx). Include the MCP, OAuth and discovery paths.
2. **The access matrix:** every route by every role (anonymous; member without and with a team unlock; manager; BH FORUM; Admin; the idea's owner), with the expected allow or deny written down. Another team's idea is refused (404 or 403, no existence leak); server-owned fields in a body are ignored; a member cannot approve their own idea; the manager rules (not the owner, a comment of at least 10 characters, NO-GO no override) hold.
3. XSS: idea text, names, comments and file names render as text everywhere, including the exports. SQL injection on every string parameter. Session cookie flags and expiry; the login-code and department-unlock lockouts.
4. **`npm audit`:** run `npm audit --omit=dev` first; fix with the regression suite after each change; **no `--force`**; produce a table: fixed, not reachable, or accepted with a written reason.
**Done when:** the matrix and the sweep pass and are in CI, and the audit table is delivered with no high finding unexplained.

---

## Item 4 — Coverage map, mutation tests, independent oracle

1. Run `scripts/coverage/inventory.mjs` three times (identical output required); extend it with the screens it lacks (member and team-unlock, NO-GO and INCOMPLETE outputs, the manager inbox, the Settings tabs, the import dialogs, the proof stage); attach `inventory.json`.
2. Fill `scripts/coverage/coverage-map.json` until `scripts/coverage/testCoverageMap.mjs` passes: every route and control mapped to a test that really exercises it. **Exemptions** need a written reason of at least 20 characters, must stay under 5%, and the **owner approves the list**. Baseline today: 33% of routes and 40% of controls are mentioned by any test.
3. **Every control's effect** is tested (the action, the request, the result, no console error), at phone and desktop widths, by keyboard as well.
4. **The independent oracle:** re-implement the written scoring rules inside the tests (not by copying the app's code) and compare on at least **5,000 generated ideas**; investigate every disagreement. Add property tests (more credit never lowers the score; order never matters; 25 repeats identical).
5. **Mutation testing** (Stryker) on the scoring and verdict files, score at least **90%**; every surviving mutant killed or explained. **c8** coverage: at least 95% lines and 90% branches on those files, 85% on the rest of `lib/`.
6. Rename the 19 of your own test files that share a name with a supplied one; keep the drift report.
**Done when:** `testCoverageMap.mjs` passes, the oracle shows no unexplained disagreement, and the mutation and coverage numbers meet the targets.

---

## Item 7 — The margin decision, then Part 144

1. **Do not change any scoring file.** Create `docs/DECISIONS.md` with the question: a margin below the division minimum is **A**, a mark-down capped at WATCH that a manager can approve forward (today), or **B**, a hard NO-GO with an exception note to CKR (the v4 text). Add the date and `OWNER'S DECISION: ______`.
2. Replay the stored ideas, on a **copy** of the data, under both rules, and report: how many change verdict, from which to which, by team and by division, including ideas a manager already approved forward.
3. Write tests for both options (boundary at the division minimum for all ten divisions; International Business; the manager flow), switched by one constant. Option A's test passes today.
4. **Only after the owner writes the decision**, implement it with item 5 as one ruleset **v5.8**.
5. **Display only, do now:** label every verdict "Screening verdict (Filters 1 to 4)" (page, exports, Log) so a GO is never read as final. No scoring change.
6. **Part 144** (the proof file and the final verdict over Filters 1 to 5, ruleset v6.0, GO above 80) is built from `docs/prompts/Primus-AI_Part144_ProofAnalysis_FinalVerdict_Cursor_Prompt.md` and its supplied tests only when the owner records the timing in `docs/DECISIONS.md`.
**Done when:** the decision record, the impact report and the two-option tests exist, the wording change is live; implementation waits for the owner.

---

## Item 5 — Part 142: a fooled AI earns nothing

Build `docs/prompts/Primus-AI_Part142_ClosingTheGaps_Cursor_Prompt.md`. Today a fooled AI gives 3.00 of 7 Filter 1 credits to junk or placeholder answers. After this part, junk earns nothing **even when the AI rates it strong**.
- This changes locked scoring files: build it on a branch; **do not deploy** until `docs/DECISIONS.md` carries `APPROVED: Part 142`. When approved, ship with item 7 as one ruleset v5.8: new fingerprint, golden file, logic lock.
- `scripts/testQualityNotQuantity.mjs` and `scripts/testImprovementPathValid.mjs` must pass **untouched**; the regression suite and `testAnswerGuard.mjs` stay green.
**Done when:** both supplied tests pass untouched, the owner has approved, and v5.8 is deployed with its new fingerprint.

---

## Item 6 — Golden-set evaluation of the AI

**OWNER:** a **test key with a spend cap**; at least **30 ideas** labelled by an expert in `golden_set_labels_template.csv` (delete the two example rows; one row per idea); the acceptance thresholds (proposed: at least 85% agreement on GST and benchmark relevance, tech-shift ratings within one level at least 90%, zero invented sources).

**Cursor:**
1. **Estimate the cost first** (ideas × 3 runs × tokens per screening, from the usage endpoint) and get the owner's approval before spending.
2. **Contract tests with a stubbed AI** for every call site (Filter 1 research, Filter 2 cost and GST, Filter 3 price events, Filter 4 tech-shift, input review, idea-import extraction, evidence reading, format trend, category sizing): output matches its schema; empty, partial, malformed, prose-wrapped, refused, timed-out and 429/500 output leaves the idea INCOMPLETE with "Screen again", never a wrong score; **prompt injection** inside idea text, file names and uploaded files is never obeyed; every cited source is one the search returned and every quote appears in it.
3. **The live evaluation:** each labelled idea three times with the production model and settings; report agreement with the labels per check, run-to-run variance, cost and time per idea, and a **source audit** of at least 100 citations (does the quote exist at that address). Add an adversarial set of 10 (nonsense, placeholders, injection, non-Indian, empty).
4. Diagnose why about 6% of screenings end INCOMPLETE and why Filter 4 sometimes does not finish; report the measured rate and the root cause.
**Done when:** the numbers are reported against the owner's thresholds (or the shortfall is stated with figures), the contract tests pass, and the INCOMPLETE rate has a diagnosed cause.

---

## Item 10 — Server-side paging for the Log (Part 155)

Build `docs/prompts/Primus-AI_Part155_LogPaging_Cursor_Prompt.md` **only after item 1 is proven and item 9's access tests pass.** Its eight tests (exact paging, summary equals the browser's arithmetic, visibility applied before the page is cut and before any count, filters server-side, writes between pages, performance, streamed export, the screen) and its budgets (first page under 150 KB and 10 database calls; within 2 seconds at 2,000 ideas with the database 250 ms away) are the acceptance criteria. Send me the tests when the endpoints exist.
**Done when:** the Part 155 checklist is complete and the Log no longer loads every idea into the browser.

---

## Item 3 — Part 154 stays true

It is live (commit `62c156b`). Keep it true: run `testHttpPerformance.mjs` untouched after any change to `server.js`, confirm the live headers (`Content-Encoding: gzip` on the bundle, `Cache-Control: public, max-age=31536000, immutable` on hashed files, `no-cache` on the page, `no-store` on `/api`), and keep the P0 check that event streams are never compressed.

---

## What the OWNER does (one list)

- [ ] Generate the backup token and key yourself; store them; give the key to a second person; set the three variables in Render; delete `D:\Primus-safety\render-backup-secrets.txt` (item 1).
- [ ] Create the synced backup folder and the Slack webhook; run the first backup by hand (item 1).
- [ ] Make the mirror private by the guide's order; rotate what the scan finds (item 2).
- [ ] Tell Cursor the exact Render plan name; add the workflow files through GitHub; set the uptime monitor; check the notification and spend limits (item 8).
- [ ] Write the margin decision, the Part 142 approval, and the Part 144 timing in `docs/DECISIONS.md` (items 7, 5).
- [ ] Approve the exemptions list (item 4).
- [ ] Provide the test key with a cap, the labelled ideas and the thresholds (item 6).
- [ ] Decide which Claude accounts may connect to the MCP endpoint (company-managed only) (P0).

## What to send me after each item

The report from rule 6, plus the new zip or the diff. I re-run the independent checks (the supplied tests, the probe, the scorecard) against the new build and update the scorecard. Target after all ten: every aspect at least 85, no open S1 or S2.
