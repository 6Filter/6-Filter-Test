/**
 * R&D org chart visibility: BH → department, leads → reportees, members → own.
 */
import assert from "node:assert/strict";
import {
  ORG_DEPARTMENT_TEAM,
  ORG_PEOPLE,
  descendantPersonKeys,
  findOrgPersonByName,
  normalizePersonKey,
  orgAccessForViewerName,
  orgChartAllowsAccess,
} from "../lib/orgHierarchy.js";
import { canAccessIdeaSync } from "../lib/propositionAccess.js";

process.env.REQUIRE_AUTH = "true";

const sridhar = findOrgPersonByName("Sridhar Rajam");
assert.equal(sridhar?.role, "department_head");
assert.equal(sridhar?.departmentTeam, ORG_DEPARTMENT_TEAM);

const sankar = findOrgPersonByName("Sankar Kalidas S");
assert.equal(sankar?.role, "team_lead");
assert.equal(sankar.members.length, 6);

const kavitha = findOrgPersonByName("K Kavitha");
assert.equal(kavitha?.role, "unit_head");

assert.ok(findOrgPersonByName("Shobana N.s"));
assert.ok(findOrgPersonByName("shobana n s"), "normalized alias");
assert.ok(findOrgPersonByName("Dharmraj Prajapati"));
assert.ok(findOrgPersonByName("Anubriya D"));

const bhAccess = orgAccessForViewerName("Sridhar Rajam");
assert.equal(bhAccess.kind, "department_head");
assert.deepEqual(bhAccess.departmentTeams, ["R&D"]);
assert.ok(bhAccess.memberKeys.has(normalizePersonKey("Sankar Kalidas S")));
assert.ok(bhAccess.memberKeys.has(normalizePersonKey("Dharmraj Prajapati")));
assert.ok(bhAccess.memberKeys.has(normalizePersonKey("K Kavitha")));
assert.ok(bhAccess.memberKeys.has(normalizePersonKey("Roopan D")));
assert.ok(bhAccess.memberKeys.has(normalizePersonKey("S Uma Shankar")));

assert.ok(
  orgChartAllowsAccess(bhAccess, { ideaTeam: "R&D", ownerName: "Someone Outside Chart" }),
  "department head sees all R&D team ideas"
);
assert.ok(
  orgChartAllowsAccess(bhAccess, { ideaTeam: "CIA", ownerName: "Dharmraj Prajapati" }),
  "department head also sees charted reportees even if team label differs"
);
assert.equal(
  orgChartAllowsAccess(bhAccess, { ideaTeam: "CIA", ownerName: "Unknown Person" }),
  false
);

const leadAccess = orgAccessForViewerName("Sankar Kalidas S");
assert.equal(leadAccess.kind, "team_lead");
assert.ok(orgChartAllowsAccess(leadAccess, { ownerName: "Rasmita Sahoo" }));
assert.ok(orgChartAllowsAccess(leadAccess, { ownerName: "Sankar Kalidas S" }));
assert.equal(orgChartAllowsAccess(leadAccess, { ownerName: "Aarthy S" }), false);
assert.equal(orgChartAllowsAccess(leadAccess, { ideaTeam: "R&D", ownerName: "Outsider" }), false);

const cqmAccess = orgAccessForViewerName("K Kavitha");
assert.equal(cqmAccess.kind, "unit_head");
assert.ok(orgChartAllowsAccess(cqmAccess, { ownerName: "G Ingarsal" }));
assert.ok(orgChartAllowsAccess(cqmAccess, { ownerName: "C Harshini" }));
assert.ok(orgChartAllowsAccess(cqmAccess, { ownerName: "Roopan D" }));
assert.ok(orgChartAllowsAccess(cqmAccess, { ownerName: "Navin Kumar" }));
assert.equal(orgChartAllowsAccess(cqmAccess, { ownerName: "Aarthy S" }), false);
assert.equal(orgChartAllowsAccess(cqmAccess, { ideaTeam: "R&D", ownerName: "Outsider" }), false);

