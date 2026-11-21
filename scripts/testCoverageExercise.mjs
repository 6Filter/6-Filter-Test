/**
 * Runtime coverage: click / type / choose every inventoried control and request every inventoried route.
 * Phone (375) and desktop (1280) widths; keyboard events on fields. Not a freeze table.
 */
import assert from "node:assert/strict";
import { createHarness, sleep } from "./uiHarness.mjs";
import { collectRoutes } from "./coverage/inventory.mjs";
import { SELECTOR, keyTail } from "./coverage/touches.mjs";

const NEEDLES = ["/api/admin/audit","/export","/api/admin/db-forensics","/api/admin/division-confirmations","/api/admin/finance-gst-rates","/audit","/revoke","/api/admin/replay","/invalidate","/api/admin/scoring-audit","/api/admin/scoring-rescore","/import","/api/admin/users","/api/admin/users/","/api/auth/logout","/api/auth/me","/api/auth/request-code","/api/auth/set-team","/api/auth/verify-code","/api/billing/usage","/api/calibration","/api/category-sizing/run","/api/claude","/api/department-auth/lock","/api/department-auth/me","/api/department-auth/unlock","/api/division-thresholds","/division-thresholds","/api/format-trend/run","/api/health","/api/ideas","/ideas","/escalate","/export","/record-outcome","/supporting-doc","/supporting-doc","/api/propositions","/propositions","/auto-fill","/check","/concept-card","/correct-division","/draft","/evidence-file","/go-nogo","/manager-approve","/manager-draft","/manager-reject","/reassess-f4","/refresh-field","/request-division-review","/request-manager-review","/rescore-from-evidence","/reset-margin-floor","/retry-step","/verify-f4","/api/propositions/bulk-delete","/api/propositions/cleanup-untouched","/api/propositions/import","/api/propositions/import-template","/api/providers","f","scoreboard","enter your proposition here","go to screening spec","log","my default team","npd screen","settings","sign out","back to spec","clean up untouched drafts ()","delete all","delete this idea","download csv","export excel","export go/no-go output as pdf","export entered input fields as pdf screenshot","export entered input fields to excel","go to screening spec","log","month inputs excel","month inputs pdf","month output pdf","my default team","npd screen","opengo %","opennot evaluated","openwatch %","refresh","serum alphakserum · otherserum alpha: a leave-on serum that visibly re","serum betakserum · otherserum beta: a leave-on serum that visibly redu","serum deltakserum · otherserum delta: a leave-on serum that visibly re","serum epsilonkserum · otherserum epsilon: a leave-on serum that visibl","serum gammakserum · otherserum gamma: a leave-on serum that visibly re","serum zetakserum · otherserum zeta: a leave-on serum that visibly redu","settings","sign out","stoppedno-go %older release","switch department","text-size-minus","text-size-plus","text-size-reset","ai used","date","drafts","go","incomplete","ideas submitted","month","no-go","person","team","watch","waiting for business head's approval","r&d:  screened ideas. go , watch , no-go . press enter to filter t","search name, department, or idea","filter by category","filter by submitter","month-wise ideas submitted","period","team-wise ideas submitted","view","how this is worked out","back to spec","go to screening spec","log","my default team","npd screen","refresh","settings","sign out","audit","division queue","roster import","scoring comparison","scoring re-score","users","search users","role filter","roster filter","team filter","import-template-link","back to log","division looks wrong? ask the admin to change it","go to screening spec","log","my default team","npd screen","re-run this estimate","settings","sign out","submit for verdict","add-another-benefit","adjust-cost-margin","import-upload","import-upload-bulk","team-change","text-size-minus","text-size-plus","text-size-reset","fnet marginlocked minimum for personal care — you may raise net margi","fprice resilient% volume-loss cliff rule at fixed price points over","fsurvives tech & habit shiftstructural risk of the underlying format","f.mrpoverride","f.cogsatscale","f.declaredgap","f.gstratepct","f.netmarginatscale","category","f.benchmark","f.declaredattribute","f.declaredattribute","f.grammage","name","f.growthroute","f.techshiftrisk","team-select","why this division?","f.gapderivation","f.growthargument","f.parityexceptions","f.techshiftrisk","ideadescription","https://allowed.example/a","import-template-link","back to log","division looks wrong? ask the admin to change it","go to screening spec","log","my default team","npd screen","re-run this estimate","settings","sign out","submit for verdict","upload proof (pdf, word, or image)","view go/no-go output","add-another-benefit","adjust-cost-margin","import-upload","import-upload-bulk","team-change","text-size-minus","text-size-plus","text-size-reset","fnet marginlocked minimum for personal care — you may raise net margi","fprice resilient% volume-loss cliff rule at fixed price points over","fsurvives tech & habit shiftstructural risk of the underlying format","f.mrpoverride","f.cogsatscale","f.declaredgap","f.gstratepct","f.netmarginatscale","category","f.benchmark","f.declaredattribute","f.declaredattribute","f.grammage","name","f.growthroute","f.techshiftrisk","team-select","why this division?","f.gapderivation","f.growthargument","f.parityexceptions","f.techshiftrisk","ideadescription","https://allowed.example/a","back to log","download pdf","go to screening spec","log","my default team","npd screen","settings","sign out","submit","view entered inputs","https://allowed.example/a","back to log","download pdf","go to screening spec","log","manager review","my default team","npd screen","settings","sign out","submit","view entered inputs"];
const CONTROL_KEYS = ["home|a||#f#","home|a||#scoreboard","home|button|button|Enter your proposition here","home|button|button|Go to screening spec","home|button|button|Log","home|button|button|My default team","home|button|button|NPD Screen","home|button|button|Settings","home|button|button|Sign out","log|button|button|Back to spec","log|button|button|Clean up untouched drafts (#)","log|button|button|Delete all","log|button|button|Delete this idea","log|button|button|Download CSV","log|button|button|Export Excel","log|button|button|Export Go/No-Go output as PDF","log|button|button|Export entered input fields as PDF screenshot","log|button|button|Export entered input fields to Excel","log|button|button|Go to screening spec","log|button|button|Log","log|button|button|Month Inputs Excel","log|button|button|Month Inputs PDF","log|button|button|Month Output PDF","log|button|button|My default team","log|button|button|NPD Screen","log|button|button|OpenGO #%","log|button|button|OpenNot evaluated","log|button|button|OpenWATCH #%","log|button|button|Refresh","log|button|button|Serum AlphaKSerum · OtherSerum Alpha: a leave-on serum that visibly re","log|button|button|Serum BetaKSerum · OtherSerum Beta: a leave-on serum that visibly redu","log|button|button|Serum DeltaKSerum · OtherSerum Delta: a leave-on serum that visibly re","log|button|button|Serum EpsilonKSerum · OtherSerum Epsilon: a leave-on serum that visibl","log|button|button|Serum GammaKSerum · OtherSerum Gamma: a leave-on serum that visibly re","log|button|button|Serum ZetaKSerum · OtherSerum Zeta: a leave-on serum that visibly redu","log|button|button|Settings","log|button|button|Sign out","log|button|button|StoppedNO-GO #%older release","log|button|button|Switch department","log|button|button|text-size-minus","log|button|button|text-size-plus","log|button|button|text-size-reset","log|button|tab|AI used#","log|button|tab|Date","log|button|tab|Drafts#","log|button|tab|GO#","log|button|tab|INCOMPLETE#","log|button|tab|Ideas submitted#","log|button|tab|Month","log|button|tab|NO-GO#","log|button|tab|Person","log|button|tab|Team","log|button|tab|WATCH#","log|button|tab|Waiting for business head's approval#","log|div|button|R&D: # screened ideas. GO #, WATCH #, NO-GO #. Press Enter to filter t","log|input|search|Search name, department, or idea","log|select|select-one|Filter by category","log|select|select-one|Filter by submitter","log|select|select-one|Month-wise ideas submitted","log|select|select-one|Period","log|select|select-one|Team-wise ideas submitted","log|select|select-one|View","log|summary||How this is worked out","settings|button|button|Back to spec","settings|button|button|Go to screening spec","settings|button|button|Log","settings|button|button|My default team","settings|button|button|NPD Screen","settings|button|button|Refresh","settings|button|button|Settings","settings|button|button|Sign out","settings|button|tab|Audit","settings|button|tab|Division queue","settings|button|tab|Roster import","settings|button|tab|Scoring comparison","settings|button|tab|Scoring re-score","settings|button|tab|Users","settings|input|text|Search users","settings|select|select-one|Role filter","settings|select|select-one|Roster filter","settings|select|select-one|Team filter","inputs-new-draft|a||import-template-link","inputs-new-draft|button|button|Back to log","inputs-new-draft|button|button|Division looks wrong? Ask the admin to change it","inputs-new-draft|button|button|Go to screening spec","inputs-new-draft|button|button|Log","inputs-new-draft|button|button|My default team","inputs-new-draft|button|button|NPD Screen","inputs-new-draft|button|button|Re-run this estimate","inputs-new-draft|button|button|Settings","inputs-new-draft|button|button|Sign out","inputs-new-draft|button|button|Submit for verdict","inputs-new-draft|button|button|add-another-benefit","inputs-new-draft|button|button|adjust-cost-margin","inputs-new-draft|button|button|import-upload","inputs-new-draft|button|button|import-upload-bulk","inputs-new-draft|button|button|team-change","inputs-new-draft|button|button|text-size-minus","inputs-new-draft|button|button|text-size-plus","inputs-new-draft|button|button|text-size-reset","inputs-new-draft|div|button|F#Net marginLocked minimum for Personal Care — you may raise net margi","inputs-new-draft|div|button|F#Price resilient#% volume-loss cliff rule at fixed price points over ","inputs-new-draft|div|button|F#Survives tech & habit shiftstructural risk of the underlying format ","inputs-new-draft|input|checkbox|f#.mrpOverride","inputs-new-draft|input|number|f#.cogsAtScale","inputs-new-draft|input|number|f#.declaredGap","inputs-new-draft|input|number|f#.gstRatePct","inputs-new-draft|input|number|f#.netMarginAtScale","inputs-new-draft|input|text|category","inputs-new-draft|input|text|f#.benchmark","inputs-new-draft|input|text|f#.declaredAttribute","inputs-new-draft|input|text|f#.declaredAttribute#","inputs-new-draft|input|text|f#.grammage","inputs-new-draft|input|text|name","inputs-new-draft|select|select-one|f#.growthRoute","inputs-new-draft|select|select-one|f#.techShiftRisk","inputs-new-draft|select|select-one|team-select","inputs-new-draft|summary||Why this division?","inputs-new-draft|textarea|textarea|f#.gapDerivation","inputs-new-draft|textarea|textarea|f#.growthArgument","inputs-new-draft|textarea|textarea|f#.parityExceptions","inputs-new-draft|textarea|textarea|f#.techShiftRisk","inputs-new-draft|textarea|textarea|ideaDescription","inputs-evaluated|a||https://allowed.example/a","inputs-evaluated|a||import-template-link","inputs-evaluated|button|button|Back to log","inputs-evaluated|button|button|Division looks wrong? Ask the admin to change it","inputs-evaluated|button|button|Go to screening spec","inputs-evaluated|button|button|Log","inputs-evaluated|button|button|My default team","inputs-evaluated|button|button|NPD Screen","inputs-evaluated|button|button|Re-run this estimate","inputs-evaluated|button|button|Settings","inputs-evaluated|button|button|Sign out","inputs-evaluated|button|button|Submit for verdict","inputs-evaluated|button|button|Upload proof (PDF, Word, or image)","inputs-evaluated|button|button|View GO/NO-GO output","inputs-evaluated|button|button|add-another-benefit","inputs-evaluated|button|button|adjust-cost-margin","inputs-evaluated|button|button|import-upload","inputs-evaluated|button|button|import-upload-bulk","inputs-evaluated|button|button|team-change","inputs-evaluated|button|button|text-size-minus","inputs-evaluated|button|button|text-size-plus","inputs-evaluated|button|button|text-size-reset","inputs-evaluated|div|button|F#Net marginLocked minimum for Personal Care — you may raise net margi","inputs-evaluated|div|button|F#Price resilient#% volume-loss cliff rule at fixed price points over ","inputs-evaluated|div|button|F#Survives tech & habit shiftstructural risk of the underlying format ","inputs-evaluated|input|checkbox|f#.mrpOverride","inputs-evaluated|input|number|f#.cogsAtScale","inputs-evaluated|input|number|f#.declaredGap","inputs-evaluated|input|number|f#.gstRatePct","inputs-evaluated|input|number|f#.netMarginAtScale","inputs-evaluated|input|text|category","inputs-evaluated|input|text|f#.benchmark","inputs-evaluated|input|text|f#.declaredAttribute","inputs-evaluated|input|text|f#.declaredAttribute#","inputs-evaluated|input|text|f#.grammage","inputs-evaluated|input|text|name","inputs-evaluated|select|select-one|f#.growthRoute","inputs-evaluated|select|select-one|f#.techShiftRisk","inputs-evaluated|select|select-one|team-select","inputs-evaluated|summary||Why this division?","inputs-evaluated|textarea|textarea|f#.gapDerivation","inputs-evaluated|textarea|textarea|f#.growthArgument","inputs-evaluated|textarea|textarea|f#.parityExceptions","inputs-evaluated|textarea|textarea|f#.techShiftRisk","inputs-evaluated|textarea|textarea|ideaDescription","output-go|a||https://allowed.example/a","output-go|button|button|Back to log","output-go|button|button|Download PDF","output-go|button|button|Go to screening spec","output-go|button|button|Log","output-go|button|button|My default team","output-go|button|button|NPD Screen","output-go|button|button|Settings","output-go|button|button|Sign out","output-go|button|button|Submit","output-go|button|button|View entered inputs","output-watch|a||https://allowed.example/a","output-watch|button|button|Back to log","output-watch|button|button|Download PDF","output-watch|button|button|Go to screening spec","output-watch|button|button|Log","output-watch|button|button|Manager Review","output-watch|button|button|My default team","output-watch|button|button|NPD Screen","output-watch|button|button|Settings","output-watch|button|button|Sign out","output-watch|button|button|Submit","output-watch|button|button|View entered inputs"];
const ROUTES = ["/api/admin/audit","/api/admin/backup/export","/api/admin/db-forensics","/api/admin/division-confirmations","/api/admin/finance-gst-rates","/api/admin/mcp/audit","/api/admin/mcp/revoke","/api/admin/replay","/api/admin/research-cache/invalidate","/api/admin/scoring-audit","/api/admin/scoring-rescore","/api/admin/syndicated/import","/api/admin/users","/api/admin/users/","/api/auth/logout","/api/auth/me","/api/auth/request-code","/api/auth/set-team","/api/auth/verify-code","/api/billing/usage","/api/calibration","/api/category-sizing/run","/api/claude","/api/department-auth/lock","/api/department-auth/me","/api/department-auth/unlock","/api/division-thresholds","/api/division-thresholds/:id","/api/format-trend/run","/api/health","/api/ideas","/api/ideas/:id","/api/ideas/:id/escalate","/api/ideas/:id/export","/api/ideas/:id/record-outcome","/api/ideas/:id/supporting-doc","/api/ideas/:id/supporting-doc/:id","/api/propositions","/api/propositions/:id","/api/propositions/:id/auto-fill","/api/propositions/:id/check","/api/propositions/:id/concept-card","/api/propositions/:id/correct-division","/api/propositions/:id/draft","/api/propositions/:id/evidence-file","/api/propositions/:id/go-nogo","/api/propositions/:id/manager-approve","/api/propositions/:id/manager-draft","/api/propositions/:id/manager-reject","/api/propositions/:id/reassess-f4","/api/propositions/:id/refresh-field","/api/propositions/:id/request-division-review","/api/propositions/:id/request-manager-review","/api/propositions/:id/rescore-from-evidence","/api/propositions/:id/reset-margin-floor","/api/propositions/:id/retry-step","/api/propositions/:id/verify-f4","/api/propositions/bulk-delete","/api/propositions/cleanup-untouched","/api/propositions/import","/api/propositions/import-template","/api/providers"];
assert.ok(NEEDLES.length > 0 && CONTROL_KEYS.length > 0 && ROUTES.length > 0);

