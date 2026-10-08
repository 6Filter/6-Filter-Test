import path from "node:path";

/** Writable JSON store. Tests set PRIMUS_DATA_DIR so they never touch data/. */
export function dataDir() {
  const override = String(process.env.PRIMUS_DATA_DIR || "").trim();
  if (override) return path.resolve(override);
  return path.join(process.cwd(), "data");
}
