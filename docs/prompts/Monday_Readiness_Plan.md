# 6 Filter Test — Monday readiness plan (the business heads test it on Monday 23 November)

Written Saturday 21 November 2026, about 38 hours before the test. Times are India time. The goal is that on Monday the heads see a tool that works, fails loudly instead of quietly, never gives a verdict it cannot support, and cannot lose their data.

## 0. The honest frame

**What we can promise and prove by Monday**
- **The scoring is locked.** I compared the live code with the build I tested: all 28 locked scoring files are byte-identical (ruleset v5.7, fingerprint `ba0156d2`). The preflight checks this again on Monday morning.
- **Backups exist.** Two verified, encrypted backups of the live data are in your company OneDrive and the health page shows a fresh `lastBackupAt`. Still to prove tonight: the scheduled run, and a restore.
- **Failures are loud.** An unfinished research step shows "Research failed, retry" and no score. It never becomes a made-up verdict.
- **Nothing changes after Sunday 20:00.**

**What nobody can promise**
- **A "perfect" AI answer.** The AI searches the web and reasons, so answers vary, and its accuracy has never been measured against labelled ideas (that needs your experts; it comes after Monday). What we can do is measure a small rehearsal now, make failures graceful, and tell the heads clearly that this is a pilot.
- **Literally zero data loss.** What we can do is stack the protections: a paid database, Render's 3-day point-in-time recovery, a nightly encrypted backup, a restore proven on a copy, no deploys during the test, and a backup taken just before it.

**The biggest AI risk I found (in the code on GitHub).** The central AI call (`lib/callAnthropic.js`) makes one request with **no timeout, no automatic retry and no limit on how many run at once**. If Anthropic answers "too many requests" or "overloaded", or a web search is slow, that research step fails at once and the idea shows "Research failed, retry". Live health shows **70 unfinished ideas out of 497 (about 14%)**. On Monday, several heads screening at the same time could make it worse. This file is **not** one of the locked scoring files, so a retry, timeout and concurrency fix is allowed without any scoring approval, and the logic lock proves nothing else changed. It is the most valuable pre-Monday change.

## 1. Your six asks: status, and what we do by Monday

| You asked for | Status now | What we do by Monday | Proof |
|---|---|---|---|
| **Input fields work** | Tested in code (labels, the 12 boxes, placeholder guard, drafts); never rehearsed end to end on real ideas | Cursor runs the whole form in a real browser (laptop and phone width), including uploads, autosave, reload and the submit gate; you run one real idea on the live site | Test lines and screenshots; your own run |
| **The AI detects the info entered** | Input review and first-pass AI exist; quality never measured | A rehearsal of 12 ideas, including 2 messy descriptions and a file upload | The results table (section 3) |
| **Web searches work** | Uses Anthropic's web search; cited sources are checked against what the search returned; failures are not retried | The retry and timeout fix; every cited address in the rehearsal is opened and the quoted text looked for | Counts: sources real, quotes found |
| **A perfect, genuine output** | Not promisable | No made-up sources; an incomplete research step never produces a verdict; a verdict is stable across repeat runs; every verdict is labelled "Screening verdict (Filters 1 to 4)" | Rehearsal numbers; the wording change |
| **Scoring logic locked** | **Verified** | Preflight check P2 on Monday morning | Fingerprint `ba0156d2` |
| **No data loss, a backup** | Two verified backups; scheduled run and restore not yet proven | The scheduled run (tonight), the restore drill (A4), a manual backup on Sunday night, the freeze | `lastBackupAt`, `ALL MATCH`, preflight P3 |

## 1b. The load check I ran (the Log at the live size, many people at once)

I cloned evaluated ideas to the live size (506 ideas, a 6.4 MB Log, about 1 MB gzipped) on a real Postgres and a real server with a 256 MB heap (`testHeadsLoad.mjs`, 4 checks pass, repeatable). Numbers are from a fast test machine; **the live service has half a CPU, so expect it to be slower, perhaps two to three times**.

