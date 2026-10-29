import { sendJson } from "../../lib/http.js";

export default async function handler(_req, res) {
  sendJson(res, 410, { error: "Registration is closed. Sign in with your Slack code." });
}
