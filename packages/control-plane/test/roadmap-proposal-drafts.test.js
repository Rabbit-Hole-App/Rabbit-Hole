// R5.01: proposal edit drafts. Real store/outbox on the in-memory schema plus migration 0041; the edit composer is a double (no model, no network).
// A draft is a preview: it never changes the pending original, never authorizes generation and never charges; only Apply makes the next version.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { acceptRoadmapStep } from '../src/roadmap/roadmap-store.js';
import { applyProposalDraft, discardProposalDraft, saveProposalDraft, sweepProposalDrafts } from '../src/roadmap/roadmap-proposal-drafts.js';
import { EDIT_PROMPT, makeComposeEdit, validateEdit } from '../src/roadmap/roadmap-edit.js';
import { roadmapRoute } from '../src/roadmap/roadmap-routes.js';
import { world, offered, accessFor, rows } from './roadmap-fixture.js';

const T0 = Math.floor(Date.now() / 1000);
const MIGRATION = readFileSync(new URL('../learn-migrations/0041-roadmap-proposal-drafts.sql', import.meta.url), 'utf8');
const EDIT = { title: 'Step one as a table', description: 'A table of the main terms.', format: 'table' };
async function setup(t) {
  const w = world(t);
  w.sqlite.exec(MIGRATION);
  const o = await offered(w, w.access);
  let composed = 0;
  const composeEdit = async () => { composed += 1; return EDIT; };
  const save = (extra = {}) => saveProposalDraft(w.LEARN_DB, w.access, { roadmapId: o.roadmapId, proposalId: o.proposalId, proposalVersion: o.proposalVersion, instruction: 'make it a table', actionKey: 'draft-key-00001', composeEdit, now: T0, ...extra });
  const apply = (draft, extra = {}) => applyProposalDraft(w.LEARN_DB, w.access, { roadmapId: o.roadmapId, draftId: draft.body.draftId, draftRevision: draft.body.revision, proposalVersion: o.proposalVersion, actionKey: 'apply-key-00001', now: T0 + 5, ...extra });
  const money = () => ({ auth: rows(w.sqlite, 'SELECT COUNT(*) AS n FROM learn_step_authorizations')[0].n, results: rows(w.sqlite, 'SELECT COUNT(*) AS n FROM learn_step_results')[0].n, calls: rows(w.sqlite, 'SELECT COUNT(*) AS n FROM learn_roadmap_calls')[0].n, usage: rows(w.sqlite, 'SELECT COUNT(*) AS n FROM usage_attempts')[0].n });
  const proposals = () => rows(w.sqlite, 'SELECT version, state, title, format FROM learn_step_proposals ORDER BY version');
  return { w, o, save, apply, money, proposals, composed: () => composed };
}

test('saving a draft leaves the pending original untouched, buys nothing, and a repeated action key replays the same draft without a second composition', async t => {
  const { w, o, save, money, proposals, composed } = await setup(t);
  const before = { money: money(), proposals: proposals(), revision: rows(w.sqlite, 'SELECT revision FROM learn_roadmaps')[0].revision };
  const first = await save();
  assert.deepEqual([first.status, first.body.title, first.body.checkStatus, first.body.revision], [200, EDIT.title, 'passed', 1]);
  assert.deepEqual(proposals(), before.proposals, 'the original is exactly as it was');
  assert.deepEqual(money(), before.money, 'no authorization, result, provider call or usage');
  assert.equal(rows(w.sqlite, 'SELECT revision FROM learn_roadmaps')[0].revision, before.revision, 'a preview does not change the roadmap');
  const again = await save();
  assert.equal(again.replayed, true);
  assert.equal(again.body.draftId, first.body.draftId);
  assert.equal(composed(), 1, 'the replay did no platform work');
  assert.equal(rows(w.sqlite, 'SELECT COUNT(*) AS n FROM learn_proposal_drafts')[0].n, 1);
  await assert.rejects(save({ instruction: 'something else entirely' }), e => e.code === 'action_key_reused');
  void o;
});

