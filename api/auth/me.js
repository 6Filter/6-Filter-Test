import { protectApi } from "../../lib/auth.js";
import { handleMe } from "../../lib/authApi.js";

export default async function handler(req, res) {
  if (!(await protectApi(req, res, { methods: "GET, OPTIONS", optionalSession: true }))) return;
  await handleMe(req, res);
}
