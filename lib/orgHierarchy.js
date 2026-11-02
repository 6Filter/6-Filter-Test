/**
 * R&D org chart for idea visibility.
 * Business head → department; unit/team leads → reportees; members → own ideas only.
 * Matching is by normalized person name (users.name / proposition.submitterName).
 */

export const ORG_DEPARTMENT_TEAM = "R&D";

/** @typedef {"department_head"|"unit_head"|"team_lead"|"member"} OrgRole */

/**
 * @typedef {object} OrgPerson
 * @property {string} id
 * @property {string} name
 * @property {OrgRole} role
 * @property {string|null} reportsTo
 * @property {string} [unit]
 * @property {string} [departmentTeam]
 * @property {string[]} [members] display names of direct reports (team leads)
 */

/** @type {OrgPerson[]} */
export const ORG_PEOPLE = [
  {
    id: "sridhar-rajam",
    name: "Sridhar Rajam",
    role: "department_head",
    departmentTeam: ORG_DEPARTMENT_TEAM,
    reportsTo: null,
  },
  {
    id: "k-kavitha",
    name: "K Kavitha",
    role: "unit_head",
    unit: "CQM",
    reportsTo: "sridhar-rajam",
  },
  {
    id: "sankar-kalidas-s",
    name: "Sankar Kalidas S",
    role: "team_lead",
    unit: "Applied Interfacial Science",
    reportsTo: "sridhar-rajam",
    members: [
      "Dharmraj Prajapati",
      "Gomathi Rajalakshmi S",
      "Rasmita Sahoo",
      "Sagar Biswas",
      "Sandip Biswas",
      "T Annamalai",
    ],
  },
  {
    id: "navin-kumar",
    name: "Navin Kumar",
    role: "team_lead",
    unit: "CQM ABC",
    reportsTo: "k-kavitha",
    members: [],
  },
  {
    id: "g-ingarsal",
    name: "G Ingarsal",
    role: "team_lead",
    unit: "CQM Foods",
    reportsTo: "k-kavitha",
    members: ["C Harshini", "Sanjai Kumar Sathiyamoorthy"],
  },
  {
    id: "roopan-d",
    name: "Roopan D",
    role: "member",
    unit: "CQM Personal Care",
    reportsTo: "k-kavitha",
  },
  {
    id: "kumar-thangarathinam",
    name: "Kumar Thangarathinam",
    role: "team_lead",
    unit: "Fragrance PC",
    reportsTo: "sridhar-rajam",
    members: [
      "Aksharaa Kannan",
      "Mahesh D",
      "Prateek Nilesh Hajare",
      "Sonam Nishad",
      "Anubhav Kumar",
      "Mefy Anna Tomy",
      "S Lavakumar",
      "Udhayachandran N",
    ],
  },
  {
    id: "mahesh-kumar-p",
    name: "Mahesh Kumar P",
    role: "team_lead",
    unit: "Microbiology",
    reportsTo: "sridhar-rajam",
    members: ["Anusha S. M", "Siva Dharshini R"],
  },
  {
    id: "abiraami-rajeswaran",
    name: "Abiraami Rajeswaran",
    role: "team_lead",
    unit: "Product Development",
    reportsTo: "sridhar-rajam",
    members: ["Aarthy S", "Kowsalya Kannan", "S Thamizharasi", "Vinitha K"],
  },
  {
    id: "naveen-kumar-s",
    name: "Naveen Kumar S",
    role: "team_lead",
    unit: "Product Development",
    reportsTo: "sridhar-rajam",
    members: ["Kovvuri Samhitha", "Rajani N"],
  },
  {
    id: "soumen-bera",
    name: "Soumen Bera",
    role: "team_lead",
    unit: "Product Development",
    reportsTo: "sridhar-rajam",
    members: ["Akshaya K P", "Anil V", "K Guruparan"],
  },
  {
    id: "n-rajyashree",
    name: "N Rajyashree",
    role: "team_lead",
    unit: "Product Development",
    reportsTo: "sridhar-rajam",
    members: ["Bharathi Kannamma S", "Yeshwin K", "Akshay V", "Rashmika Rao"],
  },
  {
    id: "lakshmi-thiagarajan",
    name: "Lakshmi Thiagarajan",
    role: "team_lead",
    unit: "Product Development",
    reportsTo: "sridhar-rajam",
    members: ["Dhivya A", "K Sirisha", "K Senthilkumar", "R S Archana"],
  },
  {
    id: "m-pasupathi",
    name: "M Pasupathi",
    role: "team_lead",
    unit: "Product Development",
    reportsTo: "sridhar-rajam",
    members: ["S Kamalasivam", "S Shalini", "Sajini Vadukumpully", "Uthaya Sridhar"],
  },
  {
    id: "shobana-ns",
    name: "Shobana N.s",
    role: "team_lead",
    unit: "Product Development",
    reportsTo: "sridhar-rajam",
    members: ["Anubriya D"],
  },
  // Direct reports to Sridhar without a charted team — members (own ideas only).
  { id: "gauri-subhash-bodade", name: "Gauri Subhash Bodade", role: "member", reportsTo: "sridhar-rajam" },
  { id: "kanakavalli-v", name: "Kanakavalli V", role: "member", reportsTo: "sridhar-rajam" },
  { id: "madhavan-g", name: "Madhavan G", role: "member", reportsTo: "sridhar-rajam" },
  { id: "tara-kannan", name: "Tara Kannan", role: "member", reportsTo: "sridhar-rajam" },
  { id: "muthu-nilavan", name: "Muthu Nilavan", role: "member", reportsTo: "sridhar-rajam" },
  { id: "ashwini-ht", name: "Ashwini H T", role: "member", reportsTo: "sridhar-rajam" },
  { id: "vignesh-rajamani", name: "Vignesh Rajamani", role: "member", reportsTo: "sridhar-rajam" },
  { id: "dillbabu-vishwanathan", name: "Dillbabu Vishwanathan", role: "member", reportsTo: "sridhar-rajam" },
  { id: "rohini-m", name: "Rohini M", role: "member", reportsTo: "sridhar-rajam" },
  { id: "m-subhashree", name: "M Subhashree", role: "member", reportsTo: "sridhar-rajam" },
  { id: "sushmitha-s", name: "Sushmitha S", role: "member", reportsTo: "sridhar-rajam" },
  { id: "s-uma-shankar", name: "S Uma Shankar", role: "member", reportsTo: "sridhar-rajam" },
];

