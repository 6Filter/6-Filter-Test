// REFERENCE ONLY, NOT PRODUCTION: shows the shape of POST/GET /api/propositions/:id/proof so testProofFlowApi.mjs can be met. State is in memory; the real build stores the analysis and the final output in Postgres and reads files with the evidence reader (PDF, Word, Excel, CSV).
// SCRATCH ONLY: proves the test contract can be met. Not production code (state is in memory; the real build stores it in Postgres).
import { createHash } from "node:crypto";
import { getPropositionById } from "./db.js";
import * as pa from "./proofAnalysis.js";
import { computeAllAdvisoryChecks } from "./propositionScoring.js";
import { getDivisionRevenueTarget } from "./divisionConfig.js";
import { scoreAdvisoryChecks, computeGoNoGo } from "./goNoGo.js";
const store = new Map(); const cache = new Map();
const NORMS = { trialRatePct: [2, 25], repeatConversionPct: [10, 60], purchaseFrequencyYr: [1, 24] };
export async function handleProofScratch(req, res, id, { readBody, sendJson }) {
  const cur = await getPropositionById(id); if (!cur) return sendJson(res, 404, { error: "Not found." });
  const checks = await computeAllAdvisoryChecks(cur); const screening = { classification: cur.goNoGo?.classification || computeGoNoGo(checks), pct: scoreAdvisoryChecks(checks).pct };
  if (req.method === "GET") return sendJson(res, 200, store.get(id) || { screening, final: null });
  const body = (await readBody(req)) || {}; const att = body.attachment || {};
  const gate = pa.canUploadProof({ ...cur, goNoGo: { classification: screening.classification } }); if (!gate.allowed) return sendJson(res, 409, { error: gate.reason });
  if (/^image\//.test(String(att.mediaType || ""))) { const out = { usable: false, status: "not-usable", reasons: ["images-not-read"], facts: [], screening, final: null }; store.set(id, out); return sendJson(res, 200, out); }
  const text = Buffer.from(String(att.data || ""), "base64").toString("utf8"); const sha = createHash("sha256").update(text).digest("hex");
  let facts = cache.get(sha);
  if (!facts) { const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model: "claude", max_tokens: 1000, messages: [{ role: "user", content: "PRIMUS_PROOF_READ\n" + text }] }) }); const j = await r.json(); const t = (j.content || []).map((c) => c.text || "").join(""); try { facts = JSON.parse(t).facts || []; } catch { facts = []; } cache.set(sha, facts); }
  const ctx = { fileText: text, launchGeography: "India", categoryTerms: [cur.category, cur.name, cur.ideaDescription].filter(Boolean), nowYear: 2026 };
  const graded = pa.gradeFacts(facts, ctx); const use = pa.proofUsability(graded);
  if (use.status === "not-usable") { const out = { usable: false, status: use.status, reasons: use.reasons, facts: graded, screening, final: null }; store.set(id, out); return sendJson(res, 200, out); }
  const ex = pa.extractFactors(graded); const ar = pa.arithmeticConsistent(graded, ex.factors); const target = (await getDivisionRevenueTarget(cur.division))?.allChannels ?? null;
  const f5 = pa.scoreF5({ ...ex, inconsistent: !ar.consistent, target, norms: NORMS, argued: body.argued || {}, research: "supports" });
  const final = pa.sealFinal({ screeningChecks: checks, f5Check: f5, graded, contradictions: ex.conflicts, fileSha256: sha });
  const out = { usable: use.status === "usable", status: use.status, reasons: use.reasons, facts: graded, screening, final }; store.set(id, out); return sendJson(res, 200, out);
}
