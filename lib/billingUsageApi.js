import { sendJson } from "./http.js";
import { isMasterUnlock } from "./departmentAuthConstants.js";
import { unlockedDepartmentOf } from "./propositionAccess.js";
import { listLlmUsage } from "./llmUsage.js";

export function billingUsageAllowed(department) {
  return isMasterUnlock(department);
}

export async function handleBillingUsage(req, res) {
  const department = unlockedDepartmentOf(req.user);
  if (!billingUsageAllowed(department)) {
    sendJson(res, 403, { error: "Only Master can view usage." });
    return;
  }
  const requested = new URL(req.url || "/api/billing/usage", "http://local").searchParams.get("days");
  const days = Math.min(365, Math.max(1, Number(requested || 30) || 30));
  const rows = await listLlmUsage(days);
  sendJson(res, 200, { days, rows });
}
