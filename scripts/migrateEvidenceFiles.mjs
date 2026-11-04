/**
 * Part 131 — move f1.evidenceSourceFile.data into evidence_files, then strip bytes.
 * Idempotent. Run once against the target database:
 *   DATABASE_URL=... node scripts/migrateEvidenceFiles.mjs
 */
import { migrateInlineEvidenceFiles } from "../lib/evidenceFiles.js";

const result = await migrateInlineEvidenceFiles({ archive: true });
console.log("evidence migration", result);
process.exit(result.after > 0 ? 1 : 0);
