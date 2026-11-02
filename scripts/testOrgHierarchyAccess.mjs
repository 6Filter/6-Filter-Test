/**
 * R&D org chart visibility: BH → department, leads → reportees, members → own.
 * Login email is the primary role detector; name remains a fallback.
 */
import assert from "node:assert/strict";
import {
  ORG_DEPARTMENT_TEAM,
  ORG_PEOPLE,
  descendantPersonKeys,
  findOrgPersonByEmail,
  findOrgPersonByName,
  normalizeOrgEmail,
  normalizePersonKey,
  orgAccessForViewer,
  orgAccessForViewerName,
  orgChartAllowsAccess,
  orgMemberNames,
} from "../lib/orgHierarchy.js";
import { canAccessIdeaSync } from "../lib/propositionAccess.js";

process.env.REQUIRE_AUTH = "true";

const sridhar = findOrgPersonByName("Sridhar Rajam");
assert.equal(sridhar?.role, "department_head");
assert.equal(sridhar?.departmentTeam, ORG_DEPARTMENT_TEAM);
assert.equal(normalizeOrgEmail(sridhar.email), "sridhar.r@cavinkare.com");

const sankar = findOrgPersonByName("Sankar Kalidas S");
assert.equal(sankar?.role, "team_lead");
assert.equal(orgMemberNames(sankar).length, 6);
assert.equal(normalizeOrgEmail(sankar.email), "sankarkalidas.s@cavinkare.com");

const kavitha = findOrgPersonByName("K Kavitha");
assert.equal(kavitha?.role, "unit_head");
assert.equal(normalizeOrgEmail(kavitha.email), "kavitha.k@cavinkare.com");

assert.ok(findOrgPersonByName("Shobana N.s"));
assert.ok(findOrgPersonByName("shobana n s"), "normalized alias");
assert.ok(findOrgPersonByName("Dharmraj Prajapati"));
assert.ok(findOrgPersonByName("Anubriya D"));

assert.equal(findOrgPersonByEmail("sridhar.r@cavinkare.com")?.id, "sridhar-rajam");
assert.equal(findOrgPersonByEmail("Sridhar.R@cavinkare.com")?.role, "department_head");
assert.equal(findOrgPersonByEmail("rasmita.r@cavinkare.com")?.role, "member");
assert.equal(findOrgPersonByEmail("ingersal@cavinkare.com")?.id, "g-ingarsal");
assert.equal(findOrgPersonByEmail("dillibabu.v@cavinkare.com")?.name, "Dillbabu Vishwanathan");
assert.equal(findOrgPersonByEmail("navin.d@cavinkare.com")?.id, "navin-kumar");
assert.equal(findOrgPersonByEmail("navin.d@cavinkare.com")?.unit, "Corporate Quality Assurance - ABC");
assert.equal(findOrgPersonByEmail("naveenkumar.s@cavinkare.com")?.id, "naveen-kumar-s");
assert.equal(findOrgPersonByEmail("naveenkumar.s@cavinkare.com")?.unit, "Product Development - ABC");
assert.equal(findOrgPersonByEmail("soumen.s@cavinkare.com")?.id, "soumen-bera");
assert.equal(findOrgPersonByEmail("soumen.s@cavinkare.com")?.unit, "Product Development - ABC");
assert.notEqual(
  findOrgPersonByEmail("navin.d@cavinkare.com")?.id,
  findOrgPersonByEmail("naveenkumar.s@cavinkare.com")?.id,
  "Navin Kumar and Naveen Kumar S stay distinct"
);
assert.equal(findOrgPersonByEmail("unknown@cavinkare.com"), null);
assert.equal(
  orgAccessForViewer({ email: "navin.d@cavinkare.com" }).kind,
  "team_lead"
);
assert.equal(
  orgAccessForViewer({ email: "soumen.s@cavinkare.com" }).kind,
  "team_lead"
);
assert.ok(
  orgChartAllowsAccess(orgAccessForViewer({ email: "soumen.s@cavinkare.com" }), {
    ownerEmail: "anil.v@cavinkare.com",
  })
);

const bhAccess = orgAccessForViewerName("Sridhar Rajam");
assert.equal(bhAccess.kind, "department_head");
assert.deepEqual(bhAccess.departmentTeams, ["R&D"]);
assert.ok(bhAccess.memberKeys.has(normalizePersonKey("Sankar Kalidas S")));
assert.ok(bhAccess.memberKeys.has(normalizePersonKey("Dharmraj Prajapati")));
assert.ok(bhAccess.memberKeys.has(normalizePersonKey("K Kavitha")));
assert.ok(bhAccess.memberKeys.has(normalizePersonKey("Roopan D")));
assert.ok(bhAccess.memberKeys.has(normalizePersonKey("S Uma Shankar")));
assert.ok(bhAccess.memberEmails.has("sankarkalidas.s@cavinkare.com"));
assert.ok(bhAccess.memberEmails.has("dharmraj.m@cavinkare.com"));

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

const leadByEmail = orgAccessForViewer({
  email: "sankarkalidas.s@cavinkare.com",
  name: "Totally Different Slack Name",
});
assert.equal(leadByEmail.kind, "team_lead");
assert.ok(
  orgChartAllowsAccess(leadByEmail, {
    ownerEmail: "rasmita.r@cavinkare.com",
    ownerName: "",
  }),
  "team lead matched by login email sees reportee by owner email"
);
assert.equal(
  orgChartAllowsAccess(leadByEmail, {
    ownerEmail: "aarthy.s@cavinkare.com",
    ownerName: "Aarthy S",
  }),
  false
);

