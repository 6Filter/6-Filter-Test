/**
 * Browser-safe expected-time estimates for Submit → research → GO/NO-GO.
 * Full research can run to the 180s PUT timeout; GO/NO-GO is a second call.
 */

export const RESEARCH_PROCESS_MS = 150000;
export const SAVE_PROCESS_MS = 50000;

export function expectedProcessMs({ forceResearch, researchRunAt, ideaChanged } = {}) {
  if (forceResearch || !researchRunAt || ideaChanged) return RESEARCH_PROCESS_MS;
  return SAVE_PROCESS_MS;
}

export function formatCountdown(remainingMs) {
  const sec = Math.max(0, Math.ceil(Number(remainingMs) / 1000));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function processTimerCopy({ elapsedMs, expectedMs } = {}) {
  const elapsed = Math.max(0, Number(elapsedMs) || 0);
  const expected = Math.max(0, Number(expectedMs) || 0);
  const remaining = expected - elapsed;
  if (remaining > 0) {
    return {
      status: "counting",
      remainingLabel: formatCountdown(remaining),
      text: `About ${formatCountdown(remaining)} left`,
    };
  }
  return {
    status: "overtime",
    remainingLabel: "Finishing…",
    text: "Finishing…",
  };
}
