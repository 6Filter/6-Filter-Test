/**
 * Part 147 — "logic lock (lite)".
 * The owner's full lock (testLogicLock.mjs) needs a Postgres and was not available, so this is a stand-in that
 * checks the two things a pure restyle must never touch:
 *   1. every file in lib/, api/ and server.js is byte-identical (LF-normalised sha256);
 *   2. the visible words of the app: every string literal, JSX text, template literal that is not CSS, and
 *      every placeholder / aria-label / title / value in src/ — minus class names, colours and sizes —
 *      as a sorted list. A restyle may move words around; it may not add, remove or rename one.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "@babel/parser";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function walk(dir, out = []) {
  for (const name of readdirSync(dir).sort()) {
    const full = path.join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const rel = (f) => path.relative(root, f).split(path.sep).join("/");
const sha = (text) => createHash("sha256").update(text).digest("hex");
const readLf = (f) => readFileSync(f, "utf8").replace(/\r\n/g, "\n");

export function collectFingerprints() {
  const files = [...walk(path.join(root, "lib")), ...walk(path.join(root, "api")), path.join(root, "server.js")]
    // reference stylesheets under lib/ are test fixtures for the look, not logic
    .filter((f) => !/\.reference\.(css|jsx?)$/i.test(f));
  const out = {};
  for (const f of files) out[rel(f)] = sha(readLf(f));
  return out;
}

const COLOUR = /^(#[0-9a-f]{3,8}|rgba?\(|hsla?\(|var\(--|calc\(|linear-gradient|radial-gradient|conic-gradient)/i;
const LENGTH = /^-?[\d.]+(px|em|rem|%|vh|vw|ms|s)?(\s+-?[\d.]+(px|em|rem|%)?)*$/;
const CSS_LIKE = /[{};]\s*[a-z-]+\s*:|^\s*[.#@:a-z][^{}]*\{[^}]*:/i;

function isCssTemplate(text) {
  return CSS_LIKE.test(text) && /[{;]/.test(text);
}

const SKIP_ATTRS = new Set(["className", "style", "key", "ref", "d", "viewBox", "fill", "stroke", "xmlns", "id", "htmlFor"]);

export function collectWords() {
  const words = [];
  const files = walk(path.join(root, "src")).filter((f) => /\.(jsx?|mjs)$/.test(f));
  for (const f of files) {
    const code = readLf(f);
    let ast;
    try {
      ast = parse(code, { sourceType: "module", plugins: ["jsx"], errorRecovery: true });
    } catch (e) {
      throw new Error(`logic-lock-lite: cannot parse ${rel(f)}: ${e.message}`);
    }
    const file = rel(f);
    const add = (text) => {
      const t = String(text).replace(/\s+/g, " ").trim();
      if (!t || COLOUR.test(t) || LENGTH.test(t)) return;
      words.push(`${file}\t${t}`);
    };
    const visit = (node, parent, parentKey) => {
      if (!node || typeof node.type !== "string") return;
      switch (node.type) {
        case "JSXText":
          add(node.value);
          break;
        case "StringLiteral":
          if (parent?.type === "JSXAttribute" && SKIP_ATTRS.has(parent.name?.name)) break;
          // data-* attributes and DOM plumbing (setProperty / closest / typeof checks) are not visible words
          if (parent?.type === "JSXAttribute" && /^data-/.test(parent.name?.name || "")) break;
          if (parent?.type === "CallExpression" && parentKey === "arguments" && /^(setProperty|closest|querySelector|querySelectorAll|getPropertyValue)$/.test(parent.callee?.property?.name || "")) break;
          if (parent?.type === "BinaryExpression" && /^(===|!==|==|!=)$/.test(parent.operator) && (parent.left?.type === "UnaryExpression" || parent.right?.type === "UnaryExpression")) break;
          if (parent?.type === "ObjectProperty" && parentKey === "value" && /^(className|color|background|border|font|fontSize|fontWeight|padding|margin|width|height|display|gap|opacity|boxShadow|borderRadius|textAlign|flex)/i.test(parent.key?.name || parent.key?.value || "")) break;
          if (parent?.type === "ImportDeclaration" || parent?.type === "ExportNamedDeclaration" || parent?.type === "ExportAllDeclaration") break;
          add(node.value);
          break;
        case "TemplateLiteral": {
          const text = node.quasis.map((q) => q.value.cooked ?? q.value.raw).join("${}");
          if (parent?.type === "CallExpression" && /^(setProperty)$/.test(parent.callee?.property?.name || "")) break;
          if (!isCssTemplate(text)) add(text);
          break;
        }
        default:
      }
      for (const key of Object.keys(node)) {
        if (key === "loc" || key === "start" || key === "end" || key === "extra") continue;
        const v = node[key];
        if (Array.isArray(v)) v.forEach((c) => visit(c, node, key));
        else if (v && typeof v.type === "string") visit(v, node, key);
      }
    };
    visit(ast.program, null, null);
  }
  return words.sort();
}

export function collectAll() {
  return { fingerprints: collectFingerprints(), words: collectWords() };
}
