import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { postSlackWebhook } from "../lib/managerReview.js";

const formSrc = readFileSync(new URL("../src/PropositionForm.jsx", import.meta.url), "utf8");
assert.doesNotMatch(formSrc, /setLocalError\(\s*data\.slackWarning/);
assert.doesNotMatch(formSrc, /setLocalError\([^)]*slackWarning/);
assert.match(formSrc, /setSlackNotice\(data\.slackWarning\)/);
assert.match(formSrc, /role="status"/);
assert.match(formSrc, /className="prop-notice"/);
assert.match(formSrc, /const \[slackNotice, setSlackNotice\]/);
assert.match(formSrc, /<Info /);

const unset = await postSlackWebhook({ text: "hi" }, { webhookUrl: "", fetchImpl: async () => ({ ok: true }) });
assert.equal(unset.posted, false);
assert.match(unset.warning, /SLACK_WEBHOOK_URL is not set/);

const posted = await postSlackWebhook(
  { text: "hi" },
  { webhookUrl: "https://hooks.slack.com/services/T/B/x", fetchImpl: async () => ({ ok: true }) }
);
assert.equal(posted.posted, true);
assert.equal(posted.warning, undefined);

assert.match(formSrc, /setLocalError\(e\.message \|\| "Could not request manager review\."\)/);
assert.match(formSrc, /role="alert"/);

const repoHits = [
  readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8"),
  formSrc,
].join("\n");
assert.doesNotMatch(repoHits, /setLocalError\([^)]*slackWarning/);

console.log("PASS Part 69 Slack warning is a notice, not an error");
