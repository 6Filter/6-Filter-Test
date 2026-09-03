/** Browser-safe copy. Infrastructure failure must not read like a completed search. */
export const RESEARCH_FAILED_COPY = "Research failed — retry";
export const BENCHMARK_UNVERIFIED_COPY =
  "Searched and found no verifiable competitive presence for this benchmark";

export function deniesBenchmarkExistence(text) {
  return /no verifiable|could not verify|could not be verified|not currently.?selling|no currently-selling|not found as a competitor|no listing|first-of-its-kind/i.test(
    String(text || "")
  );
}

export function isAttributePlaceholderCopy(text) {
  return /name the purchase-decision attribute|name a credible benchmark competitor/i.test(
    String(text || "")
  );
}
