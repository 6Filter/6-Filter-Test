# Restore a Primus database backup

The daily GitHub Action `db-backup.yml` writes a custom-format dump of the whole database and leaves out `research_cache` (the app rebuilds that table). Artifacts are kept for 90 days.

`SESSION_SECRET` stays in the company password manager. A dump cannot recreate it. Team API keys are not part of this restore.

## Restore into a scratch database

1. Download `primus-backup-<run>.dump` from the Actions artifact.
2. Create an empty database that is not the live one.
3. Restore:

```bash
pg_restore --no-owner --dbname "$SCRATCH_DATABASE_URL" primus-backup-YYYY-MM-DD.dump
```

4. Point a throwaway process at `SCRATCH_DATABASE_URL` and compare `countPropositions()` with the count taken from the live database before the dump. They should match.
5. Drop the scratch database when the counts match.

The app creates `research_cache` on the next boot if the dump did not include it.

## If the backup failed

The workflow posts to the same Slack webhook as manager review (`SLACK_WEBHOOK_URL`) when the job fails. A missing `DATABASE_URL` GitHub secret is the usual cause. Add that secret in the repo settings. Do not commit the connection string.
