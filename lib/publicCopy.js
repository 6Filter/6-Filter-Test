/** Hide internal “Filter N” jargon from user-facing copy. Keeps the product name. */
export function hideFilterTalk(value) {
  const token = "\u00006FILTERTEST\u0000";
  let text = String(value ?? "");
  if (!text) return "";
  text = text.replace(/6\s*Filter\s*Test/gi, token);
  text = text
    .replace(/\bFilter\s*1\b/gi, "Opportunity to grow")
    .replace(/\bFilter\s*2\b/gi, "Net margin")
    .replace(/\bFilter\s*3\b/gi, "Price resilience")
    .replace(/\bFilter\s*4\b/gi, "Tech & habit shift")
    .replace(/\bFilter\s*5\b/gi, "the next lab check")
    .replace(/\bFilter\s*6\b/gi, "the lab/consumer panel")
    .replace(/\bthis filter\b/gi, "this check")
    .replace(/\bthe filter\b/gi, "this check")
    .replace(/\bfailed filter\b/gi, "failed check")
    .replace(/\bfilter notes\b/gi, "notes")
    .replace(/\bfilter details\b/gi, "details")
    .replace(/\bfilters\b/gi, "checks")
    .replace(/\bfilter\b/gi, "check");
  return text.replaceAll(token, "6 Filter Test");
}
