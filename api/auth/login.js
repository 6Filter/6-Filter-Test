import { protectApi } from "../../lib/auth.js";
import { handleLogin } from "../../lib/authApi.js";

export default async function handler(req, res) {
  if (!(await protectApi(req, res, { methods: "POST, OPTIONS", auth: false }))) return;
  await handleLogin(req, res);
}
