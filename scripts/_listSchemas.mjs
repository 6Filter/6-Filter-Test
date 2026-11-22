import pg from "pg";
const c = new pg.Client({ connectionString: "postgresql://postgres:postgres@127.0.0.1:5433/postgres" });
await c.connect();
const schemas = await c.query("SELECT nspname FROM pg_namespace WHERE nspname LIKE 'primus%' ORDER BY 1");
console.log("SCHEMAS");
for (const row of schemas.rows) console.log(row.nspname);
for (const name of ["primus_restored", "primus_rehearsal_20261121"]) {
  const exists = schemas.rows.some((r) => r.nspname === name);
  if (!exists) continue;
  const n = await c.query(`SELECT count(*)::int AS n FROM ${name}.propositions`);
  console.log(`${name}.propositions`, n.rows[0].n);
}
await c.end();
