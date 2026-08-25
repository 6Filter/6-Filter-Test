import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { readJsonBody, redactSecrets, sendJson } from "./lib/http.js";

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 8_000_000) {
        reject(new Error("Request body too large."));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

const ENV_KEYS = [
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_MODEL",
  "GEMINI_API_KEY",
  "GEMINI_MODEL",
  "GROQ_API_KEY",
  "GROQ_MODEL",
  "DEEPSEEK_API_KEY",
  "DEEPSEEK_MODEL",
  "OPENAI_API_KEY",
  "OPENAI_MODEL",
  "DATABASE_URL",
  "POSTGRES_URL",
];

function applyEnv(env) {
  for (const key of ENV_KEYS) {
    if (env[key]) process.env[key] = env[key];
  }
  if (env.VITE_ANTHROPIC_API_KEY && !process.env.ANTHROPIC_API_KEY) {
    process.env.ANTHROPIC_API_KEY = env.VITE_ANTHROPIC_API_KEY;
  }
  if (env.VITE_ANTHROPIC_MODEL && !process.env.ANTHROPIC_MODEL) {
    process.env.ANTHROPIC_MODEL = env.VITE_ANTHROPIC_MODEL;
  }
}

function apiPlugin(env) {
  return {
    name: "primus-api-local",
    configureServer(server) {
      applyEnv(env);

      server.middlewares.use(async (req, res, next) => {
        const url = req.url?.split("?")[0] || "";

        if (url === "/api/providers") {
          res.setHeader("Access-Control-Allow-Origin", "*");
          res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
          res.setHeader("Access-Control-Allow-Headers", "Content-Type");
          const { handleProviders } = await import("./lib/llmApi.js");
          await handleProviders(req, res, { sendJson });
          return;
        }

        if (url === "/api/claude") {
          if (req.method === "OPTIONS") {
            res.statusCode = 204;
            res.end();
            return;
          }
          if (req.method !== "POST") {
            sendJson(res, 405, { error: "Method not allowed" });
            return;
          }
          try {
            const raw = await readBody(req);
            const payload = raw ? JSON.parse(raw) : {};
            req.body = payload;
            const { handleLlmGenerate } = await import("./lib/llmApi.js");
            await handleLlmGenerate(req, res, {
              readBody: readJsonBody,
              sendJson,
              redactSecrets,
            });
          } catch (e) {
            const status = e.status && Number.isInteger(e.status) ? e.status : 500;
            sendJson(res, status, { error: redactSecrets(e.message) });
          }
          return;
        }

        if (url === "/api/ideas") {
          res.setHeader("Access-Control-Allow-Origin", "*");
          res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
          res.setHeader("Access-Control-Allow-Headers", "Content-Type");
          const { handleIdeasCollection: handleCollection } = await import("./lib/ideasApi.js");
          await handleCollection(req, res, {
            readBody: readJsonBody,
            sendJson,
            redactSecrets,
          });
          return;
        }

        const escalateMatch = url.match(/^\/api\/ideas\/([^/]+)\/escalate$/);
        if (escalateMatch) {
          res.setHeader("Access-Control-Allow-Origin", "*");
          res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
          res.setHeader("Access-Control-Allow-Headers", "Content-Type");
          const { handleIdeaEscalate } = await import("./lib/ideasApi.js");
          await handleIdeaEscalate(req, res, decodeURIComponent(escalateMatch[1]), {
            readBody: readJsonBody,
            sendJson,
            redactSecrets,
          });
          return;
        }

        const ideaMatch = url.match(/^\/api\/ideas\/([^/]+)$/);
        if (ideaMatch) {
          res.setHeader("Access-Control-Allow-Origin", "*");
          res.setHeader("Access-Control-Allow-Methods", "GET, DELETE, OPTIONS");
          res.setHeader("Access-Control-Allow-Headers", "Content-Type");
          const { handleIdeaById: handleById } = await import("./lib/ideasApi.js");
          await handleById(req, res, decodeURIComponent(ideaMatch[1]), {
            sendJson,
            redactSecrets,
          });
          return;
        }

        next();
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [react(), apiPlugin(env)],
  };
});
