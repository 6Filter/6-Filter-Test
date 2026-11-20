# Operations

The live database is Render Postgres `6-Filter-Test-Live`, upgraded in place on 20 Nov 2026 to the paid plan `0.1c-256mb` (1 GB disk). PostgreSQL 18. The web service no longer has `DB_EXPIRES_AT`. Health must show `ok: true`, `db: "postgres"`, `dbProvider: "render"`, `sequencesOk: true`, and no `dbExpiresInDays`.

The database is about 42 MB. One gigabyte of disk covers it.

## What a backup is

One `pg_dump` of this database is the whole app: ideas, users, audit, deleted ideas, evidence files. Two things are not in the dump and must be kept in a password manager and one other place: the encryption passphrase, and the Render external connection details.

Never put a connection string, a passphrase, or a Blob SAS URL in this repo, in a chat, or in the public deploy mirror.

## Encrypted copy on this PC

A copy taken after the paid upgrade is encrypted with AES-256-GCM and stored only on D::

- `D:\Primus-safety\render-paid-2026-11-20.dump.aes`
- `D:\Primus-safety\render-paid-2026-11-20.key`

The plaintext dump was removed after encryption. An earlier copy from 19 Nov, taken while the plan was still free, is in the same folder.

## Nightly encrypted export (not switched on)

`GET /api/admin/backup/export` builds one `.bk` file (AES-256-GCM) of every table except `research_cache`, including uploaded files. It needs `BACKUP_TOKEN`. The file can be opened only with `BACKUP_ENCRYPTION_KEY`. On 20 Nov 2026 `/api/health` still has `lastBackupAt: null`.

Two new values, each 64 hex characters and different from each other, are in `D:\Primus-safety\render-backup-secrets.txt`. Move both into the password manager, put them on the web service `ck-6-filter-test`, then delete that file. Keep `BACKUP_ENCRYPTION_KEY` with two named people, offline, and never next to the backup files.

Also set `OPS_ALERT_WEBHOOK_URL` to a Slack incoming webhook. Without it the “no backup in 36 hours” alert has nowhere to go.

The nightly uploader is `node scripts/exportToBlob.mjs backup` at 02:30 India time (`0 21 * * *` UTC), with `APP_URL`, `BACKUP_TOKEN` and `AZURE_BLOB_SAS_URL` in the scheduler’s secret store. That script and `testExportToBlob.mjs` are not in this repo, and no container SAS has been saved, so the job has not been created and no export has been run.

Restore, once a `.bk` file exists, into an empty database:

```bash
node scripts/exportToBlob.mjs fetch --out latest.bk
node scripts/decryptBackup.mjs latest.bk --out data/backups/restored
node scripts/importExport.mjs data/backups/restored
```

`decryptBackup.mjs` reads `BACKUP_ENCRYPTION_KEY` from the environment and does not print it. `importExport.mjs` refuses a database that already has ideas.

## Secrets the app needs

Names only. Values stay in Render and in the password manager.

| Name | Where the copy lives |
| --- | --- |
| `DATABASE_URL` | Render, database connection |
| `DEPARTMENT_KEY_ENCRYPTION_SECRET` | Render and the password manager. A restored copy cannot read department passwords without it. |
| `BACKUP_ENCRYPTION_KEY` | Render, and two named people offline. Not beside the backups. |
| `BACKUP_TOKEN` | Render and the nightly job only |
| `SESSION_SECRET`, `LOGIN_CODE_SECRET` | Render |
| Slack and AI keys | Render. Team research can also use a row in `department_api_keys`. |
| `AZURE_BLOB_SAS_URL` | The nightly job’s secret store. Create and Write for the upload. Read and List only for a fetch. Never Delete. |
| `OPS_ALERT_WEBHOOK_URL` | Render |

## MCP connector settings

Names only. The full how-to is in `docs/MCP_PILOT.md`.

| Name | Meaning |
| --- | --- |
| `MCP_ENABLED` | `true` turns the read-only Claude connector on. Anything else, or unset: off (`/mcp` answers 404). |
| `MCP_ALLOWED_EMAILS` | Who may sign in to the connector. Unset or empty: nobody. A single `*`: every signed-in company user. A comma-separated list: only those emails. Read on every request. |
| `MCP_ABSOLUTE_SESSION_DAYS` | Optional. Days before a connected person must sign in again. Default 7, at most 30. |

Changing `SESSION_SECRET` signs everyone out of the website and ends every connector token. Settings, MCP connector (Admin only) shows whether the connector is on, the allowlist, token counts, the last 50 audit rows, and a Revoke button per person.

## Nightly schedule and the alert

Run `backup` every night, and again before a migration or a release. Three places can run it:

1. A Render Cron Job on the paid account. The start command is `node scripts/blobBackup.mjs backup`. Put the three secrets in that job's environment.
2. A scheduled GitHub Action on the private `6Filter/6-Filter-Test` repo. Store the three secrets in the repo's Actions secrets. Do not echo them in the log. The runner's IP must be allowed on the Render database for the duration of the job.
3. A company machine that is on overnight. A Task Scheduler entry runs the same command. The secrets stay in the machine's secret store.

The job must tell a person when it exits non-zero. On Render, use the cron job's failure notification. On GitHub, the workflow sends the Actions failure mail, or posts to the existing ops Slack webhook without including a secret. On the company machine, Task Scheduler sends mail on a non-zero exit. A backup that fails quietly is worse than none.

Health already warns when `lastBackupAt` is older than 36 hours, once `blobBackup` or the app export records a backup. Today `lastBackupAt` is null, because no backup has been recorded in the database.

## Restore rule

Restore only into an empty database, before the app connects to it. Use `pg_restore --no-owner --no-acl`, or `blobBackup.mjs restore` once that script is here. Then run `verifyDatabaseCopy.mjs`. Do not use `scripts/importExport.mjs` for this copy: it trims timestamps and leaves the counters behind.
