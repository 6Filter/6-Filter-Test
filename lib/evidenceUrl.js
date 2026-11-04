/**
 * Part 131 — evidence link sanitising and SharePoint classification.
 * Never logs or stores a link's query string (SharePoint ?e= tokens).
 */

const SHAREPOINT_HOST =
  /(^|\.)sharepoint\.com$/i;

export function stripUrlQuery(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  try {
    const u = new URL(s);
    return `${u.origin}${u.pathname}`;
  } catch {
    return s.split("?")[0].split("#")[0];
  }
}

export function evidenceLinkHostPath(raw) {
  const clean = stripUrlQuery(raw);
  if (!clean) return { host: "", path: "", display: "" };
  try {
    const u = new URL(clean);
    return { host: u.hostname, path: u.pathname, display: `${u.hostname}${u.pathname}` };
  } catch {
    return { host: "", path: clean, display: clean };
  }
}

export function isSharePointHost(hostname) {
  const h = String(hostname || "").toLowerCase();
  if (!h) return false;
  if (SHAREPOINT_HOST.test(h)) return true;
  if (/-my\.sharepoint\.com$/i.test(h)) return true;
  return false;
}

export function sharepointAllowedPrefix() {
  return String(process.env.EVIDENCE_SHAREPOINT_ALLOWED_PREFIX || "").trim();
}

export function linkInsidePrimusEvidenceLibrary(raw) {
  const prefix = sharepointAllowedPrefix();
  if (!prefix) return false;
  const clean = stripUrlQuery(raw).toLowerCase();
  const pref = stripUrlQuery(prefix).toLowerCase();
  return Boolean(clean && pref && clean.startsWith(pref));
}

export function classifyEvidenceLink(raw) {
  const s = String(raw || "").trim();
  if (!s) return { ok: false, reason: "empty", advice: "" };
  let u;
  try {
    u = new URL(s);
  } catch {
    return {
      ok: false,
      reason: "invalid URL",
      advice: "Paste a full https:// link, or upload the file.",
      url: "",
    };
  }
  if (u.protocol !== "https:") {
    return {
      ok: false,
      reason: `${u.protocol.replace(":", "")} links are not allowed`,
      advice: "Use https only, or upload the file.",
      url: stripUrlQuery(s),
    };
  }
  const host = u.hostname;
  if (isSharePointHost(host)) {
    if (linkInsidePrimusEvidenceLibrary(s)) {
      return { ok: true, kind: "sharepoint-library", url: stripUrlQuery(s), host, path: u.pathname };
    }
    return {
      ok: false,
      kind: "sharepoint-other",
      reason: "SharePoint link is outside the Primus Evidence library",
      advice:
        "SharePoint links can only be read from the Primus Evidence library. Upload the file instead.",
      url: stripUrlQuery(s),
      host,
      path: u.pathname,
    };
  }
  return { ok: true, kind: "https", url: stripUrlQuery(s), host, path: u.pathname };
}
