/**
 * Score explanation generated from the locked bands and the search budget.
 * The results page and docs/HOW_THE_SCORE_WORKS.md both render this text.
 */
import { GONOGO_SCORE_BANDS } from "./lockedConstants.js";
import { EXACT_CATEGORY_MATCH_MAX_USES, RESEARCH_STEP_SEARCH_BUDGET } from "./searchBudget.js";

export function scoreExplainerSections() {
  const nogo = GONOGO_SCORE_BANDS.NOGO_MAX;
  const watch = GONOGO_SCORE_BANDS.WATCH_MAX;
  const perStep = RESEARCH_STEP_SEARCH_BUDGET;
  const exact = EXACT_CATEGORY_MATCH_MAX_USES;
  return [
    {
      heading: "What the percent is",
      body:
        "The percent is the share of Filter 1 to Filter 4 checks that are complete for this idea. " +
        "Filters 5 and 6 are not in the percent. Filter 6 is validation only.",
    },
    {
      heading: "Hard stops",
      body:
        "A hard stop is applied first. A filter below a non-negotiable floor forces NO-GO, whatever the percent. " +
        "A filter that has not run, or whose research failed, keeps the idea INCOMPLETE (not a GO/WATCH/NO-GO band) until Filter 1–4 finish — unless a floor failure already forced NO-GO.",
    },
    {
      heading: "Bands",
      body:
        `After the hard stops, complete ideas band as: GO above ${watch}, WATCH ${nogo} to ${watch}, and NO-GO below ${nogo}. ` +
        "INCOMPLETE ideas still show the percent and checks-complete count, but are not banded.",
    },
    {
      heading: "Where numbers come from",
      body:
        "Research looks for a publicly cited Nielsen or Kantar figure first, then category engines, then a public proxy. " +
        "A local Nielsen or Kantar row is used only when that category has been loaded. There is no live Nielsen or Kantar feed.",
    },
    {
      heading: "Searches",
      body:
        `Each research step may run up to ${perStep} web searches. ` +
        `That budget is ${exact} when both a local Nielsen row and a local Kantar row match the exact category. ` +
        "The verdict sentence and the improvement list do not search. " +
        "Submitting the same idea again reuses the saved research.",
    },
    {
      heading: "Points to improve",
      body:
        "The improvement list is only the checks still open on this idea. " +
        "Each open check is an equal share of the remaining points, and the field owner is named.",
    },
  ];
}

export function scoreExplainerMarkdown() {
  const lines = ["# How the score works", ""];
  for (const section of scoreExplainerSections()) {
    lines.push(`## ${section.heading}`, "", section.body, "");
  }
  return lines.join("\n");
}
