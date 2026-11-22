# 6 Filter Test — Cursor Build Prompt, Part 155: The Log in pages, with exact summaries

Build this only after Part 154 has passed `testHttpPerformance.mjs` (send me the result). Do not mix it with other parts.

## Why (measured)

The Log loads **every idea into the browser at once** (`fetchPropositionList(LIST_PROPOSITIONS_CAP)`, cap 2,000, `src/App.jsx` about line 693). An evaluated idea is about 17 KB of JSON, so that is about 6 MB at 508 ideas, 12 MB at 1,000 and 23 MB at the cap, and past 2,000 ideas the Log would silently drop ideas. The tiles, the charts and the Team, Month, Person and Date views (Part 148) are all computed in the browser from those rows, so they are only exact while every row is loaded.

## Your design is right; these are the parts that make it safe

Your plan (one page of 50, at most 100, plus a cursor; a separate summary query with `COUNT`; filters applied before the page is cut; the full list kept only for export) is the right shape. Build it with the following requirements, each of which is a way this goes wrong if left out.

## Decisions (build the DEFAULT)

- **D152 Paged list.** `GET /api/propositions?limit=50&cursor=…&team=&month=&person=&category=&status=&q=` returns `{ propositions (at most 100), nextCursor | null, tableCount }`. Use **keyset paging** on `(updated_at DESC, id DESC)`, never `OFFSET`.
- **D153 Visibility first, always.** Today the access rule runs in JavaScript **after** the rows are read: `filterAccessibleIdeas(req.user, await listPropositions(limit))` (`lib/propositionsApi.js` about line 905). With paging that is wrong: a page would hold fewer rows than asked, and the totals could reveal how many ideas the person is **not** allowed to see. Apply the access scope **before** the page is cut and before any count (in the SQL, or by filling the page in a loop), and make every count, group and total include only ideas the person may see.
- **D154 Exact summary.** `GET /api/log/summary?from=&to=&team=&category=&q=` returns the tile counts (submitted, drafts, GO, WATCH, NO-GO, INCOMPLETE, AI used, waiting for the business head's approval) and the Team, Month, Person and Date groups (zero-filled; India time; month in progress marked), plus what the insights rules need (the last submission date per team, the verdict counts per month). Computed in SQL with `COUNT`, with the **same definitions** as `lib/logStatus.js` and `lib/logInsights.js`: submitted means "not not-evaluated"; India-time days and months; the verdict as stored.
- **D155 One definition, not two.** The browser helpers and the SQL must never disagree. Store the values both read (the evaluation state, the verdict, the first-submitted date, and whether the AI was used) as **indexed columns written when the idea is saved**, with a backfill, so the list, the summary, the exports and the tests read the same stored facts.
- **D156 Every filter is server-side.** Team, month, person, category, each status chip, the search text (name, id, submitter), and "waiting for the business head's approval" go into the query. The Log must never filter inside the loaded page only (a "GO" chip over the first 50 rows would be wrong).
- **D157 The screen.** "Showing 50 of N", infinite scroll or Load more; the tiles and charts come only from the summary; choosing a table row or a bar sets a filter and refetches; the Part 148 views, the CSV and the insights keep working. **Exports** (Output PDF, Inputs, CSV) respect the current filters and access and **stream** rows, not load the whole table into memory.
- **D158 No other 2,000-row fetch.** Audit every caller of `fetchPropositionList` and every use of `?limit=`: each one needs a single idea (use `GET /:id`), a page, or an export. List what you changed.
- **D159 Budgets.** The first Log page: at most 150 KB, at most 10 database calls, and the number of calls and the bytes do not grow with the number of ideas. With the database 250 ms away, the first page shows within 2 seconds at 2,000 ideas.
- **D160 Compatibility.** Keep `?limit=` working for one release for older browsers, then remove it.

## Tests (you write them; send them to me and I will run my own)

- **T1 Paging is exact.** With 2,500 ideas, following the cursors returns every visible idea exactly once, in order, with no duplicate and no gap; no page exceeds 100.
- **T2 The summary equals the browser's own arithmetic.** For random filters, periods, teams and persons, the summary's totals and groups equal `summarize()` from `lib/logInsights.js` computed on the full list, including drafts, zero-filled months and the India-time boundaries (00:30 IST on the 1st is in the new month; the financial year turns on 1 April).
- **T3 Visibility.** A member with a team scope sees only that scope in pages, totals, groups and insights. Adding ideas the member may not see changes **no** number, no page and no cursor.
- **T4 Filters.** Each chip, filter and search returns exactly the matching set across all pages (compared with an oracle over the full data).
- **T5 Writes between pages.** An idea updated between page 1 and page 2 causes no error; state in the test exactly what happens (it may appear again or be skipped) and that nothing else breaks.
- **T6 Performance.** The call count is constant as ideas grow (use the delaying-proxy approach of `testQueryCount.mjs`); the first-page size and the time at 250 ms are within D159.
- **T7 Export.** The filtered export equals the oracle and does not hold all rows in memory.
- **T8 Screen.** The tiles equal the summary; "Showing X of N" is right; Load more adds exactly the next page; no flicker; the Part 148 tabs, charts and insights still match their tests.

## Not in scope

Any scoring change, new filters, and a different database.

## Acceptance checklist

- [ ] The Log loads one page, not every idea; the browser never holds more than the pages shown.
- [ ] Every tile, chart, table and insight is exact and independent of how many rows were sent.
- [ ] A person's counts never include ideas they may not see.
- [ ] Every filter, chip and search works across all pages.
- [ ] Budgets D159 met at 2,000 ideas with the database 250 ms away.
- [ ] T1 to T8 pass; the logic lock and the regression suite stay green.
