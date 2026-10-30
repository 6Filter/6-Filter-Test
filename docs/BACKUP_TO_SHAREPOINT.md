# Daily encrypted backup → SharePoint (Power Automate)

Off-platform copy so ideas survive a database wipe. The app endpoint streams every table except `research_cache` as gzip JSON Lines, encrypted with AES-256-GCM.

## Environment (Render)

| Variable | Purpose |
| --- | --- |
| `BACKUP_TOKEN` | Long random secret. Sent as `X-Backup-Token`. Compared constant-time. Never log it. |
| `BACKUP_ENCRYPTION_KEY` | 32-byte key as 64 hex chars (or base64). Encrypts the export. |
| `OPS_ALERT_WEBHOOK_URL` (optional) | Slack webhook for backup-lag / Slack-down alerts. Falls back to `SLACK_WEBHOOK_URL`. |

Generate:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Use one value for `BACKUP_TOKEN` and another for `BACKUP_ENCRYPTION_KEY`.

## Encryption key custody (offline)

Keep `BACKUP_ENCRYPTION_KEY` with **two named people** (primary + deputy), offline (password manager printout or sealed envelope — not only in Render).

Do **not** store the key in SharePoint next to the backups. The SharePoint library holds ciphertext only.

## Power Automate — daily 02:30 IST

1. Create a **Scheduled cloud flow**.
2. Recurrence: every day at **02:30**, time zone **India Standard Time**.
3. Action **HTTP**:
   - Method: `GET`
   - URI: `https://<your-host>/api/admin/backup/export`
   - Headers: `X-Backup-Token` = the `BACKUP_TOKEN` value (use a secure input / Azure Key Vault reference if available).
4. Action **Create file** (SharePoint):
   - Site / Library: shared library with **version history** on.
   - Folder: e.g. `PrimusBackups/`
   - File name: `primus-backup-@{utcNow()}.bk`
   - File content: body of the HTTP response (binary).
5. Library settings:
   - Versioning: major versions on.
   - Retention / information management: keep at least **90 days** (or org policy).
6. **Configure run after** on a parallel branch: if HTTP fails, **Post message** (Teams/Slack/email) to the on-call person with the flow run link. Do not include the token in the alert.

Optional: reject HTTP status ≠ 200 before writing the file.

## Restore into an empty database

```bash
# Decrypt to a gitignored folder
node scripts/decryptBackup.mjs path/to/primus-backup.bk --out data/backups/restored-stamp

# Import (refuses if propositions already has rows)
DATABASE_URL=postgres://... node scripts/importExport.mjs data/backups/restored-stamp
```

Tables included: all app tables except `research_cache`, including `manager_review_events`, `login_codes`, `login_attempts`, `backup_exports`.

## Monthly restore drill (checklist)

- [ ] Pick last week’s `.bk` from SharePoint (do not delete production).
- [ ] On a **scratch** Postgres only: decrypt → import into an empty schema/database.
- [ ] Confirm row counts match the manifest.
- [ ] Spot-check: open 2–3 ideas; confirm manager review history and login tables restored.
- [ ] Optional: run a scoring replay on restored ideas; totals should match the pre-export snapshot.
- [ ] Record date, who ran it, and file name in the ops log.
- [ ] Confirm `/api/health` shows a recent `lastBackupAt` in production (export within 36 hours).

## Health

`GET /api/health` includes `lastBackupAt`. If no export for **36 hours**, the app sends **one** Slack ops alert per day.