const memberAccess = orgAccessForViewerName("Dharmraj Prajapati");
assert.equal(memberAccess.kind, "member");
assert.equal(orgChartAllowsAccess(memberAccess, { ownerName: "Rasmita Sahoo" }), false);

const directAccess = orgAccessForViewerName("Tara Kannan");
assert.equal(directAccess.kind, "member");

const fragrance = orgAccessForViewerName("Kumar Thangarathinam");
assert.ok(orgChartAllowsAccess(fragrance, { ownerName: "Aksharaa Kannan" }));
assert.ok(orgChartAllowsAccess(fragrance, { ownerName: "Mefy Anna Tomy" }));
assert.equal(orgChartAllowsAccess(fragrance, { ownerName: "Anubriya D" }), false);

const pdLead = orgAccessForViewerName("N Rajyashree");
assert.ok(orgChartAllowsAccess(pdLead, { ownerName: "Rashmika Rao" }));
assert.ok(orgChartAllowsAccess(pdLead, { ownerName: "Yeshwin K" }));

// Own-idea path still works without org grant.
assert.equal(
  canAccessIdeaSync(
    { email: "member@cavinkare.com", role: "BM", status: "active" },
    { createdByEmail: "member@cavinkare.com", submitterDepartment: "R&D" }
  ),
  true
);
assert.equal(
  canAccessIdeaSync(
    { email: "member@cavinkare.com", role: "BM", status: "active" },
    { createdByEmail: "other@cavinkare.com", submitterDepartment: "R&D", submitterName: "Dharmraj Prajapati" }
  ),
  false
);

const chartedLeads = ORG_PEOPLE.filter((p) => p.role === "team_lead");
assert.equal(chartedLeads.length, 12);
const underSridhar = descendantPersonKeys("sridhar-rajam");
assert.ok(underSridhar.size > 40, `expected full R&D tree, got ${underSridhar.size}`);

// Async guard (no Postgres): BH mapping miss is non-fatal; org chart still grants.
const { canAccessIdea } = await import("../lib/propositionAccess.js");
assert.equal(
  await canAccessIdea(
    { id: "lead", name: "Sankar Kalidas S", email: "sankar.kalidas@cavinkare.com", role: "BM", status: "active" },
    {
      createdByEmail: "rasmita@cavinkare.com",
      submitterName: "Rasmita Sahoo",
      submitterDepartment: "R&D",
    }
  ),
  true,
  "team lead sees reportee idea by submitterName"
);
assert.equal(
  await canAccessIdea(
    { id: "lead", name: "Sankar Kalidas S", email: "sankar.kalidas@cavinkare.com", role: "BM", status: "active" },
    {
      createdByEmail: "aarthy@cavinkare.com",
      submitterName: "Aarthy S",
      submitterDepartment: "R&D",
    }
  ),
  false,
  "team lead does not see another lead's reportee"
);
assert.equal(
  await canAccessIdea(
    { id: "bh", name: "Sridhar Rajam", email: "sridhar@cavinkare.com", role: "BM", status: "active" },
    {
      createdByEmail: "outsider@cavinkare.com",
      submitterName: "Outside Chart",
      submitterDepartment: "R&D",
    }
  ),
  true,
  "department head sees any R&D team idea"
);
assert.equal(
  await canAccessIdea(
    { id: "mem", name: "Dharmraj Prajapati", email: "dharmraj@cavinkare.com", role: "BM", status: "active" },
    {
      createdByEmail: "rasmita@cavinkare.com",
      submitterName: "Rasmita Sahoo",
      submitterDepartment: "R&D",
    }
  ),
  false,
  "member does not see peer ideas"
);

console.log(
  `PASS org hierarchy access: BH R&D, ${chartedLeads.length} leads, CQM unit head, members own-only (${underSridhar.size} names under Sridhar)`
);
