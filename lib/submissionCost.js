import { AsyncLocalStorage } from "node:async_hooks";

const store = new AsyncLocalStorage();

function emptyBag(propositionId) {
  return {
    propositionId: propositionId || "",
    calls: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheRead: 0,
    cacheWrite: 0,
    searches: 0,
    byLabel: {},
    events: [],
  };
}

export function openSubmissionCost(propositionId) {
  const bag = emptyBag(propositionId);
  store.enterWith(bag);
  return bag;
}

export function currentSubmissionCost() {
  return store.getStore() || null;
}

export function noteSubmissionUsage({
  label = "unlabeled",
  inputTokens = 0,
  outputTokens = 0,
  cacheRead = 0,
  cacheWrite = 0,
  searches = 0,
  prefixHash = "",
  startedAt = "",
  endedAt = "",
} = {}) {
  const bag = store.getStore();
  if (!bag) return;
  bag.events.push({
    label: String(label || "unlabeled"),
    prefixHash: String(prefixHash || ""),
    cacheRead,
    cacheWrite,
    inputTokens,
    outputTokens,
    searches,
    startedAt: String(startedAt || ""),
    endedAt: String(endedAt || ""),
  });
  bag.calls += 1;
  bag.inputTokens += inputTokens;
  bag.outputTokens += outputTokens;
  bag.cacheRead += cacheRead;
  bag.cacheWrite += cacheWrite;
  bag.searches += searches;
  const key = String(label || "unlabeled");
  const row = bag.byLabel[key] || { calls: 0, in: 0, out: 0, cache_read: 0, cache_write: 0, searches: 0 };
  row.calls += 1;
  row.in += inputTokens;
  row.out += outputTokens;
  row.cache_read += cacheRead;
  row.cache_write += cacheWrite;
  row.searches += searches;
  bag.byLabel[key] = row;
}

export function formatCostLine(bag) {
  const row = bag || emptyBag("");
  return (
    `[primus/cost] proposition=${row.propositionId || "(none)"} calls=${row.calls} ` +
    `in=${row.inputTokens} out=${row.outputTokens} cache_read=${row.cacheRead} ` +
    `searches=${row.searches} by_label=${JSON.stringify(row.byLabel)}`
  );
}

export function closeSubmissionCost() {
  const bag = store.getStore();
  if (!bag || bag.closed) return null;
  bag.closed = true;
  const line = formatCostLine(bag);
  console.log(line);
  store.enterWith(undefined);
  return line;
}
