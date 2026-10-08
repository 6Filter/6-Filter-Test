# Database migration

**Expires: 25 October 2026, 10:22 IST** (`2026-10-25T04:52:34Z`).

**Deleted: 8 November 2026, 10:22 IST** (`2026-11-08T04:52:34Z`), 14 days after expiry if it is still on the free plan.

`primus-ai-store` is a free Render Postgres database. Render's free plan expires 30 days after creation and is then deleted after a 14-day grace period. This database was created on 25 September 2026. The nightly GitHub backup cannot reach it while the IP allow list is empty, so that job is not a backup.

Set `DB_EXPIRES_AT` on the web service to the database expiry instant. `/api/health` then reports `dbExpiresInDays`. At 14, 7, 3, and 1 days left, health sends one Slack message: "Primus database expires in N days. Upgrade or migrate."

The owner chooses one route. Do not run the import against the live database. Do not commit `data/`. Do not paste a database URL, an export, or idea text into chat, a pull request, or a log.

## 1. In-place paid upgrade

No data movement. Render documents this as changing the database's compute plan, and an expired free database stays recoverable during the grace period only if it is upgraded to a paid plan.

1. Open `primus-ai-store` in the Render Dashboard.
2. On the database page, edit Compute (some accounts show this as the PostgreSQL Instance section) and choose a paid plan. Save.
3. The database is unavailable for a few minutes while the new instance starts. It cannot be moved back to the free plan afterwards.
4. Confirm the dashboard no longer shows an expiry date.
5. Clear `DB_EXPIRES_AT` on the web service, or set it only if the new host has its own expiry.
6. Open the IP allow list for a few minutes, run `node scripts/exportAllTables.mjs`, then remove the allow-list entry.
7. Repeat the restore drill below against that fresh export.

Source: [Render free instances](https://render.com/docs/free) and [changing a Postgres compute plan](https://render.com/docs/postgresql-creating-connecting).

## 2. Move to a database with no fixed expiry

Example: a Neon project on a plan that does not delete the database on a fixed date. Any other Postgres with no fixed expiry is the same route.

1. Create the new empty database. Leave `primus-ai-store` untouched.
2. Open the Render IP allow list for a few minutes and run `node scripts/exportAllTables.mjs`. Remove the allow-list entry when the export finishes. The script prints a warning when the folder contains password hashes and encrypted keys. Store that folder encrypted. Never commit it.
3. Point `DATABASE_URL` at the new empty database only in the shell that runs the import: `node scripts/importExport.mjs data/backups/<timestamp>`. The import stops if `propositions` already has rows.
4. Compare the printed counts with `manifest.json`.
5. Run `node scripts/replayScoring.mjs` against the live database and against the new database. The two score files must be byte-identical. Neither run may write.
6. Set the web service `DATABASE_URL` to the new database and deploy.
7. Keep `primus-ai-store` for 7 days. Do not delete or suspend it during that week.
8. Take a fresh export from the new database and repeat the restore drill against that export.

## Restore drill

Needs an empty Postgres that is not the live database. A local instance is enough.

1. `node scripts/exportAllTables.mjs` writes `data/backups/<timestamp>/`.
2. `DATABASE_URL=<empty database> node scripts/importExport.mjs data/backups/<timestamp>`.
3. Replay scores from the source and from the restored database. The JSON files match byte for byte.

`research_cache` is not in the export. It is rebuilt on the next research run. `--exclude-secrets` leaves out `department_passwords` and `department_api_keys`; those can be re-seeded from the department hash environment variables.
