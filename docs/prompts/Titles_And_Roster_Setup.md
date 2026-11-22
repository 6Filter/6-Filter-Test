# 6 Filter Test — the three titles and how to set up who sees what

**The titles (BM is removed as a title everywhere people see it):**

| Title | What the person sees | How the platform knows |
|---|---|---|
| **Individual contributor** | Only the ideas they created | The default for everyone who signs in |
| **Team Lead** | Their own ideas **and the ideas of the people who report to them** (the R&D Team Leads first, as requested) | A row in the roster with `org_role` TEAM_LEAD |
| **Business Head** | **Every idea of every team (division) mapped to them**, for example R&D and Ambient & Beverages | The business-head mapping, set by an admin |
| **Admin** | Everything, and the admin screens | The Admin role (you) |

Nobody is titled BM or BH FORUM any more. (Behind the scenes the stored values stay as they are, so nothing breaks; only the words people see change.)

**One question for you to confirm.** "Team Leads see their team's ideas": do you mean **the people who report to the lead** (how the platform works today, and my default), or **everyone in the R&D department**? The second would make a Team Lead as powerful as a Business Head for R&D. Tell Cursor which; the test supports both.

## What I verified by running the platform (independent test, 21 Nov)

- A Business Head sees exactly the ideas of the teams mapped to them, and no others: **works today**.
- An Individual contributor sees only their own ideas, and a person with no roster row sees only their own: **works today**.
- Opening an idea by its address follows the same rules as the Log: **works today**, apart from the Team Lead problem below.
- **A defect on the live site:** a Team Lead can *open* a report's idea by its address but the **Log list does not show it.** The cause is one missing column (`created_by_email`) in the list query, so the owner's email is empty on every list row. A one-line fix makes all eight visibility checks pass. Cursor has the exact change and my test.
- **The titles themselves are not built yet** (the words BM and BH FORUM still show). Cursor builds them as labels only.

## The roster rules the platform enforces (I found them by running it)

1. The file has exactly five columns: `email, name, team, org_role, reports_to_email`.
2. `org_role` is one of `BUSINESS_HEAD`, `TEAM_LEAD`, `MEMBER`.
3. A **MEMBER must report to someone on the same team.**
4. A **TEAM_LEAD must report to a BUSINESS_HEAD of the same team.**
5. A Business Head has **one team in the roster**. For a Business Head who covers several teams (R&D and Ambient & Beverages), the other teams' ideas reach them through the **business-head mapping**, not through the roster.
6. Team names must be spelled exactly as the platform has them: Ambient & Beverages, CC, CIA, Digital Marketing, FD and Dairy, IB, Manufacturing, Manufacturing and Commodities, MED, Media, Packaging Development, PC, Pets Division, R&D, Sales & Distribution FMCG, Sales & Distribution PPD, SN, Strategic Purchase.
7. Anyone **not** in the roster is simply an Individual contributor. That is fine: nobody has to be in the roster.

## What you do (about 30 minutes, once Cursor's pieces are live, or the roster part today)

**A. Prepare the roster (R&D first).** Use `Roster_Template.csv`. Replace the EXAMPLE rows with real people: the Business Head of each team, the Team Leads (R&D first), and the members who report to each lead. Keep the header line. Save as CSV. Remove every EXAMPLE row. People you leave out stay Individual contributors.

**B. Load the roster** (needs no new code):
1. Sign in as admin, open **Settings**, then the **Roster import** tab.
2. Paste the CSV text (or choose the file) and click **Preview**. Read the issues list: every problem names the line and the reason (for example "MEMBER must report to someone on the same team"). Fix the file and preview again until there are none.
3. Click **Apply** and confirm. Leave "deactivate missing people" **off** the first time.
4. Open the **Users** tab: the **Roster** column should now show "in roster" for those people.

**C. Map each Business Head to the teams they cover.** There is **no screen for this yet**: Cursor builds a small one (Roster import tab, "Business head teams"). Until it exists, the platform's mapping is empty, so Business Heads would see only their own ideas. The mapping **replaces** the whole list each time you save, so always enter every Business Head's rows together.

**D. Check it.** Ask each Team Lead and Business Head to sign in once and open the **Log**. A Business Head should see the ideas of their teams. A Team Lead should see their reports' ideas. An Individual contributor should see only their own. Anyone who sees too much or too little: stop and send me the title, the team, and what they saw.
