# 6 Filter Test — Road to production (the full plan after the backup step)

**Written 20 November 2026.** It starts where we are: the Render database is on the paid plan; Part 154 (compress and cache) passed its test; the app's own backup works and restores (proven on a real database) but **has not been switched on** (`lastBackupAt` is null); the scorecard overall is about **55 / 100**.

**How to read it.** Each phase has: the goal, the tasks (who does each: **You** = the owner, **Cursor**, **Me** = Claude, **IT** = whoever administers Azure, GitHub and Render for the company), the proof that the phase is finished, and how the scorecard should move. Time estimates are mine, they assume Cursor keeps its recent pace and your decisions arrive within a few days, and they are estimates, not promises.

> **Running this alone (no IT)?** Every task marked **IT** below becomes yours. `Primus-AI_Solo_Owner_Guide.md` gives the exact steps for the three that matter most: a backup copy in a folder you own (no cloud account needed), making the public mirror private without breaking deploys, and which secrets to rotate (and which **not** to). It also covers the single-person risk: someone else must be able to restore the data if you cannot.

## The destination, in plain words

"Production" means **all CavinKare teams use it for real stage-gate decisions, unattended, and a bad night does not lose data, leak data or give a wrong verdict.** Concretely, every one of the eight aspects scores **at least 85**, there is **no open S1 or S2 defect**, and the 11 exit gates of `Primus-AI_Full_Platform_Verification_Prompt.md` hold. Reaching them means "everything we can enumerate is checked, and the checks would catch a change". It is not a promise of zero bugs.

## The plan on one page

| Phase | When (from today) | Goal | Scorecard after (estimate) |
|---|---|---|---|
| **0. Finish the backup** | days 1 to 3 | A backup that really runs, restores, and alerts | Data safety 59 to ~85 |
| **1. Safety and hygiene** | week 1 to 2 | Private code, rotated secrets, CI, monitoring, an honest test baseline | Security 60 to ~72, Operations 38 to ~65 |
| **2. Verdict correctness** | week 2 to 4 | The scoring is fully built, independently checked, and the margin rule settled | Scoring 65 to ~85 |
| **3. Evidence of quality** | week 3 to 6 | Every button, route, file and AI call has a test; the AI's accuracy is measured | Testing 45 to ~85, AI 47 to ~80, Functionality 67 to ~88 |
| **4. Scale and speed** | week 4 to 6 (parallel) | The Log in pages; fast with any number of ideas | Performance 59 to ~87 |
| **5. Pilot** | week 5 to 8 | Two or three teams use it for real, under watch | Confidence, calibration data |
| **6. Rollout and go-live** | week 8 to 10 | Everyone, with a rollback ready | All eight at least 85 |
| **7. After launch** | forever | Monthly drills, quarterly calibration, renewals | Scores stay up |

**The critical path** is: backup running, then private code, then Part 142 and the margin decision, then the verification phases, then the pilot. Part 155 (paging) and the AI evaluation can run alongside. **A pilot can start at about week 5**; broad go-live is about **week 8 to 10** if the pilot is clean. The calendar is longest where it waits on you: the margin decision, the golden-set labels, the AI test key, and the SAS and secrets.

---

## Phase 0 — Finish the backup (days 1 to 3)

**Goal:** a verified backup lands off Render every night, a person is alerted if it fails, and a restore has been done on your side.

