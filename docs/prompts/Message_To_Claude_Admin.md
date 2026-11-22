# Message to the Claude admin (send ONLY when the owner says the address is live)

**Subject: Please add one read-only custom connector to our Claude workspace (pilot)**

Hi,

I would like to add a connector so that our own Claude accounts can look up ideas and verdicts from our NPD screening tool (6 Filter Test). It is **read-only** for now.

**Please do not add it yet.** The address currently returns "Not found" on purpose while we finish security checks. I will message you the moment it is live.

When I confirm, please add it like this (the menu names may differ slightly): **Organization settings, Connectors, Add, Custom, Web**.

- **Name:** `6 Filter Test (read-only pilot)`
- **URL:** `https://ck-6-filter-test-88wu.onrender.com/mcp`
- **OAuth client:** leave it on "Use Claude's published identity".
- **Request headers:** leave empty.
- **Do not enter any API key, token or secret.** None is needed. People sign in once with their work email, and the code arrives in Slack.

Then, before enabling it for anyone:
1. Open the connector's tool list and tell me what it shows. It must be **exactly three tools: `list_ideas`, `open_idea`, `read_verdict`**. If you see anything about save, upload or screen, **do not enable it** and tell me.
2. If Claude lets you set a permission per tool, please set all three to **ask for approval** for the first weeks.
3. Please make it available only on **company-managed Claude accounts**, not personal or free ones.
4. Tell me when it is on, and let me know the first person who connects, so I can watch the first sign-ins. I will tell you when other people may connect.

Two things to know:
- The connector only lets a short pilot list of people finish signing in; anyone else is refused with a "limited pilot" message, so it is safe if it is visible to everyone in the workspace.
- The tool shows each person only the ideas their team can already see on the website. The text of those ideas will appear in their Claude conversations, under your workspace's retention settings, so please check that is acceptable.
- You can remove the connector at any time from the same screen. I can also cut off sign-ins on our side.

Thank you.
