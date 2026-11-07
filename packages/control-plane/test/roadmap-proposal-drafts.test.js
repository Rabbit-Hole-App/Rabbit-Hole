// R5.01: proposal edit drafts. Real store/outbox on the in-memory schema plus migration 0041; the edit composer is a double (no model, no network).
// A draft is a preview: it never changes the pending original, never authorizes generation and never charges; only Apply makes the next version.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { acceptRoadmapStep } from '../src/roadmap/roadmap-store.js';
import { applyProposalDraft, discardProposalDraft, saveProposalDraft, sweepProposalDrafts } from '../src/roadmap/roadmap-proposal-drafts.js';
import { EDIT_PROMPT, makeComposeEdit, validateEdit } from '../src/roadmap/roadmap-edit.js';
import { roadmapRoute } from '../src/roadmap/roadmap-routes.js';
import { makeProposalScreen } from '../src/roadmap/roadmap-edit.js';
import { SAFETY_QUESTIONS } from '../src/agents/roadmap-check.js';
import { world, offered, accessFor, rows, MODEL } from './roadmap-fixture.js';
import { platformCallModel } from '../src/roadmap/roadmap-models.js';
import { spendTransport } from '../src/learn-spend.js';
import { STRINGS } from '../../web/src/roadmap-strings.js';