| # | Task | Who | Proof |
|---|---|---|---|
| 0.1 | Generate `BACKUP_TOKEN` and `BACKUP_ENCRYPTION_KEY`; store them in the password manager; give the key to **two named people**, offline | You | Two people confirm they hold the key |
| 0.2 | Set `BACKUP_TOKEN`, `BACKUP_ENCRYPTION_KEY` and `OPS_ALERT_WEBHOOK_URL` in the Render web service | You | The service redeploys; `/api/health` is `ok` |
| 0.3 | Create the private `primus-backups` container, turn on soft delete, make a **Create + Write only** container SAS (about 90 days); save it in the Temp-folder file for Cursor | You (or IT) | `exportToBlob.mjs check` prints "can store backups: yes" |
| 0.4 | Run `testExportToBlob.mjs` untouched, take the first real backup | Cursor | `lastBackupAt` on live `/api/health` is within the last minute; "BACKUP STORED AND VERIFIED" |
| 0.5 | Schedule it nightly at 02:30 India time (`0 21 * * *` UTC): a Render Cron Job, or an always-on company machine; secrets in the scheduler's store; **alert on any non-zero exit** | Cursor + You | One scheduled run succeeded; a deliberately failed run raised the alert |
| 0.6 | **Restore drill into a scratch database**: `fetch`, `decryptBackup`, `importExport`, then `verifyDatabaseCopy.mjs --timestamps ms --ignore-table backup_exports` must end `ALL MATCH`; the uploaded files must match byte for byte | Cursor | Written report with the numbers |
| 0.7 | Measure the export's memory on the live service in a quiet hour (Render Metrics) | Cursor | Peak reported; if high, open a "stream the export" task |
| 0.8 | Write `docs/OPERATIONS.md`: restore steps, failover, the monthly drill, the **names** of every secret and who holds each copy | Cursor, You review | The document exists and a second person has read it |
| 0.9 | Confirm Part 154 on the live site (`curl.exe -I -H "Accept-Encoding: gzip" https://ck-6-filter-test-88wu.onrender.com/` shows gzip and the cache headers) | You | Headers shown |
| 0.10 | Check what the Render database's **Recovery** tab offers (retention) | You | Reported to me |

**Governance check at the same time (important).** The Azure subscription shown in your screenshots is a **personal** one (a personal email address), and company ideas and employee data would sit in it. Before the first real backup, decide: either move the storage to a **company-owned** subscription, or send the backups to company SharePoint instead (the Power Automate route, if the HTTP action is licensed). I am not a lawyer; ask your IT and security teams, and the company's data-protection owner, because the backup holds employee email addresses and confidential ideas.

**Done when:** one nightly run has stored a verified backup, a scratch restore matched, and a failed run raised an alert. **Data safety about 85.**

---

## Phase 1 — Safety and hygiene (week 1 to 2)

**Goal:** the code is no longer public, nothing exposed is still valid, deployment is repeatable, someone is told when it breaks, and we know the true state of the tests.

| # | Task | Who | Proof |
|---|---|---|---|
| 1.1 | **Make the GitHub mirror private.** Connect Render's GitHub app to the private organisation repository, point the web service at it, then retire the public mirror | You + IT | The mirror address returns "not found" when signed out; a deploy from the private repo succeeds |
| 1.2 | Scan the mirror's **history** (a fresh clone) with `scanForSecrets.mjs` and a history scanner (gitleaks or trufflehog); report masked findings | Cursor | The report lists findings by type and file, never a whole secret |
| 1.3 | **Rotate every secret that was ever in the mirror** (database password, Slack tokens, AI keys, session and login secrets, the backup token and key, any SAS) | You | Each rotated, each recorded in the password manager |
| 1.4 | Make the sync an **allowlist** (tracked files only); add `.gitignore` patterns (`*.dump`, `*.dump.enc`, `*-database-url.txt`, `.env*`, `scripts/_*`, `.cursor/`); remove the `.cursor` folder from the repository; replace real employee emails in test fixtures with example addresses | Cursor | `scanForSecrets.mjs` exits 0 on the repository |
| 1.5 | CI: a workflow that runs the scanner, the regression suite and the logic lock on every change; a pre-merge gate | Cursor (+ You if a token with workflow scope is needed) | A failing test blocks a merge |
| 1.6 | Fix `render.yaml` (it still says `plan: free`; the live plan is the paid one) and add the keep-alive workflow that `testPart70Health` expects | Cursor | The blueprint matches the live service |
| 1.7 | **Monitoring:** an uptime check on `/api/health` (a free service is fine), an alert if `lastBackupAt` is older than 26 hours, Render's notification emails, an Anthropic spend limit per key, an Azure budget alert | You + Cursor | A test alert reaches a person |
| 1.8 | Triage the 6 high `npm audit` findings: `npm audit --omit=dev` first; fix with the test suite after each change; no `--force` | Cursor | A written list: fixed, not reachable, or accepted with a reason |
| 1.9 | **Run the coverage gate once** (`inventory.mjs` three times, extended with the missing screens; `testCoverageMap.mjs --report`) and report the baseline; rename the 19 colliding test files so supplied and own tests never share a name | Cursor | `inventory.json` attached; the drift list explained |
| 1.10 | Adjudicate the three spec-deviation tests: `testInputReview`, `testInputReviewSubmit` (400 vs 422), and **`testManagerReviewFirstTimeHead`** (a business head who never signed in gets no Slack message: check this first, it may be a real regression of the manager flow) | Cursor reports, You decide | For each: the build is fixed, or you approve a spec change in writing |

