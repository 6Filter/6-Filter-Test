import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkF1 } from "../lib/filterChecks.js";
import { previewAdvisoryChecks } from "../lib/goNoGo.js";
import { ideaSizeTier, ideaSizeFromF5 } from "../lib/ideaScale.js";
import { canViewProposition } from "../lib/propositionAccess.js";
import { FMCG_CATEGORIES } from "../lib/fmcgCategories.js";

const prevAuth = process.env.REQUIRE_AUTH;
process.env.REQUIRE_AUTH = "true";

const emptyF1 = checkF1({});
assert.equal(emptyF1.checkLabel, "Not yet run");
assert.notEqual(emptyF1.checkLabel, "Cleared");
assert.deepEqual(emptyF1.items, []);

const typed = checkF1({ declaredAttribute: "soft hair after wash" });
assert.notEqual(typed.checkLabel, "Not yet run");

const preview = previewAdvisoryChecks({});
assert.equal(preview.f1.checkLabel, "Not yet run");
assert.notEqual(preview.f1.checkLabel, "Cleared");

assert.equal(ideaSizeTier(null), null);
assert.equal(ideaSizeFromF5({}), null);
assert.equal(ideaSizeFromF5({ householdsReachedY3Mn: 10 }), null);
assert.equal(
  ideaSizeFromF5({
    householdsReachedY3Mn: 3.2,
    trialRatePct: 45,
    repeatConversionPct: 30,
    purchaseFrequencyYr: 5,
    avgPackValueInr: 120,
  }),
  null
);
assert.deepEqual(ideaSizeTier(0.4), { tier: "10g", label: "up to ₹1 Cr" });
assert.deepEqual(ideaSizeTier(8), { tier: "100g", label: "₹1–12 Cr" });
assert.deepEqual(ideaSizeTier(20), { tier: "1000g", label: "above ₹12 Cr" });

const sized = ideaSizeFromF5({
  householdsReachedY3Mn: 10,
  trialRatePct: 20,
  repeatConversionPct: 40,
  purchaseFrequencyYr: 6,
  avgPackValueInr: 80,
  computedRevenue: 38.4,
});
assert.ok(sized);
assert.equal(sized.tier, "1000g");
assert.match(sized.derivation, /households/);
assert.match(sized.derivation, /trial/);
assert.match(sized.derivation, /repeat/);

const manager = { id: "m1", role: "ADMIN", email: "admin@cavinkare.com", division: "Foods" };
const bmA = { id: "u1", role: "BM", email: "a@cavinkare.com", division: "Personal Care" };
const bmB = { id: "u2", role: "BM", email: "b@cavinkare.com", division: "Foods" };
const propA = {
  id: "p1",
  division: "Personal Care",
  createdByUserId: "u1",
  createdByEmail: "a@cavinkare.com",
};
const propB = {
  id: "p2",
  division: "Foods",
  createdByUserId: "u9",
  createdByEmail: "other@cavinkare.com",
};
const propMine = {
  id: "p3",
  division: "Foods",
  createdByUserId: "u1",
  createdByEmail: "a@cavinkare.com",
};
assert.equal(canViewProposition(manager, propA), true);
assert.equal(canViewProposition(bmA, propA), true);
assert.equal(canViewProposition(bmA, propB), false);
assert.equal(canViewProposition(bmA, propMine), true);
assert.equal(canViewProposition(bmB, propA), false);
assert.equal(canViewProposition(null, propA), false);

process.env.REQUIRE_AUTH = prevAuth;

const form = readFileSync(new URL("../src/PropositionForm.jsx", import.meta.url), "utf8");
const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const api = readFileSync(new URL("../lib/propositionsApi.js", import.meta.url), "utf8");
const router = readFileSync(new URL("../lib/apiRouter.js", import.meta.url), "utf8");
const log = readFileSync(new URL("../src/LogPage.jsx", import.meta.url), "utf8");

assert.match(form, /previewAdvisoryChecks\(liveDoc\)/);
assert.match(form, /Upload concept card/);
assert.match(form, /primus-fmcg-categories/);
assert.match(form, /Re-run this estimate/);
assert.match(form, /saveDraftSilently|onSaveDraft/);
assert.match(form, /align-items:start/);
assert.match(form, /gonogo-scale-chip/);
assert.match(form, /sizeTier\.derivation/);
assert.doesNotMatch(form, /min-height:168px;height:100%/);

assert.match(app, /\/api\/propositions\/\$\{encodeURIComponent\(id\)\}\/draft/);
assert.match(app, /onSaveDraft=\{savePropositionDraft\}/);
assert.match(app, /html:has\(\.prop-form-page\)/);
assert.match(app, /html:has\(\.output-page\)/);

assert.match(api, /handlePropositionDraft/);
assert.match(api, /handlePropositionConceptCard/);
assert.match(api, /handlePropositionRefreshField/);
assert.match(api, /bumpVersion: false/);
assert.match(api, /canAccessIdea/);
assert.match(api, /404, \{ error: "Proposition not found\." \}/);

assert.match(router, /\/draft\$/);
assert.match(router, /\/concept-card\$/);
assert.match(router, /\/refresh-field\$/);

assert.match(log, /table-layout:fixed/);
assert.match(log, /log-export-btn|log-actions-cell/);
assert.match(log, /position:sticky;right:0/);
assert.doesNotMatch(log, /min-height:calc\(100vh - 180px\)/);
assert.doesNotMatch(log, /min-width:880px/);

assert.ok(FMCG_CATEGORIES.includes("Hair oils"));
assert.ok(FMCG_CATEGORIES.length >= 20);

console.log("PASS Part 73 F1 not-yet-run, layout containment, division visibility, gram badge, draft, refresh, category list");