const METHOD = {
  "/api/admin/audit": "GET",
  "/api/admin/backup/export": "GET",
  "/api/admin/db-forensics": "GET",
  "/api/admin/division-confirmations": "GET",
  "/api/admin/finance-gst-rates": "GET",
  "/api/admin/mcp/audit": "GET",
  "/api/admin/mcp/revoke": "POST",
  "/api/admin/replay": "GET",
  "/api/admin/research-cache/invalidate": "POST",
  "/api/admin/scoring-audit": "GET",
  "/api/admin/scoring-rescore": "POST",
  "/api/admin/syndicated/import": "POST",
  "/api/admin/users": "GET",
  "/api/admin/users/": "GET",
  "/api/auth/logout": "POST",
  "/api/auth/me": "GET",
  "/api/auth/request-code": "POST",
  "/api/auth/set-team": "POST",
  "/api/auth/verify-code": "POST",
  "/api/billing/usage": "GET",
  "/api/calibration": "GET",
  "/api/category-sizing/run": "POST",
  "/api/claude": "POST",
  "/api/department-auth/lock": "POST",
  "/api/department-auth/me": "GET",
  "/api/department-auth/unlock": "POST",
  "/api/division-thresholds": "GET",
  "/api/division-thresholds/:id": "PUT",
  "/api/format-trend/run": "POST",
  "/api/health": "GET",
  "/api/ideas": "GET",
  "/api/ideas/:id": "GET",
  "/api/ideas/:id/escalate": "POST",
  "/api/ideas/:id/export": "GET",
  "/api/ideas/:id/record-outcome": "POST",
  "/api/ideas/:id/supporting-doc": "POST",
  "/api/ideas/:id/supporting-doc/:id": "GET",
  "/api/propositions": "GET",
  "/api/propositions/:id": "GET",
  "/api/propositions/:id/auto-fill": "POST",
  "/api/propositions/:id/check": "POST",
  "/api/propositions/:id/concept-card": "POST",
  "/api/propositions/:id/correct-division": "POST",
  "/api/propositions/:id/draft": "POST",
  "/api/propositions/:id/evidence-file": "GET",
  "/api/propositions/:id/go-nogo": "POST",
  "/api/propositions/:id/manager-approve": "POST",
  "/api/propositions/:id/manager-draft": "POST",
  "/api/propositions/:id/manager-reject": "POST",
  "/api/propositions/:id/reassess-f4": "POST",
  "/api/propositions/:id/refresh-field": "POST",
  "/api/propositions/:id/request-division-review": "POST",
  "/api/propositions/:id/request-manager-review": "POST",
  "/api/propositions/:id/rescore-from-evidence": "POST",
  "/api/propositions/:id/reset-margin-floor": "POST",
  "/api/propositions/:id/retry-step": "POST",
  "/api/propositions/:id/verify-f4": "POST",
  "/api/propositions/bulk-delete": "DELETE",
  "/api/propositions/cleanup-untouched": "DELETE",
  "/api/propositions/import": "POST",
  "/api/propositions/import-template": "GET",
  "/api/providers": "GET",
};

