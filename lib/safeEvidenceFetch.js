/**
 * Part 131 — SSRF-safe HTTPS fetch for evidence links.
 * Resolves the host, refuses private/loopback/link-local/metadata addresses,
 * connects to the validated address, re-validates each redirect (max 3).
 */
import dns from "node:dns/promises";
import net from "node:net";
import { stripUrlQuery } from "./evidenceUrl.js";

const MAX_BYTES = 10 * 1024 * 1024;
const MAX_MS = 15_000;
const MAX_REDIRECTS = 3;

const ALLOWED_MAGIC = [
  { kind: "pdf", bytes: [0x25, 0x50, 0x44, 0x46] }, // %PDF
  { kind: "zip", bytes: [0x50, 0x4b, 0x03, 0x04] }, // docx/xlsx
  { kind: "html", text: true },
  { kind: "csv", text: true },
];

function isPrivateIpv4(ip) {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return true;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a >= 224) return true;
  return false;
}

function isPrivateIpv6(ip) {
  const s = ip.toLowerCase();
  if (s === "::1" || s === "::") return true;
  if (s.startsWith("fc") || s.startsWith("fd")) return true; // ULA
  if (s.startsWith("fe80")) return true; // link-local
  // IPv4-mapped
  const mapped = s.match(/^:[:f]*:(\d+\.\d+\.\d+\.\d+)$/i) || s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (mapped) return isPrivateIpv4(mapped[1]);
  const hexMapped = s.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
  if (hexMapped) {
    const hi = parseInt(hexMapped[1], 16);
    const lo = parseInt(hexMapped[2], 16);
    const ip4 = `${(hi >> 8) & 255}.${hi & 255}.${(lo >> 8) & 255}.${lo & 255}`;
    return isPrivateIpv4(ip4);
  }
  return false;
}

export function isBlockedAddress(ip) {
  const family = net.isIP(ip);
  if (family === 4) return isPrivateIpv4(ip);
  if (family === 6) return isPrivateIpv6(ip);
  return true;
}

export async function resolveAndValidateHost(hostname) {
  const host = String(hostname || "").trim().toLowerCase();
  if (!host) throw Object.assign(new Error("empty host"), { code: "EVIDENCE_DNS" });
  if (host === "localhost" || host.endsWith(".localhost")) {
    throw Object.assign(new Error("localhost is not allowed"), { code: "EVIDENCE_SSRF" });
  }
  if (net.isIP(host)) {
    if (isBlockedAddress(host)) {
      throw Object.assign(new Error("private address is not allowed"), { code: "EVIDENCE_SSRF" });
    }
    return [host];
  }
  let records;
  try {
    records = await dns.lookup(host, { all: true, verbatim: true });
  } catch (e) {
    throw Object.assign(new Error("could not resolve host"), { code: "EVIDENCE_DNS", cause: e });
  }
  const ips = (records || []).map((r) => r.address).filter(Boolean);
  if (!ips.length) throw Object.assign(new Error("could not resolve host"), { code: "EVIDENCE_DNS" });
  for (const ip of ips) {
    if (isBlockedAddress(ip)) {
      throw Object.assign(new Error("host resolves to a private address"), { code: "EVIDENCE_SSRF" });
    }
  }
  return ips;
}

function sniffKind(buffer, contentType = "") {
  const ct = String(contentType || "").toLowerCase();
  if (buffer.length >= 4) {
    if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) return "pdf";
    if (buffer[0] === 0x50 && buffer[1] === 0x4b) return "zip";
  }
  if (ct.includes("pdf")) return "pdf";
  if (ct.includes("wordprocessingml") || ct.includes("officedocument.word")) return "docx";
  if (ct.includes("spreadsheetml") || ct.includes("excel")) return "xlsx";
  if (ct.includes("text/csv") || ct.includes("application/csv")) return "csv";
  if (ct.includes("text/html") || ct.includes("text/plain")) return "html";
  // Heuristic text
  const sample = buffer.slice(0, 512).toString("utf8");
  if (/^\s*</.test(sample) && /html|body|div/i.test(sample)) return "html";
  if (/^[\w\s,"'.%-]+$/m.test(sample) && sample.includes(",")) return "csv";
  return null;
}

/**
 * @returns {{ buffer: Buffer, contentType: string, kind: string, finalUrl: string }}
 */
export async function safeFetchEvidenceUrl(rawUrl, { fetchImpl = fetch } = {}) {
  let current = String(rawUrl || "").trim();
  if (!current) throw Object.assign(new Error("empty URL"), { code: "EVIDENCE_URL" });

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    let u;
    try {
      u = new URL(current);
    } catch {
      throw Object.assign(new Error("invalid URL"), { code: "EVIDENCE_URL" });
    }
    if (u.protocol !== "https:") {
      throw Object.assign(new Error("only https is allowed"), { code: "EVIDENCE_URL" });
    }
    await resolveAndValidateHost(u.hostname);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), MAX_MS);
    let res;
    try {
      res = await fetchImpl(u.href, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          Accept: "application/pdf,application/vnd.openxmlformats-officedocument.*,text/*,*/*",
          "User-Agent": "PrimusEvidenceReader/1.0",
        },
      });
    } catch (e) {
      clearTimeout(timer);
      throw Object.assign(new Error("fetch failed"), { code: "EVIDENCE_FETCH", cause: e });
    }
    clearTimeout(timer);

    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const loc = res.headers.get("location");
      if (!loc) throw Object.assign(new Error("redirect without location"), { code: "EVIDENCE_FETCH" });
      if (hop === MAX_REDIRECTS) {
        throw Object.assign(new Error("too many redirects"), { code: "EVIDENCE_FETCH" });
      }
      current = new URL(loc, u).href;
      continue;
    }

    if (!res.ok) {
      throw Object.assign(new Error(`HTTP ${res.status}`), { code: "EVIDENCE_FETCH" });
    }

    const len = Number(res.headers.get("content-length") || 0);
    if (len > MAX_BYTES) {
      throw Object.assign(new Error("file exceeds 10 MB"), { code: "EVIDENCE_SIZE" });
    }

    const chunks = [];
    let total = 0;
    const reader = res.body?.getReader?.();
    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > MAX_BYTES) {
          try {
            reader.cancel();
          } catch {
            /* ignore */
          }
          throw Object.assign(new Error("file exceeds 10 MB"), { code: "EVIDENCE_SIZE" });
        }
        chunks.push(Buffer.from(value));
      }
    } else {
      const ab = await res.arrayBuffer();
      if (ab.byteLength > MAX_BYTES) {
        throw Object.assign(new Error("file exceeds 10 MB"), { code: "EVIDENCE_SIZE" });
      }
      chunks.push(Buffer.from(ab));
    }

    const buffer = Buffer.concat(chunks);
    const contentType = res.headers.get("content-type") || "";
    const kind = sniffKind(buffer, contentType);
    if (!kind) {
      throw Object.assign(new Error("unsupported content type"), { code: "EVIDENCE_TYPE" });
    }
    return {
      buffer,
      contentType,
      kind,
      finalUrl: stripUrlQuery(u.href),
    };
  }
  throw Object.assign(new Error("too many redirects"), { code: "EVIDENCE_FETCH" });
}

export const _test = { isPrivateIpv4, isPrivateIpv6, sniffKind, ALLOWED_MAGIC };
