/**
 * Input review (deterministic rules, no AI, no database). Typed inputs are checked BEFORE anything is scored.
 * Required export: reviewInputs(doc) in lib/inputReview.js -> { fields: [{ field, status: "fix" | "invalid", code, message, suggestion? }], blocking }
 *   invalid = impossible or nonsense, blocks Submit (drafts still save). fix = looks wrong, warns, never blocks.
 * Exits 1 if any check fails.
 */
let failed = 0; const check = (n, ok, d = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? "  [" + d + "]" : ""}`); if (!ok) failed++; };
const mod = await import("../lib/inputReview.js").catch(() => ({}));
if (typeof mod.reviewInputs !== "function") { check("0 reviewInputs is exported from lib/inputReview.js", false, "missing"); console.log("\n1 CHECK(S) FAILED"); process.exit(1); }
const clean = () => ({ name: "Hair growth serum", category: "Serum", ideaDescription: "Leave-on serum that supports visible hair growth", f1: { declaredAttribute: "Hair growth", benchmark: "Dove Scalp Serum 100 ml", declaredGap: 3 }, f2: { mrpInr: 199, cogsAtScale: 100, netMarginAtScale: 40, gstRatePct: 18, grammage: "100 ml" } });
const withDoc = (patch) => { const d = clean(); for (const [k, v] of Object.entries(patch)) { if (k.includes(".")) { const [a, b] = k.split("."); d[a] = { ...(d[a] || {}), [b]: v }; } else d[k] = v; } return d; };
const rev = (patch) => mod.reviewInputs(withDoc(patch)); const find = (r, field) => r.fields.find((f) => f.field === field);
const only = (r, field, status, code) => r.fields.length === 1 && r.fields[0].field === field && r.fields[0].status === status && (!code || r.fields[0].code === code);

let r = mod.reviewInputs(clean()); check("1 a clean, consistent idea has no issues and does not block", r.fields.length === 0 && r.blocking === false, JSON.stringify(r.fields));

// the benchmark in the owner's screenshot
r = rev({ "f1.benchmark": "dOVE SCALP SERUM" });
check("2 'dOVE SCALP SERUM' is flagged for its capitals and a corrected name is suggested; it does not block", only(r, "f1.benchmark", "fix", "TEXT_ODD_CASE") && r.fields[0].suggestion === "Dove Scalp Serum" && !r.blocking, JSON.stringify(r.fields[0] || null));
r = rev({ "f1.benchmark": "DOVE SCALP SERUM 100 ML" }); check("2b all capitals are flagged with a tidy suggestion that keeps the unit", only(r, "f1.benchmark", "fix", "TEXT_ODD_CASE") && r.fields[0].suggestion === "Dove Scalp Serum 100 ml", r.fields[0]?.suggestion);
r = rev({ "f1.benchmark": "Dove" }); check("2c a bare brand with no variant or pack asks for them (warns, does not block)", only(r, "f1.benchmark", "fix", "BENCHMARK_NEEDS_VARIANT") && !r.blocking);

// nonsense text is refused before anything is spent
for (const [label, patch, field] of [["benchmark 'asdfgh qwerty'", { "f1.benchmark": "asdfgh qwerty" }, "f1.benchmark"], ["benchmark 'test'", { "f1.benchmark": "test" }, "f1.benchmark"], ["benchmark 'xxxx'", { "f1.benchmark": "xxxx" }, "f1.benchmark"], ["idea name 'zzzz'", { name: "zzzz" }, "name"], ["description 'asdf asdf asdf qwerty'", { ideaDescription: "asdf asdf asdf qwerty" }, "ideaDescription"], ["attribute 'tbd'", { "f1.declaredAttribute": "tbd" }, "f1.declaredAttribute"]]) {
  r = rev(patch); check(`3 ${label} is invalid and blocks Submit`, only(r, field, "invalid", "TEXT_GIBBERISH") && r.blocking === true, JSON.stringify(r.fields[0] || null)); }
r = rev({ "f1.benchmark": "asdfgh qwerty" }); check("3b the message tells the user what to type instead", /brand/i.test(find(r, "f1.benchmark")?.message || "") && /Dove Scalp Serum/.test(find(r, "f1.benchmark")?.message || ""), find(r, "f1.benchmark")?.message);

// real products must never be flagged
const REAL = ["Pantene Hair Fall Control Shampoo 340 ml", "Clinic Plus Strong & Long Shampoo 175 ml", "Liberty Handwash 250 ml", "Sunsilk Black Shine Shampoo", "Parachute Advansed Coconut Oil 200 ml", "L'Oréal Paris Hyaluron Moisture Serum 30 ml", "Mamaearth Onion Hair Oil 150 ml", "Dove Intense Repair Shampoo 340 ml", "Himalaya Anti-Dandruff Shampoo 400 ml", "Biotique Bxl Fruit Whitening Serum 40 ml"];
const flagged = REAL.filter((n) => rev({ "f1.benchmark": n }).fields.length > 0); check("4 ten real product names are not flagged (no false alarms)", flagged.length === 0, flagged.join(" | "));

// numbers
for (const [label, patch, field, code] of [["declared gap 15", { "f1.declaredGap": 15 }, "f1.declaredGap", "GAP_OUT_OF_RANGE"], ["declared gap -1", { "f1.declaredGap": -1 }, "f1.declaredGap", "GAP_OUT_OF_RANGE"], ["declared gap 'abc'", { "f1.declaredGap": "abc" }, "f1.declaredGap", "GAP_OUT_OF_RANGE"], ["GST 99", { "f2.gstRatePct": 99 }, "f2.gstRatePct", "GST_OUT_OF_RANGE"], ["net margin 150", { "f2.netMarginAtScale": 150 }, "f2.netMarginAtScale", "MARGIN_OUT_OF_RANGE"], ["net margin -5", { "f2.netMarginAtScale": -5 }, "f2.netMarginAtScale", "MARGIN_OUT_OF_RANGE"], ["net margin 100", { "f2.netMarginAtScale": 100 }, "f2.netMarginAtScale", "MARGIN_OUT_OF_RANGE"], ["MRP 0", { "f2.mrpInr": 0 }, "f2.mrpInr", "MRP_NOT_POSITIVE"], ["MRP -50", { "f2.mrpInr": -50 }, "f2.mrpInr", "MRP_NOT_POSITIVE"], ["COGS -3", { "f2.cogsAtScale": -3 }, "f2.cogsAtScale", "COGS_NEGATIVE"]]) {
  r = rev(patch); check(`5 ${label} is invalid and blocks Submit`, Boolean(find(r, field)) && find(r, field).status === "invalid" && find(r, field).code === code && r.blocking === true, JSON.stringify(find(r, field) || null)); }
for (const [label, patch] of [["gap 0", { "f1.declaredGap": 0 }], ["gap 2", { "f1.declaredGap": 2 }], ["gap 10", { "f1.declaredGap": 10 }], ["GST 5", { "f2.gstRatePct": 5, "f2.mrpInr": 175 }], ["GST 18", { "f2.gstRatePct": 18 }]]) { r = rev(patch); check(`5b ${label} is accepted`, !r.blocking && !r.fields.some((f) => f.field.startsWith("f1.declaredGap") || f.code === "GST_OUT_OF_RANGE" || f.code === "GST_NOT_STANDARD"), JSON.stringify(r.fields)); }
r = rev({ "f2.gstRatePct": 7, "f2.mrpInr": 178 }); check("5c GST 7 is not a standard rate: warns, does not block", Boolean(find(r, "f2.gstRatePct")) && find(r, "f2.gstRatePct").status === "fix" && !r.blocking, JSON.stringify(r.fields));

// numbers that disagree with each other
r = rev({ "f2.cogsAtScale": 900, "f2.mrpInr": 325 }); check("6 COGS above the MRP warns and does not block", Boolean(find(r, "f2.cogsAtScale")) && find(r, "f2.cogsAtScale").code === "COGS_ABOVE_MRP" && !r.blocking, JSON.stringify(r.fields.map((f) => f.code)));
r = rev({ "f2.mrpInr": 325 }); check("6b an MRP that does not match COGS, margin and GST warns and shows what they imply (about 197)", Boolean(find(r, "f2.mrpInr")) && find(r, "f2.mrpInr").code === "MRP_MARGIN_MISMATCH" && /19[67]/.test(find(r, "f2.mrpInr").message) && !r.blocking, find(r, "f2.mrpInr")?.message);
r = rev({ "f2.mrpInr": 205 }); check("6c an MRP within 15% of the implied one is accepted", !r.fields.length, JSON.stringify(r.fields));

// other text and format
r = rev({ ideaDescription: "Serum" }); check("7 a one-word description warns (does not block)", only(r, "ideaDescription", "fix", "DESCRIPTION_TOO_SHORT") && !r.blocking);
for (const g of ["100 g", "250ml", "1 kg", "30 ml", "12 pcs"]) { r = rev({ "f2.grammage": g }); if (r.fields.length) check(`7b grammage "${g}" is accepted`, false, JSON.stringify(r.fields)); }
r = rev({ "f2.grammage": "hundred" }); check("7c a pack size without a unit warns", only(r, "f2.grammage", "fix", "GRAMMAGE_FORMAT") && !r.blocking);
r = mod.reviewInputs({}); check("8 an empty idea is not reviewed (required fields are a separate check)", r.fields.length === 0 && !r.blocking);
r = mod.reviewInputs({ ...withDoc({ name: "zzzz", "f1.declaredGap": 15 }) }); check("9 several problems are all reported together, not one at a time", r.fields.length === 2 && r.blocking === true, r.fields.map((f) => f.field).join(","));
console.log(failed ? `\n${failed} CHECK(S) FAILED` : "\nPASS input review"); process.exit(failed ? 1 : 0);
