# 6 Filter Test — Encrypted database copies in Azure Blob Storage (runbook)

## What a Blob SAS can and cannot do

A **Blob SAS token or URL gives access to files in Azure Blob Storage. It is not a database.** The app needs PostgreSQL, so it cannot run on Blob storage, and the SAS cannot "migrate the database" by itself. What it is excellent for: keeping an **encrypted copy of the whole database in Azure, outside Render**, and rebuilding a database from that copy. `scripts/blobBackup.mjs` does that (tested: 13 checks, five deliberate breaks each caught).

Everything the app stores is in the one PostgreSQL database (ideas, users, audit, deleted ideas, department keys, evidence files, backups), so one dump is the entire data. Two things are **not** in the dump and must be kept separately, in the password manager and one other safe place: the app's secrets (`DEPARTMENT_KEY_ENCRYPTION_SECRET`, `BACKUP_ENCRYPTION_KEY`, `SESSION_SECRET`, `LOGIN_CODE_SECRET`, and the rest of the Render environment) and the backup passphrase below. Without `DEPARTMENT_KEY_ENCRYPTION_SECRET` a restored copy cannot decrypt the department passwords; without the passphrase the backups cannot be opened.

## 0. Protect the SAS token first

- **Never paste the SAS URL or token** into a chat, a Cursor prompt, a ticket, a commit, or anything mirrored publicly (you mentioned a public mirror: check it). Put it only in environment variables or the scheduler's secret store.
- If it has already been shared anywhere, **create a new one and delete the old** (in the Azure portal: regenerate or revoke it; if it was made from a stored access policy, delete the policy).

## 1. Create the right SAS (the one you have may be for a single blob)

A "Blob SAS URL" for one blob would be overwritten by every backup. You need a **container** SAS:

1. Azure portal, your storage account, **Containers**, create a **private** container, for example `primus-backups`.
2. Open the container, **Shared access tokens**. For the **backup** token choose permissions **Create and Write** only; expiry as short as you can live with (for example 90 days); HTTPS only; sign with the account key or, better, a **stored access policy** so you can revoke it. For **restores**, make a separate token with **Read and List**. **Never grant Delete.**
3. Copy the **Blob SAS URL** of the container (it looks like `https://<account>.blob.core.windows.net/primus-backups?sv=...&sig=...`).
4. On the storage account turn on **soft delete** for blobs, and add a **lifecycle rule** that deletes backups older than, say, 35 days (the tool does not delete anything). For stronger protection enable immutable storage (WORM) on the container.

## 2. Make a backup

```bash
export AZURE_BLOB_SAS_URL='https://<account>.blob.core.windows.net/primus-backups?sv=...&sig=...'
export BLOB_BACKUP_PASSPHRASE='<at least 16 characters; keep it in the password manager and one other place>'
export DATABASE_URL='<the Render database: Connect > External>'      # allow your IP on the Render database for a few minutes

node scripts/blobBackup.mjs check      # what the SAS allows and when it expires; writes nothing
node scripts/blobBackup.mjs backup     # pg_dump, encrypt (AES-256-GCM), upload, verify
```

It prints `BACKUP STORED AND VERIFIED: primus-YYYYMMDD-HHMMSSZ.dump.enc (n bytes, t tables, r rows)`. Two files are stored: the encrypted dump and a small `.json` of row counts written last; a backup counts as **complete only when the `.json` exists**, and "restore latest" ignores unfinished uploads. Azure itself checks the checksum we send, and the tool compares the checksum Azure returns; a mismatch ends in `NOT VERIFIED` (exit 1), never a success.

## 3. Prove it restores (do this once now, then every month)

```bash
export AZURE_BLOB_SAS_URL='<a Read + List container SAS>'
node scripts/blobBackup.mjs restore --target "postgres://<user>@<scratch host>/<EMPTY database>" --yes-restore
node scripts/verifyDatabaseCopy.mjs --source "$DATABASE_URL" --target "<that scratch database>" --schema public
```

The restore refuses a database that already has tables, refuses a wrong passphrase or a damaged file (nothing is restored), and compares the restored row counts with the counts recorded at backup time. A copy you have never restored is not a backup.

## 4. Schedule it

Run `backup` **nightly**, and before any risky change (a migration, a release). Options: a Render Cron Job (paid), a scheduled GitHub Action, or a company machine; the job needs the three secrets from its own secret store, network access to the Render database (its allow list) and to Azure Blob, and **must alert a person when it exits non-zero**. A backup that silently stops is worse than none.

## 5. How this fits with the other plans

- **Render stays the live database (simplest, safest).** The Blob copies are your off-Render protection. Recovery loses what was saved since the last backup, so nightly plus a manual one before big changes. Keep the Render database on a **paid** plan (a free one expires and is deleted).
- **If you later want the live database on Azure,** that needs an **Azure Database for PostgreSQL** server (a different Azure resource from Blob). Blob can be the transport: stop writes, `backup`, then `restore --target <the empty Azure PostgreSQL database>`, verify with `verifyDatabaseCopy.mjs`, and only then point `DATABASE_URL` at it (never let the app connect to it before the restore). Then Render becomes the standby, refreshed from Azure with `refreshStandby.mjs` (see `Primus-AI_Migrate_Database_To_Azure_Prompt.md`), and Blob stays the third copy.
- Either way you hold: the live database, a second whole database (standby), and an encrypted, versioned copy in Blob. Together that is as close to zero loss as practical; it is not zero (the loss window is the time since the last copy).
