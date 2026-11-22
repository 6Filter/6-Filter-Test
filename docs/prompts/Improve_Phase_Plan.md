# 6 Filter Test — the improve phase (starts now, deploys only through gates)

**Start now means:** measurement tools, tests, labelled data and fixes are built and measured **on branches and in the scratch environment** starting tonight. **Nothing improves production before Monday's session** (freeze Sunday 20:00). After Monday, each improvement deploys only when it passes the gate in section 5.

## 1. Where we are and where we are going

| | Now (21 Nov) | Target by end of the improve phase (about 4 weeks) |
|---|---|---|
| Overall score | about 64 (about 61 on what I have verified) | about 80 to 85 |
| AI output quality | **45** | **70 to 78** |
| Unfinished research (older ideas) | 22% of evaluated ideas (70 of 320), causes not recorded | **5% or less of new screenings** |
| Invented or dead sources | never measured | **0** |
| Accuracy against labelled ideas | never measured | measured, and at or above the thresholds in section 2 |
| Same idea, same verdict band across repeat runs | never measured | at least 80% |

**Honest limit:** Cursor alone can lift the AI score only to about 58 (reliability, evidence checks, tests). **Getting to 70 or more needs your experts' labels and the heads' feedback**, because accuracy cannot be improved until it is measured against known answers.

## 2. The measurable targets (the AI quality scoreboard)

| Measure | Target |
|---|---|
| Screenings that finish all four filters without a manual retry | 95% or more |
| Invented or dead sources (every cited address opens and contains the quote) | 0 |
| GST rate correct for the category | 95% or more (it should come from the GST table, not the AI) |
| Benchmark chosen is a real, relevant product in the category | 85% or more |
| Tech-shift ratings within one level of the experts' | 90% or more |
| Price events dated and sourced | 90% or more |
| Same verdict band in at least 2 of 3 repeat runs | 80% or more |
| Median time from Submit to verdict | 3 minutes or less |
| Cost per idea | known and stable (today about $1.31) |
| Verdict band agrees with the experts' expected verdict | measured first; target set after the baseline |

## 3. Principles

1. **Measure first, change second, measure again.** Every improvement is judged on the same labelled set before and after.
2. **One change at a time,** so we know what helped.
3. **No regression:** a change that improves one measure and worsens another does not ship without a written decision.
4. **The scoring stays locked** (v5.7, fingerprint `ba0156d2`) unless you approve a change in writing. Prompts and research logic are not locked, which is exactly why they need measuring.
5. **Never tidy a bad number away.** Report it.
6. **Small, reviewable changes.** Each is a branch with tests, a before-and-after table, and the logic-lock result.

## 4. The seven work streams

| # | Stream | What it does | Who | Starts |
|---|---|---|---|---|
| S1 | **Evaluation harness** | Runs a labelled set through the real pipeline (capped key, scratch only) and scores every field against the labels; checks every source; repeats 3 times for stability; reports cost and time; saves a report that can be compared run to run | Cursor | Tonight, as a branch |
| S2 | **Reliability** | The retry, timeout and concurrency fix (M3) deployed and measured; the unfinished-research cause table from the diagnostics endpoint | Cursor, deploy by you | M3 built; deploy Sunday or Tuesday |
| S3 | **Evidence quality** | List every place where an AI claim is accepted without checking; add checks (source returned by the search, quote present, date plausible); Part 142 ("a fooled AI earns nothing") once you approve | Cursor; your approval | Tonight (audit); Part 142 after approval |
| S4 | **Input detection** | How well the AI picks out the attribute, benchmark and gap from a messy description; the placeholder guard; the acceptance rate of its suggestions | Cursor | With the M4 rehearsal |
| S5 | **Research and prompt tuning** | Only when S1 shows which error class is biggest: benchmark choice, tech-shift ratings, price events, route match | Cursor, guided by the numbers | After the first labelled baseline |
| S6 | **Calibration against real outcomes** | Compare the verdicts with what actually happened (launched, killed, running) and with the heads' view; propose threshold changes **as proposals only** | Cursor and you with the NPD heads | After Monday |
| S7 | **Feedback loop** | Monday's feedback into an issue list, triaged by severity, each linked to a stream | You and me | Monday |

## 5. The gate every improvement must pass before it deploys

1. A branch with tests, and a **before-and-after table on the labelled set** (or, before the set exists, on the 12-idea rehearsal).
2. No measure worse than before, or a written decision from you.
3. The logic lock and the scoring fingerprint unchanged (`ba0156d2`, 28 files).
4. All supplied tests pass untouched.
5. Your message naming the branch, in the deploy window (one deploy a day, never during a test).
6. The preflight says GO afterwards, and one real idea is run on the live site.

## 6. Timeline (from Saturday 21 November)

| When | What |
|---|---|
| **Sat night to Sun** | S1 harness on a branch; the golden-set sheet pre-filled with idea inputs (never with the AI's own answers); the audit of unchecked AI claims (S3); the 12-idea rehearsal, which is also the first measurement (S2, S4) |
| **Mon** | The heads' session; feedback logged (S7); nothing changes |
| **Tue to Wed** | Deploy M3, M6 and the titles fix through the gate; the mirror private; your experts start labelling (**at least 10 ideas**) |
| **Week 2** | First real accuracy baseline from the labels; fix the **three biggest error classes** (S5); re-measure |
| **Week 3** | Calibration (S6); Part 142 once approved; stability work; re-measure |
| **Week 4** | Final measurement against section 2; the scorecard rescored; a go or no-go on wider use |

## 7. What I need from you for this phase

1. **Labels:** at least 10 ideas labelled in the first week, 30 by the end of week 2, in `golden_set_labels_template.csv` (Cursor pre-fills the idea inputs so your experts add only the answers and what actually happened).
2. **Outcomes:** for 30 to 50 past ideas, what really happened.
3. **Decisions:** the margin rule, Part 142, the acceptance thresholds above.
4. **Heads' feedback** from Monday.
5. A **spend cap** you are comfortable with for evaluation runs (about $1.31 per full screen: a 30-idea set run three times is about $120).
