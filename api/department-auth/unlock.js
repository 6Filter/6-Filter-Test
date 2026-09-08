import { protectApi } from "../../lib/auth.js";
import { handleDepartmentUnlock } from "../../lib/departmentAuthApi.js";

export default async function handler(req, res) {
  if (!(await protectApi(req, res, { methods: "POST, OPTIONS", auth: false, rateLimit: { max: 20, bucket: "dept-unlock" } }))) return;
  await handleDepartmentUnlock(req, res);
}
