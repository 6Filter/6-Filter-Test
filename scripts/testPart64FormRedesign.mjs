import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { submitProgress, heroFieldCount, filterSidebarCount } from "../lib/formProgress.js";
import { ownershipBanner } from "../lib/fieldOwnership.js";

const formSrc = readFileSync(new URL("../src/PropositionForm.jsx", import.meta.url), "utf8");
const htmlSrc = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const appSrc = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const dbSrc = readFileSync(new URL("../lib/db.js", import.meta.url), "utf8");

assert.match(htmlSrc, /Sora/);
assert.match(htmlSrc, /IBM\+Plex\+Mono/);
assert.match(formSrc, /--bg:#120818/);
assert.match(formSrc, /--accent:#8b5cf6/);
assert.match(formSrc, /font-family:'Sora'/);
assert.match(formSrc, /prop-sidebar/);
assert.match(formSrc, /prop-form-hero/);
assert.match(formSrc, /Start with the idea/);
assert.match(formSrc, /Three fields\. Research fills the rest, you edit it\./);
assert.match(formSrc, /e\.g\. Herbal cooling hair oil/);
assert.match(formSrc, /e\.g\. Hair oils/);
assert.match(formSrc, /Describe the product idea/);
assert.match(formSrc, /submit-bar/);
assert.match(formSrc, /Submit for verdict/);
assert.match(formSrc, /inline-floor-fail/);
assert.match(formSrc, /teaser-card/);
assert.match(formSrc, /Still to enter before a full score:/);
assert.match(formSrc, /listMissingFormInputs/);
assert.doesNotMatch(formSrc, /Open anyway/);
assert.doesNotMatch(formSrc, /Run research & pre-fill/);
assert.doesNotMatch(formSrc, /Upload PDF, Word, or image/);
assert.doesNotMatch(formSrc, /key: "division"/);
assert.doesNotMatch(formSrc, /setFileError/);

const empty = submitProgress({});
assert.equal(empty.requiredLeft, 5);
assert.ok(empty.missingFieldLabels.includes("Proposition name"));
assert.ok(empty.missingFieldLabels.includes("Your name"));

const filled = {
  submitterName: "Asha",
  submitterDepartment: "NPD",
  name: "Oil",
  category: "Hair oils",
  ideaDescription: "menthol stick",
};
assert.equal(submitProgress(filled).requiredLeft, 0);
assert.equal(submitProgress(filled).pct, 100);
assert.equal(heroFieldCount(filled).label, "3/3");

assert.equal(filterSidebarCount("f3", {}).label, "0/1", "F3 sidebar counts inputs even when f3 is not enough");
assert.equal(
  filterSidebarCount("f3", {
    f1: {
      declaredAttribute: "soft",
      benchmark: "Parachute Advansed 200ml",
      declaredGap: 2,
      growthRoute: "penetration",
      growthArgument: "share",
    },
    f2: { cogsAtScale: 10, netMarginAtScale: 20, gstRatePct: 18 },
    f3: { plannedAnnualIncreasePct: 5 },
  }).label,
  "1/1"
);
assert.equal(
  filterSidebarCount("f4", { f4: { techShiftRisk: { dimensions: { functionalCoreStability: { risk: "Low" } } } } })
    .label,
  "1/7"
);

assert.match(ownershipBanner("BM"), /You own/);
assert.match(ownershipBanner("ADMIN"), /every filter/);

const logSrc = readFileSync(new URL("../src/LogPage.jsx", import.meta.url), "utf8");
assert.match(logSrc, /CLEARED/);
assert.match(appSrc, /LogPage/);
const statusSrc = readFileSync(new URL("../lib/logStatus.js", import.meta.url), "utf8");
assert.match(statusSrc, /finalSummary/);
assert.match(dbSrc, /final_summary_json/);
assert.match(dbSrc, /manager_review_json/);
assert.match(dbSrc, /ADD COLUMN IF NOT EXISTS final_summary_json/);

const envSrc = readFileSync(new URL("../.env.local.example", import.meta.url), "utf8");
assert.match(envSrc, /SLACK_WEBHOOK_URL/);

console.log("PASS Part 64 form redesign tokens, hero, teasers, Log completed");
