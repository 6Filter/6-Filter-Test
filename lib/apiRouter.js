import { readJsonBody, redactSecrets, sendJson } from "./http.js";
import { protectApi } from "./auth.js";
import { handleLogin, handleLogout, handleMe } from "./authApi.js";
import {
  handleIdeaById,
  handleIdeaEscalate,
  handleIdeaExport,
  handleIdeasCollection,
  handleRecordOutcome,
  handleSupportingDoc,
  handleSupportingDocById,
} from "./ideasApi.js";
import { handlePropositionsCollection, handlePropositionById } from "./propositionsApi.js";
import { handlePropositionCheck } from "./propositionCheckApi.js";
import { handleLlmGenerate, handleProviders } from "./llmApi.js";
import { handleCategoryIntelRequest } from "./categoryIntelligence/http.js";

function idFrom(url, re) {
  const m = url.match(re);
  return m ? decodeURIComponent(m[1]) : "";
}

/**
 * Shared API dispatcher for Render (`server.js`) and local Vite.
 * Vercel `api/*.js` files call the same handlers via `protectApi`.
 * Returns true when the request was an /api route.
 */
export async function handleApiRequest(req, res) {
  const url = req.url?.split("?")[0] || "";
  if (!url.startsWith("/api/")) return false;

  try {
    if (url === "/api/auth/login") {
      if (!(await protectApi(req, res, { methods: "POST, OPTIONS", auth: false }))) return true;
      await handleLogin(req, res);
      return true;
    }
    if (url === "/api/auth/logout") {
      if (!(await protectApi(req, res, { methods: "POST, OPTIONS", auth: false }))) return true;
      await handleLogout(req, res);
      return true;
    }
    if (url === "/api/auth/me") {
      if (!(await protectApi(req, res, { methods: "GET, OPTIONS", auth: false }))) return true;
      await handleMe(req, res);
      return true;
    }

    if (url === "/api/providers") {
      if (!(await protectApi(req, res, { methods: "GET, OPTIONS" }))) return true;
      await handleProviders(req, res, { sendJson });
      return true;
    }

    if (url === "/api/claude") {
      if (!(await protectApi(req, res, { methods: "POST, OPTIONS", rateLimit: true }))) return true;
      await handleLlmGenerate(req, res, { readBody: readJsonBody, sendJson, redactSecrets });
      return true;
    }

    if (url === "/api/ideas") {
      if (!(await protectApi(req, res, { methods: "GET, POST, OPTIONS" }))) return true;
      await handleIdeasCollection(req, res, { readBody: readJsonBody, sendJson, redactSecrets });
      return true;
    }

    if (url === "/api/propositions") {
      if (!(await protectApi(req, res, { methods: "GET, POST, OPTIONS" }))) return true;
      await handlePropositionsCollection(req, res, { sendJson, redactSecrets });
      return true;
    }

    const checkMatch = url.match(/^\/api\/propositions\/([^/]+)\/check$/);
    if (checkMatch) {
      if (!(await protectApi(req, res, { methods: "POST, OPTIONS", rateLimit: { max: 120, bucket: "prop-check" } }))) return true;
      await handlePropositionCheck(req, res, {
        readBody: readJsonBody,
        sendJson,
        redactSecrets,
      });
      return true;
    }

    const propositionMatch = url.match(/^\/api\/propositions\/([^/]+)$/);
    if (propositionMatch) {
      if (!(await protectApi(req, res, { methods: "GET, PUT, DELETE, OPTIONS" }))) return true;
      await handlePropositionById(req, res, decodeURIComponent(propositionMatch[1]), {
        readBody: readJsonBody,
        sendJson,
        redactSecrets,
      });
      return true;
    }

    const supportingDocItemMatch = url.match(/^\/api\/ideas\/([^/]+)\/supporting-doc\/([^/]+)$/);
    if (supportingDocItemMatch) {
      if (!(await protectApi(req, res, { methods: "GET, DELETE, OPTIONS" }))) return true;
      await handleSupportingDocById(
        req,
        res,
        decodeURIComponent(supportingDocItemMatch[1]),
        decodeURIComponent(supportingDocItemMatch[2]),
        { sendJson, redactSecrets }
      );
      return true;
    }

    const supportingDocMatch = url.match(/^\/api\/ideas\/([^/]+)\/supporting-doc$/);
    if (supportingDocMatch) {
      if (!(await protectApi(req, res, { methods: "POST, OPTIONS" }))) return true;
      await handleSupportingDoc(req, res, decodeURIComponent(supportingDocMatch[1]), {
        readBody: readJsonBody,
        sendJson,
        redactSecrets,
      });
      return true;
    }

    const exportMatch = url.match(/^\/api\/ideas\/([^/]+)\/export$/);
    if (exportMatch) {
      if (!(await protectApi(req, res, { methods: "GET, OPTIONS" }))) return true;
      await handleIdeaExport(req, res, decodeURIComponent(exportMatch[1]), { sendJson, redactSecrets });
      return true;
    }

    const escalateMatch = url.match(/^\/api\/ideas\/([^/]+)\/escalate$/);
    if (escalateMatch) {
      if (!(await protectApi(req, res, { methods: "POST, OPTIONS" }))) return true;
      await handleIdeaEscalate(req, res, decodeURIComponent(escalateMatch[1]), {
        readBody: readJsonBody,
        sendJson,
        redactSecrets,
      });
      return true;
    }

    const outcomeMatch = url.match(/^\/api\/ideas\/([^/]+)\/record-outcome$/);
    if (outcomeMatch) {
      if (!(await protectApi(req, res, { methods: "POST, OPTIONS" }))) return true;
      await handleRecordOutcome(req, res, decodeURIComponent(outcomeMatch[1]), {
        readBody: readJsonBody,
        sendJson,
        redactSecrets,
      });
      return true;
    }

    const ideaMatch = url.match(/^\/api\/ideas\/([^/]+)$/);
    if (ideaMatch) {
      if (!(await protectApi(req, res, { methods: "GET, DELETE, OPTIONS" }))) return true;
      await handleIdeaById(req, res, decodeURIComponent(ideaMatch[1]), { sendJson, redactSecrets });
      return true;
    }

    if (
      url === "/api/calibration" ||
      url === "/api/category-sizing/run" ||
      url === "/api/format-trend/run" ||
      /^\/api\/category-sizing\/export\/[^/]+$/.test(url) ||
      /^\/api\/category-sizing\/[^/]+\/engine\/[^/]+$/.test(url)
    ) {
      const rateLimit = url === "/api/category-sizing/run" || url === "/api/format-trend/run";
      const methods = url.includes("/export/") ? "GET, OPTIONS" : url === "/api/calibration" ? "GET, POST, OPTIONS" : "POST, OPTIONS";
      if (!(await protectApi(req, res, { methods, rateLimit }))) return true;
      const handled = await handleCategoryIntelRequest(req, res, url, {
        readBody: readJsonBody,
        sendJson,
        redactSecrets,
      });
      if (!handled) sendJson(res, 404, { error: "Not found." });
      return true;
    }

    sendJson(res, 404, { error: "Not found." });
    return true;
  } catch (e) {
    const status = e.status && Number.isInteger(e.status) ? e.status : 500;
    sendJson(res, status, { error: redactSecrets(e.message) });
    return true;
  }
}

export { idFrom };
