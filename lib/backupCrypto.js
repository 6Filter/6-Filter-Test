/**
 * AES-256-GCM helpers for off-platform backups. Never log the key or token.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";

const MAGIC = Buffer.from("PRIMUSBK1");

export function parseBackupEncryptionKey(raw = process.env.BACKUP_ENCRYPTION_KEY) {
  const s = String(raw || "").trim();
  if (!s) {
    const err = new Error("BACKUP_ENCRYPTION_KEY is not set.");
    err.status = 503;
    throw err;
  }
  let key;
  if (/^[0-9a-fA-F]{64}$/.test(s)) key = Buffer.from(s, "hex");
  else {
    try {
      key = Buffer.from(s, "base64");
    } catch {
      key = null;
    }
  }
  if (!key || key.length !== 32) {
    const err = new Error("BACKUP_ENCRYPTION_KEY must be 32 bytes (64 hex chars or base64).");
    err.status = 503;
    throw err;
  }
  return key;
}

export function backupTokenMatches(presented, expected = process.env.BACKUP_TOKEN) {
  const left = Buffer.from(String(presented || ""), "utf8");
  const right = Buffer.from(String(expected || ""), "utf8");
  if (!expected || !presented) {
    // Still run a compare against equal-length fillers so timing is less informative.
    const filler = Buffer.alloc(32, 0);
    timingSafeEqual(filler, filler);
    return false;
  }
  if (left.length !== right.length) {
    const filler = Buffer.alloc(right.length, 0);
    try {
      timingSafeEqual(left.length < right.length ? Buffer.concat([left, Buffer.alloc(right.length - left.length)]) : left.subarray(0, right.length), filler);
    } catch {
      /* ignore */
    }
    return false;
  }
  return timingSafeEqual(left, right);
}

export function sha256Hex(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

/**
 * @param {Buffer|string} plaintextGzip
 * @param {object} manifest
 * @returns {Buffer}
 */
export function encryptBackupPayload(plaintextGzip, manifest, key = parseBackupEncryptionKey()) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const plain = Buffer.isBuffer(plaintextGzip) ? plaintextGzip : Buffer.from(plaintextGzip);
  const enc = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  const meta = Buffer.from(
    JSON.stringify({
      ...manifest,
      iv: iv.toString("base64"),
      tag: tag.toString("base64"),
      sha256: sha256Hex(plain),
      alg: "aes-256-gcm",
      encoding: "gzip+jsonl",
    }),
    "utf8"
  );
  // PRIMUSBK1 | u32 metaLen | meta json | ciphertext
  const header = Buffer.alloc(4);
  header.writeUInt32BE(meta.length, 0);
  return Buffer.concat([MAGIC, header, meta, enc]);
}

export function decryptBackupPayload(blob, key = parseBackupEncryptionKey()) {
  const buf = Buffer.isBuffer(blob) ? blob : Buffer.from(blob);
  if (buf.length < MAGIC.length + 4 || !buf.subarray(0, MAGIC.length).equals(MAGIC)) {
    throw new Error("Not a Primus encrypted backup.");
  }
  const metaLen = buf.readUInt32BE(MAGIC.length);
  const metaStart = MAGIC.length + 4;
  const metaEnd = metaStart + metaLen;
  const meta = JSON.parse(buf.subarray(metaStart, metaEnd).toString("utf8"));
  const iv = Buffer.from(meta.iv, "base64");
  const tag = Buffer.from(meta.tag, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const cipherText = buf.subarray(metaEnd);
  const plain = Buffer.concat([decipher.update(cipherText), decipher.final()]);
  if (meta.sha256 && meta.sha256 !== sha256Hex(plain)) {
    throw new Error("Backup SHA-256 mismatch.");
  }
  const jsonl = gunzipSync(plain).toString("utf8");
  return { manifest: meta, jsonl, gzip: plain };
}

export function gzipJsonLines(lines) {
  const body = lines.map((line) => (typeof line === "string" ? line : JSON.stringify(line))).join("\n") + "\n";
  return gzipSync(Buffer.from(body, "utf8"));
}
