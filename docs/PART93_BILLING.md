# Part 93 — Session billing and research-cache policy

## Verified session owns Anthropic billing

Team unlock (`primus_dept` cookie) gates the whole platform. Research and other
LLM calls bill that unlocked team's Anthropic key — never the Proposition Form
"Your department" dropdown (`submitterDepartment`), which remains Log metadata
and category-scoping context only.

| Session | Key source |
|---|---|
| R&D / CIA / Marketing / NPD | Encrypted `department_api_keys` (bootstrapped from `DEPT_API_KEY_*`). If that team key is unset, `ANTHROPIC_API_KEY` so auto-populate still runs. |
| Master | Infrastructure `ANTHROPIC_API_KEY` |
| Scripts / CI with no session | Infrastructure `ANTHROPIC_API_KEY` |

There is **no silent fallback** from one team's exhausted key onto another team's
key. A missing team key may use the shared infra key. Credit failures return a
hard, visible error naming the department.

## Evidence read (Part 131)

When an Evidence Source file or link is present, Submit adds one priced step
(`evidence`, ≤ 20,000 input tokens, no web search). It is listed in
`expectedResearchSteps` and the Submit price confirmation. Cache key =
file sha256 + idea/category/benchmark/attributes hash. Changing the evidence
forces a research-cache miss.

## Cross-department research-cache policy — **REUSE**

Decision (explicit): the research fingerprint does **not** include session or
submitter department. If CIA's session pays for a miss and Marketing later
submits identical research inputs, Marketing gets a **cache HIT** — no Anthropic
call, no charge.

Rationale: findings are department-agnostic; re-charging would waste money
without changing quality. Billing attribution applies only to cache misses
executed under a verified session.
