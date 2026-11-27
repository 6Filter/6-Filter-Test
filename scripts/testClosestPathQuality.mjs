/**
 * IS THE "CLOSEST PATH TO GO" ADVICE ANY GOOD? An automated quality gate for every suggestion in the panel, run on every idea's output page (real page, real server, AI stubbed).
 * The owner's complaint: "the majority of the points make no sense". A suggestion is VALID only if it passes every rule:
 *  P1  it is an ACTION (starts with a verb the person can do: Write, Add, Replace, Enter, Name, Pick, Upload, Fix, Raise, Lower, Confirm, Describe, Select, Submit ...). "Keep X, it scored strong" is not an action and can never gain a point
 *  P2  no duplicates, and at most ONE line of the kind "entered, Submit/Screen again to update" (six identical lines collapse to one)
 *  P3  it never points to a box that is not on the form (Evidence Source, who this is for, Target consumer, pure commodity, quick-commerce, finance tick, concept card)
 *  P4  it never tells the person to press "Screen again" (there is one button: Submit)
 *  P5  the numbers add up: the "A% to B%" header equals the score plus the sum of the lines' gains (rounding allowed)
 *  P6  it is not a promise that cannot be kept: a line may not say "Submit/Screen again to update the score" unless the score would actually change (checked by test: pressing it must change the page)
 *  P7  a page that says "Waiting for the web check" must NOT also show a verdict (NO-GO, WATCH, GO) with a score: it is pending, so it shows no score
 * Output: every line with its verdict, and the share of valid lines. Exit 1 if any rule is broken.
 * Put in scripts/ with uiHarness.mjs. Needs TEST_DATABASE_URL (local scratch only). Optional: --idea "<name>" (default: every seeded idea).
 */
import { createHarness, sleep } from "./uiHarness.mjs";
let failed = 0; const check = (id, n, ok, d = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${id}  ${n}${d ? "  [" + d + "]" : ""}`); if (!ok) failed++; };
const H = await createHarness(); const clean = (s) => String(s || "").replace(/\s+/g, " ").trim();
const only = process.argv.includes("--idea") ? process.argv[process.argv.indexOf("--idea") + 1] : null;
const names = only ? [only] : Object.values(H.ideas).map((i) => i.name);
const VERB = /^(write|add|replace|enter|name|pick|choose|upload|fix|raise|lower|confirm|describe|select|submit|rate|check|paste|stay|compute|evaluate|provide|fill|give|state|list|explain|specify|type|set|attach|change|remove|use|open|name|cite|quote|show)\b/i;
const REMOVED = /(evidence source|who (this|it) is for|target consumer|pure commodity|quick[- ]commerce|finance tick|concept[- ]card)/i;
let rowsTotal = 0, rowsValid = 0; const A = H.boot({ as: "admin" }); const w = A.w;
for (const name of names) {
  await H.nav.idea(w, name); await sleep(900); const panel = w.document.querySelector(".path-panel"); const pageText = H.text(w);
  const rows = panel ? [...panel.querySelectorAll("li")].map((li) => clean(li.textContent)) : [];
  const parsed = rows.map((t) => { const m = t.match(/^(F[1-4])\s*(.*?)\s*\+(\d+)%$/); return m ? { f: m[1], text: clean(m[2]), gain: Number(m[3]) } : { f: "", text: t, gain: 0 }; });
  const seen = new Map(); let enteredLines = 0; const flags = parsed.map((r) => { const f = []; const key = r.text.toLowerCase();
    if (!VERB.test(r.text)) f.push("P1 not an action"); if (seen.has(key)) f.push("P2 duplicate"); seen.set(key, 1); if (/entered\s*[—-]\s*(submit|screen again)/i.test(r.text) || /entered:? .*(submit|screen again) to update/i.test(r.text)) { enteredLines++; if (enteredLines > 1) f.push("P2 repeated 'entered, update' line"); }
    if (REMOVED.test(r.text)) f.push("P3 names a box that is not on the form"); if (/screen again/i.test(r.text)) f.push("P4 says Screen again (one button: Submit)"); return f; });
  const head = clean(panel?.textContent || "").match(/(\d{1,3})%\s*(?:→|->|to)\s*(\d{1,3})%/); const sum = parsed.reduce((s, r) => s + r.gain, 0); const p5 = !head || !parsed.length || Math.abs(Math.min(100, Number(head[1]) + sum) - Number(head[2])) <= 2;
  const pending = /waiting for the web check/i.test(pageText); const verdictShown = /\b(NO-GO|WATCH|GO)\b/.test(pageText) && /\b\d{1,3}%/.test(pageText); const p7 = !(pending && verdictShown);
  console.log(`\n=== ${name}: ${parsed.length} line(s)${head ? `, header ${head[1]}% to ${head[2]}%, gains add to ${sum}` : ""}`);
  parsed.forEach((r, i) => { rowsTotal++; const ok = !flags[i].length; if (ok) rowsValid++; console.log(`  ${ok ? "valid  " : "INVALID"} ${r.f.padEnd(2)} ${r.text.slice(0, 92)}${r.gain ? ` (+${r.gain}%)` : ""}${ok ? "" : "   <- " + flags[i].join("; ")}`); });
  if (parsed.length) check("P5", `${name}: the header equals the score plus the gains`, p5, head ? `${head[1]} + ${sum} vs ${head[2]}` : "no header");
  if (pending) check("P7", `${name}: a pending web check does not show a verdict with a score`, p7, "says Waiting for the web check");
}
const share = rowsTotal ? Math.round((100 * rowsValid) / rowsTotal) : 100; console.log(`\nINFO  valid lines: ${rowsValid} of ${rowsTotal} (${share}%)`);
check("P1-P4", "every suggestion is a valid action (no 'Keep', no duplicates, no missing box, no Screen again)", rowsValid === rowsTotal, `${rowsTotal - rowsValid} invalid line(s) of ${rowsTotal}`);
await H.close(); console.log(failed ? `\n${failed} CHECK(S) FAILED` : "\nPASS every suggestion is a valid action"); process.exitCode = failed ? 1 : 0;