| Test | Result |
|---|---|
| One admin opens the Log | about 0.3 s of server CPU |
| **Ten admins at the same moment** | all answered; the last one waited about 3 s here; peak memory 360 to 390 MB |
| **Twenty at the same moment** | all answered, about 6 s; **peak memory about 483 MB, close to the 512 MB limit** (over it, the platform kills and restarts the app) |
| Ten Business Managers at the same moment | the last waited about 0.7 s; one fifth of the CPU (they see only their own ideas) |
| Opening one idea | about 7 ms |

**What this means for Monday.** A handful of heads, staggered, is comfortable. The heavy case is **many people with broad roles opening the Log in the same minute**. So: (1) make the heads **Business Managers or BH FORUM, not Admin**; (2) stick to the staggered slots; (3) ask them to open the Log only when needed; (4) during the session watch Render's **Metrics**: if **memory passes about 450 MB**, ask everyone to pause for two minutes. The real fix, the Log in pages (Part 155), is built on a branch but is a big change: do it **after Monday**, not before.

## 2. Timeline

**Saturday evening (now until midnight)**
- *You:* (1) after 18:25 run the scheduled backup test: `Start-ScheduledTask -TaskName "Primus backup"`, then check `LastTaskResult` is 0; (2) paste the A4 restore message to Cursor (your key file is ready); (3) save a **capped Anthropic test key** for Cursor in `%USERPROFILE%\primus-secrets\eval-key.txt` and set its spend cap; (4) send Cursor and me **the heads' names, work emails, roles and teams**; (5) paste Cursor the Monday prompt (`Cursor_Monday_AI_Quality_Prompt.md`); (6) the Slack alert address if you have time.
- *Cursor:* the restore drill (keep the scratch copy until the diagnosis is done), classify the 70 unfinished ideas by cause from the restored copy, and start the reliability fix.

**Sunday 09:00 to 13:00**
- *Cursor:* the reliability fix tested against a fake Anthropic server; the AI rehearsal; the browser smoke test. Report.
- *You:* make sure each head can sign in and will see the right things. Sign-in is by Slack code, so each head must be in Slack. A Business Manager sees only the ideas they created; BH FORUM sees the mapped teams; Admin sees everything. Check each head's role and team in Settings.

**Sunday 13:00 to 17:00**
- Review the rehearsal together, fix the top issues, prepare the deploy candidates **with their evidence**. Candidates are the only things that may go live.

**Sunday 17:00 to 20:00, the only deploy window**
- You say "deploy `<branch>`" for each, one at a time, in this order: (1) the tiny fail-closed allowlist; (2) the reliability fix; (3) the wording change. After each: run the preflight and run one real idea.

**Sunday 20:00: FREEZE.** No deploys, no Render setting changes, no secret changes. Emergencies only.

**Sunday 21:00**
- Take a manual backup (double-click `run-primus-backup.cmd`; it needs the hourly allowance free), confirm `lastBackupAt`, run the preflight, and run one real idea end to end yourself.

**Monday 08:00**
- Run the preflight (it must say GO). Check: backup fresh; Anthropic credit and limits; Render Metrics baseline; the Slack alert works. Send the heads the staggered schedule and the guide (`Heads_Test_Guide_And_Feedback.md`, ready to paste into an email).

**Monday during the session**
- Every 30 minutes check the preflight and the Render **Logs** for errors. Write down each head's idea and what they said. **No code changes.** If something serious happens, see section 7.

**Monday evening**
- A backup, Cursor's diagnostics, and the heads' feedback collected.

## 3. The AI rehearsal Cursor runs on Sunday (and how to read it)

*Method:* a local copy of the app on the restored scratch database, the real Anthropic API with your capped test key, never the live database. Twelve ideas: eight past ideas with known verdicts, two deliberately messy descriptions, two fresh ones you supply. Three of them are run three times each; four are run at the same moment.