**Done when:** the mirror is private, every exposed secret is rotated, CI blocks a failing change, and the gate baseline and drift list are delivered. **Security about 72, Operations about 65.**

---

## Phase 2 — Verdict correctness (week 2 to 4)

**Goal:** the scoring and verdict logic is complete, matches your rules, and is checked by something other than itself.

| # | Task | Who | Proof |
|---|---|---|---|
| 2.1 | **Decide the margin rule** (see the decision register, D1) after reading the impact report | You | `OWNER'S DECISION` filled in `docs/DECISIONS.md` |
| 2.2 | Job 3: decision record, a read-only replay of the stored ideas under both rules (how many change, by team and division), tests for both options; then build the chosen one as ruleset **v5.8** with the fingerprint, golden file and logic lock updated | Cursor | The impact report; both tests pass; v5.8 fingerprint approved |
| 2.3 | **Part 142**: junk or placeholder answers earn nothing even when the AI is fooled into rating them strong (today a fooled AI gives 3 of 7 Filter 1 credits to junk) | Cursor | `testQualityNotQuantity.mjs` and `testImprovementPathValid.mjs` pass untouched |
| 2.4 | **Part 145, second half**: an exempt pure-commodity idea is scored over the 11 remaining checks (14 in the final) from a sourced research finding; the parity box becomes the one-tick design | Cursor | `testPureCommodityExemption.mjs` (the supplied one) passes; the form matches the spec |
| 2.5 | An **independent rules model** inside the tests (re-implemented from the written rules, not copied from the app) compared on at least 5,000 generated ideas; property tests (more credit never lowers the score; order never matters; 25 repeats identical); **mutation testing** on the scoring and verdict files | Cursor | Zero disagreements, or each explained; mutation score at least 90% |
| 2.6 | **Calibration review.** 2 GO of about 320 screened ideas is very strict. Pick 30 to 50 past ideas whose real outcome you know (launched, killed, still running) and compare the platform's verdict with the outcome | You + NPD heads + Me | A table of verdict against outcome; any threshold change is **your** written decision (the scoring files are locked) |
| 2.7 | Decide **when Part 144** (the proof file and the final verdict over Filters 1 to 5, GO above 80 after Filter 5) is built; until then **label the verdict "Screening verdict (Filters 1 to 4)"** everywhere so a GO is never read as final | You | The wording decision recorded |

**Done when:** the margin rule is decided and built, Part 142 and the commodity scoring pass, the independent model agrees, and the calibration table exists. **Scoring about 85.**

---

## Phase 3 — Evidence of quality (week 3 to 6)

**Goal:** every button, route, file type and AI call has a test that would fail if it broke, and the AI's accuracy is a measured number.