test('Apply creates the next immutable version, supersedes the original, consumes the draft once and appends one event', async t => {
  const { w, o, save, apply, money, proposals } = await setup(t);
  const before = money();
  const draft = await save();
  const done = await apply(draft);
  assert.equal(done.body.version, 2);
  assert.equal(done.body.state, 'pending');
  assert.deepEqual(proposals().map(p => [p.version, p.state]), [[1, 'superseded'], [2, 'pending']]);
  assert.deepEqual(rows(w.sqlite, 'SELECT title, format FROM learn_step_proposals WHERE version = 2')[0], { title: EDIT.title, format: 'table' });
  assert.equal(rows(w.sqlite, "SELECT state FROM learn_proposal_drafts")[0].state, 'applied');
  assert.equal(rows(w.sqlite, "SELECT COUNT(*) AS n FROM learn_roadmap_outbox WHERE kind = 'proposal_edited'")[0].n, 1);
  assert.equal(rows(w.sqlite, "SELECT COUNT(*) AS n FROM learn_step_proposals WHERE state IN ('checking', 'held', 'pending')")[0].n, 1, 'still one offered step');
  assert.deepEqual(money(), before, 'zero learner debit and no generation dispatch');
  assert.equal((await apply(draft)).replayed, true, 'a duplicate Apply replays');
  await assert.rejects(apply(draft, { actionKey: 'apply-key-00002' }), e => e.status === 409, 'a second Apply with another key finds the draft consumed');
  assert.equal(proposals().length, 2);
  void o;
});

test('discard (Esc) changes no accepted-state record, and Apply of a discarded draft is a 409', async t => {
  const { w, o, save, apply, proposals } = await setup(t);
  const draft = await save();
  const before = proposals();
  const gone = await discardProposalDraft(w.LEARN_DB, w.access, { roadmapId: o.roadmapId, draftId: draft.body.draftId });
  assert.equal(gone.body.state, 'discarded');
  assert.deepEqual(proposals(), before);
  await assert.rejects(apply(draft), e => e.status === 409);
  assert.equal((await discardProposalDraft(w.LEARN_DB, w.access, { roadmapId: o.roadmapId, draftId: draft.body.draftId })).body.state, 'discarded', 'idempotent');
});

test('Accept and Apply race on one guard: whichever commits first wins, the loser is a 409 with no second version and no second purchase', async t => {
  // Accept first.
  const a = await setup(t);
  const draftA = await a.save();
  await acceptRoadmapStep(a.w.env, a.w.access, { roadmapId: a.o.roadmapId, revision: a.o.revision, proposalId: a.o.proposalId, proposalVersion: a.o.proposalVersion, actionKey: 'accept-key-0001', now: T0 + 2 });
  await assert.rejects(a.apply(draftA), e => e.status === 409);
  assert.equal(a.proposals().length, 1, 'no version 2');
  assert.equal(a.money().auth, 1, 'one purchase');
  assert.deepEqual(await sweepProposalDrafts(a.w.LEARN_DB, { now: T0 + 3 }), { expired: 0, discarded: 1 }, 'the stale draft stops being live');
  // Apply first.
  const b = await setup(t);
  const draftB = await b.save();
  await b.apply(draftB);
  await assert.rejects(acceptRoadmapStep(b.w.env, b.w.access, { roadmapId: b.o.roadmapId, revision: b.o.revision, proposalId: b.o.proposalId, proposalVersion: b.o.proposalVersion, actionKey: 'accept-key-0002', now: T0 + 6 }), e => e.status === 409);
  assert.equal(b.money().auth, 0, 'the old version was never purchased');
});

test('an expired draft, an edited source (changed input fingerprint), another actor and a held validation', async t => {
  const e = await setup(t);
  const draft = await e.save();
  await assert.rejects(e.apply(draft, { now: T0 + 4000 }), x => x.status === 409, 'expired');
  const s = await setup(t);
  const stale = await s.save();
  s.w.sqlite.prepare("UPDATE learn_step_proposals SET content_hash = 'changed' WHERE version = 1").run();
  await assert.rejects(s.apply(stale), x => x.status === 409, 'the input fingerprint moved');
  const c = await setup(t);
  const mine = await c.save();
  await assert.rejects(applyProposalDraft(c.w.LEARN_DB, accessFor('u-bob', 'lb_board00000000000003'), { roadmapId: c.o.roadmapId, draftId: mine.body.draftId, draftRevision: 1, proposalVersion: 1, actionKey: 'apply-bob-0001', now: T0 + 1 }), x => x.status === 404, 'a draft id is not access');
  const h = await setup(t);
  const held = await h.save({ screen: async () => false, actionKey: 'draft-key-00002' });
  assert.equal(held.body.checkStatus, 'held');
  const out = await h.apply(held);
  assert.equal(out.body.state, 'held', 'unresolved checks keep the new version held, not pending');
  assert.equal(rows(h.w.sqlite, "SELECT COUNT(*) AS n FROM learn_step_proposals WHERE state = 'pending'")[0].n, 0);
});

