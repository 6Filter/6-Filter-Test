/**
 * Part 134 revised — pure Filter 2 derivation (MRP, override, pack, GST honesty).
 * Owner source of truth. Do not edit to weaken.
 */
import assert from "node:assert/strict";
import { deriveMrp, resolveF2Price } from "../../lib/mrpFormula.js";
import { parsePackSize, samePackSize } from "../../lib/packSize.js";
import { resolveGst } from "../../lib/gstRate.js";

let n = 0;
function check(cond, msg) {
  n += 1;
  assert.ok(cond, `check ${n}: ${msg}`);
}

// --- deriveMrp ---
{
  const d = deriveMrp({ cogsAtScale: 100, netMarginAtScale: 50, gstRatePct: 18 });
  check(d.ok === true, "derive ok");
  check(d.preTaxMrp === 200, `preTax ${d.preTaxMrp}`);
  check(d.gstAmount === 36, `gst ${d.gstAmount}`);
  check(d.mrp === 236, `mrp ${d.mrp}`);
  check(Math.abs(d.mrp - d.gstAmount - d.preTaxMrp) < 0.001, "parts reconcile");
  check(d.mrpRounded === 236, "rounded");
}
{
  check(deriveMrp({}).reason === "NEEDS_COGS", "needs cogs");
  check(deriveMrp({ cogsAtScale: 10 }).reason === "NEEDS_MARGIN", "needs margin");
  check(deriveMrp({ cogsAtScale: 10, netMarginAtScale: 0 }).reason === "MARGIN_OUT_OF_RANGE", "margin 0");
  check(deriveMrp({ cogsAtScale: 10, netMarginAtScale: 100 }).reason === "MARGIN_OUT_OF_RANGE", "margin 100");
  check(deriveMrp({ cogsAtScale: 10, netMarginAtScale: 40 }).reason === "NEEDS_GST", "needs gst");
}

// --- resolveF2Price margin driver ---
{
  const r = resolveF2Price({ cogsAtScale: 100, netMarginAtScale: 50, gstRatePct: 18 });
  check(r.ok && r.driver === "margin", "margin driver");
  check(r.effectiveMargin === 50, "effective = typed");
  check(r.mrp === 236, "computed mrp");
}

// --- resolveF2Price MRP override ---
{
  const r = resolveF2Price({
    cogsAtScale: 100,
    netMarginAtScale: 50,
    gstRatePct: 18,
    mrpOverride: true,
    mrpInr: 200,
  });
  check(r.ok && r.driver === "mrp", "mrp driver");
  check(r.mrp === 200, "uses typed mrp");
  // preTax = 200/1.18 ≈ 169.49; margin = (169.49-100)/169.49 ≈ 41.00
  check(Math.abs(r.effectiveMargin - 41) < 0.1, `implied margin ${r.effectiveMargin}`);
  check(Math.abs(r.preTaxMrp + r.gstAmount - r.mrp) < 0.02, "override parts reconcile");
}
{
  check(
    resolveF2Price({ mrpOverride: true, mrpInr: 100, gstRatePct: 18 }).reason === "NEEDS_COGS",
    "override needs cogs"
  );
  check(
    resolveF2Price({ mrpOverride: true, cogsAtScale: 10, gstRatePct: 18 }).reason === "NEEDS_MRP",
    "override needs mrp"
  );
  check(
    resolveF2Price({ mrpOverride: true, cogsAtScale: 10, mrpInr: 50 }).reason === "NEEDS_GST",
    "override needs gst"
  );
}
{
  // Without override flag, a stray mrpInr is ignored — margin driver recomputes.
  const r = resolveF2Price({
    cogsAtScale: 100,
    netMarginAtScale: 50,
    gstRatePct: 18,
    mrpInr: 999,
  });
  check(r.driver === "margin" && r.mrp === 236, "no override ignores typed mrp");
}

// --- parsePackSize ---
{
  check(parsePackSize("100 ml").ok && parsePackSize("100 ml").unit === "ml", "100 ml");
  check(parsePackSize("100 g").ok && parsePackSize("100 g").base === 100, "100 g");
  check(parsePackSize("1 kg").ok && parsePackSize("1 kg").base === 1000, "1 kg");
  check(parsePackSize("0.5 L").ok && parsePackSize("0.5 L").base === 500, "0.5 L");
  check(parsePackSize("250 gm").ok && parsePackSize("250 gm").base === 250, "250 gm");
  check(parsePackSize("100").reason === "NEEDS_UNIT", "bare number refused");
  check(samePackSize("0.1 L", "100 ml"), "0.1 L ≡ 100 ml");
  check(!samePackSize("100 g", "100 ml"), "g ≠ ml");
}

// --- resolveGst honesty ---
{
  const finance = resolveGst({
    category: "namkeen",
    table: [{ categoryKeywords: ["namkeen"], rate: 5, effectiveFrom: "2025-09-22", source: "Finance" }],
  });
  check(finance.basis === "finance-table", "finance wins");
  check(finance.needsConfirmation === false, "finance no confirm");

  const ai = resolveGst({
    aiProposal: { gstRatePct: 5, source: "https://cbic.gov.in/x", asOf: "2025-09-22" },
  });
  check(ai.basis === "ai-estimate", "cited AI");
  check(/AI estimate from a web search/i.test(ai.note), "AI note");
  check(/override/i.test(ai.note), "override wording");

  const plain = resolveGst({});
  check(plain.basis === "default", "default");
  check(!/Analysed by AI/i.test(plain.note), "never Analysed by AI");
  check(/placeholder/i.test(plain.note), "placeholder");
}

console.log(`PASS owner testFilter2Derivation (${n} checks)`);
