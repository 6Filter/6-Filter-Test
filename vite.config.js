import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { handleApiRequest } from "./lib/apiRouter.js";
import { redactSecrets, sendJson } from "./lib/http.js";
import { applySecurityHeaders } from "./lib/securityHeaders.js";

const ENV_KEYS = [
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_MODEL",
  "DATABASE_URL",
  "POSTGRES_URL",
  "SESSION_SECRET",
  "REQUIRE_AUTH",
  "ALLOWED_ORIGIN",
  "DEPT_PASSWORD_HASH_RD",
  "DEPT_PASSWORD_HASH_CIA",
  "DEPT_PASSWORD_HASH_MARKETING",
  "DEPT_PASSWORD_HASH_NPD",
];

function applyEnv(env) {
  for (const key of ENV_KEYS) {
    if (env[key]) process.env[key] = env[key];
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
        applySecurityHeaders(res, { dev: true });
        try {
          const handled = await handleApiRequest(req, res);
          if (handled) return;
        } catch (e) {
          const status = e.status && Number.isInteger(e.status) ? e.status : 500;
          sendJson(res, status, { error: redactSecrets(e.message) });
          return;
        }
        next();
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        applySecurityHeaders(res);
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
