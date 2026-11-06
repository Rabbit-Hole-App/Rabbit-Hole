// Shared fixture for the R4 State/Money tests: the real consolidated schema on node:sqlite (learnDb), a learner access object, a roadmap taken to
// an offered proposal, and a mocked provider that counts its calls. Nothing here is paid or networked.
import { learnDb } from './learn-grade-fixture.js';
import { requestSpendBound } from '../src/learn-spend.js';
import { toMicros } from '../src/learn-usage.js';
import { createRoadmap, recordPlan, acceptPlan, offerProposal } from '../src/roadmap/roadmap-store.js';

export const MODEL = 'claude-opus-5-5';
export const body = { max_tokens: 200, messages: [{ role: 'user', content: 'Synthetic question.' }] };
export const NEED = toMicros(requestSpendBound(body, MODEL)); // one request's reservation in micros
export const usd = micros => (micros / 1e6).toFixed(6);

export const accessFor = (userId = 'u-alice', boardId = 'lb_board00000000000001') => ({ org: 'team', actorUserId: userId, actorEmail: `${userId}@example.test`, boardId, boardOwnerEmail: `${userId}@example.test`, role: 'owner', payerUserId: userId });

export function world(t, { allowanceMicros = 10_000_000 } = {}) {
  const { sqlite, LEARN_DB } = learnDb(t);
  const env = { SMALL_ENV: 'dev', LEARN_DB, USAGE_PLATFORM_DAY_USD: '100', AI_MONTHLY_ALLOWANCE_USD: usd(allowanceMicros) };
  for (const user of ["u-alice", "u-bob"]) sqlite.prepare("INSERT INTO learn_boards (id, org, owner_email, app, board, state_json, updated_at) VALUES (?, 'team', ?, 'learn', 'main', '{}', '2026-11-06')").run(user === "u-alice" ? "lb_board00000000000001" : "lb_board00000000000003", `${user}@example.test`);
  return { sqlite, LEARN_DB, env, access: accessFor() };
}

// A roadmap with an accepted plan and one pending (checked) proposal. -> ids and the revisions a client would send.
export async function offered({ LEARN_DB }, access, { n = 1 } = {}) {
  const made = await createRoadmap(LEARN_DB, access, { actionKey: `create-${n}-0001`, app: 'learn', instruction: 'I already know X, teach me Y', source: { key: 'file:fs_a', rev: 'rev1' }, scope: { kind: 'whole' }, scopeFingerprint: 'fp1', depth: 'standard' });
  const roadmapId = made.body.roadmapId;
  const plan = { outcome: 'Teach Y', assumptions: [], formats: ['explanation', 'table'], stoppingPoint: 'Y understood', steps: [
    { title: 'Step one', goal: 'g1', format: 'explanation', passage: { start: 0, end: 100 } }, { title: 'Step two', goal: 'g2', format: 'table', passage: { start: 100, end: 200 } }] };
  await recordPlan(LEARN_DB, access, { roadmapId, actionKey: `plan-${n}-00001`, expectedRevision: 1, plan, promptVersion: 'p1' });
  await LEARN_DB.prepare("DELETE FROM learn_roadmap_outbox WHERE kind = 'plan_requested'").run(); // this fixture plans by hand; the glue's planning event is tested in roadmap-planning.test.js
  await acceptPlan(LEARN_DB, access, { roadmapId, expectedRevision: 2, planVersion: 1, actionKey: `accept-plan-${n}-1` });
  const step = await LEARN_DB.prepare('SELECT id FROM learn_roadmap_steps WHERE roadmap_id = ? AND position = 1').bind(roadmapId).first();
  const offer = await offerProposal(LEARN_DB, access, { roadmapId, expectedRevision: 3, actionKey: `offer-${n}-000001`, stepId: step.id, format: 'explanation', title: 'Step one', description: 'About Y', contentHash: 'hash1' });
  return { roadmapId, stepId: step.id, proposalId: offer.body.proposalId, proposalVersion: offer.body.version, revision: 4 };
}

export function provider() {
  const calls = [];
  const reply = (usage = { input_tokens: 100, output_tokens: 20 }) => async () => { calls.push(1); return Response.json({ model: MODEL, usage, content: [{ type: 'text', text: 'Synthetic.' }] }); };
  return { calls, reply };
}
export const rows = (sqlite, sql, ...args) => sqlite.prepare(sql).all(...args).map(r => ({ ...r }));
