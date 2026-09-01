import {
  addDivisionThreshold,
  getDivisionThresholds,
  saveDivisionThreshold,
} from "./divisionConfig.js";

export async function handleDivisionThresholdsCollection(req, res, { readBody, sendJson, redactSecrets }) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method === "GET") {
    try {
      const thresholds = await getDivisionThresholds();
      sendJson(res, 200, { thresholds });
    } catch (e) {
      sendJson(res, 500, { error: redactSecrets(e.message) });
    }
    return;
  }

  if (req.method === "POST") {
    try {
      const body = typeof readBody === "function" ? await readBody(req) : req.body || {};
      const row = await addDivisionThreshold(body || {});
      sendJson(res, 201, { threshold: row });
    } catch (e) {
      const status = e.status && Number.isInteger(e.status) ? e.status : 500;
      sendJson(res, status, { error: redactSecrets(e.message) });
    }
    return;
  }

  sendJson(res, 405, { error: "GET or POST only." });
}

export async function handleDivisionThresholdById(req, res, id, { readBody, sendJson, redactSecrets }) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== "PUT") {
    sendJson(res, 405, { error: "PUT only." });
    return;
  }

  try {
    const body = typeof readBody === "function" ? await readBody(req) : req.body || {};
    const row = await saveDivisionThreshold(id, body || {});
    if (!row) {
      sendJson(res, 404, { error: "Division threshold not found." });
      return;
    }
    sendJson(res, 200, { threshold: row });
  } catch (e) {
    const status = e.status && Number.isInteger(e.status) ? e.status : 500;
    sendJson(res, status, { error: redactSecrets(e.message) });
  }
}
