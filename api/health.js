import { protectApi } from "../lib/auth.js";
import { handleHealth } from "../lib/healthApi.js";

export default async function handler(req, res) {
  if (!(await protectApi(req, res, { methods: "GET, OPTIONS", optionalSession: true }))) return;
  await handleHealth(req, res);
}
