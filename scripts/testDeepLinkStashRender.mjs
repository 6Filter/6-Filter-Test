/**
 * Login / team-gate render must not call undefined deep-link helpers
 * (ReferenceError: *epLinkIdeaId / takeStashedDeepLinkIdeaId).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
assert.doesNotMatch(app, /takeStashedDeepLinkIdeaId/);
assert.doesNotMatch(app, /stashDeepLinkIdeaId/);
assert.match(app, /stashReturnIdea/);
assert.match(app, /readStashedReturnIdea/);
assert.match(
  app,
  /if \(!authRequired \|\| sessionUser\) return;[\s\S]*stashReturnIdea\(loc\.ideaId\)/
);

console.log("PASS testDeepLinkStashRender — login gate uses stashReturnIdea only");
