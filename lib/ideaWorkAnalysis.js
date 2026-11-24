import { callLlm } from "./callLlm.js";
import { runWithLlm, normalizeProvider } from "./llmContext.js";
import { requireUnlockedDepartment } from "./propositionAccess.js";

export const IDEA_ANALYSIS_SYSTEM = [
  "You help a CavinKare team see what would make a new product idea pass the 6 Filter Test.",
  "Filters 1 to 4 decide the screen: a real benchmark, a shopper-visible gap, a growth route that matches the buyer, a checkable growth paragraph, a pack and price that can be defended, and a low technology-shift risk.",
  "Return only JSON with this shape: {\"summary\":\"one sentence\",\"suggestions\":[\"...\",\"...\",\"...\"]}.",
  "Give 3 to 5 suggestions. Each one names the box to fill and the kind of sentence that would help this idea pass.",
  "Do not invent statistics, brand shares, or prices. Do not say the idea already passes. India, plain words.",
].join(" ");

function clip(value, max) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export function buildIdeaAnalysisUser(doc = {}) {
  const f1 = doc.f1 && typeof doc.f1 === "object" ? doc.f1 : {};
  const f2 = doc.f2 && typeof doc.f2 === "object" ? doc.f2 : {};
  const lines = [
    `Name: ${clip(doc.name, 120) || "(not entered)"}`,
    `Category: ${clip(doc.category, 120) || "(not entered)"}`,
    `Idea: ${clip(doc.ideaDescription, 1200) || "(not entered)"}`,
    `Benchmark: ${clip(f1.benchmark, 200) || "(not entered)"}`,
    `What you will beat: ${clip(f1.gapDerivation, 400) || "(not entered)"}`,
    `Where you are only equal: ${clip(f1.parityExceptions, 300) || "(not entered)"}`,
    `Growth route: ${clip(f1.growthRoute, 40) || "(not entered)"}`,
    `Why it will grow: ${clip(f1.growthArgument, 600) || "(not entered)"}`,
    `Pack: ${clip(f2.grammage, 40) || "(not entered)"}`,
  ];
  return lines.join("\n");
}

export function parseIdeaAnalysis(raw) {
  const text = String(raw || "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) {
    const err = new Error("AI analysis did not return a suggestion.");
    err.status = 502;
    throw err;
  }
  let parsed;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    const err = new Error("AI analysis did not return a suggestion.");
    err.status = 502;
    throw err;
  }
  const suggestions = (Array.isArray(parsed.suggestions) ? parsed.suggestions : [])
    .map((item) => clip(item, 280))
    .filter((item) => item.length >= 12)
    .slice(0, 5);
  const summary = clip(parsed.summary, 280);
  if (!summary || suggestions.length < 1) {
    const err = new Error("AI analysis did not return a suggestion.");
    err.status = 502;
    throw err;
  }
  return { summary, suggestions };
}

export async function handleIdeaAnalysis(req, res, { readBody, sendJson, redactSecrets }) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed. Use POST." });
    return;
  }
  try {
    const payload = typeof req.body === "object" && req.body != null ? req.body : (await readBody(req)) || {};
    const doc = payload.proposition && typeof payload.proposition === "object" ? payload.proposition : payload;
    const idea = String(doc.ideaDescription || "").trim();
    if (idea.length < 12) {
      sendJson(res, 400, { error: "Describe the idea in a sentence first." });
      return;
    }
    const billingDepartment = requireUnlockedDepartment(req.user);
    const email = String(req.user?.email || "").trim().toLowerCase();
    const provider = normalizeProvider(payload.provider);
    const { text } = await runWithLlm(
      provider,
      () =>
        callLlm({
          userText: buildIdeaAnalysisUser(doc),
          system: IDEA_ANALYSIS_SYSTEM,
          maxTokens: 700,
          temperature: 0,
          label: "idea-analysis",
        }),
      { department: billingDepartment, userEmail: email }
    );
    sendJson(res, 200, { analysis: parseIdeaAnalysis(text) });
  } catch (e) {
    const status = e.status && Number.isInteger(e.status) ? e.status : 500;
    sendJson(res, status, { error: redactSecrets(e.message || "AI analysis did not finish.") });
  }
}
