import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { deleteAllConfirmPhrase, deleteAllPhraseMatches } from "../lib/deleteAllConfirm.js";

assert.equal(deleteAllConfirmPhrase(32), "DELETE ALL 32");
assert.equal(deleteAllPhraseMatches("DELETE ALL 32", 32), true);
assert.equal(deleteAllPhraseMatches("delete all 32", 32), false);
assert.equal(deleteAllPhraseMatches("DELETE ALL 31", 32), false);

const api = readFileSync(new URL("../lib/propositionsApi.js", import.meta.url), "utf8");
const page = readFileSync(new URL("../src/LogPage.jsx", import.meta.url), "utf8");
assert.match(api, /\[primus\/audit\] delete-all by=Master rows=/);
assert.match(page, /DELETE ALL/);
assert.match(page, /Export all/);
assert.match(page, /onDeleteAll\(phrase\)/);

console.log("PASS delete-all requires the typed phrase and writes an audit line");
