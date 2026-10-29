import { handleRequestCode } from "../../lib/authApi.js";
import { protectApi } from "../../lib/auth.js";

export default async function handler(req, res) {
  if (!(await protectApi(req, res, { methods: "POST, OPTIONS", optionalSession: true, auth: false }))) return;
  await handleRequestCode(req, res);
}