export function normalizePersonKey(raw) {
  return String(raw || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

const BY_ID = new Map(ORG_PEOPLE.map((p) => [p.id, p]));

/** @type {Map<string, OrgPerson>} */
const BY_KEY = new Map();
for (const person of ORG_PEOPLE) {
  BY_KEY.set(normalizePersonKey(person.name), person);
  for (const memberName of person.members || []) {
    const key = normalizePersonKey(memberName);
    if (!BY_KEY.has(key)) {
      BY_KEY.set(key, {
        id: `member:${key}`,
        name: memberName,
        role: "member",
        reportsTo: person.id,
      });
    }
  }
}

export function findOrgPersonByName(name) {
  const key = normalizePersonKey(name);
  if (!key) return null;
  if (BY_KEY.has(key)) return BY_KEY.get(key);
  // Tolerate "Last First" vs chart order by comparing token sets for unique matches.
  const tokens = new Set(key.split(" ").filter(Boolean));
  if (tokens.size < 2) return null;
  let hit = null;
  for (const [k, person] of BY_KEY) {
    const other = new Set(k.split(" ").filter(Boolean));
    if (other.size !== tokens.size) continue;
    let same = true;
    for (const t of tokens) {
      if (!other.has(t)) {
        same = false;
        break;
      }
    }
    if (!same) continue;
    if (hit) return null;
    hit = person;
  }
  return hit;
}

function childrenOf(id) {
  return ORG_PEOPLE.filter((p) => p.reportsTo === id);
}

/** Every person key under this node, including the node and charted team members. */
export function descendantPersonKeys(rootId) {
  const out = new Set();
  const walk = (id) => {
    const person = BY_ID.get(id);
    if (!person) return;
    out.add(normalizePersonKey(person.name));
    for (const memberName of person.members || []) {
      out.add(normalizePersonKey(memberName));
    }
    for (const child of childrenOf(id)) walk(child.id);
  };
  walk(rootId);
  return out;
}

/**
 * Visibility grant for a signed-in viewer, derived from their display name.
 * @returns {null | { kind: string, departmentTeams: string[], memberKeys: Set<string> }}
 */
export function orgAccessForViewerName(viewerName) {
  const person = findOrgPersonByName(viewerName);
  if (!person) return null;

  if (person.role === "department_head") {
    return {
      kind: "department_head",
      departmentTeams: [person.departmentTeam || ORG_DEPARTMENT_TEAM].filter(Boolean),
      memberKeys: descendantPersonKeys(person.id),
    };
  }
  if (person.role === "unit_head") {
    return {
      kind: "unit_head",
      departmentTeams: [],
      memberKeys: descendantPersonKeys(person.id),
    };
  }
  if (person.role === "team_lead") {
    const keys = new Set([normalizePersonKey(person.name)]);
    for (const memberName of person.members || []) keys.add(normalizePersonKey(memberName));
    return { kind: "team_lead", departmentTeams: [], memberKeys: keys };
  }
  return { kind: "member", departmentTeams: [], memberKeys: new Set([normalizePersonKey(person.name)]) };
}

export function ideaSubmitterDisplayName(proposition = {}) {
  return String(proposition.submitterName || proposition.submitter_name || "").trim();
}

/**
 * Whether org chart rules grant this viewer access to the idea (beyond own-idea).
 */
export function orgChartAllowsAccess(access, { ownerName = "", ideaTeam = "" } = {}) {
  if (!access || access.kind === "member") return false;
  const team = String(ideaTeam || "").trim();
  if (access.departmentTeams?.length && team && access.departmentTeams.includes(team)) {
    return true;
  }
  const ownerKey = normalizePersonKey(ownerName);
  if (ownerKey && access.memberKeys?.has(ownerKey)) return true;
  return false;
}
