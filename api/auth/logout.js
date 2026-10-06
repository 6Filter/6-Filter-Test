import { protectApi } from "../../lib/auth.js";
import { handleLogout } from "../../lib/authApi.js";

export default async function handler(req, res) {
  if (!(await protectApi(req, res, { methods: "POST, OPTIONS", optionalSession: true }))) return;
  await handleLogout(req, res);
}
