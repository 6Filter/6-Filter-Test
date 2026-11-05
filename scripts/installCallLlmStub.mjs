import { register } from "node:module";

register(new URL("./callLlmStubLoader.mjs", import.meta.url).href, import.meta.url);

/** @param {(opts: object) => Promise<{ text?: string, content?: unknown, sources?: string[] }>} fn */
export function setCallLlmStub(fn) {
  globalThis.__PRIMUS_CALL_LLM_STUB = fn;
}

export function clearCallLlmStub() {
  delete globalThis.__PRIMUS_CALL_LLM_STUB;
}
