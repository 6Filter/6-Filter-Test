const NAMES = {
  f1: "Filter 1",
  f2: "Filter 2",
  f3: "Filter 3",
  f4: "Filter 4",
  f5: "Filter 5",
};

export function retryStepCostPreview(filterKey) {
  const label = NAMES[filterKey];
  if (!label) return "";
  return (
    `Re-run only ${label}. The other filters are not called again. ` +
    "One model call is billed to your team at list price: input $3/MTok, output $15/MTok, " +
    "cache write $3.75/MTok, cache read $0.30/MTok, web search $10/1,000."
  );
}

export function checkNeedsResearchRetry(check) {
  return (check?.items || []).some((item) => /Research failed — retry/.test(String(item?.text || "")));
}
