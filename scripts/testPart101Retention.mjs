import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  createProposition,
  deleteAllPropositions,
  deleteProposition,
  deleteUntouchedDrafts,
  getPropositionById,
  restoreDeletedProposition,
  updateProposition,
} from "../lib/db.js";
import { clearCountDays, decideCountAlarm, noteFilePropositionCount, resetCountWriteThrottle } from "../lib/propositionRetention.js";
import { anthropicSystemBlocks, flattenSkillSystem, sixFilterFullSystem } from "../lib/skills/loadSkill.js";

const dbSrc = readFileSync(new URL("../lib/db.js", import.meta.url), "utf8");
assert.match(dbSrc, /BEGIN/);
assert.match(dbSrc, /INSERT INTO deleted_propositions/);
assert.match(dbSrc, /DELETE FROM deleted_propositions WHERE id = \$1/);
assert.match(dbSrc, /INSERT INTO proposition_audit/);
assert.match(dbSrc, /SET TRANSACTION READ ONLY|BEGIN READ ONLY/);
const retentionSrc = readFileSync(new URL("../lib/propositionRetention.js", import.meta.url), "utf8");
assert.match(retentionSrc, /!rows\.some\(\(doc\) => doc\.id === row\.id\)/);

assert.equal(
  decideCountAlarm({ lastCount: 90, previousMax: 100, auditedDeletes: 0, alarmAlreadySent: false }),
  "Proposition count dropped from 100 to 90 with no audit record."
);
assert.equal(
  decideCountAlarm({ lastCount: 90, previousMax: 100, auditedDeletes: 10, alarmAlreadySent: false }),
  null
);
assert.equal(decideCountAlarm({ lastCount: 98, previousMax: 100, auditedDeletes: 0 }), null);

resetCountWriteThrottle();
await clearCountDays(["2026-10-07", "2026-10-08"]);
const first = await noteFilePropositionCount(20, { force: true, now: new Date("2026-10-07T00:00:00Z"), auditedDeletes: 0 });
assert.equal(first.wrote, true);
const second = await noteFilePropositionCount(10, {
  force: true,
  now: new Date("2026-10-08T00:00:00Z"),
  auditedDeletes: 0,
});
assert.match(second.alarm, /dropped from 20 to 10/);
const quiet = await noteFilePropositionCount(10, {
  force: true,
  now: new Date("2026-10-08T00:00:00Z"),
  auditedDeletes: 10,
});
assert.equal(quiet.alarm, null);

const single = await createProposition({ submitterDepartment: "Marketing" });
await updateProposition(single.id, { ...single, name: "archive-me", ideaDescription: "keep" });
assert.equal(await deleteProposition(single.id, "test"), true);
assert.equal(await getPropositionById(single.id), null);
const restored = await restoreDeletedProposition(single.id);
assert.equal(restored, single.id);
assert.equal((await getPropositionById(single.id)).name, "archive-me");
await assert.rejects(() => restoreDeletedProposition(single.id), /Refusing to duplicate/);
assert.equal(await deleteProposition(single.id, "test"), true, "re-delete after restore must replace archive");
assert.equal(await getPropositionById(single.id), null);
const restoredAgain = await restoreDeletedProposition(single.id);
assert.equal(restoredAgain, single.id);
await deleteProposition(single.id, "test");

const blank = await createProposition({ submitterDepartment: "Marketing" });
const untouched = await deleteUntouchedDrafts("Marketing", "test");
assert.ok(untouched.includes(blank.id));
await restoreDeletedProposition(blank.id);
await deleteProposition(blank.id, "test");

const scoped = await createProposition({ submitterDepartment: "Marketing" });
await updateProposition(scoped.id, { ...scoped, name: "scoped", ideaDescription: "x", submitterDepartment: "Marketing" });
const n = await deleteAllPropositions("Marketing", "test");
assert.ok(n >= 1);
await restoreDeletedProposition(scoped.id);
await deleteProposition(scoped.id, "test");

const system = sixFilterFullSystem("per-call task");
const blocks = anthropicSystemBlocks(system);
assert.equal(blocks[0].cache_control.type, "ephemeral");
assert.equal(blocks[1].cache_control, undefined);
assert.equal(flattenSkillSystem(system), `${blocks[0].text}\n\n---\n\n${blocks[1].text}`);
assert.doesNotMatch(blocks[0].text, /per-call task/);
assert.match(blocks[1].text, /per-call task/);

console.log("testPart101Retention ok");
