/** Take the lite lock baseline from the CURRENT tree. Run this once, on the commit you start from. */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { collectAll } from "./collectLite.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const snap = collectAll();
writeFileSync(path.join(here, "baselineLite.json"), JSON.stringify(snap, null, 1) + "\n");
console.log(`baselineLite.json written: ${Object.keys(snap.fingerprints).length} logic files, ${snap.words.length} visible words`);
