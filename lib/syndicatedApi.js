import { sendJson, readJsonBody } from "./http.js";
import { isMasterUnlock } from "./departmentAuthConstants.js";
import { unlockedDepartmentOf } from "./propositionAccess.js";
import { normalizeSyndicatedImport, previewSyndicatedImport } from "./syndicatedImport.js";
import { replaceSyndicatedRows } from "./syndicatedStore.js";

export async function handleSyndicatedImport(req, res) {
  if (!isMasterUnlock(unlockedDepartmentOf(req.user))) {
    sendJson(res, 403, { error: "Only Master can import syndicated rows." });
    return;
  }
  try {
    const body = (await readJsonBody(req)) || {};
    const rows = normalizeSyndicatedImport(body);
    const preview = previewSyndicatedImport(rows);
    const apply = body.apply === true || body.dryRun === false;
    if (!apply) {
      sendJson(res, 200, { preview, written: 0 });
      return;
    }
    const result = await replaceSyndicatedRows(rows, { actor: "Master" });
    sendJson(res, 200, { preview, ...result });
  } catch (e) {
    sendJson(res, e.status || 500, { error: e.message || "Import failed." });
  }
}