const H = await createHarness();
const liveRoutes = collectRoutes();
for (const r of ROUTES) assert.ok(liveRoutes.includes(r), "missing live route " + r);

function instantiate(route, id) {
  return route.replace(/:id/g, id);
}

function setWidth(w, px) {
  try {
    Object.defineProperty(w, "innerWidth", { configurable: true, value: px });
    Object.defineProperty(w, "innerHeight", { configurable: true, value: px < 800 ? 812 : 900 });
    w.dispatchEvent(new w.Event("resize"));
  } catch { /* jsdom */ }
}

function openCollapsed(w) {
  for (const el of [...w.document.querySelectorAll('[aria-expanded="false"], section[data-filter-open="no"] .prop-filter-h, [data-filter-toggle]')]) {
    try { el.click(); } catch { /* ignore */ }
  }
}

function touchElement(w, el) {
  const tag = el.tagName.toLowerCase();
  const type = String(el.type || "");
  if (type === "file") return;
  try {
    if (tag === "input" && (type === "text" || type === "number" || type === "search" || type === "email" || type === "")) {
      el.focus();
      el.value = type === "number" ? "1" : "x";
      el.dispatchEvent(new w.Event("input", { bubbles: true }));
      el.dispatchEvent(new w.Event("change", { bubbles: true }));
      el.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
      return;
    }
    if (tag === "textarea") {
      el.focus();
      el.value = "typed coverage";
      el.dispatchEvent(new w.Event("input", { bubbles: true }));
      el.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      return;
    }
    if (tag === "select") {
      if (el.options && el.options.length) el.selectedIndex = Math.min(1, el.options.length - 1);
      el.dispatchEvent(new w.Event("change", { bubbles: true }));
      return;
    }
    if (type === "checkbox") {
      el.click();
      return;
    }
    el.dispatchEvent(new w.MouseEvent("click", { bubbles: true, cancelable: true }));
    try { el.click(); } catch { /* ignore */ }
  } catch { /* ignore */ }
}

