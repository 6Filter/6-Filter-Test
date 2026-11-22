/**
 * THE SKILL MUST NOT DRIFT FROM THE PLATFORM. Compares the six-filter-test skill's alignment record (and its wording) with what the platform's code says today. Written by the reviewer. Needs only Node; reads files, touches no database, no network.
 *   node scripts/testSkillAlignment.mjs [path/to/SKILL.md] [--max-age-days 45]      (default skill: docs/prompts/six-filter-test_SKILL_v2_DRAFT.md)
 * Put in scripts/. Add it to the pre-push hook so a change to the scoring or the research code cannot ship with a stale skill. Exits 1 if anything is out of line.
 *  A0 the skill carries a readable alignment record   A1 the scoring ruleset equals lockedConstants   A2 the scoring fingerprint equals scripts/scoringFingerprint.json   A3 the scored filters and their slot counts equal SCORE_CHECK_SLOTS
 *  A4 the search budget per research step equals RESEARCH_STEP_SEARCH_BUDGET   A5 the Filter 1 prompt version equals F1_PROMPT_VERSION   A6 the engines equal the engines registered in lib/categoryIntelligence/engines.js
 *  A7 the wording: it names the Screening verdict (Filters 1 to 4), it does not claim Filters 1 to 5 are scored, and it never uses the retired titles BM or BH FORUM   A8 the review is not older than the limit (default 45 days)
 */
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url";
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), ".."); const args = process.argv.slice(2); const flag = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const skillPath = path.resolve(args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--max-age-days") || path.join(root, "docs", "prompts", "six-filter-test_SKILL_v2_DRAFT.md")); const MAX_AGE = Number(flag("max-age-days", "45"));
let failed = 0; const check = (id, n, ok, d = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${id}  ${n}${d ? "  [" + d + "]" : ""}`); if (!ok) failed++; };
const text = fs.readFileSync(skillPath, "utf8"); const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
let rec = null; for (const m of text.matchAll(/```json\s*([\s\S]*?)```/g)) { try { const j = JSON.parse(m[1]); if (j && j.aligned_with) { rec = j; break; } } catch { /* not this block */ } }
check("A0", `the skill carries a readable alignment record (${path.basename(skillPath)})`, !!rec, rec ? "found" : "no JSON block with aligned_with: the skill predates the alignment record");
const A = rec?.aligned_with || {};
const lc = await import(new URL("../lib/lockedConstants.js", import.meta.url).href); const sb = await import(new URL("../lib/searchBudget.js", import.meta.url).href); const fp = JSON.parse(fs.readFileSync(path.join(root, "scripts", "scoringFingerprint.json"), "utf8"));
const engSrc = fs.readFileSync(path.join(root, "lib", "categoryIntelligence", "engines.js"), "utf8"); const block = (engSrc.match(/const ENGINE_FNS = \{([\s\S]*?)\};/) || [])[1] || ""; const engines = [...block.matchAll(/\b(E\d)\s*:/g)].map((m) => m[1]);
check("A1", "the scoring ruleset equals the platform's", A.scoring_ruleset === lc.SCORING_RULESET_VERSION, `skill ${A.scoring_ruleset ?? "none"} / platform ${lc.SCORING_RULESET_VERSION}`);
check("A2", "the scoring fingerprint equals the platform's", String(A.scoring_fingerprint || "").length >= 6 && String(fp.fingerprint).startsWith(String(A.scoring_fingerprint)), `skill ${A.scoring_fingerprint ?? "none"} / platform ${String(fp.fingerprint).slice(0, 8)}`);
const platFilters = Object.keys(lc.SCORE_CHECK_SLOTS).map((k) => k.toUpperCase()); check("A3", "the scored filters and their slot counts equal the platform's (the verdict is built from these only)", same(A.scored_filters, platFilters) && same(A.score_slots, lc.SCORE_CHECK_SLOTS), `skill ${JSON.stringify(A.score_slots ?? null)} / platform ${JSON.stringify(lc.SCORE_CHECK_SLOTS)}`);
check("A4", "the search budget per research step equals the platform's", A.research_step_search_budget === sb.RESEARCH_STEP_SEARCH_BUDGET, `skill ${A.research_step_search_budget ?? "none"} / platform ${sb.RESEARCH_STEP_SEARCH_BUDGET}`);
check("A5", "the Filter 1 prompt version equals the platform's", A.f1_prompt_version === lc.F1_PROMPT_VERSION, `skill ${A.f1_prompt_version ?? "none"} / platform ${lc.F1_PROMPT_VERSION}`);
check("A6", "the engines equal the engines the platform registers", same(A.engines, engines) && engines.length > 0, `skill ${JSON.stringify(A.engines ?? null)} / platform ${JSON.stringify(engines)}`);
const body = text.replace(/```json[\s\S]*?```/g, ""); const claims15 = /Filters?\s*1\s*(?:-|–|—|to)\s*5\b/i.test(body); const oldTitles = /\bBM\b|BH FORUM/.test(body); const names14 = /Screening verdict \(Filters 1 to 4\)/.test(body);
check("A7", "the wording: names the Screening verdict (Filters 1 to 4); does not claim Filters 1 to 5 are scored; does not use the retired titles BM or BH FORUM", names14 && !claims15 && !oldTitles, `names verdict ${names14}; claims 1-5 ${claims15}; old titles ${oldTitles}`);
const age = rec?.reviewed_on ? (Date.now() - Date.parse(rec.reviewed_on)) / 86400000 : Infinity; check("A8", `the review is not older than ${MAX_AGE} days (a periodic review is mandatory)`, Number.isFinite(age) && age >= 0 && age <= MAX_AGE, rec?.reviewed_on ? `reviewed ${rec.reviewed_on}, ${Math.round(age)} day(s) ago` : "no review date");
console.log(failed ? `\n${failed} CHECK(S) FAILED: the skill and the platform have drifted apart. Update the skill and its alignment record together.` : "\nPASS the skill is aligned with the platform"); process.exitCode = failed ? 1 : 0;
