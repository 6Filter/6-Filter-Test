# 6 Filter Test — Status so far, and what Cursor does next

Read this whole message, then the docs listed at the end. The product is called **6 Filter Test** (it used to be called Primus.AI; technical names such as `primus-secrets`, `primus-backup-*` and the `primus_session` cookie stay as they are). The same rules still apply as in `docs/prompts/Primus-AI_Ten_Actions_Master_Prompt.md`: you never generate, store, print or commit a secret; test data and the scratch database only; never edit a supplied test or the coverage gate or its recorder; scoring files locked at v5.7 / `ba0156d2` unless `docs/DECISIONS.md` carries the owner's written approval; report honestly with evidence; "NOT DONE" is an acceptable answer.

## 1. What has been done

**By the owner (reported; verify as in section 2):**
- The backup folder exists on the company OneDrive: `D:\OneDrive - CavinKare Private Limited\6-Filter-Test-Backups` (not shared, syncing, proven with a test file that reached the cloud). Both launchers (`run-primus-backup.cmd`, `run-primus-backup-check.cmd`) now point to it with the closing quote fixed.
- A password manager entry exists for the backup token and key; the token is saved in `%USERPROFILE%\primus-secrets\backup-token.txt` (64 characters). The owner generated both values personally; you did not and must not.
- `D:\Primus-safety\render-backup-secrets.txt` was deleted (A5). The encrypted safety dump of the Render database in that folder stays.
- Render's recovery was looked at (A6): **point-in-time recovery for the past 3 days** and a one-click export kept at least 7 days.
- The owner reports completing the checklist through **A7** (`docs/prompts/6-Filter-Test_Owner_Checklist.md`: the Render variables, the Slack webhook, the first backup, a copy of all Render settings in the password manager).
- `SESSION_SECRET` was rotated (everyone signed out). The Claude admin added the 6 Filter Test connector to the Claude organisation; the owner's own sign-in through Claude is being sorted out by the admin. Harshita (second pilot person) is out of town. `MCP_ALLOWED_EMAILS` holds the owner and Harshita.
- The platform scorecard now reads about **61 / 100** (Data safety 63, Scoring 72, AI 45, Functionality 69, Testing 57, Security 68, Performance 77, Operations 40); target about 85.

**By Cursor, per your own reports (local branches, nothing deployed):** `h1-mcp-pilot` (audit email, admin panel, fail-closed allowlist), `h1-log-layout`, `h1-hygiene`, `w3-research-incomplete-diag`, `w2-2-access-matrix`, `w5-coverage`, `t3-coverage-runtime` (9e59f14), `t1-mutation-kill` (65b08f5). Live is mirror commit `221abe5`.

## 2. First: verify the owner's steps, without reading any secret

Do not read environment values and do not open `primus-secrets`. Check only these, and report each in one line:
1. Live `https://ck-6-filter-test-88wu.onrender.com/api/health`: `ok`, the commit, and **`lastBackupAt`** (it must be a real time within the last day, not null).
2. The backup folder: list **names and sizes only** of the newest files. Expect a `primus-backup-<date>-<time>-xxxxZ.bk` and its `.json`.
3. The last 5 lines of `%USERPROFILE%\primus-backup\backup.log` (they hold no secrets): the last line should say `BACKUP STORED AND VERIFIED`.
4. Windows Task Scheduler: the two tasks exist, their next run times, and that they use the launchers with the corrected path.
5. Whether `%USERPROFILE%\primus-secrets\backup-key.txt` exists (existence only, never its content). If it does, run **A4**, the restore drill: decrypt the latest backup with `decryptBackup.mjs`, load it into the **scratch** database with `importExport.mjs`, run `verifyDatabaseCopy.mjs --timestamps ms --ignore-table backup_exports`, compare the uploaded files byte for byte, read the key from that file into the process environment only, never print it, delete the scratch data afterwards. Report `ALL MATCH`. If the file does not exist, say so and wait.
6. Anything that does not match what the owner reported: say it plainly.

## 3. Your last report: what I accept, what I do not, and what to fix

