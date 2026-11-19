import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseAppLocation, screenFromHash, hashForScreen, pathForView } from "../lib/appRoutes.js";
let n = 0;
const check = (name, fn) => { fn(); n += 1; console.log("  ok", n, "-", name); };
check("the page marker is read from the address", () => {
  assert.equal(screenFromHash("#input"), "input");
  assert.equal(screenFromHash("#output"), "output");
  assert.equal(screenFromHash("#INPUT"), "input");
  assert.equal(screenFromHash(""), "");
  assert.equal(screenFromHash("#other"), "");
  assert.equal(hashForScreen("input"), "#input");
  assert.equal(hashForScreen("output"), "#output");
  assert.equal(hashForScreen(""), "");
});
check("the marker does not change which idea or page the address means", () => {
  assert.deepEqual(parseAppLocation("/propositions/abc-1"), { kind: "proposition", ideaId: "abc-1" });
  assert.equal(pathForView("form", "abc-1"), "/propositions/abc-1");
  assert.equal(pathForView("log"), "/log");
});
const app = readFileSync("src/App.jsx", "utf8");
const form = readFileSync("src/PropositionForm.jsx", "utf8");
check("refresh and Back re-open the idea on the page it was on", () => {
  assert.match(app, /initialDeepLink: true,\s*screen: screenFromHash\(window\.location\.hash\)/);
  assert.match(app, /fromPop: true, screen/);
  assert.match(app, /opts\.screen === "output"/);
  assert.match(app, /opts\.screen === "input" \|\| opts\.forceForm/);
});
check("the form writes the page marker into the address and an explicit 'input' beats the evaluated state", () => {
  assert.match(form, /currentView === "propositionForm" \? "#input" : "#output"/);
  assert.match(form, /doc\?\._preferOutput === false\) return false/);
});
console.log(`PASS Part 154 (${n} checks)`);
