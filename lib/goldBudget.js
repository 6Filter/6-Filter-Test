/**
 * List-price quote for the gold harness. Not a Console invoice.
 * Input $3/MTok, output $15/MTok, cache read $0.30/MTok, cache write $3.75/MTok,
 * web search $10 / 1,000. Confirm in the Anthropic Console before spending.
 */
export const GOLD_LIST_PRICE = {
  inputPerMtok: 3,
  outputPerMtok: 15,
  cacheReadPerMtok: 0.3,
  cacheWritePerMtok: 3.75,
  searchPerThousand: 10,
};

export function usdFromUsage({
  inputTokens = 0,
  outputTokens = 0,
  cacheRead = 0,
  cacheWrite = 0,
  searches = 0,
} = {}) {
  const p = GOLD_LIST_PRICE;
  return (
    (Number(inputTokens) / 1e6) * p.inputPerMtok +
    (Number(outputTokens) / 1e6) * p.outputPerMtok +
    (Number(cacheRead) / 1e6) * p.cacheReadPerMtok +
    (Number(cacheWrite) / 1e6) * p.cacheWritePerMtok +
    (Number(searches) / 1000) * p.searchPerThousand
  );
}

export function harnessQuoteFromMeasurement(measurement, { ideas = 10, baselines = 2, candidates = 1 } = {}) {
  const perRun = usdFromUsage(measurement);
  const runs = ideas * (baselines + candidates);
  return { ideas, baselines, candidates, runs, perRunUsd: perRun, usd: perRun * runs };
}

export function readGoldBudgetCap(env = process.env) {
  const raw = env.GOLD_SET_MAX_USD;
  if (raw == null || String(raw).trim() === "") {
    throw new Error("GOLD_SET_MAX_USD is required and has no default.");
  }
  const cap = Number(raw);
  if (!Number.isFinite(cap) || cap <= 0) {
    throw new Error("GOLD_SET_MAX_USD must be a positive number of US dollars.");
  }
  return cap;
}

export function shouldAbortGoldRun(spentUsd, capUsd) {
  return Number(spentUsd) > Number(capUsd);
}
