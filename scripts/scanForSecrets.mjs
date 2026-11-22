#!/usr/bin/env node
/**
 * LOOK FOR SECRETS, PERSONAL DATA AND STRAY FILES IN A FOLDER (a repository, or the public mirror of one). Read-only: it never changes anything and NEVER prints a whole secret (only its first 4 characters and its length).
 *   node scripts/scanForSecrets.mjs <folder> [--compare <the real repository folder>] [--json]
 * HIGH findings (exit 1): a database address that carries a password, an Azure SAS signature, an Anthropic or Slack or AWS key, a private key block, a JWT, an assignment of a long literal to a name containing SECRET, PASSWORD, TOKEN, API_KEY or PASSPHRASE,
 *   and files that should never be committed (.env, *.pem, *.key, *.pfx, *.dump, *.dump.enc, dest-database-url.txt and its kin).
 * INFO findings (exit 0): company email addresses (personal data), listed by count per file.   --compare lists files that exist in the folder but NOT in the real repository (the "scratch scripts" a sync can leak).
 * Placeholders such as sk-ant-stub, "example", "changeme", "<your ...>" and process.env references are not findings. Skips node_modules, .git, dist and build output.
 */
import fs from "node:fs"; import path from "node:path";
const argv = process.argv.slice(2); const cmpIdx = argv.indexOf("--compare"); const other = cmpIdx >= 0 ? path.resolve(argv[cmpIdx + 1] || ".") : ""; const positional = argv.filter((a, i) => !a.startsWith("--") && !(cmpIdx >= 0 && i === cmpIdx + 1)); const root = path.resolve(positional[0] || "."); const asJson = argv.includes("--json");
const SKIP = new Set(["node_modules", ".git", "dist", "build", ".next", "coverage", ".stryker-tmp"]); const MAX = 2 * 1024 * 1024; const BINARY = /\.(png|jpe?g|gif|webp|ico|pdf|zip|gz|xlsx|xls|docx|woff2?|ttf|otf|mp4|webm|wasm)$/i;
const PLACEHOLDER = /(stub|example|changeme|change-me|placeholder|your[-_ ]|<[^>]+>|xxxx|local-only|dummy|sample|fake|redacted|\*\*\*|process\.env|test-?secret|not-a-real)/i;
const mask = (s) => `${String(s).slice(0, 4)}*** (${String(s).length} characters)`;
const RULES = [
  ["database address with a password", /postgres(?:ql)?:\/\/[^:\s\/@"'`]+:([^@\s"'`]{3,})@[^\s"'`]+/g, (m) => m[1]],
  ["Azure SAS signature", /[?&]sig=([A-Za-z0-9%+\/=]{20,})/g, (m) => m[1]],
  ["Anthropic API key", /\b(sk-ant-[A-Za-z0-9_\-]{12,})/g, (m) => m[1]],
  ["Slack token", /\b(xox[baprs]-[A-Za-z0-9-]{10,})/g, (m) => m[1]],
  ["AWS access key", /\b(AKIA[0-9A-Z]{16})\b/g, (m) => m[1]],
  ["private key block", /(-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----)/g, (m) => m[1]],
  ["JWT", /\b(eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})/g, (m) => m[1]],
  ["long literal assigned to a secret-like name", /\b[A-Za-z0-9_]*(?:SECRET|PASSWORD|PASSPHRASE|TOKEN|API_?KEY)[A-Za-z0-9_]*\s*[:=]\s*["'`]([^"'`\s]{12,})["'`]/gi, (m) => m[1]],
];
const BAD_NAMES = [/^\.env(\..*)?$/i, /\.pem$/i, /\.key$/i, /\.pfx$/i, /\.p12$/i, /\.dump$/i, /\.dump\.enc$/i, /(^|[-_])database-url\.txt$/i, /^id_(rsa|ed25519)$/i, /\.sqlite3?$/i];
function walk(dir, base, out = []) { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { if (SKIP.has(e.name)) continue; const p = path.join(dir, e.name); if (e.isDirectory()) walk(p, base, out); else out.push(path.relative(base, p).split(path.sep).join("/")); } return out; }
const files = walk(root, root); const findings = []; const emails = {};
for (const f of files) {
  const name = path.basename(f); if (BAD_NAMES.some((re) => re.test(name))) findings.push({ level: "HIGH", file: f, line: 0, rule: "a file that should never be committed", shown: name });
  if (BINARY.test(f)) continue; let st; try { st = fs.statSync(path.join(root, f)); } catch { continue; } if (st.size > MAX) continue; let text; try { text = fs.readFileSync(path.join(root, f), "utf8"); } catch { continue; } if (text.includes("\u0000")) continue;
  const lines = text.split("\n"); lines.forEach((ln, i) => { for (const [rule, re, pick] of RULES) { re.lastIndex = 0; let m; while ((m = re.exec(ln))) { const secret = pick(m); if (PLACEHOLDER.test(ln) || PLACEHOLDER.test(secret)) continue; findings.push({ level: "HIGH", file: f, line: i + 1, rule, shown: mask(secret) }); } } const em = ln.match(/[A-Za-z0-9._%+-]+@cavinkare\.com/gi); if (em) emails[f] = (emails[f] || 0) + em.length; });
}
let onlyHere = []; if (other) { const theirs = new Set(walk(other, other)); onlyHere = files.filter((f) => !theirs.has(f)); }
const high = findings.filter((f) => f.level === "HIGH");
if (asJson) { console.log(JSON.stringify({ root, filesScanned: files.length, high, emailFiles: emails, onlyHere }, null, 1)); }
else {
  console.log(`Scanned ${files.length} files in ${root}`); console.log(high.length ? `\nHIGH findings (${high.length}):` : "\nNo high findings."); for (const f of high) console.log(`  ${f.file}${f.line ? ":" + f.line : ""}  ${f.rule}  ${f.shown}`);
  const ef = Object.entries(emails); console.log(`\nINFO: company email addresses in ${ef.length} file(s) (personal data; check they belong in a public place)${ef.length ? ":" : "."}`); for (const [f, n] of ef.slice(0, 12)) console.log(`  ${f}  ${n}`); if (ef.length > 12) console.log(`  ...and ${ef.length - 12} more`);
  if (other) { console.log(`\nFiles in ${root} that are NOT in ${other} (${onlyHere.length}):`); for (const f of onlyHere.slice(0, 60)) console.log(`  ${f}`); if (onlyHere.length > 60) console.log(`  ...and ${onlyHere.length - 60} more`); }
}
process.exit(high.length ? 1 : 0);
