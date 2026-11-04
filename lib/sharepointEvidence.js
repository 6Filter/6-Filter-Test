/**
 * Part 131 D10 — read evidence only from the Primus Evidence SharePoint library
 * via Microsoft Graph app-only (Sites.Selected). Never fetch SharePoint anonymously.
 */
import { linkInsidePrimusEvidenceLibrary, stripUrlQuery, isSharePointHost } from "./evidenceUrl.js";

function graphConfigured() {
  return Boolean(
    String(process.env.MS_TENANT_ID || "").trim() &&
      String(process.env.MS_CLIENT_ID || "").trim() &&
      String(process.env.MS_CLIENT_SECRET || "").trim() &&
      String(process.env.EVIDENCE_SHAREPOINT_ALLOWED_PREFIX || "").trim()
  );
}

async function graphToken({ fetchImpl = fetch } = {}) {
  const tenant = String(process.env.MS_TENANT_ID || "").trim();
  const clientId = String(process.env.MS_CLIENT_ID || "").trim();
  const clientSecret = String(process.env.MS_CLIENT_SECRET || "").trim();
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  });
  const res = await fetchImpl(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    throw Object.assign(new Error("SharePoint token request failed"), { code: "EVIDENCE_GRAPH" });
  }
  const json = await res.json();
  if (!json.access_token) {
    throw Object.assign(new Error("SharePoint token missing"), { code: "EVIDENCE_GRAPH" });
  }
  return json.access_token;
}

/**
 * Resolve a library link to file bytes through Graph.
 * Prefer shares endpoint; fall back to site + path when shares is unavailable under Sites.Selected.
 */
export async function fetchSharePointEvidence(rawUrl, { fetchImpl = fetch } = {}) {
  const clean = stripUrlQuery(rawUrl);
  let host = "";
  try {
    host = new URL(clean).hostname;
  } catch {
    return {
      ok: false,
      reason: "invalid SharePoint URL",
      advice: "Upload the file instead.",
      url: clean,
    };
  }
  if (!isSharePointHost(host)) {
    return { ok: false, reason: "not a SharePoint host", advice: "Upload the file instead.", url: clean };
  }
  if (!linkInsidePrimusEvidenceLibrary(rawUrl)) {
    return {
      ok: false,
      reason: "SharePoint link is outside the Primus Evidence library",
      advice:
        "SharePoint links can only be read from the Primus Evidence library. Upload the file instead.",
      url: clean,
    };
  }
  if (!graphConfigured()) {
    return {
      ok: false,
      reason: "SharePoint Graph is not configured",
      advice:
        "SharePoint links can only be read from the Primus Evidence library. Upload the file instead.",
      url: clean,
    };
  }

  const token = await graphToken({ fetchImpl });
  const shareId = Buffer.from(clean, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

  // Route: shares endpoint first
  let itemRes = await fetchImpl(`https://graph.microsoft.com/v1.0/shares/u!${shareId}/driveItem`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!itemRes.ok) {
    // Fallback: parse server-relative path from the link
    const u = new URL(clean);
    const pathMatch = u.pathname.match(/\/sites\/([^/]+)(\/.*)?$/i);
    if (!pathMatch) {
      return {
        ok: false,
        reason: "could not resolve SharePoint item",
        advice: "Upload the file instead.",
        url: clean,
      };
    }
    const sitePath = `/sites/${pathMatch[1]}`;
    const siteRes = await fetchImpl(
      `https://graph.microsoft.com/v1.0/sites/${u.hostname}:${sitePath}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!siteRes.ok) {
      return {
        ok: false,
        reason: "could not resolve SharePoint site",
        advice: "Upload the file instead.",
        url: clean,
      };
    }
    const site = await siteRes.json();
    const rel = decodeURIComponent(u.pathname.replace(/^\/sites\/[^/]+/i, "") || "/");
    itemRes = await fetchImpl(
      `https://graph.microsoft.com/v1.0/sites/${site.id}/drive/root:${rel}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
  }

  if (!itemRes.ok) {
    return {
      ok: false,
      reason: "SharePoint item not found",
      advice: "Upload the file instead.",
      url: clean,
    };
  }
  const item = await itemRes.json();
  const downloadUrl =
    item["@microsoft.graph.downloadUrl"] ||
    (item.id
      ? `https://graph.microsoft.com/v1.0/drives/${item.parentReference?.driveId}/items/${item.id}/content`
      : null);
  if (!downloadUrl) {
    return {
      ok: false,
      reason: "SharePoint download URL missing",
      advice: "Upload the file instead.",
      url: clean,
    };
  }
  const contentRes = await fetchImpl(downloadUrl, {
    headers: downloadUrl.includes("graph.microsoft.com")
      ? { Authorization: `Bearer ${token}` }
      : undefined,
  });
  if (!contentRes.ok) {
    return {
      ok: false,
      reason: "SharePoint content download failed",
      advice: "Upload the file instead.",
      url: clean,
    };
  }
  const ab = await contentRes.arrayBuffer();
  return {
    ok: true,
    buffer: Buffer.from(ab),
    name: item.name || "sharepoint-evidence",
    mime: item.file?.mimeType || "",
    url: clean,
  };
}
