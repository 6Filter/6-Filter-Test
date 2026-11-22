# 6 Filter Test — Stay on Render: upgrade the database in place (prompt for Cursor)

## What the owner decided

The Render database `6-Filter-Test-Live` (PostgreSQL) is on the **Free** plan, which expires after 30 days. The owner is upgrading it **in place** to the **$6 / month** instance (`0.1c-256mb`) in the Render dashboard. **The Azure migration is cancelled.** The web service stays as it is.

## Rules for you (Cursor)

- Never print a password, a connection string or a token, and never write one into the repo. The connection strings are in files in `C:\Users\1015803\AppData\Local\Temp\primus-render-migrate\` (outside the project).
- **You do not change anything in the Render dashboard or in Render's environment.** The owner does the upgrade and any environment change by hand. You prepare, verify and report.
- Do not delete or alter data. Every database step below is read-only, except the optional test restore, which goes only into a scratch database.
- Stop and report at each numbered step.

## Phase 1 — before the upgrade (do this now; the owner waits for your report)

1. **Cancel the Azure work.** Do not connect to any Azure database. Do not use `dest-database-url.txt` or `dest-test-database-url.txt`.
2. **Take a safety copy of the Render database.** Read the Render external connection string from `source-database-url.txt` (the owner's PC IP must be on the Render database's allow list). Make `pg_dump -Fc --no-owner --no-acl` into a file in the Temp folder, check it with `pg_restore --list`, and tell me its size. If `scripts/blobBackup.mjs` is in the repo (the owner is uploading it), also run `check` and `backup` so an encrypted copy is in Azure Blob; otherwise skip that and say so.
3. **Record a baseline, read-only**, in a text file in the Temp folder (not in the repo), and show me the numbers:
   - `SELECT pg_size_pretty(pg_database_size(current_database()));`
   - the biggest tables: `SELECT relname, pg_size_pretty(pg_total_relation_size(relid)) FROM pg_stat_user_tables ORDER BY pg_total_relation_size(relid) DESC LIMIT 6;`
   - the row count of every table: `SELECT table_name, (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name), false, true, '')))[1]::text AS n FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY 1;`
   - the live app's `/api/health` fields: `ok`, `db`, `dbProvider`, `propositions`, `sequencesOk`, `dbExpiresInDays` (if present), `scoringFingerprint`.
4. **Tell me the baseline and say "ready for the upgrade".** Then wait.

## The owner's steps (in the Render dashboard)

1. Database `6-Filter-Test-Live`, **Plan**, **Upgrade your instance**, choose the **$6 / month, `0.1c-256mb`** option, and check the **Storage** line (it may be billed separately) fits the database size.
2. After it finishes, the page must show a paid plan (no "Free", no "expire after 30 days" banner). Open the **Recovery** tab and note what backups it offers and for how long.
3. Remove `DB_EXPIRES_AT` from the web service's environment and let the service redeploy.
4. Tell Cursor "upgrade done".

## Phase 2 — after "upgrade done"

5. **Prove nothing changed.** Re-run the baseline queries against the same connection string, and compare with Phase 1: every table has the same row count (allow for ideas the team saved in between, and tell me which tables differ and by how much), and the database size is the same or larger. If the connection address changed, tell me and wait.
6. **Check the live app:** `/api/health` must show `ok: true`, `db: "postgres"`, `dbProvider: "render"`, the same idea count, `sequencesOk: true`, and **no `dbExpiresInDays`**. Then test through the app (or the API with a session you are given): open an idea, create and delete a draft, upload an evidence file. Report each result.
7. **Update the docs.** In `docs/DATABASE_MIGRATION.md` and any text that says the database is free or expires, state that the database is now on the paid $6 plan with no expiry, and remove the expiry dates. Leave the `DB_EXPIRES_AT` code alone (it simply does nothing when the variable is unset). Do not change anything in `lib/`, `api/` or `server.js` for this step.

## Phase 3 — the follow-ups (one at a time, in this order)

8. **Apply Part 152 (fewer database calls)** using `Primus-AI_Part152_FewerDatabaseCalls_Cursor_Prompt.md`, `testQueryCount.mjs`, `uiHarness.mjs` and `Part152_scratch_reference.diff` (the owner is uploading them). It makes the Log make 7 database calls instead of about 7 per idea, which matters most on the small 0.1 CPU instance. The attached test must pass untouched, the logic lock and the regression suite must stay green, and the Log must show exactly the same data.
9. **Nightly encrypted backup to Azure Blob.** With `blobBackup.mjs`, `testBlobBackup.mjs` and `verifyDatabaseCopy.mjs` (the owner is uploading them) and `Primus-AI_Blob_Backup_Runbook.md`: confirm `testBlobBackup.mjs` passes in this repo; prove a restore once into a **scratch** database (never into the live one) and compare with `verifyDatabaseCopy.mjs`; and tell me how to schedule `blobBackup.mjs backup` nightly with alerting on failure (a Render Cron Job, a GitHub Action, or a company machine), with the three secrets kept in that scheduler's secret store. Do not store any secret in the repo.
10. **Clean up.** Delete from the Temp folder the files that hold connection strings (`source-database-url.txt`, `dest-database-url.txt`, `dest-test-database-url.txt`) and the safety dump, once the owner confirms the upgrade is healthy and the first Blob backup restored correctly. Tell the owner to remove their PC's IP from the Render database's allow list.
11. Report the list of anything you could not do or had to guess.

## Not in scope

Any Azure database, a MongoDB or SQL Server rewrite, scoring, fields, layout, Parts 142, 144 and 145 (separate jobs), and any change to the Render dashboard.
