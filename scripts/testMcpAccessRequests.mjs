/**
 * MCP connector: fail-closed allowlist + admin approval. No Anthropic.
 */
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.REQUIRE_AUTH = "false";
process.env.PRIMUS_DATA_DIR = mkdtempSync(path.join(tmpdir(), "primus-mcp-access-"));
delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;
delete process.env.MCP_ALLOWED_EMAILS;

const {
  envAllowsMcp,
  mcpAccessAllowed,
  mcpAccessState,
  mcpRefuseMessage,
  requestMcpAccess,
  decideMcpAccess,
  listMcpAccessRequests,
  resetMcpAccessMemory,
  MCP_REQUEST_MESSAGE,
  MCP_PENDING_MESSAGE,
  MCP_DENIED_MESSAGE,
} = await import("../lib/mcpAccess.js");

let checks = 0;
function check(name, ok) {
  assert.ok(ok, name);
  checks += 1;
}

resetMcpAccessMemory();
check("empty allowlist is nobody, not everyone", envAllowsMcp("anyone@cavinkare.com") === false);
check("empty allowlist does not grant MCP", (await mcpAccessAllowed("anyone@cavinkare.com")) === false);

process.env.MCP_ALLOWED_EMAILS = " Owner@cavinkare.com , other@cavinkare.com ";
check("listed email is allowed", envAllowsMcp("owner@cavinkare.com") === true);
check("unlisted email is not allowed by env", envAllowsMcp("new.person@cavinkare.com") === false);

const first = await requestMcpAccess("new.person@cavinkare.com");
check("first try creates a pending request", first.status === "pending" && first.created === true);
check("the asker is told a request was sent", mcpRefuseMessage("requested") === MCP_REQUEST_MESSAGE);

const again = await requestMcpAccess("new.person@cavinkare.com");
check("a second try stays pending and is not a new request", again.status === "pending" && again.created === false);
check("waiting copy is used while pending", mcpRefuseMessage("pending") === MCP_PENDING_MESSAGE);

const approved = await decideMcpAccess("new.person@cavinkare.com", "approve", "admin@cavinkare.com");
check("admin approve grants access", approved.status === "approved" && (await mcpAccessAllowed("new.person@cavinkare.com")) === true);

const deniedPerson = await requestMcpAccess("blocked@cavinkare.com");
check("another person can request", deniedPerson.created === true);
await decideMcpAccess("blocked@cavinkare.com", "deny", "admin@cavinkare.com");
check("denied stays refused", (await mcpAccessAllowed("blocked@cavinkare.com")) === false);
check("denied copy is shown", mcpRefuseMessage("denied") === MCP_DENIED_MESSAGE);
const afterDeny = await requestMcpAccess("blocked@cavinkare.com");
check("a denied person cannot self-reopen the request", afterDeny.status === "denied" && afterDeny.created === false);

const listed = await mcpAccessState("owner@cavinkare.com");
check("env allowlist still bypasses the queue", listed.allowed === true && listed.status === "allowlist");

const rows = await listMcpAccessRequests();
check(
  "admin list includes pending/approved/denied",
  rows.some((r) => r.email === "new.person@cavinkare.com" && r.status === "approved") &&
    rows.some((r) => r.email === "blocked@cavinkare.com" && r.status === "denied")
);

const src = await import("node:fs").then((fs) =>
  fs.readFileSync(new URL("../src/AdminUsersPage.jsx", import.meta.url), "utf8")
);
check("Admin has a Connector tab", /id: "connector"/.test(src) && /Claude connector requests/.test(src));
const router = await import("node:fs").then((fs) =>
  fs.readFileSync(new URL("../lib/apiRouter.js", import.meta.url), "utf8")
);
check("the approve route is registered", /\/api\/admin\/mcp\/access-requests/.test(router));

console.log(`testMcpAccessRequests: ${checks} checks passed`);
