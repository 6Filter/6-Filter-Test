/**
 * Test loader — intercepts lib/callLlm.js so owner tests can stub LLM without API keys.
 * Install via scripts/installCallLlmStub.mjs before dynamically importing f1Research.
 */
export async function load(url, context, nextLoad) {
  if (url.includes("/lib/callLlm.js") || url.endsWith("callLlm.js")) {
    return {
      format: "module",
      shortCircuit: true,
      source: `
export async function callLlm(opts) {
  const stub = globalThis.__PRIMUS_CALL_LLM_STUB;
  if (typeof stub !== "function") {
    throw new Error("Set globalThis.__PRIMUS_CALL_LLM_STUB before importing modules that call the LLM");
  }
  return stub(opts);
}
export function providerMeta() {
  return { id: "claude", label: "Claude (stubbed)" };
}
`,
    };
  }
  return nextLoad(url);
}