test('the composer: one validated tool call, price text and bad formats rejected, an unregistered role fails closed', async () => {
  const tool = input => ({ content: [{ type: 'tool_use', id: 'tu', name: 'submit_proposal_edit', input }] });
  const args = { step: { goal: 'g' }, proposal: { title: 't', description: 'd', format: 'explanation' }, instruction: 'x' };
  assert.deepEqual(await makeComposeEdit({ callModel: async (role, body) => { assert.equal(role, 'roadmap_proposal'); assert.equal(body.tools, EDIT_PROMPT.tools); assert.match(body.messages[0].content, /"change":"x"/); return tool(EDIT); } })(args), EDIT);
  for (const bad of [{ ...EDIT, format: 'video' }, { ...EDIT, title: '' }, { ...EDIT, description: 'This costs 3 credits' }, { ...EDIT, title: 'Pay $5' }]) await assert.rejects(makeComposeEdit({ callModel: async () => tool(bad) })(args), e => e.code === 'edit_rejected');
  await assert.rejects(makeComposeEdit({ callModel: async () => ({ content: [] }) })(args), e => e.code === 'edit_rejected');
  await assert.rejects(makeComposeEdit({ callModel: async () => { throw Object.assign(new Error('x'), { code: 'role_not_registered' }); } })(args), e => e.code === 'edit_unavailable');
  assert.equal(validateEdit({ title: 'The cost function', description: 'Explains the cost function.', format: 'explanation' }).ok, true, 'cost function is a topic, not a price');
});

test('routes: draft and link paths answer 404 before identity unless ROADMAP_EDIT_ENABLED is true; with it the preview, Apply and discard round-trip', async t => {
  const { w, o } = await setup(t);
  let identityCalls = 0;
  const deps = { identity: async () => { identityCalls += 1; return { org: w.access.org, email: w.access.actorEmail, userId: w.access.actorUserId }; }, composeEdit: async () => EDIT };
  const call = (env, path, payload) => roadmapRoute(`/api/learn/roadmap/${o.roadmapId}/${path}`, new Request(`https://rabbit.test/api/learn/roadmap/${o.roadmapId}/${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ boardId: w.access.boardId, ...payload }) }), env, deps);
  for (const off of [{ ROADMAP_ENABLED: 'true' }, { ROADMAP_ENABLED: 'true', ROADMAP_EDIT_ENABLED: 'false' }, { ROADMAP_EDIT_ENABLED: 'true' }]) {
    for (const path of [`proposals/${o.proposalId}/drafts`, 'drafts/pd_x/apply', 'drafts/pd_x/discard', 'steps/link']) {
      const res = await call({ ...w.env, ...off }, path, {});
      assert.equal(res.status, 404, `${JSON.stringify(off)} ${path}`);
    }
  }
  assert.equal(identityCalls, 0, 'refused before identity or any read');
  const env = { ...w.env, ROADMAP_ENABLED: 'true', ROADMAP_EDIT_ENABLED: 'true' };
  const saved = await call(env, `proposals/${o.proposalId}/drafts`, { proposalVersion: 1, instruction: 'make it a table', actionKey: 'route-draft-0001' });
  assert.equal(saved.status, 200);
  const body = await saved.json();
  assert.equal(body.draft.title, EDIT.title);
  assert.equal(body.proposal.version, 1, 'the view still shows the original');
  const applied = await call(env, `drafts/${body.draft.draftId}/apply`, { draftRevision: 1, proposalVersion: 1, actionKey: 'route-apply-0001' });
  assert.equal(applied.status, 200);
  assert.equal((await applied.json()).proposal.version, 2);
  const noComposer = await roadmapRoute(`/api/learn/roadmap/${o.roadmapId}/proposals/${o.proposalId}/drafts`, new Request('https://rabbit.test/x', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ boardId: w.access.boardId, proposalVersion: 2, instruction: 'x', actionKey: 'route-draft-0002' }) }), env, { identity: deps.identity });
  assert.equal(noComposer.status, 503, 'no composer wired: unavailable, not a guess');
});
