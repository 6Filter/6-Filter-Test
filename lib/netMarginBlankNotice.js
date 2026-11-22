/**
 * Display-only: the Filter 2 net-margin box is not Required and is hidden behind
 * "Adjust cost and margin". When it is blank the locked margin check earns nothing.
 * This module never writes netMarginAtScale and never changes scoring.
 */

export const NET_MARGIN_BLANK_NOTICE =
  "Net margin is not filled in. Filter 2's margin check earns nothing until you enter it (Adjust cost and margin).";

export function netMarginIsBlank(f2 = {}) {
  return f2 == null || f2.netMarginAtScale == null || String(f2.netMarginAtScale).trim() === "";
}

/** Empty string when the box has a value, so the caller can render nothing. */
export function netMarginBlankNotice(f2 = {}) {
  return netMarginIsBlank(f2) ? NET_MARGIN_BLANK_NOTICE : "";
}
