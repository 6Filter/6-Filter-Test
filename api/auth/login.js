import { sendJson } from "../../lib/http.js";

export default async function handler(_req, res) {
  sendJson(res, 410, { error: "Password sign-in is closed. Use your Slack code." });
}