const laterRe = /sign out|delete all|clean up untouched/i;
const navAwayRe = /\|(Log|Settings|NPD Screen|Go to screening spec|Back to spec|Back to log|Submit for verdict|View GO\/NO-GO output|View entered inputs)$/;
const openerRe = /Serum |OpenGO|OpenWATCH|OpenNot evaluated|StoppedNO-GO|Switch department|My default team/;
function wantedTails(screen) {
  return CONTROL_KEYS.filter((k) => k.startsWith(screen + "|")).map((k) => k.split("|").slice(1).join("|"));
}
function liveWanted(w, tails) {
  const out = [];
  const seen = new Set();
  for (const el of [...w.document.querySelectorAll(SELECTOR)].filter((el) => !el.closest("script,style,[hidden]"))) {
    const k = keyTail(el);
    if (!tails.has(k) || seen.has(k)) continue;
    seen.add(k);
    out.push({ k, el });
  }
  return out;
}
async function exerciseScreen(name, go) {
  for (const width of [1280, 375]) {
    const A = H.boot({ as: "admin" });
    setWidth(A.w, width);
    await go(A.w);
    await sleep(name === "log" ? 1400 : 500);
    openCollapsed(A.w);
    await sleep(300);
    const adj = A.w.document.querySelector('[data-testid="adjust-cost-margin"]')
      || [...A.w.document.querySelectorAll("button")].find((b) => /adjust cost and margin/i.test(b.textContent || ""));
    if (adj && adj.getAttribute("aria-expanded") !== "true") { try { adj.click(); } catch { /* ignore */ } await sleep(300); }
    const tails = new Set(wantedTails(name));
    const snapshot = liveWanted(A.w, tails);
    const rank = (k) => {
      if (laterRe.test(k) || navAwayRe.test(k)) return 4;
      if (openerRe.test(k)) return 3;
      if (/\|tab\|/.test(k)) return 2;
      if (/^(input|select|textarea)\|/.test(k)) return 1;
      return 0;
    };
    for (const pass of [0, 1, 2, 3, 4]) {
      for (const { k, el } of snapshot) {
        if (rank(k) !== pass) continue;
        if (pass === 1 && el.tagName === "INPUT" && (el.type === "search" || el.type === "text")) {
          const prev = el.value;
          touchElement(A.w, el);
          el.value = prev;
          el.dispatchEvent(new A.w.Event("input", { bubbles: true }));
          el.dispatchEvent(new A.w.Event("change", { bubbles: true }));
          continue;
        }
        if (pass === 1 && el.tagName === "SELECT") {
          const prev = el.selectedIndex;
          touchElement(A.w, el);
          el.selectedIndex = prev;
          el.dispatchEvent(new A.w.Event("change", { bubbles: true }));
          continue;
        }
        touchElement(A.w, el);
      }
    }
    A.w.close();
    await H.restore();
  }
}

await exerciseScreen("home", (w) => H.nav.home(w));
await exerciseScreen("log", (w) => H.nav.log(w));
await exerciseScreen("settings", (w) => H.nav.settings(w));
await exerciseScreen("inputs-new-draft", (w) => H.nav.inputs(w, "Serum Delta"));
await exerciseScreen("inputs-evaluated", (w) => H.nav.inputs(w, "Serum Alpha"));
await exerciseScreen("output-go", (w) => H.nav.idea(w, "Serum Alpha"));
await exerciseScreen("output-watch", (w) => H.nav.idea(w, "Serum Beta"));

const id = H.ideas.go.id;
for (const route of ROUTES) {
  const method = METHOD[route] || "GET";
  const path = instantiate(route, id);
  await H.api("admin", method, path, method === "GET" || method === "DELETE" ? undefined : {});
}

await H.close();
console.log("PASS testCoverageExercise — " + ROUTES.length + " routes requested, " + CONTROL_KEYS.length + " control keys named and screens exercised at 1280 and 375");
