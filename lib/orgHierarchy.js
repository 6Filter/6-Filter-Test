/**
 * R&D org chart for idea visibility.
 * Business head → department; unit/team leads → reportees; members → own ideas only.
 * Matching prefers login email (users.email), then normalized display name
 * (users.name / proposition.submitterName).
 */

export const ORG_DEPARTMENT_TEAM = "R&D";

/** @typedef {"department_head"|"unit_head"|"team_lead"|"member"} OrgRole */

/**
 * @typedef {object} OrgMemberRef
 * @property {string} name
 * @property {string} [email]
 */

/**
 * @typedef {object} OrgPerson
 * @property {string} id
 * @property {string} name
 * @property {OrgRole} role
 * @property {string|null} reportsTo
 * @property {string} [email]
 * @property {string} [title]
 * @property {string} [unit]
 * @property {string} [departmentTeam]
 * @property {(string|OrgMemberRef)[]} [members] direct reports (team leads)
 */

function m(name, email) {
  return email ? { name, email } : { name };
}

function memberName(entry) {
  return typeof entry === "string" ? entry : String(entry?.name || "");
}

function memberEmail(entry) {
  return typeof entry === "string" ? "" : String(entry?.email || "").trim().toLowerCase();
}

/** @type {OrgPerson[]} */
export const ORG_PEOPLE = [
  {
    id: "sridhar-rajam",
    name: "Sridhar Rajam",
    email: "sridhar.r@cavinkare.com",
    role: "department_head",
    departmentTeam: ORG_DEPARTMENT_TEAM,
    reportsTo: null,
  },
  {
    id: "k-kavitha",
    name: "K Kavitha",
    email: "kavitha.k@cavinkare.com",
    role: "unit_head",
    unit: "CQM",
    reportsTo: "sridhar-rajam",
  },
  {
    id: "sankar-kalidas-s",
    name: "Sankar Kalidas S",
    email: "sankarkalidas.s@cavinkare.com",
    role: "team_lead",
    unit: "Applied Interfacial Science",
    reportsTo: "sridhar-rajam",
    members: [
      m("Dharmraj Prajapati", "dharmraj.m@cavinkare.com"),
      m("Gomathi Rajalakshmi S", "gomathi.s@cavinkare.com"),
      m("Rasmita Sahoo", "rasmita.r@cavinkare.com"),
      m("Sagar Biswas", "sagar.s@cavinkare.com"),
      m("Sandip Biswas", "sandip.s@cavinkare.com"),
      m("T Annamalai", "annamalai.t@cavinkare.com"),
    ],
  },
  {
    id: "navin-kumar",
    name: "Navin Kumar",
    email: "navin.d@cavinkare.com",
    role: "team_lead",
    title: "Lead",
    unit: "Corporate Quality Assurance - ABC",
    reportsTo: "k-kavitha",
    members: [],
  },
  {
    id: "g-ingarsal",
    name: "G Ingarsal",
    email: "ingersal@cavinkare.com",
    role: "team_lead",
    unit: "CQM Foods",
    reportsTo: "k-kavitha",
    members: [
      m("C Harshini", "harshini.c@cavinkare.com"),
      m("Sanjai Kumar Sathiyamoorthy", "sanjai.s@cavinkare.com"),
    ],
  },
  {
    id: "roopan-d",
    name: "Roopan D",
    email: "roopan.d@cavinkare.com",
    role: "member",
    unit: "CQM Personal Care",
    reportsTo: "k-kavitha",
  },
  {
    id: "kumar-thangarathinam",
    name: "Kumar Thangarathinam",
    email: "kumar.t@cavinkare.com",
    role: "team_lead",
    unit: "Fragrance PC",
    reportsTo: "sridhar-rajam",
    members: [
      m("Aksharaa Kannan", "aksharaa.k@cavinkare.com"),
      m("Mahesh D", "mahesh.d@cavinkare.com"),
      m("Prateek Nilesh Hajare", "prateek.n@cavinkare.com"),
      m("Sonam Nishad", "sonam.l@cavinkare.com"),
      m("Anubhav Kumar", "anubhav.p@cavinkare.com"),
      m("Mefy Anna Tomy", "mefy.t@cavinkare.com"),
      m("S Lavakumar", "lavakumar.s@cavinkare.com"),
      m("Udhayachandran N", "udhayachandran@cavinkare.com"),
    ],
  },
  {
    id: "mahesh-kumar-p",
    name: "Mahesh Kumar P",
    email: "maheshkumar.p@cavinkare.com",
    role: "team_lead",
    unit: "Microbiology",
    reportsTo: "sridhar-rajam",
    members: [
      m("Anusha S. M", "anusha.sm@cavinkare.com"),
      m("Siva Dharshini R", "sivadharshini.r@cavinkare.com"),
    ],
  },
  {
    id: "abiraami-rajeswaran",
    name: "Abiraami Rajeswaran",
    email: "abiraami.r@cavinkare.com",
    role: "team_lead",
    unit: "Product Development",
    reportsTo: "sridhar-rajam",
    members: [
      m("Aarthy S", "aarthy.s@cavinkare.com"),
      m("Kowsalya Kannan", "kowsalya.k@cavinkare.com"),
      m("S Thamizharasi", "thamizharasi.s@cavinkare.com"),
      m("Vinitha K", "vinitha.k@cavinkare.com"),
    ],
  },
  {
    id: "naveen-kumar-s",
    name: "Naveen Kumar S",
    email: "naveenkumar.s@cavinkare.com",
    role: "team_lead",
    title: "Expert Scientist",
    unit: "Product Development - ABC",
    reportsTo: "sridhar-rajam",
    members: [
      m("Kovvuri Samhitha", "samhitha.v@cavinkare.com"),
      m("Rajani N", "rajani.m@cavinkare.com"),
    ],
  },
  {
    id: "soumen-bera",
    name: "Soumen Bera",
    email: "soumen.s@cavinkare.com",
    role: "team_lead",
    title: "Lead Scientist",
    unit: "Product Development - ABC",
    reportsTo: "sridhar-rajam",
    members: [
      m("Akshaya K P", "akshaya.kp@cavinkare.com"),
      m("Anil V", "anil.v@cavinkare.com"),
      m("K Guruparan", "guruparan.k@cavinkare.com"),
    ],
  },
  {
    id: "n-rajyashree",
    name: "N Rajyashree",
    email: "raji.n@cavinkare.com",
    role: "team_lead",
    unit: "Product Development",
    reportsTo: "sridhar-rajam",
    members: [
      m("Bharathi Kannamma S", "bharathi.s@cavinkare.com"),
      m("Yeshwin K", "yeshwink@cavinkare.com"),
      m("Akshay V", "akshay.v@cavinkare.com"),
      m("Rashmika Rao", "rashmika.b@cavinkare.com"),
    ],
  },
  {
    id: "lakshmi-thiagarajan",
    name: "Lakshmi Thiagarajan",
    email: "lakshmi.t@cavinkare.com",
    role: "team_lead",
    unit: "Product Development",
    reportsTo: "sridhar-rajam",
    members: [
      m("Dhivya A", "dhivya.a@cavinkare.com"),
      m("K Sirisha", "sirisha.k@cavinkare.com"),
      m("K Senthilkumar", "senthilkumar.k@cavinkare.com"),
      m("R S Archana", "archana.rs@cavinkare.com"),
    ],
  },
  {
    id: "m-pasupathi",
    name: "M Pasupathi",
    email: "pasupathi.m@cavinkare.com",
    role: "team_lead",
    unit: "Product Development",
    reportsTo: "sridhar-rajam",
    members: [
      m("S Kamalasivam", "kamalasivam.sm@cavinkare.com"),
      m("S Shalini", "shalini.se@cavinkare.com"),
      m("Sajini Vadukumpully", "sajini.v@cavinkare.com"),
      m("Uthaya Sridhar", "uthaya.s@cavinkare.com"),
    ],
  },
  {
    id: "shobana-ns",
    name: "Shobana N.s",
    email: "shobana.ns@cavinkare.com",
    role: "team_lead",
    unit: "Product Development",
    reportsTo: "sridhar-rajam",
    members: [m("Anubriya D", "anubriya.d@cavinkare.com")],
  },
  // Direct reports to Sridhar without a charted team — members (own ideas only).
  {
    id: "gauri-subhash-bodade",
    name: "Gauri Subhash Bodade",
    email: "gauri.s@cavinkare.com",
    role: "member",
    reportsTo: "sridhar-rajam",
  },
  {
    id: "kanakavalli-v",
    name: "Kanakavalli V",
    email: "kanakavalli.v@cavinkare.com",
    role: "member",
    reportsTo: "sridhar-rajam",
  },
  {
    id: "madhavan-g",
    name: "Madhavan G",
    email: "madhavan.g@cavinkare.com",
    role: "member",
    reportsTo: "sridhar-rajam",
  },
  {
    id: "tara-kannan",
    name: "Tara Kannan",
    email: "tara.k@cavinkare.com",
    role: "member",
    reportsTo: "sridhar-rajam",
  },
  {
    id: "muthu-nilavan",
    name: "Muthu Nilavan",
    email: "muthu.n@cavinkare.com",
    role: "member",
    reportsTo: "sridhar-rajam",
  },
  {
    id: "ashwini-ht",
    name: "Ashwini H T",
    email: "ashwini.h@cavinkare.com",
    role: "member",
    reportsTo: "sridhar-rajam",
  },
  {
    id: "vignesh-rajamani",
    name: "Vignesh Rajamani",
    email: "vignesh.r@cavinkare.com",
    role: "member",
    reportsTo: "sridhar-rajam",
  },
  {
    id: "dillbabu-vishwanathan",
    name: "Dillbabu Vishwanathan",
    email: "dillibabu.v@cavinkare.com",
    role: "member",
    reportsTo: "sridhar-rajam",
  },
  {
    id: "rohini-m",
    name: "Rohini M",
    email: "rohini.m@cavinkare.com",
    role: "member",
    reportsTo: "sridhar-rajam",
  },
  {
    id: "m-subhashree",
    name: "M Subhashree",
    email: "subhashree.m@cavinkare.com",
    role: "member",
    reportsTo: "sridhar-rajam",
  },
  {
    id: "sushmitha-s",
    name: "Sushmitha S",
    email: "sushmitha.si@cavinkare.com",
    role: "member",
    reportsTo: "sridhar-rajam",
  },
  {
    id: "s-uma-shankar",
    name: "S Uma Shankar",
    email: "umashankar.s@cavinkare.com",
    role: "member",
    reportsTo: "sridhar-rajam",
  },
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

export function normalizeOrgEmail(raw) {
  return String(raw || "").trim().toLowerCase();
}

const BY_ID = new Map(ORG_PEOPLE.map((p) => [p.id, p]));

/** @type {Map<string, OrgPerson>} */
const BY_KEY = new Map();
/** @type {Map<string, OrgPerson>} */
const BY_EMAIL = new Map();

function indexPerson(person) {
  BY_KEY.set(normalizePersonKey(person.name), person);
  const email = normalizeOrgEmail(person.email);
  if (email) BY_EMAIL.set(email, person);
}

for (const person of ORG_PEOPLE) {
  indexPerson(person);
  for (const entry of person.members || []) {
    const name = memberName(entry);
    const email = memberEmail(entry);
    const key = normalizePersonKey(name);
    if (!key) continue;
    if (!BY_KEY.has(key)) {
      const synthetic = {
        id: `member:${key}`,
        name,
        email: email || undefined,
        role: "member",
        reportsTo: person.id,
      };
      indexPerson(synthetic);
    } else if (email && !BY_EMAIL.has(email)) {
      BY_EMAIL.set(email, BY_KEY.get(key));
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

export function findOrgPersonByEmail(email) {
  const key = normalizeOrgEmail(email);
  if (!key) return null;
  return BY_EMAIL.get(key) || null;
}

/** Prefer login email, then Slack/display name. */
export function findOrgPersonForViewer({ email = "", name = "" } = {}) {
  return findOrgPersonByEmail(email) || findOrgPersonByName(name);
}

function childrenOf(id) {
  return ORG_PEOPLE.filter((p) => p.reportsTo === id);
}

function collectEmailsForPerson(person, into) {
  const self = normalizeOrgEmail(person.email);
  if (self) into.add(self);
  for (const entry of person.members || []) {
    const e = memberEmail(entry);
    if (e) into.add(e);
  }
}

/** Every person key under this node, including the node and charted team members. */
export function descendantPersonKeys(rootId) {
  const out = new Set();
  const walk = (id) => {
    const person = BY_ID.get(id);
    if (!person) return;
    out.add(normalizePersonKey(person.name));
    for (const entry of person.members || []) {
      out.add(normalizePersonKey(memberName(entry)));
    }
    for (const child of childrenOf(id)) walk(child.id);
  };
  walk(rootId);
  return out;
}

/** Every charted email under this node (including the node). */
export function descendantEmails(rootId) {
  const out = new Set();
  const walk = (id) => {
    const person = BY_ID.get(id);
    if (!person) return;
    collectEmailsForPerson(person, out);
    for (const child of childrenOf(id)) walk(child.id);
  };
  walk(rootId);
  return out;
}

function accessForPerson(person) {
  if (!person) return null;

  if (person.role === "department_head") {
    return {
      kind: "department_head",
      departmentTeams: [person.departmentTeam || ORG_DEPARTMENT_TEAM].filter(Boolean),
      memberKeys: descendantPersonKeys(person.id),
      memberEmails: descendantEmails(person.id),
    };
  }
  if (person.role === "unit_head") {
    return {
      kind: "unit_head",
      departmentTeams: [],
      memberKeys: descendantPersonKeys(person.id),
      memberEmails: descendantEmails(person.id),
    };
  }
  if (person.role === "team_lead") {
    const keys = new Set([normalizePersonKey(person.name)]);
    const emails = new Set();
    const selfEmail = normalizeOrgEmail(person.email);
    if (selfEmail) emails.add(selfEmail);
    for (const entry of person.members || []) {
      keys.add(normalizePersonKey(memberName(entry)));
      const e = memberEmail(entry);
      if (e) emails.add(e);
    }
    return { kind: "team_lead", departmentTeams: [], memberKeys: keys, memberEmails: emails };
  }
  const emails = new Set();
  const selfEmail = normalizeOrgEmail(person.email);
  if (selfEmail) emails.add(selfEmail);
  return {
    kind: "member",
    departmentTeams: [],
    memberKeys: new Set([normalizePersonKey(person.name)]),
    memberEmails: emails,
  };
}

/**
 * Visibility grant for a signed-in viewer, derived from their display name.
 * @returns {null | { kind: string, departmentTeams: string[], memberKeys: Set<string>, memberEmails: Set<string> }}
 */
export function orgAccessForViewerName(viewerName) {
  return accessForPerson(findOrgPersonByName(viewerName));
}

/**
 * Visibility grant from login email (preferred) or display name.
 * @returns {null | { kind: string, departmentTeams: string[], memberKeys: Set<string>, memberEmails: Set<string> }}
 */
export function orgAccessForViewer({ email = "", name = "" } = {}) {
  return accessForPerson(findOrgPersonForViewer({ email, name }));
}

export function ideaSubmitterDisplayName(proposition = {}) {
  return String(proposition.submitterName || proposition.submitter_name || "").trim();
}

/**
 * Whether org chart rules grant this viewer access to the idea (beyond own-idea).
 */
export function orgChartAllowsAccess(access, { ownerName = "", ownerEmail = "", ideaTeam = "" } = {}) {
  if (!access || access.kind === "member") return false;
  const team = String(ideaTeam || "").trim();
  if (access.departmentTeams?.length && team && access.departmentTeams.includes(team)) {
    return true;
  }
  const email = normalizeOrgEmail(ownerEmail);
  if (email && access.memberEmails?.has(email)) return true;
  const ownerKey = normalizePersonKey(ownerName);
  if (ownerKey && access.memberKeys?.has(ownerKey)) return true;
  return false;
}

/** Exposed for tests — member list length stays stable whether strings or objects. */
export function orgMemberNames(person) {
  return (person?.members || []).map(memberName);
}
