# Testing

## Postgres no-clobber suite

`npm run test:regression` runs `scripts/testPostgresNoClobber.mjs` at the end. That script uses `TEST_DATABASE_URL` only. It refuses any host that is not local or a private address (`localhost`, `127.0.0.1`, `::1`, `10.0.0.0/8`, `192.168.0.0/16`, `172.16.0.0/12`) and it refuses `render.com`, `neon.tech`, and `supabase.co`. It never reads `DATABASE_URL`.

When `TEST_DATABASE_URL` is unset, the script prints:

`POSTGRES SUITE SKIPPED — TEST_DATABASE_URL is not set. Postgres no-clobber tests did not run.`

and exits 0, so a local run without a database still finishes. A push must not be able to pass that way.

Enable the repo hook once:

```
git config core.hooksPath .githooks
```

`.githooks/pre-push` runs `npm run test:regression` with `REQUIRE_POSTGRES_TESTS=1`. In that mode the skip line is a failure and the push is refused.

Start the scratch database with one command. It binds to `127.0.0.1:5433` and ignores `DATABASE_URL`:

```
npm run scratch-postgres
```

Then, in the shell that runs the tests:

```
TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5433/postgres
```

On PowerShell:

```
$env:TEST_DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:5433/postgres"
npm run test:postgres
```

`npm run test:postgres` is the same script on its own.

## CI

GitHub Actions does not set `TEST_DATABASE_URL` today, and the workflow files are unchanged until a login with the `workflow` scope is available. When that login exists, add a Postgres service container to CI and set `TEST_DATABASE_URL` (and `REQUIRE_POSTGRES_TESTS=1`) on the regression job so the skip line cannot pass there either.