Run the six phases of `Primus-AI_Full_Platform_Verification_Prompt.md`, in its order, reporting after each:

| # | Work | Who | Proof |
|---|---|---|---|
| 3.1 | **Every control and every route** has a test (the coverage gate passes: 100% mapped, exemptions under 5%, each with your approved reason). Today: 33% of routes and 40% of controls are mentioned by any test | Cursor | `testCoverageMap.mjs` passes |
| 3.2 | **File recognition matrix** (types, both size limits, corrupt, password-protected, wrong extension, Unicode, injection in CSV): recognised by content, extracted fields equal ground truth, nothing created on refusal | Cursor | The matrix report, each row with its expected outcome |
| 3.3 | **Access matrix**: every route by every role (anonymous, member with and without a team unlock, manager, BH FORUM, Admin, the idea's owner); another team's idea is refused; add my unauthenticated sweep as a permanent test (104 of 120 requests refused today, none leaking) | Cursor | A passing matrix; no route answers without the right to |
| 3.4 | **AI contract tests** with a stubbed AI for every call site: bad, partial and refused output, timeouts, **prompt injection** inside idea text and uploaded files, invented sources | Cursor | All pass; no injected instruction obeyed |
| 3.5 | **AI golden-set evaluation** (budget capped): at least 30 labelled ideas, three runs each, accuracy per check, run-to-run variance, a source audit of 100 citations, an adversarial set of 10, cost and time per idea | Cursor + You (labels, a **test key with a spend cap**, the acceptance thresholds) | The numbers against thresholds, e.g. at least 85% on GST and benchmark relevance, tech-shift within one level at least 90%, zero invented sources |
| 3.6 | Diagnose why about 6% of screenings end INCOMPLETE and why Filter 4 sometimes does not finish; target under 3% | Cursor | A root cause and a measured rate |
| 3.7 | Data integrity: two tabs and two people editing, refresh mid-save, database down, India-time months and the 1 April year turn, delete and restore (add a "recently deleted" restore screen) | Cursor | Tests pass; the screen exists |
| 3.8 | The Log, charts, insights and every export parsed and compared with what is on screen | Cursor | Matches the oracle |
| 3.9 | Real browsers (Chromium, WebKit, Firefox) at five widths; **axe-core: zero serious or critical** on every screen; the two-column layout; the opening form within 1.25 screens; the "web check" column state | Cursor | The layout test and axe report |
| 3.10 | **c8 coverage** (at least 95% lines and 90% branches on the scoring and verdict files, 85% on the rest of `lib/`) and the **mutation score** (at least 90%) | Cursor | The numbers in `results.json` |
| 3.11 | The final **verification report** (`docs/verification/REPORT.md`): the requirements matrix, defects by severity, NOT BUILT and UNVERIFIABLE lists | Cursor, Me review | Gates G1 to G11 reviewed one by one |

**Done when:** gates G1 to G11 hold or each exception is written and signed by you. **Testing about 85, AI about 80, Security about 85, Functionality about 88.**

---

## Phase 4 — Scale and speed (week 4 to 6, in parallel)

| # | Task | Who | Proof |
|---|---|---|---|
| 4.1 | **Part 155: the Log in pages** (50 per page, keyset cursor), exact server-side summaries, every filter and chip on the server, **visibility applied before the page is cut and before any count**, exports that stream | Cursor | The eight tests of the Part 155 prompt pass, including "summary equals the browser's arithmetic" and "hidden ideas change no number" |
| 4.2 | Budgets: the first Log page under 150 KB and 10 database calls, within 2 seconds at 2,000 ideas with the database 250 ms away; the Log must not break at the old 2,000-idea cap | Cursor | `testQueryCount`-style test at 2,000 ideas |
| 4.3 | If memory on the 512 MB service was high in 0.7: stream the backup export | Cursor | Flat memory during an export |
| 4.4 | Watch the Metrics tab; if the 0.1 CPU database is often near its limit, move to the next plan | You | A decision recorded |

**Performance about 87.**

---

## Phase 5 — The pilot (week 5 to 8)

**Goal:** real use, a small blast radius, quick learning.

1. **Scope:** two or three teams (a mix: one that screens many ideas, one that screens few) for 2 to 3 weeks. Everyone else keeps the old process.
2. **Prepare:** a one-page "how to use it" guide and a 20-minute walkthrough for the pilot teams; a named person to answer questions (a Slack channel); the wording "Screening verdict (Filters 1 to 4)" on the output.
3. **Rules of engagement:** the scoring is **frozen** during the pilot (no rule changes); S1 or S2 problems are fixed within 48 hours; everything else is logged.
4. **Measure weekly:** ideas screened; INCOMPLETE rate (target under 3%); time to a verdict; cost per idea; the share of ideas the managers approve or reject; backup health; errors; user feedback (a 3-question survey). Re-run the scorecard.
5. **Record outcomes** with the existing "record outcome" action so the next calibration has real data.

**Pilot exit:** two weeks with no S1 or S2, INCOMPLETE under 3%, the backup and restore drill clean, and the pilot teams say they would use it again.

---

## Phase 6 — Rollout and go-live (week 8 to 10)

1. **Go-live review:** the scorecard, each aspect at least 85; gates G1 to G11; the decision register closed; you sign.
2. **Rollback ready:** the previous release and a fresh backup taken just before; a one-line "how to go back" in `OPERATIONS.md`.
3. **Roll out in waves:** a few teams a week, not everyone on one day; watch the Metrics and the INCOMPLETE rate each day for the first week.
4. **Communicate:** an announcement with the guide, what the verdict means (and does not), who to ask, and how to report a problem.
5. **First-month review:** the scorecard again, the calibration table updated with the first real outcomes, costs against budget.

---

## Phase 7 — After launch (the routine that keeps the scores up)

| Cadence | What | Who |
|---|---|---|
| **Nightly** | Backup runs; `lastBackupAt` fresh; alert if not | Automatic |
| **Weekly** | Check INCOMPLETE rate, errors, costs, uptime; triage feedback | You + Cursor |
| **Monthly** | **Restore drill** into a scratch database (`ALL MATCH`, files byte for byte); `npm audit`; secret scan | Cursor |
| **Quarterly** | Calibration review against real outcomes; re-run the full verification; re-run the scorecard; review roles and access | You + NPD heads + Me |
| **Before each expiry** | Renew the SAS two weeks early; rotate secrets on a schedule; a paid plan's card is valid | You |
| **Per release** | CI green, logic lock, scanner, one backup just before | Cursor |

**The next features** (after launch, not before): Part 144 (the proof file and the final verdict, if not already built in the pilot), Filter 6 and the outcomes loop, the remaining sections (23, 28 and 29) of the CK Pulse business requirements document, and a decision on Nielsen and Kantar data and its licence.

---

## Decision register (what I need from you, with a recommended default)

| # | Decision | Recommendation | Needed by |
|---|---|---|---|
| **D1** | **Margin below the division minimum:** A, a mark-down capped at WATCH that a manager can approve forward (today); or B, a hard NO-GO with an exception note to CKR (your v4 text) | Look at the impact report first. If v4 is the authority, B; if the business wants flexibility, A, and then change the v4 wording. Either way, record it | Phase 2 start |
| D2 | Keep **Required** labels on every box (restored in the last build)? Earlier an instruction removed them | Keep (twelve boxes) | Phase 1 |
| D3 | Parity: one tick (the Part 145 design) or the text box that exists now | The tick | Phase 2 |
| D4 | The **Bulk upload** button (Cursor's own addition): keep? | Keep, with the single-upload rule that a file of several ideas is refused | Phase 1 |
| D5 | **Make the GitHub mirror private** and connect Render to the private repo | Yes, now | Phase 1 |
| D6 | **Where backups live:** the personal Azure subscription, a company subscription, or SharePoint | Company-owned storage | Phase 0 |
| D7 | The AI **test key** with a spend cap, the 30 golden-set ideas with expert labels, and the acceptance thresholds | Cap sized from the cost estimate Cursor reports first | Phase 3 start |
| D8 | **Approvers** for WATCH ideas: Admin and BH FORUM; a named deputy for each | Name the deputies | Phase 1 |
| D9 | **Part 144 timing:** before the pilot or during it; and the wording "Screening verdict" until then | During the pilot, with the wording in place | Phase 2 |
| D10 | **Pilot teams and dates**; the support person | Two or three teams; a Slack channel | Phase 4 |
| D11 | **Retention:** deleted ideas (90 days today), backups (35 days suggested, with a storage rule), audit | Confirm with your data-protection owner | Phase 1 |
| D12 | **Nielsen and Kantar** data: use, licence, how it is cited | Ask procurement before any use | Before it is used |
| D13 | Monitoring and on-call: who gets the 2 a.m. alert | A named person and a deputy | Phase 1 |

---

## Who does what

| Role | Owns |
|---|---|
| **You (owner)** | Every decision above; the secrets and their custody; Render and GitHub access; the golden-set labels; the pilot and the go-live signature |
| **Cursor** | All code, tests, CI, scans, backups, the verification report; reports at the end of every phase and never edits a supplied test |
| **Me** | The prompts and tools; independent re-runs of every claim against each new build; the scorecard after each phase; the calibration analysis; the remaining BRD sections |
| **IT / security** | The company-owned storage, the private repository, the monitoring and on-call set-up, a review of hosting and data location (Render, and where the AI provider processes data) |
| **NPD heads and managers** | The outcome labels, the pilot feedback, and the approval flow in real use |

## Risks and what we do about each

| Risk | Likelihood | Effect | Mitigation |
|---|---|---|---|
| A bad night loses data | Low once Phase 0 is done | Severe | Nightly verified backup, a monthly restore drill, an alert, two key holders |
| A secret is already exposed in the public history | Medium | Severe | Phase 1: scan, rotate everything, make the mirror private |
| The verdict is too strict or too lenient | Medium | Trust | Phase 2 calibration against real outcomes; the "Screening verdict" wording; frozen rules in the pilot |
| The AI is wrong or fooled | Medium | Wrong score | Part 142; contract tests; the golden-set evaluation; INCOMPLETE rather than a guess |
| Decisions arrive late | Medium | Calendar slips | Recommended defaults above; one decision-meeting per week |
| Cursor edits a test to make it pass | Medium | Hidden defects | The drift report, the checksum manifest, the independent re-run |
| The small database or web service is overloaded | Low to medium | Slow pages | Part 154 (done), Part 155, the Metrics watch, the next plan size |
| Company data sits in a personal cloud account | Real today | Governance | D6: company storage before the first real backup |
| People read a "GO" as final | Medium | Wrong decisions | The label "Screening verdict (Filters 1 to 4)" until Part 144 |

## Costs to expect (rough, check each figure on the provider's page)

Render web service about $7 a month and the database about $6 (plus storage); Azure Blob storage for the backups is small (cents to a few dollars a month); a Render Cron Job for the nightly run is a few dollars at most; a free uptime check; the AI usage is the real variable (the platform already has a usage endpoint; set a cap per key); the golden-set evaluation is a one-off AI cost that Cursor must estimate and you must approve first.

## How we will know we are on track

At the end of every phase I re-run the independent checks against the new build and update `Primus-AI_Platform_Scorecard.md` with the new numbers. **Stop rules:** no new feature work while an S1 is open; no scoring change without your written approval and a new fingerprint; no phase starts until the previous phase's proof is delivered.
