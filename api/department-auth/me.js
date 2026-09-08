import { protectApi } from "../../lib/auth.js";
import { handleDepartmentMe } from "../../lib/departmentAuthApi.js";

export default async function handler(req, res) {
  if (!(await protectApi(req, res, { methods: "GET, OPTIONS", auth: false }))) return;
  await handleDepartmentMe(req, res);
}
