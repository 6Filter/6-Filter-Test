/**
 * Honest Submit feedback — plain words next to the button, and the server decision shape.
 * No scoring. Browser-safe (no Node-only APIs).
 */

const REASON_PLAIN = {
  same_inputs_and_level: "the inputs and the level are the same as the last screening",
  seal_reused: "a stored result for this level was reused",
  unfinished_research: "research did not finish",
  already_running: "a search is already in progress",
  missing_required: "a required box is still blank",
  missing_identity: "your team is not confirmed yet",
  invalid_input: "an answer is invalid",
  credit_exhausted: "the team has run out of AI credit",
  cancelled_confirm: "you cancelled the confirm step",
  save_failed: "the save did not finish",
};

function formatWhen(iso) {
  if (!iso) return "just now";
  try {
    return new Date(iso).toLocaleString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Kolkata",
    });
  } catch {
    return "just now";
  }
}

/** Running copy shown within one second of a press. */
export const SCREENING_BUSY_MESSAGE =
  "Screening… this takes about 2 to 3 minutes. You can leave this page.";

/**
 * Build the one visible line next to Submit / Screen action.
 * Outcomes: blocked | changed | unchanged | error | running
 */
export function screenFeedbackMessage(input = {}) {
  const outcome = String(input.outcome || "").trim();
  if (outcome === "running") return SCREENING_BUSY_MESSAGE;

  if (outcome === "blocked") {
    const code = String(input.reasonCode || "").trim();
    let reason =
      String(input.reasonPlain || "").trim() ||
      REASON_PLAIN[code] ||
      "this press could not start";
    reason = reason.replace(/\.$/, "");
    const box = String(input.fieldLabel || "").trim();
    if (code === "already_running") {
      return "Not started: a search is already in progress. Wait for it to finish.";
    }
    if (box) return `Not started: ${reason}. Fix: ${box}.`;
    return `Not started: ${reason}.`;
  }

  if (outcome === "error") {
    const plain = String(input.reasonPlain || input.message || "Something went wrong.").trim();
    return plain.replace(/\s+/g, " ");
  }

  const when = formatWhen(input.screenedAt);
  const level = Number(input.level) || 1;
  const fromPct = Number(input.fromPct);
  const toPct = Number(input.toPct);
  const fromVerdict = String(input.fromVerdict || "").trim() || "—";
  const toVerdict = String(input.toVerdict || "").trim() || "—";
  const scoreBit =
    Number.isFinite(fromPct) && Number.isFinite(toPct)
      ? `Score ${fromPct}% to ${toPct}%`
      : "Score unchanged";
  const verdictBit = `verdict ${fromVerdict} to ${toVerdict}`;

  if (outcome === "changed") {
    return `Screened at ${when} at Level ${level}. ${scoreBit}, ${verdictBit}.`;
  }

  if (outcome === "unchanged") {
    const code = String(input.reasonCode || "same_inputs_and_level").trim();
    let why = REASON_PLAIN[code] || "nothing new was found";
    if (code === "unfinished_research") {
      const step = String(input.unfinishedStep || "").trim();
      why = step
        ? `research did not finish (${step})`
        : "research did not finish";
    }
    return `Screened at ${when} at Level ${level}. Nothing changed because ${why}.`;
  }

  return String(input.reasonPlain || "").trim() || "";
}

/** Compact decision object returned on every screen request. */
export function buildScreenDecision({
  ideaId = "",
  level = 1,
  inputsKeyChanged = false,
  levelChanged = false,
  sealReused = false,
  forceResearch = false,
  outcome = "ran",
  reasonCode = "",
  ms = 0,
  unfinishedStep = "",
  field = "",
} = {}) {
  return {
    ideaId: String(ideaId || ""),
    level: Number(level) || 1,
    inputsKeyChanged: Boolean(inputsKeyChanged),
    levelChanged: Boolean(levelChanged),
    sealReused: Boolean(sealReused),
    forceResearch: Boolean(forceResearch),
    outcome: String(outcome || "ran"),
    reasonCode: String(reasonCode || ""),
    unfinishedStep: String(unfinishedStep || ""),
    field: String(field || ""),
    ms: Math.max(0, Number(ms) || 0),
    at: new Date().toISOString(),
  };
}

/** One log line — idea id only, never proposition text. */
export function formatScreenDecisionLog(decision = {}) {
  const d = decision && typeof decision === "object" ? decision : {};
  return [
    "[primus/screen-decision]",
    `ideaId=${d.ideaId || ""}`,
    `level=${d.level ?? ""}`,
    `inputsKeyChanged=${Boolean(d.inputsKeyChanged)}`,
    `levelChanged=${Boolean(d.levelChanged)}`,
    `sealReused=${Boolean(d.sealReused)}`,
    `forceResearch=${Boolean(d.forceResearch)}`,
    `outcome=${d.outcome || ""}`,
    `reasonCode=${d.reasonCode || ""}`,
    `ms=${d.ms ?? 0}`,
  ].join(" ");
}

export function logScreenDecision(decision) {
  console.log(formatScreenDecisionLog(decision));
}
