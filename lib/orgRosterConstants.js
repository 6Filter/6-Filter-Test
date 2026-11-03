/** Part 125 named visibility / notification constants — do not rename without a prompt. */

/** Business heads also see ideas created by people whose home team is one of theirs. */
export const BH_SEES_HOME_TEAM = true;

/** Team leads are not Slack-notified when manager review is requested. */
export const NOTIFY_TEAM_LEAD_ON_REVIEW = false;

export const ORG_ROSTER_ROLES = Object.freeze(["BUSINESS_HEAD", "TEAM_LEAD", "MEMBER"]);

export const ORG_ROLE_BUSINESS_HEAD = "BUSINESS_HEAD";
export const ORG_ROLE_TEAM_LEAD = "TEAM_LEAD";
export const ORG_ROLE_MEMBER = "MEMBER";
