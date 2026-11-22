# 6 Filter Test — Turn on the nightly encrypted backup (and prove it restores)

**Where things stand (live, 20 Nov 2026):** `/api/health` shows `lastBackupAt: null`. No off-platform backup has ever run. The app already contains everything needed to make one; it only has to be switched on. This runbook does that with the least new machinery, and every restore step below was proven on a real database (section 5).

## 0. What the backup is, and is not

- **What:** `GET /api/admin/backup/export` returns one encrypted file (`.bk`, AES-256-GCM) holding every table except the research cache: ideas, users, audit, manager reviews, thresholds, **and the uploaded files**. Protected by a token, limited to 2 calls an hour.
- **Not in it:** the app's secrets and environment variables (`DEPARTMENT_KEY_ENCRYPTION_SECRET`, `SESSION_SECRET`, the AI keys, the Slack tokens). Keep those in the password manager (names listed in `docs/OPERATIONS.md`). Without `DEPARTMENT_KEY_ENCRYPTION_SECRET` a restored copy cannot read the department passwords.
- **The key:** `BACKUP_ENCRYPTION_KEY` is the only way to read a backup. Keep it with **two named people**, offline, and never next to the backups.

## 1. Create the two secrets (two minutes, on any computer with Node)

Run this twice and save each result in the password manager:

```
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

- First result = `BACKUP_TOKEN`.  Second result = `BACKUP_ENCRYPTION_KEY`.
- Never paste either into a chat, a ticket, an email or the repository.

## 2. Put them in Render (you, in the dashboard)

Web service `ck-6-filter-test`, **Environment**, add:
- `BACKUP_TOKEN` and `BACKUP_ENCRYPTION_KEY` (the two values above);
- `OPS_ALERT_WEBHOOK_URL` (a Slack incoming-webhook address): without it the app's own alert ("no backup in 36 hours") has nowhere to go. It has been silent so far because it was never set.
Save; the service redeploys.

## 3. Choose how the nightly call is made

**Option A: the supplied uploader (recommended).** `scripts/exportToBlob.mjs` calls the export and stores the file in your Azure Blob container, checking it at both ends. It needs no database access, no `pg_dump`, no local Postgres, and it never holds the encryption key. Tested by `testExportToBlob.mjs` (13 checks, 6 deliberate breaks each caught).

1. Azure portal, your storage account, **Containers**: a **private** container `primus-backups`. On the account turn on **soft delete** for blobs.
2. Container, **Shared access tokens**: permissions **Create + Write** only (never Delete), HTTPS only, expiry about 90 days (put a reminder to renew it 2 weeks earlier). Copy the Blob SAS URL.
3. Run nightly at 02:30 India time (that is `0 21 * * *` in UTC) with these three variables from a secret store: `APP_URL` (`https://ck-6-filter-test-88wu.onrender.com`), `BACKUP_TOKEN`, `AZURE_BLOB_SAS_URL`:

```
node scripts/exportToBlob.mjs backup
```

   Where to run it: a **Render Cron Job** (same repo, command above, the three variables in its Environment; it needs no database address); or any always-on company machine with Node (Windows Task Scheduler); or a GitHub Action in the private repository. **Alert a person whenever it exits non-zero** (Render emails on a failed cron job; configure the same for the other choices). Exit 0 prints `BACKUP STORED AND VERIFIED: primus-backup-YYYYMMDD-HHMMSS-xxxxZ.bk (bytes, tables, rows)`.
4. Check before relying on it: `node scripts/exportToBlob.mjs check` (what the SAS allows, when it expires).

**Option C: save into a folder you own, with no cloud account** (the choice for a solo owner on Render). `scripts/pullBackupToFolder.mjs` fetches the same encrypted backup and saves it into a folder that syncs (OneDrive or SharePoint) or an external drive, verified, tidied to the newest 60, with a Slack alert on failure and a `status` check for staleness. Windows Task Scheduler runs it daily. Needs no database, no SAS, no `pg_dump`, never the key. Tested by `testPullBackupToFolder.mjs` (11 checks, six deliberate breaks each caught). Step-by-step with the exact commands: `Primus-AI_Solo_Owner_Guide.md`, section 2.

**Option B: the Power Automate flow already documented** in `docs/BACKUP_TO_SHAREPOINT.md` (daily 02:30, HTTP GET with the `X-Backup-Token` header, saved to SharePoint). Caution: the **HTTP action is a premium connector** in Power Automate, so it needs a licence that includes it. If you do not have one, use Option A.

You can run both: two independent copies, in two places.

## 4. Prove it works (do this the same day)

1. Run the backup once by hand. Then open `https://ck-6-filter-test-88wu.onrender.com/api/health`: `lastBackupAt` must show a time within the last minute.
2. Do the restore drill in section 5 once, into a scratch database, with a copy of that first file.
3. Put the drill on a calendar: **repeat monthly**. A backup that has never been restored is a hope, not a backup.

## 5. Restore (proven on a real database)

Needed: the `.bk` file, `BACKUP_ENCRYPTION_KEY` in the environment, and an **empty** PostgreSQL database.

```
# 1. fetch the latest COMPLETE backup from Blob (needs a SAS with Read + List; skip if you already have the file)
node scripts/exportToBlob.mjs fetch --out latest.bk

# 2. decrypt into a folder (the key is read from the environment and never printed)
node scripts/decryptBackup.mjs latest.bk --out data/backups/restored

# 3. load into an EMPTY database (it refuses a database that already has ideas)
DATABASE_URL=postgres://...empty-database... node scripts/importExport.mjs data/backups/restored

# 4. compare the copy with the source
node scripts/verifyDatabaseCopy.mjs --source "<the source>" --target "<the restored copy>" --timestamps ms --ignore-table backup_exports
```

**What the drill showed** (a real database with 60 ideas, a user, a manager review, 11 thresholds and three uploaded files: a 300,693-byte PDF, a 15,640-byte Excel file and a CSV with Hindi text): the whole chain app to uploader to storage to fetch to decrypt to load ran clean; **every table matched; the three files came back byte for byte** (identical SHA-256); counters healthy. Two expected differences, both harmless:
- **Timestamps lose their last three digits** (`.435971` becomes `.435`) because the export carries millisecond timestamps. Use `--timestamps ms`; the app itself works to the millisecond.
- **`backup_exports`** is one row short: the app logs each export after building it, so a backup never contains its own log row. Use `--ignore-table backup_exports`.

After a real restore, start the app against the restored database once; it repairs its counters at start-up. Then check `/api/health` (`sequencesOk: true`, the idea count).

## 6. Limits to know

- **Memory:** the app builds the whole export in memory (it reads every table, then compresses and encrypts). At about 500 ideas that is small; with many large uploaded files it grows. The web service has 512 MB. Run the first real export in a quiet hour and watch the Render **Metrics** memory graph; if it climbs high, ask Cursor to stream the export.
- **Two exports an hour** is the app's own limit; one a night is fine.
- **Loss window:** you can lose what was saved since the last backup (up to a day). Run an extra backup before any risky change.
- **The research cache is excluded** (it is rebuilt by research).
- **The SAS expires.** The uploader warns 14 days ahead; put the renewal on a calendar.
- **If the token or key leaks:** change them in Render, make a new backup, and re-encrypt nothing (old backups stay readable only with the old key, so keep the old key until the old backups are gone).
