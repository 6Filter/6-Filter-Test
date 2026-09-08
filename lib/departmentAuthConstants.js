/**
 * Browser-safe department unlock constants only.
 * Do not import server password verification here — that stays in departmentAuth.js.
 */
import { SUBMITTER_DEPARTMENTS } from "./propositionFields.js";

/** R&D / CIA / Marketing / NPD — submitter teams, not CavinKare business divisions. */
export const LOG_UNLOCK_DEPARTMENTS = SUBMITTER_DEPARTMENTS;
