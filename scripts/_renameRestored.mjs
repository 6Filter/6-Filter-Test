import pg from "pg";
const c = new pg.Client({ connectionString: "postgresql://postgres:postgres@127.0.0.1:5433/postgres" });
await c.connect();
const names = (await c.query("SELECT nspname FROM pg_namespace WHERE nspname IN ('primus_restored','primus_rehearsal_20261121')")).rows.map((r) => r.nspname);
if (!names.includes("primus_restored")) {
  console.error("primus_restored is not present");
  process.exit(1);
}
if (names.includes("primus_rehearsal_20261121")) {
  console.error("primus_rehearsal_20261121 already exists");
  process.exit(1);
}
const n = await c.query("SELECT count(*)::int AS n FROM primus_restored.propositions");
console.log("before", n.rows[0].n);
await c.query("ALTER SCHEMA primus_restored RENAME TO primus_rehearsal_20261121");
const after = await c.query("SELECT nspname FROM pg_namespace WHERE nspname IN ('primus_restored','primus_rehearsal_20261121') ORDER BY 1");
const count = await c.query("SELECT count(*)::int AS n FROM primus_rehearsal_20261121.propositions");
console.log("schemas", after.rows.map((r) => r.nspname).join(","));
console.log("primus_rehearsal_20261121.propositions", count.rows[0].n);
await c.end();