const T0 = Math.floor(Date.now() / 1000);
const MIGRATION = readFileSync(new URL('../learn-migrations/0041-roadmap-proposal-drafts.sql', import.meta.url), 'utf8');
const EDIT = { title: 'Step one as a table', description: 'A table of the main terms.', format: 'table' };
async function setup(t) {
  const w = world(t);
  w.sqlite.exec(MIGRATION);
  const o = await offered(w, w.access);
  let composed = 0;
  const composeEdit = async () => { composed += 1; return EDIT; };
  const screened = [];
  const screen = async (text, ctx) => { screened.push([ctx.role, text]); return true; };
  const save = (extra = {}) => saveProposalDraft(w.LEARN_DB, w.access, { roadmapId: o.roadmapId, proposalId: o.proposalId, proposalVersion: o.proposalVersion, instruction: 'make it a table', actionKey: 'draft-key-00001', composeEdit, screen, now: T0, ...extra });
  const apply = (draft, extra = {}) => applyProposalDraft(w.LEARN_DB, w.access, { roadmapId: o.roadmapId, draftId: draft.body.draftId, draftRevision: draft.body.revision, proposalVersion: o.proposalVersion, actionKey: 'apply-key-00001', now: T0 + 5, ...extra });
  const money = () => ({ auth: rows(w.sqlite, 'SELECT COUNT(*) AS n FROM learn_step_authorizations')[0].n, results: rows(w.sqlite, 'SELECT COUNT(*) AS n FROM learn_step_results')[0].n, calls: rows(w.sqlite, 'SELECT COUNT(*) AS n FROM learn_roadmap_calls')[0].n, usage: rows(w.sqlite, 'SELECT COUNT(*) AS n FROM usage_attempts')[0].n });
  const proposals = () => rows(w.sqlite, 'SELECT version, state, title, format FROM learn_step_proposals ORDER BY version');
  return { w, o, save, apply, money, proposals, composed: () => composed, screened };
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
  const held = await h.save({ screen: async (_text, ctx) => ctx.role === 'learner', actionKey: 'draft-key-00002' });
  assert.equal(held.body.checkStatus, 'held');
  assert.deepEqual(Object.keys(held.body).sort(), ['checkStatus', 'draftId', 'proposalId', 'proposalVersion', 'revision'], 'words that failed the screen are never shown back');
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
  let identityCalls = 0, composed = 0;
  const deps = { identity: async () => { identityCalls += 1; return { org: w.access.org, email: w.access.actorEmail, userId: w.access.actorUserId }; }, composeEdit: async () => { composed += 1; return EDIT; }, screen: async () => true };
  const call = (env, path, payload) => roadmapRoute(`/api/learn/roadmap/${o.roadmapId}/${path}`, new Request(`https://rabbit.test/api/learn/roadmap/${o.roadmapId}/${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ boardId: w.access.boardId, ...payload }) }), env, deps);
  for (const off of [{ ROADMAP_ENABLED: 'true' }, { ROADMAP_ENABLED: 'true', ROADMAP_EDIT_ENABLED: 'false' }, { ROADMAP_EDIT_ENABLED: 'true' }]) {
    for (const path of [`proposals/${o.proposalId}/drafts`, 'drafts/pd_x/apply', 'drafts/pd_x/discard', 'steps/link']) {
      const res = await call({ ...w.env, ...off }, path, {});
      assert.equal(res.status, 404, `${JSON.stringify(off)} ${path}`);
    }
  }
  assert.equal(identityCalls, 0, 'refused before identity or any read');
  assert.equal(composed, 0);
  const env = { ...w.env, ROADMAP_ENABLED: 'true', ROADMAP_EDIT_ENABLED: 'true' };
  const saved = await call(env, `proposals/${o.proposalId}/drafts`, { proposalVersion: 1, instruction: 'make it a table', actionKey: 'route-draft-0001' });
  assert.equal(saved.status, 200);
  const body = await saved.json();
  assert.equal(body.draft.title, EDIT.title);
  assert.equal(body.proposal.version, 1, 'the view still shows the original');
  assert.equal(body.edit, true, 'the view tells the web the edit flag is on');
  const applied = await call(env, `drafts/${body.draft.draftId}/apply`, { draftRevision: 1, proposalVersion: 1, actionKey: 'route-apply-0001' });
  assert.equal(applied.status, 200);
  assert.equal((await applied.json()).proposal.version, 2);
  const noComposer = await roadmapRoute(`/api/learn/roadmap/${o.roadmapId}/proposals/${o.proposalId}/drafts`, new Request('https://rabbit.test/x', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ boardId: w.access.boardId, proposalVersion: 2, instruction: 'x', actionKey: 'route-draft-0002' }) }), env, { identity: deps.identity });
  assert.equal(noComposer.status, 503, 'no composer wired: unavailable, not a guess');
  const noScreen = await roadmapRoute(`/api/learn/roadmap/${o.roadmapId}/proposals/${o.proposalId}/drafts`, new Request('https://rabbit.test/x', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ boardId: w.access.boardId, proposalVersion: 2, instruction: 'x', actionKey: 'route-draft-0003' }) }), env, { ...deps, screen: undefined });
  assert.equal(noScreen.status, 503, 'no safety screen wired: nothing is composed');
});

test('flag off: no new response field and no edit field on any view (ROADMAP_ENABLED true, ROADMAP_EDIT_ENABLED unset)', async t => {
  const { w, o } = await setup(t);
  const deps = { identity: async () => ({ org: w.access.org, email: w.access.actorEmail, userId: w.access.actorUserId }) };
  const res = await roadmapRoute('/api/learn/roadmap', new Request(`https://rabbit.test/api/learn/roadmap?boardId=${w.access.boardId}`), { ...w.env, ROADMAP_ENABLED: 'true' }, deps);
  assert.equal(res.status, 200);
  const view = await res.json();
  assert.equal(view.proposal.id, o.proposalId);
  assert.equal('edit' in view, false);
});

test('the route gate holds for every spelling of the draft and link paths (percent-encoded, double-encoded, case, encoded slash, malformed): 404, no identity, no D1, no model', async t => {
  const { w, o } = await setup(t);
  let identityCalls = 0, composed = 0, screens = 0, statements = 0;
  const spy = { ...w.env, ROADMAP_ENABLED: 'true', LEARN_DB: { prepare: (...a) => { statements += 1; return w.env.LEARN_DB.prepare(...a); }, batch: (...a) => { statements += 1; return w.env.LEARN_DB.batch(...a); } } };
  const deps = { identity: async () => { identityCalls += 1; return { org: w.access.org, email: w.access.actorEmail, userId: w.access.actorUserId }; }, composeEdit: async () => { composed += 1; return EDIT; }, screen: async () => { screens += 1; return true; } };
  const call = (env, path, payload) => roadmapRoute(`/api/learn/roadmap/${o.roadmapId}/${path}`, new Request(`https://rabbit.test/api/learn/roadmap/${o.roadmapId}/${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ boardId: w.access.boardId, proposalVersion: 1, instruction: 'make it a table', actionKey: 'gate-key-000001', ...payload }) }), env, deps);
  const id = o.proposalId;
  const spellings = [`proposals/${id}/%64rafts`, `proposals/${id}/%64%72%61%66%74%73`, `proposals/${id}/%2564rafts`, `proposals/${id}/%252564rafts`, `proposals/${id}/%44rafts`, `proposals/${id}/DRAFTS`, `proposals/${id}%2Fdrafts`,
    `proposals/${id}%252Fdrafts`, 'steps/%6Cink', 'steps/%256Cink', 'steps/LINK', 'steps/li%6Ek', 'drafts/pd_x/%61pply', '%64rafts/pd_x/discard', `proposals/${id}/drafts/`, `proposals//${id}//drafts`, 'steps/%E0%A4%A'];
  for (const path of spellings) {
    const res = await call(spy, path, {});
    assert.equal(res.status, 404, path);
    assert.equal((await res.json()).code, 'not_found', path);
  }
  assert.deepEqual([identityCalls, composed, screens, statements], [0, 0, 0, 0], 'refused before identity, any statement, any screen, any model call');
  assert.equal(rows(w.sqlite, 'SELECT COUNT(*) AS n FROM learn_proposal_drafts')[0].n, 0);
  assert.equal(rows(w.sqlite, 'SELECT COUNT(*) AS n FROM learn_roadmap_calls')[0].n, 0);
  // The same spelling is a real route with the flag on: the gate and the dispatcher read the same segments.
  const on = { ...w.env, ROADMAP_ENABLED: 'true', ROADMAP_EDIT_ENABLED: 'true' };
  const res = await call(on, `proposals/${id}/%64rafts`, { actionKey: 'gate-key-000002' });
  assert.equal(res.status, 200);
  assert.equal(composed, 1);
  assert.equal(identityCalls, 1);
});

test('a learner instruction that fails the safety screen costs no model call and makes no draft; the composed words are screened too', async t => {
  const a = await setup(t);
  const before = a.money();
  await assert.rejects(a.save({ screen: async (_text, ctx) => ctx.role !== 'learner' }), e => e.status === 422 && e.code === 'edit_rejected');
  assert.equal(a.composed(), 0, 'the composer (a platform-paid model call) never ran');
  assert.deepEqual(a.money(), before);
  assert.equal(rows(a.w.sqlite, 'SELECT COUNT(*) AS n FROM learn_proposal_drafts')[0].n, 0);
  await assert.rejects(a.save({ screen: undefined }), e => e.status === 503, 'no screen: nothing composed');
  assert.equal(a.composed(), 0);
  const ok = await a.save();
  assert.deepEqual(a.screened.map(([role]) => role), ['learner', 'output'], 'instruction first, then the composed words');
  assert.equal(a.screened[0][1], 'make it a table');
  assert.equal(a.screened[1][1], `${EDIT.title}\n${EDIT.description}`);
  assert.equal(ok.body.checkStatus, 'passed');
});

const SAFE = { scores: Object.fromEntries(Object.keys(SAFETY_QUESTIONS).map(k => [k, 0])), uncertainty: 0, coverage: { complete: true, chars: 10, chunks: 1 } };
test('makeProposalScreen is the R4 classifier path: allow passes; a block, an unknown, an incomplete read, a personal-risk signal and a throw do not', async t => {
  const { w, o } = await setup(t);
  const ctx = role => ({ role, access: w.access, roadmap: { id: o.roadmapId }, proposal: { version: 1 }, actionKey: 'screen-key-00001' });
  const roles = [];
  const screen = classify => makeProposalScreen(w.env, { classify });
  assert.equal(await screen(async ({ role }) => { roles.push(role); return SAFE; })('hello', ctx('learner')), true);
  assert.deepEqual(roles, ['learner']);
  assert.equal(await screen(async () => ({ ...SAFE, scores: { ...SAFE.scores, sexual_explicit: 0.95 } }))('x', ctx('output')), false, 'block');
  assert.equal(await screen(async () => ({ ...SAFE, uncertainty: 0.9 }))('x', ctx('output')), false, 'unknown is held, not published');
  assert.equal(await screen(async () => ({ ...SAFE, coverage: { complete: false, chars: 1, chunks: 1 } }))('x', ctx('output')), false, 'incomplete coverage');
  assert.equal(await screen(async () => ({ ...SAFE, scores: { ...SAFE.scores, self_harm_personal: 0.9 } }))('x', ctx('learner')), false, 'personal risk in the learner words is not publishable');
  assert.equal(await screen(async () => { throw new Error('down'); })('x', ctx('output')), false, 'transport failure');
});

test('the real path: platform-paid JEV through platformJevAsk, one checkpointed operation per call, distinct keys for the instruction and the composed words, no learner charge', async t => {
  const { w, o } = await setup(t);
  const answers = Object.fromEntries(Object.keys(SAFETY_QUESTIONS).map(k => [k, { type: 'noul', noul: 0.01 }]));
  const asked = [];
  const screen = makeProposalScreen(w.env, { askJev: async (_env, request) => { asked.push(request.state.author_role); return { ok: true, status: 200, body: { answers } }; } });
  const ctx = role => ({ role, access: w.access, roadmap: { id: o.roadmapId }, proposal: { version: 1 }, actionKey: 'real-screen-0001' });
  assert.equal(await screen('make it a table', ctx('learner')), true);
  assert.equal(await screen('Title\nDescription', ctx('output')), true);
  assert.deepEqual(asked, ['learner', 'output']);
  const calls = rows(w.sqlite, 'SELECT operation_key, payer, stage, checkpoint FROM learn_roadmap_calls ORDER BY operation_key');
  assert.equal(calls.length, 2);
  assert.equal(new Set(calls.map(c => c.operation_key)).size, 2, 'the two screens of one save never share an operation key');
  assert.ok(calls.every(c => c.payer === 'platform' && c.stage === 'safety'), JSON.stringify(calls));
  assert.equal(rows(w.sqlite, 'SELECT COUNT(*) AS n FROM learn_step_authorizations')[0].n, 0);
});

test('Apply then Accept: the edited version is what is accepted and bought, once; the superseded original is never purchased and a second Accept replays', async t => {
  const { w, o, save, apply, money } = await setup(t);
  const done = await apply(await save());
  const revision = rows(w.sqlite, 'SELECT revision FROM learn_roadmaps')[0].revision;
  const accept = (extra = {}) => acceptRoadmapStep(w.env, w.access, { roadmapId: o.roadmapId, revision, proposalId: done.body.proposalId, proposalVersion: done.body.version, actionKey: 'accept-edited-001', now: T0 + 9, ...extra });
  const first = await accept();
  assert.equal(first.status < 300, true);
  assert.equal(money().auth, 1, 'one purchase');
  assert.deepEqual(rows(w.sqlite, 'SELECT version, state FROM learn_step_proposals ORDER BY version').map(p => [p.version, p.state]), [[1, 'superseded'], [2, 'accepted']]);
  assert.equal((await accept()).replayed, true);
  assert.equal(money().auth, 1, 'a second Accept never buys again');
  await assert.rejects(acceptRoadmapStep(w.env, w.access, { roadmapId: o.roadmapId, revision, proposalId: o.proposalId, proposalVersion: o.proposalVersion, actionKey: 'accept-old-0001', now: T0 + 10 }), e => e.status === 409, 'the obsolete original cannot be accepted');
  assert.equal(money().auth, 1);
});

// M1 (owner 2026-11-06): platform-paid edit previews are capped at 5 per proposal and 30 per learner per UTC day, checked before any screen or model call.
// The composer here is the production one (makeComposeEdit over platformCallModel, as roadmap-wire.js builds it) with a provider double, so every preview
// that reaches the model leaves the same stage 'proposal' call row production leaves.
const EDIT_REGISTRY = { roadmap_proposal: { provider: 'anthropic', model: MODEL, effort: 'low', maxTokens: 600 } };
async function metered(t) {
  const base = await setup(t);
  const { w, o } = base;
  let modelCalls = 0, screens = 0;
  const transport = (env, body, model, org) => { modelCalls += 1; return spendTransport(env, body, model, org, async () => Response.json({ model: MODEL, usage: { input_tokens: 50, output_tokens: 20 }, content: [{ type: 'tool_use', id: 't', name: 'submit_proposal_edit', input: EDIT }] }), { userId: 'provider:platform', category: 'roadmap' }); };
  const composeEdit = args => makeComposeEdit({ callModel: platformCallModel(w.env, w.access, { roadmapId: args.roadmap.id, version: args.proposal.version, anchor: args.proposal.id, registry: EDIT_REGISTRY, transport }) })(args);
  const screen = async () => { screens += 1; return true; };
  const preview = (n, extra = {}) => saveProposalDraft(w.LEARN_DB, w.access, { roadmapId: o.roadmapId, proposalId: o.proposalId, proposalVersion: o.proposalVersion, instruction: `change ${n}`, actionKey: `preview-key-${String(n).padStart(4, '0')}`, composeEdit, screen, now: T0, ...extra });
  const proposalCalls = () => rows(w.sqlite, "SELECT COUNT(*) AS n FROM learn_roadmap_calls WHERE stage = 'proposal'")[0].n;
  return { ...base, preview, proposalCalls, counts: () => ({ modelCalls, screens }) };
}
const limited = message => e => e.status === 429 && e.code === 'edit_limit' && e.message === message;

test('M1: the 6th preview of one proposal is refused with 429 edit_limit and costs nothing: no screen, no model call, no call row', async t => {
  const m = await metered(t);
  for (let n = 1; n <= 5; n += 1) assert.equal((await m.preview(n)).status, 200);
  assert.equal(m.proposalCalls(), 5);
  const before = m.counts();
  await assert.rejects(m.preview(6), limited(STRINGS.editLimitStep));
  assert.deepEqual(m.counts(), before, 'refused before the learner screen and the composer');
  assert.equal(m.proposalCalls(), 5, 'no call row');
  assert.equal(STRINGS.editLimitStep, 'You have reached the edit limit for this step.');
});

test('M1: a replayed action key, Discard and Apply are never counted', async t => {
  const m = await metered(t);
  const first = await m.preview(1);
  for (let i = 0; i < 4; i += 1) assert.equal((await m.preview(1)).replayed, true);
  await discardProposalDraft(m.w.LEARN_DB, m.w.access, { roadmapId: m.o.roadmapId, draftId: first.body.draftId });
  assert.equal(m.proposalCalls(), 1, 'replays and the discard reached no model');
  for (let n = 2; n <= 5; n += 1) assert.equal((await m.preview(n)).status, 200, `preview ${n} is still allowed: replays did not count`);
  const last = rows(m.w.sqlite, "SELECT id, revision FROM learn_proposal_drafts WHERE state = 'draft'")[0];
  const applied = await applyProposalDraft(m.w.LEARN_DB, m.w.access, { roadmapId: m.o.roadmapId, draftId: last.id, draftRevision: last.revision, proposalVersion: m.o.proposalVersion, actionKey: 'apply-key-m1-001', now: T0 + 5 });
  assert.equal(applied.status, 200);
  assert.equal(m.proposalCalls(), 5, 'Apply made no model call');
});

test('M1: the 31st preview of the learner\'s UTC day is refused across proposals; released calls and yesterday do not count; Accept is never capped', async t => {
  const m = await metered(t);
  const day = Math.floor(T0 / 86400) * 86400;
  const seed = (n, { at = day + 1, checkpoint = 'settled' } = {}) => m.w.sqlite.prepare(`INSERT INTO learn_roadmap_calls (op_id, operation_key, roadmap_id, org, owner_user_id, board_id, stage, call_no, retry_no, payer, task, checkpoint, created_at)
    VALUES (?, ?, 'rm_other', 'team', 'u-alice', 'lb_board00000000000001', 'proposal', 0, 0, 'platform', 'roadmap_proposal', ?, ?)`).run(`op_seed_${checkpoint}_${at}_${n}`, `rm.rm_other.1.pr_${checkpoint}${at}x${n}.proposal.0.0.rm_other`, checkpoint, at);
  for (let n = 0; n < 29; n += 1) seed(n);
  for (let n = 0; n < 5; n += 1) seed(n, { at: day - 10 }); // yesterday
  for (let n = 0; n < 5; n += 1) seed(n, { checkpoint: 'released' }); // never dispatched
  assert.equal((await m.preview(1)).status, 200, 'the 30th preview today');
  const before = m.counts();
  await assert.rejects(m.preview(2), limited(STRINGS.editLimitDay));
  assert.deepEqual(m.counts(), before, 'no screen, no model call');
  assert.equal(STRINGS.editLimitDay, "You have reached today's edit limit.");
  const accepted = await acceptRoadmapStep(m.w.env, m.w.access, { roadmapId: m.o.roadmapId, revision: m.o.revision, proposalId: m.o.proposalId, proposalVersion: m.o.proposalVersion, actionKey: 'accept-key-m1-001', now: T0 + 2 });
  assert.ok(accepted.status < 300, 'the edit cap does not touch Accept');
});

test('M1: the route answers the refusal as 429 edit_limit with the learner sentence (the editor shows it through the existing refused path)', async t => {
  const m = await metered(t);
  for (let n = 1; n <= 5; n += 1) await m.preview(n);
  const env = { ...m.w.env, ROADMAP_ENABLED: 'true', ROADMAP_EDIT_ENABLED: 'true' };
  const deps = { identity: async () => ({ org: 'team', email: 'u-alice@example.test', userId: 'u-alice' }), screen: async () => assert.fail('no screen'), composeEdit: async () => assert.fail('no model') };
  const res = await roadmapRoute(`/api/learn/roadmap/${m.o.roadmapId}/proposals/${m.o.proposalId}/drafts`, new Request('https://rabbit.test/x', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ boardId: 'lb_board00000000000001', proposalVersion: m.o.proposalVersion, instruction: 'one more', actionKey: 'preview-route-0001' }) }), env, deps);
  assert.equal(res.status, 429);
  assert.deepEqual(await res.json(), { error: STRINGS.editLimitStep, code: 'edit_limit' });
});
