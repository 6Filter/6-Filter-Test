/**
 * WATCH → business head can override the displayed verdict to GO or NO-GO.
 */
import assert from "node:assert/strict";
import { classificationOf } from "../lib/logStatus.js";
import {
  buildManagerApproval,
  buildManagerNoGoOverride,
  canRequestManagerReview,
} from "../lib/managerReview.js";

const watchDoc = {
  goNoGo: { classification: "WATCH", score: { pct: 72, total: 18 } },
};

assert.equal(classificationOf(watchDoc), "WATCH");
assert.equal(canRequestManagerReview(watchDoc), true);

const go = buildManagerApproval(watchDoc.managerReview || {}, {
  comment: "Exception cleared for launch trial",
  user: { id: "bh", name: "Sridhar", email: "sridhar.r@cavinkare.com", role: "BH FORUM" },
  overrideClassification: "GO",
});
assert.equal(go.overrideClassification, "GO");
assert.equal(
  classificationOf({ ...watchDoc, managerApproval: go, managerReview: go }),
  "GO"
);
assert.equal(canRequestManagerReview({ ...watchDoc, managerApproval: go, managerReview: go }), false);

const nogo = buildManagerNoGoOverride(watchDoc.managerReview || {}, {
  comment: "Still below the commercial bar for this pack",
  user: { id: "bh", name: "Sridhar", email: "sridhar.r@cavinkare.com", role: "BH FORUM" },
});
assert.equal(nogo.overrideClassification, "NO-GO");
assert.equal(
  classificationOf({ ...watchDoc, managerReview: nogo }),
  "NO-GO"
);
assert.equal(canRequestManagerReview({ ...watchDoc, managerReview: nogo }), false);

const formSrc = await import("node:fs").then((fs) =>
  fs.readFileSync(new URL("../src/PropositionForm.jsx", import.meta.url), "utf8")
);
assert.match(formSrc, /gonogo-verdict-main/);
assert.match(formSrc, /Override to GO/);
assert.match(formSrc, /Override to NO-GO/);
assert.match(formSrc, /Ask business head to override/);

console.log("PASS testWatchOverride");
