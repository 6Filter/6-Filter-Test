/**
 * SSRF-safe fetch for citation audits (shared groundwork for Part 142 evidence reads).
 * HTTPS only, private/loopback/link-local/metadata addresses refused, timeout and size cap.
 * Reuses lib/safeEvidenceFetch.js for the address checks.
 *
 * Never follows a redirect onto a private host. Inject fetchImpl in tests — DNS is then
 * skipped so tests need no network, but the URL host is still checked.
 */
import net from "node:net";
import { isBlockedAddress, resolveAndValidateHost } from "../../lib/safeEvidenceFetch.js";

export const EVAL_FETCH_MAX_BYTES = 1_000_000;
export const EVAL_FETCH_TIMEOUT_MS = 10_000;
export const EVAL_FETCH_MAX_REDIRECTS = 3;

function isLocalHostname(host) {
  const h = String(host || "")
    .trim()
    .toLowerCase();
  return h === "localhost" || h.endsWith(".localhost") || h === "metadata.google.internal";
}

export function assertPublicHttpsUrl(rawUrl) {
  let u;
  try {
    u = new URL(String(rawUrl || "").trim());
  } catch {
    const err = new Error("invalid URL");
    err.code = "EVAL_URL";
    throw err;
  }
  if (u.protocol !== "https:") {
    const err = new Error("only https is allowed");
    err.code = "EVAL_URL";
    throw err;
  }
  if (isLocalHostname(u.hostname)) {
    const err = new Error("private address is not allowed");
    err.code = "EVAL_SSRF";
    throw err;
  }
  if (net.isIP(u.hostname) && isBlockedAddress(u.hostname)) {
    const err = new Error("private address is not allowed");
    err.code = "EVAL_SSRF";
    throw err;
  }
  return u;
}

function htmlToText(raw) {
  return String(raw || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

async function readLimitedBody(res, maxBytes) {
  const len = Number(res.headers?.get?.("content-length") || 0);
  if (len > maxBytes) {
    const err = new Error(`response exceeds ${maxBytes} bytes`);
    err.code = "EVAL_SIZE";
    throw err;
  }
  const reader = res.body?.getReader?.();
  if (!reader) {
    const ab = await res.arrayBuffer();
    if (ab.byteLength > maxBytes) {
      const err = new Error(`response exceeds ${maxBytes} bytes`);
      err.code = "EVAL_SIZE";
      throw err;
    }
    return Buffer.from(ab);
  }
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      try {
        reader.cancel();
      } catch {
        /* ignore */
      }
      const err = new Error(`response exceeds ${maxBytes} bytes`);
      err.code = "EVAL_SIZE";
      throw err;
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

/**
 * @returns {{ buffer: Buffer, text: string, contentType: string, finalUrl: string, status: number }}
 */
export async function safeFetchPublicUrl(
  rawUrl,
  {
    fetchImpl = fetch,
    timeoutMs = EVAL_FETCH_TIMEOUT_MS,
    maxBytes = EVAL_FETCH_MAX_BYTES,
    skipDns = false,
  } = {}
) {
  let current = String(rawUrl || "").trim();
  for (let hop = 0; hop <= EVAL_FETCH_MAX_REDIRECTS; hop += 1) {
    const u = assertPublicHttpsUrl(current);
    if (!skipDns) {
      await resolveAndValidateHost(u.hostname);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res;
    try {
      res = await fetchImpl(u.href, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          Accept: "text/html,text/plain,application/json,*/*",
          "User-Agent": "PrimusEvalCitationAudit/1.0",
        },
      });
    } catch (e) {
      clearTimeout(timer);
      const err = new Error("fetch failed");
      err.code = e?.name === "AbortError" ? "EVAL_TIMEOUT" : "EVAL_FETCH";
      err.cause = e;
      throw err;
    }
    clearTimeout(timer);

    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const loc = res.headers.get("location");
      if (!loc) {
        const err = new Error("redirect without location");
        err.code = "EVAL_FETCH";
        throw err;
      }
      if (hop === EVAL_FETCH_MAX_REDIRECTS) {
        const err = new Error("too many redirects");
        err.code = "EVAL_FETCH";
        throw err;
      }
      current = new URL(loc, u).href;
      continue;
    }

    if (!res.ok) {
      const err = new Error(`HTTP ${res.status}`);
      err.code = "EVAL_FETCH";
      err.status = res.status;
      throw err;
    }

    const buffer = await readLimitedBody(res, maxBytes);
    const contentType = res.headers.get("content-type") || "";
    const rawText = buffer.toString("utf8");
    const text = /html/i.test(contentType) || /^\s*</.test(rawText) ? htmlToText(rawText) : rawText;
    return {
      buffer,
      text,
      contentType,
      finalUrl: u.href,
      status: res.status,
    };
  }
  const err = new Error("too many redirects");
  err.code = "EVAL_FETCH";
  throw err;
}

export { isBlockedAddress };