| Measure | Monday target |
|---|---|
| Finish all four filters without a manual retry | at least 11 of 12 |
| Median time | 3 minutes or less |
| Cited sources: opened, and the quoted text found | **0 invented** |
| GST rate against the GST table for the category | all correct |
| Benchmark chosen | a real product in the category (a human checks the 12) |
| The same idea three times: same verdict band | at least 2 of 3 runs, score spread 10 points or less |
| Four screenings at the same moment | all four finish |
| A messy description: the AI picks out the attribute, benchmark and gap sensibly; placeholders refused | yes, with examples |
| Cost per idea | measured |

If a target is missed, we decide together: fix it by Sunday 17:00, or tell the heads about the limit. We do not hide it.

## 4. For the heads: one page to send them

**What this is.** A pilot of a screening tool. It checks a new product idea against four filters (success and growth, net margin, price resilience, and technology and habit shift) using AI research. The result is a **Screening verdict (Filters 1 to 4)**. It is not a final decision and it does not replace your judgment.

**How to try it.**
1. Sign in with your work email. A 6-digit code arrives in Slack.
2. Choose your team, then start a new proposition.
3. Fill the 12 required boxes (the form shows which). Save a draft whenever you like; it saves itself too.
4. Press **Submit for verdict**. The research takes about three minutes. Please stay on the page.
5. Read the verdict, the score, the reasons and the sources. If you see "Research failed, retry", press **Screen again** once.

**Please.** Run one idea at a time, and try not to press Submit at exactly the same minute as colleagues. Use ideas you know well, so you can judge whether the answer is sensible.

**Tell us (five questions).** Was the verdict sensible? Were the sources relevant? Was any box confusing? How long did it take? Anything that surprised you?

**Known limits.** The AI can be slow or occasionally fail on the first try. The verdict is a screening aid. The accuracy has not yet been measured against past outcomes; your feedback is the first real data.

## 5. Go or no-go for Monday morning

**GO** only if all of these hold: the preflight says GO; the rehearsal targets are met or the heads have been told the limit; the last backup is under 26 hours old; Anthropic credit and the rate limit are checked; you ran one real idea on Sunday night; Cursor is on standby. Otherwise tell the heads the session moves, and say why.

## 6. What we are not doing before Monday, and why

- **Making the GitHub mirror private (B).** It involves a manual deploy and two settings clicks; a mistake could break the site on the day. Do it on Tuesday. The exposure continues for a few more days.
- **Expanding the connector, paging for the Log, the coverage and mutation work, Part 142 and the margin decision.** All valuable, none needed for Monday, and each is a change that could go wrong.
- **The labelled golden set.** It needs your experts. After Monday, the heads' feedback is the first real data.
- **Any change to the scoring.** Locked.

## 7. If something goes wrong on Monday

| Problem | First move |
|---|---|
| Many ideas show "Research failed, retry" | Ask the heads to wait two minutes and press Screen again; check Anthropic status and your rate limit; tell me and Cursor, with the time |
| The site is slow or unreachable | Run the preflight; check Render Events and Logs; wait a minute (a restart takes about one) |
| The site slows down when several heads are on the Log | Ask them to wait two minutes and not all refresh together; check Render Metrics (memory under 450 MB) |
| A head cannot sign in | Check they are in Slack; check their email and role in Settings |
| A head sees no ideas | Expected for a Business Manager who has created none: ask them to create one |
| A verdict looks wrong | Write down the idea and the reasons shown; do not change anything; send it to me |
| A serious fault after a deploy | In Render, open the web service, **Events** or **Deploys**, and roll back to the previous deploy (as far as I know this is a button on a past deploy). The data is not rolled back |
| Anything touching data | **Do not click "Restore database" in Render.** Stop, and call me first |

**Your contacts on Monday:** this chat for me, and Cursor for code changes (none during the session unless it is an emergency and you say so).
