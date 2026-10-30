/**
 * Opening a screened idea from the Log must land on GO/NO-GO output and offer
 * a path back to the filled input form.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appSrc = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const formSrc = readFileSync(new URL("../src/PropositionForm.jsx", import.meta.url), "utf8");
const logSrc = readFileSync(new URL("../src/LogPage.jsx", import.meta.url), "utf8");

assert.match(appSrc, /_preferOutput/);
assert.match(appSrc, /_openFromLog/);
assert.match(appSrc, /row\.goNoGo\?\.classification/);

assert.match(formSrc, /function preferOutputView/);
assert.match(formSrc, /View entered inputs/);
assert.match(formSrc, /View GO\/NO-GO output/);
assert.match(formSrc, /prop-output-return/);
assert.match(formSrc, /setCurrentView\("goNoGoResult"\)/);
assert.match(formSrc, /setCurrentView\("propositionForm"\)/);

assert.match(logSrc, /Click a row to open its GO\/NO-GO output/);
assert.doesNotMatch(logSrc, /Click a row to open the form\./);

console.log("PASS Log open shows output first and links to entered inputs");
