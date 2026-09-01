import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { handleApiRequest } from "./lib/apiRouter.js";
import { redactSecrets, sendJson } from "./lib/http.js";

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
  "SESSION_SECRET",
  "ALLOWED_ORIGIN",
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
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [react(), apiPlugin(env)],
  };
});