- **T2, the oracle:** accepted (5,000 boards, 0 disagreements, independent of the app's scoring code).
- **The two lock-screen exemptions** (`lock-member`, `lock-master`): the owner approves them, **on the condition** that they are removed if `PLATFORM_TEAM_LOCK_ENABLED` is ever turned on.
- **T3, the coverage map: not yet accepted.** Three problems:
  1. **Which inventory?** Your earlier report said **63 routes, 389 controls, 16 screens**. Now it says **62 routes, 191 controls**. 191 is about the size of the original 7-screen inventory, so the "100%" probably covers only half the controls. Say exactly which inventory was used and how many screens. Merge the extended inventory from `w5-coverage` (and the W3 route), run it three times for an identical hash, and **map 100% of the extended inventory** (389 controls on 16 screens, 63 routes).
  2. **Touching is not testing.** One test that clicks every control proves nothing except that nothing crashed. For each control family, add an expected-effect table and assertions (the request made, the text or state that changes, no console error), split by area (form, Log, Settings, output, admin) so a failure points somewhere. The owner and I will pick 20 controls at random and ask you for the exact line that asserts each effect.
  3. Never edit `testCoverageMap.mjs`, `touches.mjs` or `recordTouches.mjs`.
- **T1, mutation:** honest, and thank you for both numbers. 48.1% behavioural (`goNoGo.js` 59.2%, `scoreSlots.js` 43.6%, `propositionScoring.js` 37.2%) is far from 90%. Do not ask the owner to scope out branches. Instead:
  1. Use c8 coverage on a **realistic production-like run** (not only the tests) to classify every survivor: (a) **dead code** (never reached in any production path), listed in `scripts/coverage/mutation-survivors.md` with the proof; (b) **reachable but unasserted**: these are test gaps and must be killed.
  2. Targets: **`goNoGo.js` at least 90% behavioural** (the verdict), `scoreSlots.js` and `propositionScoring.js` at least 80% on **live** code, with dead code listed separately for the owner's later decision (removing it is a locked scoring change that needs approval).
  3. Then `filter1Check.js`, `filter2Check.js`, `f4Assessment.js`, and the rest of the fingerprint set, in that order.
  4. Report both scores per file (all mutants, behavioural) and the live-code score.
- **Branches:** push `t3-coverage-runtime`, `t1-mutation-kill` and the earlier local branches to the **private origin only, as branches** (not `main`, not the mirror, no deploy).

## 4. B (the private mirror): you may do it, with the owner's two clicks and strict safeguards

The owner has delegated the GitHub and Render parts of item B to you, because your tools are connected. Do it in two phases.

**Phase 1: prepare, now, read-only:**
1. Check your permissions on `cavinkarecia/6-Filter-Test-ck6filter` (`gh api repos/<owner>/<repo>`: `visibility`, `permissions.admin`, `forks_count`). If you are not an admin, stop and say so.
2. If `forks_count` is above 0, list the forks. A public fork stays public when the original goes private: tell the owner before anything else.
3. Run `scripts/scanForSecrets.mjs` on a **fresh clone of the mirror** and a history scan (gitleaks or trufflehog if available; otherwise the scanner over `git log -p`). Send a **masked** summary by type and file, the files that exist only in the mirror, and the company emails found.
4. Write the **rotation list**: what is exposed, where to rotate it (the owner does the rotating in Slack, Anthropic and Render; you never see the new values), in what order. **Never advise changing `DEPARTMENT_KEY_ENCRYPTION_SECRET` or `BACKUP_ENCRYPTION_KEY` without a written re-encryption plan.**
5. Find out, read-only, how Render is connected to this repository (the service's repository setting; the GitHub app installation) and whether you can grant the Render app access to the repository by API. If you cannot, say that the owner must do the two clicks below.
6. Prepare the commands for Phase 2 and send them for review. Do nothing else.

**Phase 2: execute, only when the owner replies with the single word "GO" in a new message, and never while a connector test is in progress:**
1. **The owner does two clicks** (they cannot be done by your token, as far as I know): give Render's GitHub app access to the repository (GitHub, Settings, Applications, Installed GitHub Apps, Render, Configure, Repository access), and confirm in Render (the web service, Settings, Build & Deploy, Repository, Edit) that the repository appears in the list. **Do not continue until the owner says both are done.**
2. Make the repository private: `gh repo edit cavinkarecia/6-Filter-Test-ck6filter --visibility private --accept-visibility-change-consequences`.
3. Trigger **one** deploy of the web service by the Render CLI (this named action only; no environment read, no environment write, no other setting), wait for it to be live, and check `/api/health` shows `"ok":true` and the expected commit.
4. Verify it is private: an unauthenticated request to the repository page and to its API must answer 404 (`curl.exe -s -o NUL -w "%{http_code}" https://github.com/cavinkarecia/6-Filter-Test-ck6filter`).
5. **If the deploy fails with a repository or permission error: do not make the repository public again.** Report the exact message and wait; the cause is almost certainly the app access in step 1. Only if the owner writes "REVERT" may you set it public again.
6. Log each step (names only, no values, no tokens) in `docs/GITHUB_RENDER_CHANGES.md` (add it to `.gitignore`).
7. Afterwards: tell the owner to rotate the Render API key and sign out the Render CLI (`render logout`). You hold no standing access after that.
**Still the owner's alone:** rotating secrets in the Slack, Anthropic and Render accounts (item B2), because they need the owner's logins.

## 5. Next tasks, in this order

1. Section 2 (verify), then A4 if the key file exists.
2. Section 3 (the corrections), starting with the extended inventory and the assertions.
3. Section 4, phase 1 now; phase 2 on "GO".
4. Continue `Primus-AI_Score_Sprint_2_Cursor_Prompt.md`: **T5** (Part 142 and the margin impact report on branches, not merged), **T6** (AI contract tests), **T7** (the unfinished-research health field and safe fixes; the diagnostics branch is ready), **T8** (the file-recognition matrix), **T9** (CI, `render.yaml`, `backupAgeHours` and `backupStale` on health, `docs/OPERATIONS.md`; the owner will add the workflow files through GitHub), **T10** (Part 155 paging on a branch, not deployed until the owner confirms a verified backup and restore), **T11** (small items).
5. The deploy order, when the owner releases the hold (one deploy window per day, never during a test): the MCP branch first, then tests-only branches, then the diagnostics endpoint and health fields, then the operations branch, then paging last.

## 5b. Work moved from the owner to you (everything you can do, you do)

The owner should only do what needs their own login, their own decision or their own people. These were on the owner's list and are now yours:
1. **The Render plan name.** Read it yourself, **read-only and without touching the environment** (the service's instance type from the Render CLI or API), and put it in `render.yaml` on the hygiene branch. Report what you read.
2. **CI and branch protection.** The owner will run `gh auth refresh -h github.com -s workflow` once and approve in the browser (no secret is typed or shared). After that, push `.github/workflows/ci.yml` and the keep-alive workflow yourself, and set branch protection on `main` requiring the CI check, with `gh api`, if you have admin rights. If the scope is still missing, say so.
3. **Monitoring without a new account.** Write a **scheduled GitHub Action, every 30 minutes**, that requests `/api/health` and posts to Slack (the webhook comes from a repository secret named `OPS_ALERT_WEBHOOK_URL`, which the owner adds in GitHub) when `ok` is false, when `backupStale` is true, or when `researchIncompleteRate` is above 5%. No secret in the repository or the logs. Test it against a fake health server. State the monthly Actions minutes it uses.
4. **A monthly Action** that runs `npm audit --omit=dev` and `scripts/scanForSecrets.mjs` and opens an issue if either finds anything.
5. **Pre-fill the golden-set sheet.** From the **scratch copy** (the restore drill's database, never the live one), choose 30 ideas that cover every division and category and a mix of verdicts and unfinished ones, and fill only the **input columns** of `golden_set_labels_template.csv`. Leave every label column **empty** for the experts, and never put the AI's own answers into a label column (that would make the golden set worthless). Also produce the **calibration table** (idea id, team, date, the platform's verdict, and an empty outcome column for the NPD heads).
6. **Drafts, with no secrets:** `docs/RECOVERY_ONE_PAGER.md` (where the backups are, the restore steps, who to call; name placeholders), `docs/USER_GUIDE.md` with a 20-minute walkthrough outline for the pilot teams, an announcement text, and a support runbook (who answers, how to report a problem, what to do for the common errors).

## 5c. Cross-check against GitHub: what must be pushed, and what is wrong in the live code

I unpacked the code on GitHub (the mirror) and compared it with your reports. **Verified:** the 28 locked scoring files are identical to the build I tested; Part 154 passes my 7-check test; the MCP probe passes 8 of 8 on it; your own MCP test passes 39 of 40 here (the one that fails fetches Claude's identity document and my sandbox has no internet: say whether it passes on your machine). **Absent from GitHub** (local branches or untracked files, so they exist on one PC only): the MCP panel, the audit email and the fail-closed allowlist (`h1-mcp-pilot`); the diagnostics endpoint; `scripts/coverage/*` and the runtime-evidence tests; the mutation tests; the access-matrix tests; the CI files; `scripts/pullBackupToFolder.mjs` and its test; the probe and the other supplied tools; `docs/MCP_PILOT.md`. **Wrong in the live code:** `pilotAllows` in `lib/mcpHttp.js` returns true when `MCP_ALLOWED_EMAILS` is unset or empty (**fail-open**); `.cursor/` is public and not in `.gitignore`; `render.yaml` says `plan: free`; `package.json` has `verify:all` pointing to `scripts/verifyAll.mjs`, which is not there; the new dev tools (Playwright, Stryker, c8, axe, fast-check) are installed on every deploy.

Do, in this order (all on the private origin first; **no deploy and no mirror push** without the owner's message):
1. **Commit the supplied tooling and every local branch to the private origin** (a branch `supplied-tooling` holding `pullBackupToFolder.mjs` and its test, the probe and its test, `scripts/coverage/*`, the harness, `exportToBlob.mjs`, `testHttpPerformance.mjs` and the other supplied tests and docs). The nightly backup currently runs from an untracked script inside `C:\Users\1015803\Downloads\Primus.ai`, so one deleted folder would stop it silently. Keep these out of the mirror unless the owner says otherwise.
2. **Prepare a tiny, separate commit for the owner to release first: only the fail-closed allowlist** (unset or empty means nobody; a single `*` means everyone; a list means that list), with its test, cherry-picked from `h1-mcp-pilot` so it deploys fast and alone. Report the exact diff.
3. `.gitignore`: add `.cursor/`, `docs/RENDER_ENV_CHANGES.md` and `docs/GITHUB_RENDER_CHANGES.md`; untrack `.cursor/`.
4. `package.json`: either commit `scripts/verifyAll.mjs` or remove the `verify:all` script; and keep the test-only tools out of the production install (Render currently installs them), for example by moving them to a separate workspace or by a documented install flag, without breaking the build.
5. `render.yaml`: the plan name (read it from Render, read-only), and say whether `healthCheckPath: /` should become `/api/health`.
6. State which commit the live site runs and whether the zip I checked equals it.

## 6. The hold

Still in force for: deploys (except the single named deploy in section 4, phase 2), the mirror, Render environment reads and writes, and any scoring change. You may push branches to the private origin.

## 7. Reporting

One report per day: what you verified (section 2), what you fixed (section 3), what you did in section 4, and the evidence for each (command and final line, secrets masked; supplied tests run untouched; branch and commit; defects with severity; what you wait for). I rescore from that.

**Docs:** `docs/prompts/6-Filter-Test_Owner_Checklist.md`, `Primus-AI_Score_Sprint_2_Cursor_Prompt.md`, `Primus-AI_Ten_Actions_Master_Prompt.md`, `Primus-AI_Solo_Owner_Guide.md`, `Primus-AI_Backup_Setup_Runbook.md`, `Primus-AI_Platform_Scorecard.md`.
