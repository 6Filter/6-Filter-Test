/**
 * Per-team Anthropic API keys (AES-256-GCM), billed from the verified session.
 *
 * Every default team can have its own stored key. R&D, CIA, Marketing and NPD can also
 * be set with DEPT_API_KEY_*. Any other team with no stored key uses ANTHROPIC_API_KEY.
 * Master unlock and infrastructure/CI use ANTHROPIC_API_KEY (infra key).
 * A team with no DEPT_API_KEY_* uses that same infra key so auto-populate still
 * runs. Never charge one team from another team's key.
 *
 * Cross-department research-cache policy (Part 93): REUSE. The research fingerprint
 * does not include submitter/session department. A cache HIT does not call Anthropic
 * and does not charge any team. Only cache misses bill the verified session's account.
 * See docs/PART93_BILLING.md.
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import {
  getDepartmentApiKeyCiphertext,
  upsertDepartmentApiKeyCiphertext,
  bootstrapDepartmentApiKeysFromEnv,
} from "./db.js";
import {
  LOG_MASTER_UNLOCK,
  OPEN_ACCESS_TEAM,
  normalizeLogUnlock,
} from "./departmentAuthConstants.js";
import { billingTeamName } from "./propositionFields.js";

function cleanEnvKey(raw) {
  return (
    String(raw || "")
      .replace(/\r/g, "")
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean)[0] || ""
  );
}

function readInfraAnthropicKey() {
  return cleanEnvKey(process.env.ANTHROPIC_API_KEY);
}

const ALGO = "aes-256-gcm";

function encryptionSecret() {
  const raw =
    cleanEnvKey(process.env.DEPARTMENT_KEY_ENCRYPTION_SECRET) ||
    cleanEnvKey(process.env.SESSION_SECRET) ||
    "local-dev-only-department-key-secret";
  return createHash("sha256").update(raw).digest();
}

export function encryptApiKey(plaintext) {
  const key = encryptionSecret();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(String(plaintext || ""), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: enc.toString("base64"),
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
  };
}

export function decryptApiKey({ ciphertext, iv, tag } = {}) {
  if (!ciphertext || !iv || !tag) return "";
  const key = encryptionSecret();
  const decipher = createDecipheriv(ALGO, key, Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  const out = Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64")),
    decipher.final(),
  ]);
  return out.toString("utf8");
}

const ENV_PLAINTEXT = {
  "R&D": "DEPT_API_KEY_RD",
  CIA: "DEPT_API_KEY_CIA",
  Marketing: "DEPT_API_KEY_MARKETING",
  NPD: "DEPT_API_KEY_NPD",
};

export function departmentApiKeyEnvName(department) {
  return ENV_PLAINTEXT[normalizeLogUnlock(department)] || null;
}

export function isTeamBillingDepartment(department) {
  const dept = billingTeamName(department);
  return Boolean(dept) && dept !== LOG_MASTER_UNLOCK && dept !== OPEN_ACCESS_TEAM;
}

export function billingCreditExhaustedError(department, cause) {
  const dept = normalizeLogUnlock(department) || "this department";
  const err = new Error(
    `${dept}'s Anthropic account is out of credit (or the key was rejected). ` +
      `Top up or rotate that team's key — Primus will not charge another department.`
  );
  err.status = 402;
  err.code = "BILLING_CREDIT_EXHAUSTED";
  err.billingDepartment = dept;
  if (cause) err.cause = cause;
  return err;
}

export function isAnthropicCreditFailure(status, bodyText = "") {
  const s = Number(status) || 0;
  const t = String(bodyText || "").toLowerCase();
  if (s === 402) return true;
  if (s === 401 && /credit|billing|balance|purchase|quota|insufficient/.test(t)) return true;
  if (s === 429 && /credit|billing|balance|quota|insufficient|spend/.test(t)) return true;
  if (/credit balance|billing|payment.?required|insufficient.?credit|out of credits/.test(t)) {
    return true;
  }
  return false;
}

/**
 * Resolve which Anthropic key pays for this call.
 * @returns {Promise<{ apiKey: string, source: string, billingDepartment: string|null }>}
 */
export async function resolveBillingApiKey(department) {
  const dept = billingTeamName(department);

  // Master, open platform, and no-session infra/CI → shared infrastructure key only.
  if (!dept || dept === LOG_MASTER_UNLOCK || dept === OPEN_ACCESS_TEAM) {
    const infra = readInfraAnthropicKey();
    if (!infra) {
      const err = new Error(
        "Claude API key missing. Set ANTHROPIC_API_KEY on the server, then redeploy — without it the platform cannot auto-populate COGS or research."
      );
      err.status = 500;
      err.code = "BILLING_KEY_MISSING";
      throw err;
    }
    return {
      apiKey: infra,
      source: "ANTHROPIC_API_KEY",
      billingDepartment: dept || null,
    };
  }

  if (!isTeamBillingDepartment(dept)) {
    const err = new Error(`No Anthropic billing key mapping for department "${department}".`);
    err.status = 500;
    throw err;
  }

  const stored = await getDepartmentApiKeyCiphertext(dept);
  if (stored?.ciphertext) {
    try {
      const apiKey = decryptApiKey(stored);
      if (apiKey) {
        return { apiKey, source: `department_api_keys:${dept}`, billingDepartment: dept };
      }
    } catch (e) {
      console.warn(`[primus/billing] decrypt failed for ${dept}: ${e.message || e}`);
    }
  }

  const envName = departmentApiKeyEnvName(dept);
  const fromEnv = envName ? cleanEnvKey(process.env[envName]) : "";
  if (fromEnv) {
    try {
      await upsertDepartmentApiKeyCiphertext(dept, encryptApiKey(fromEnv));
    } catch (e) {
      console.warn(`[primus/billing] could not persist ${dept} key: ${e.message || e}`);
    }
    return { apiKey: fromEnv, source: envName, billingDepartment: dept };
  }

  const infra = readInfraAnthropicKey();
  if (infra) {
    console.log(`[primus/billing] ${dept} has no team key — using ANTHROPIC_API_KEY so numbers can auto-populate`);
    return { apiKey: infra, source: "ANTHROPIC_API_KEY", billingDepartment: dept };
  }

  const err = new Error(
    `No Anthropic API key configured for ${dept}. Set ${envName} or ANTHROPIC_API_KEY (or store an encrypted row in department_api_keys), then unlock again.`
  );
  err.status = 500;
  err.code = "BILLING_KEY_MISSING";
  err.billingDepartment = dept;
  throw err;
}

export async function ensureDepartmentApiKeysBootstrapped() {
  return bootstrapDepartmentApiKeysFromEnv(encryptApiKey);
}

export { LOG_MASTER_UNLOCK };
