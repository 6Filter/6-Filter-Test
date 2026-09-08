import { protectApi } from "../../lib/auth.js";
import { handleDepartmentLock } from "../../lib/departmentAuthApi.js";

export default async function handler(req, res) {
  if (!(await protectApi(req, res, { methods: "POST, OPTIONS", auth: false }))) return;
  await handleDepartmentLock(req, res);
}
