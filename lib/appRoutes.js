/**
 * Part 130 — browser address ↔ screen. Pure helpers (no React).
 */

export const APP_ROUTE = Object.freeze({
  HOME: "/",
  LOG: "/log",
  SETTINGS: "/settings",
});

export function propositionPath(id) {
  const cleaned = String(id || "").trim();
  if (!cleaned) return APP_ROUTE.HOME;
  return `/propositions/${encodeURIComponent(cleaned)}`;
}

/**
 * @returns {{ kind: "home"|"log"|"settings"|"proposition"|"unknown", ideaId: string }}
 */
export function parseAppLocation(pathname = "/", search = "") {
  const path = String(pathname || "/").replace(/\/+$/, "") || "/";
  // Slack-style ?idea= wins on any path (including /).
  try {
    const q = new URLSearchParams(String(search || "").replace(/^\?/, "")).get("idea");
    if (q && String(q).trim()) return { kind: "proposition", ideaId: String(q).trim() };
  } catch {
    /* ignore */
  }
  if (path === "/" || path === "") return { kind: "home", ideaId: "" };
  if (path === "/log") return { kind: "log", ideaId: "" };
  if (path === "/settings") return { kind: "settings", ideaId: "" };
  const m = path.match(/^\/propositions\/([^/]+)$/i);
  if (m?.[1]) {
    try {
      return { kind: "proposition", ideaId: decodeURIComponent(m[1]) };
    } catch {
      return { kind: "proposition", ideaId: m[1] };
    }
  }
  return { kind: "unknown", ideaId: "" };
}

export function pathForView(view, ideaId = "") {
  if (view === "log") return APP_ROUTE.LOG;
  if (view === "settings") return APP_ROUTE.SETTINGS;
  if (view === "form" || view === "result") {
    return ideaId ? propositionPath(ideaId) : APP_ROUTE.HOME;
  }
  return APP_ROUTE.HOME;
}

export const RETURN_IDEA_KEY = "primus_return_idea";

export function readStashedReturnIdea(storage = null) {
  try {
    const store = storage || (typeof sessionStorage !== "undefined" ? sessionStorage : null);
    if (!store) return "";
    return String(store.getItem(RETURN_IDEA_KEY) || "").trim();
  } catch {
    return "";
  }
}

export function stashReturnIdea(id, storage = null) {
  const cleaned = String(id || "").trim();
  if (!cleaned) return;
  try {
    const store = storage || (typeof sessionStorage !== "undefined" ? sessionStorage : null);
    if (!store) return;
    store.setItem(RETURN_IDEA_KEY, cleaned);
  } catch {
    /* ignore */
  }
}

export function clearStashedReturnIdea(storage = null) {
  try {
    const store = storage || (typeof sessionStorage !== "undefined" ? sessionStorage : null);
    if (!store) return;
    store.removeItem(RETURN_IDEA_KEY);
  } catch {
    /* ignore */
  }
}
