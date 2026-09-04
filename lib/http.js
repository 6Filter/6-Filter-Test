export function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 16_000_000) {
        reject(new Error("Request body too large."));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("Invalid JSON body."));
      }
    });
    req.on("error", reject);
  });
}

export function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

export function redactSecrets(message) {
  return String(message || "Server error")
    .replace(/sk-ant-[A-Za-z0-9\-_]+/g, "[redacted]")
    .replace(/sk-proj-[A-Za-z0-9\-_]+/g, "[redacted]")
    .replace(/gsk_[A-Za-z0-9]+/g, "[redacted]")
    .replace(/AIza[A-Za-z0-9_\-]+/g, "[redacted]")
    .replace(/AQ\.[A-Za-z0-9_\-]+/g, "[redacted]")
    .replace(/\bsk-[a-f0-9]{32}\b/gi, "[redacted]")
    .replace(/https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9/_-]+/g, "[redacted]")
    .replace(/\bxoxb-[A-Za-z0-9-]+/g, "[redacted]");
}
