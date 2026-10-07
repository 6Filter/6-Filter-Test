/** Exact phrase Master must type before a log-wide delete. */
export function deleteAllConfirmPhrase(count) {
  const n = Number(count);
  const rows = Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
  return `DELETE ALL ${rows}`;
}

export function deleteAllPhraseMatches(typed, count) {
  return String(typed || "") === deleteAllConfirmPhrase(count);
}
