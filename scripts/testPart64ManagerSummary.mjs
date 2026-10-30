import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildManagerApproval,
  buildManagerReviewRequest,
  canApproveManagerRole,
  canRequestManagerReview,
  postSlackWebhook,
  slackReviewPayload,
  timeAgo,
} from "../lib/managerReview.js";
import { canProceedToProofUpload } from "../lib/filterUnlock.js";
import {
  expectedBusinessImpactCopy,
  fallbackSummaryNarrative,
  generateFinalSummary,
  shouldGenerateFinalSummary,
} from "../lib/finalSummary.js";

assert.equal(canRequestManagerReview({ goNoGo: { classification: "WATCH" } }), true);
assert.equal(canRequestManagerReview({ goNoGo: { classification: "GO" } }), false);
assert.equal(canRequestManagerReview({ goNoGo: { classification: "NO-GO" } }), false);
assert.equal(
  canRequestManagerReview({
    goNoGo: { classification: "WATCH" },
    managerApproval: { comment: "ok" },
  }),
  false
);

assert.equal(canApproveManagerRole("ADMIN"), true);
assert.equal(canApproveManagerRole("BH FORUM"), true);
assert.equal(canApproveManagerRole("BM"), false);

assert.throws(() => buildManagerApproval({}, { comment: "  " }), /comment is required/i);
const approved = buildManagerApproval({ requestedAt: "2026-09-01T00:00:00.000Z" }, {
  comment: "Ship it — gaps are closeable.",
  user: { id: "u1", name: "Priya", role: "ADMIN" },
});
assert.equal(approved.comment, "Ship it — gaps are closeable.");
assert.equal(approved.managerUserId, "u1");
assert.ok(approved.approvedAt);

const requested = buildManagerReviewRequest({}, { id: "u2", name: "Dev", role: "BM" });
assert.equal(requested.requestedBy.role, "BM");
assert.ok(requested.requestedAt);

const slack = slackReviewPayload({ id: "abc", name: "Cooling oil", goNoGo: { score: { pct: 72 } } }, 72, "https://example.com");
assert.match(slack.text, /Manager review requested/);
assert.match(slack.text, /WATCH \(72%\)/);
assert.match(slack.text, /https:\/\/example.com\/propositions\/abc/);

const posted = await postSlackWebhook({ text: "hi" }, { webhookUrl: "", fetchImpl: async () => ({ ok: true }) });
assert.equal(posted.posted, false);
assert.match(posted.warning, /SLACK_WEBHOOK_URL/);

let fetchedUrl = "";
const ok = await postSlackWebhook(
  { text: "hi" },
  {
    webhookUrl: "https://hooks.slack.com/services/T000/B000/XXX",
    fetchImpl: async (url, init) => {
      fetchedUrl = url;
      assert.equal(init.method, "POST");
      return { ok: true };
    },
  }
);
assert.equal(ok.posted, true);
assert.match(fetchedUrl, /hooks\.slack\.com/);

assert.equal(timeAgo(new Date(Date.now() - 120000).toISOString(), Date.now()), "2m ago");

assert.equal(
  expectedBusinessImpactCopy(
    { f5: { householdsReachedY3Mn: 10, trialRatePct: 20, repeatConversionPct: 50, purchaseFrequencyYr: 2, avgPackValueInr: 100 } },
    12
  ),
  "₹20.0 Cr projected Year-3 revenue vs a ₹12.0 Cr division target"
);
assert.equal(expectedBusinessImpactCopy({ f5: {} }), "Revenue projection not available");

const narrative = fallbackSummaryNarrative({
  name: "Cooling oil",
  path: "WATCH, manager-approved",
  f5Summary: "₹20.0 Cr projected Year-3 revenue vs a ₹12.0 Cr division target",
  f6Result: "pass",
});
assert.match(narrative, /Cooling oil/);
assert.match(narrative, /WATCH, manager-approved/);
assert.match(narrative, /Pass/);

const summary = await generateFinalSummary(
  {
    name: "Cooling oil",
    goNoGo: { classification: "WATCH" },
    managerApproval: { comment: "ok" },
    f5: { householdsReachedY3Mn: 10, trialRatePct: 20, repeatConversionPct: 50, purchaseFrequencyYr: 2, avgPackValueInr: 100 },
    f6: { forumVerdict: "pass" },
  },
  {
    skipDivisionLookup: true,
    callNarrative: async () => "Closed-case text describing the recorded Pass.",
  }
);
assert.equal(summary.f6Result, "pass");
assert.equal(summary.path, "WATCH, manager-approved");
assert.match(summary.summaryText, /Closed-case text/);
assert.ok(summary.generatedAt);

assert.equal(shouldGenerateFinalSummary({}, { f6: { forumVerdict: "pass" } }), true);
assert.equal(shouldGenerateFinalSummary({}, { f6: { forumVerdict: "" } }), false);
assert.equal(
  shouldGenerateFinalSummary({ finalSummary: { summaryText: "locked" } }, { f6: { forumVerdict: "fail" }, finalSummary: { summaryText: "locked" } }),
  false,
  "final summary is not regenerated"
);

assert.equal(
  canProceedToProofUpload({ classification: "GO" }),
  true,
  "prompt-shaped classification on the doc root still unlocks"
);

const formSrc = readFileSync(new URL("../src/PropositionForm.jsx", import.meta.url), "utf8");
assert.match(formSrc, /Manager Review/);
assert.match(formSrc, /Approve/);
assert.match(formSrc, /Reject/);
assert.match(formSrc, /NO-GO has no manager override/);
assert.doesNotMatch(formSrc, /Manager Review[\s\S]*NO-GO" && \(/);

const apiSrc = readFileSync(new URL("../lib/managerReviewApi.js", import.meta.url), "utf8");
assert.match(apiSrc, /NO-GO has no manager-review path/);
assert.match(apiSrc, /manager-reject|handleManagerReject|decision.*reject/);
assert.match(readFileSync(new URL("../lib/managerReviewServer.js", import.meta.url), "utf8"), /sendSlackLoginCodeDm|conversations\.open|chat\.postMessage/);

console.log("PASS Part 64 WATCH manager path + F6 final summary helpers");