const leadAccess = orgAccessForViewerName("Sankar Kalidas S");
assert.equal(leadAccess.kind, "team_lead");
assert.ok(orgChartAllowsAccess(leadAccess, { ownerName: "Rasmita Sahoo" }));
assert.ok(orgChartAllowsAccess(leadAccess, { ownerName: "Sankar Kalidas S" }));
assert.equal(orgChartAllowsAccess(leadAccess, { ownerName: "Aarthy S" }), false);
assert.equal(orgChartAllowsAccess(leadAccess, { ideaTeam: "R&D", ownerName: "Outsider" }), false);

const cqmAccess = orgAccessForViewer({ email: "kavitha.k@cavinkare.com" });
assert.equal(cqmAccess.kind, "unit_head");
assert.ok(orgChartAllowsAccess(cqmAccess, { ownerName: "G Ingarsal" }));
assert.ok(orgChartAllowsAccess(cqmAccess, { ownerEmail: "harshini.c@cavinkare.com" }));
assert.ok(orgChartAllowsAccess(cqmAccess, { ownerEmail: "roopan.d@cavinkare.com" }));
assert.ok(orgChartAllowsAccess(cqmAccess, { ownerName: "Navin Kumar" }));
assert.equal(orgChartAllowsAccess(cqmAccess, { ownerName: "Aarthy S" }), false);
assert.equal(orgChartAllowsAccess(cqmAccess, { ideaTeam: "R&D", ownerName: "Outsider" }), false);

const memberAccess = orgAccessForViewer({ email: "dharmraj.m@cavinkare.com" });
assert.equal(memberAccess.kind, "member");
assert.equal(orgChartAllowsAccess(memberAccess, { ownerName: "Rasmita Sahoo" }), false);

const directAccess = orgAccessForViewer({ email: "tara.k@cavinkare.com", name: "Tara Kannan" });
assert.equal(directAccess.kind, "member");

const fragrance = orgAccessForViewer({ email: "kumar.t@cavinkare.com" });
assert.ok(orgChartAllowsAccess(fragrance, { ownerEmail: "aksharaa.k@cavinkare.com" }));
assert.ok(orgChartAllowsAccess(fragrance, { ownerEmail: "mefy.t@cavinkare.com" }));
assert.equal(orgChartAllowsAccess(fragrance, { ownerEmail: "anubriya.d@cavinkare.com" }), false);

const pdLead = orgAccessForViewer({ email: "raji.n@cavinkare.com" });
assert.ok(orgChartAllowsAccess(pdLead, { ownerEmail: "rashmika.b@cavinkare.com" }));
assert.ok(orgChartAllowsAccess(pdLead, { ownerEmail: "yeshwink@cavinkare.com" }));

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

const emailed = ORG_PEOPLE.filter((p) => p.email).length;
assert.ok(emailed >= 20, `expected most charted people to have emails, got ${emailed}`);

// Async guard (no Postgres): BH mapping miss is non-fatal; org chart still grants.
const { canAccessIdea } = await import("../lib/propositionAccess.js");
assert.equal(
  await canAccessIdea(
    {
      id: "lead",
      name: "Wrong Slack Display",
      email: "sankarkalidas.s@cavinkare.com",
      role: "BM",
      status: "active",
    },
    {
      createdByEmail: "rasmita.r@cavinkare.com",
      submitterName: "",
      submitterDepartment: "R&D",
    }
  ),
  true,
  "team lead matched by login email sees reportee by owner email"
);
assert.equal(
  await canAccessIdea(
    {
      id: "lead",
      name: "Sankar Kalidas S",
      email: "sankarkalidas.s@cavinkare.com",
      role: "BM",
      status: "active",
    },
    {
      createdByEmail: "aarthy.s@cavinkare.com",
      submitterName: "Aarthy S",
      submitterDepartment: "R&D",
    }
  ),
  false,
  "team lead does not see another lead's reportee"
);
assert.equal(
  await canAccessIdea(
    {
      id: "bh",
      name: "Someone Else",
      email: "sridhar.r@cavinkare.com",
      role: "BM",
      status: "active",
    },
    {
      createdByEmail: "outsider@cavinkare.com",
      submitterName: "Outside Chart",
      submitterDepartment: "R&D",
    }
  ),
  true,
  "department head matched by email sees any R&D team idea"
);
assert.equal(
  await canAccessIdea(
    {
      id: "mem",
      name: "Dharmraj Prajapati",
      email: "dharmraj.m@cavinkare.com",
      role: "BM",
      status: "active",
    },
    {
      createdByEmail: "rasmita.r@cavinkare.com",
      submitterName: "Rasmita Sahoo",
      submitterDepartment: "R&D",
    }
  ),
  false,
  "member does not see peer ideas"
);
assert.equal(
  await canAccessIdea(
    {
      id: "cqm",
      name: "Kavitha",
      email: "kavitha.k@cavinkare.com",
      role: "BM",
      status: "active",
    },
    {
      createdByEmail: "sanjai.s@cavinkare.com",
      submitterName: "Sanjai Kumar Sathiyamoorthy",
      submitterDepartment: "R&D",
    }
  ),
  true,
  "CQM unit head matched by email sees Foods reportee"
);

console.log(
  `PASS org hierarchy access: email+name roles, BH R&D, ${chartedLeads.length} leads, CQM unit head, members own-only (${underSridhar.size} names under Sridhar)`
);
