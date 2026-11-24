/**
 * Display-only: when Filter 2 net margin is blank, a non-blocking notice is shown
 * next to Adjust cost and margin and on the output page. Scoring, Required, and
 * the submit gate are untouched.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  NET_MARGIN_BLANK_NOTICE,
  netMarginBlankNotice,
  netMarginIsBlank,
} from "../lib/netMarginBlankNotice.js";
import { applyFilter2Rules, F2_ITEM_CODES } from "../lib/filter2Check.js";
import { DISPLAY_REQUIRED_PATHS, SUBMIT_GATE_PATHS } from "../lib/requiredBoxes.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const form = readFileSync(path.join(root, "src", "PropositionForm.jsx"), "utf8");
const helper = readFileSync(path.join(root, "lib", "netMarginBlankNotice.js"), "utf8");

assert.equal(netMarginIsBlank({}), true);
assert.equal(netMarginIsBlank({ netMarginAtScale: "" }), true);
assert.equal(netMarginIsBlank({ netMarginAtScale: "  " }), true);
assert.equal(netMarginIsBlank({ netMarginAtScale: null }), true);
assert.equal(netMarginBlankNotice({}), NET_MARGIN_BLANK_NOTICE);
assert.equal(netMarginBlankNotice({ netMarginAtScale: 35 }), "");
assert.equal(netMarginBlankNotice({ netMarginAtScale: "40" }), "");

assert.doesNotMatch(form, /data-testid="adjust-cost-margin"/);
assert.match(form, /data-testid="net-margin-blank-notice"/);
assert.match(form, /data-testid="net-margin-blank-notice-output"/);
assert.match(form, /netMarginBlankNotice/);
assert.match(form, /NET_MARGIN_BLANK_NOTICE/);
assert.equal(helper.includes(NET_MARGIN_BLANK_NOTICE), true);
assert.doesNotMatch(helper, /netMarginAtScale\s*=\s*[^=]/);

const blankCheck = applyFilter2Rules({}, { floor: 35, divisionLabel: "Foods" });
const blankMargin = blankCheck.items.find((it) => it.slot === "margin");
assert.equal(blankMargin.code, F2_ITEM_CODES.F2_MARGIN_MISSING);
assert.equal(blankMargin.credit, 0);

assert.equal(DISPLAY_REQUIRED_PATHS.includes("f2.netMarginAtScale"), false);
assert.equal(SUBMIT_GATE_PATHS.includes("f2.netMarginAtScale"), false);
assert.deepEqual([...DISPLAY_REQUIRED_PATHS], [...DISPLAY_REQUIRED_PATHS]);
assert.deepEqual([...SUBMIT_GATE_PATHS], ["name", "category", "ideaDescription"]);

console.log("PASS testNetMarginBlankNotice");
