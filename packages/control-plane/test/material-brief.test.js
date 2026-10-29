// Owner spec 2026-10-29 section 6: an explicit simple material command (/quiz, /practice, /flashcards, /code, /graph, /diagram, /3d)
// prepares a signed brief with NO model call (POST /api/learn/chat/material-proposals), a conversational Edit publishes exactly the next
// revision of the one named, and Generate (/api/learn/artifact with the brief) consumes it once before the existing generator runs on
// the brief's own words. The real signer, verifier, consume and chat tables on one SQLite; identity, the canvas owner and the app
// lookup are the only injected seams, and the generator is a counted stub (nothing is paid).
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { chatProposalFetch } from '../src/chat-proposal-route.js';
import { artifactFetch } from '../src/learn-artifact.js';
import { PROPOSAL_TOOL, proposalRecord, validateProposalInput } from '../src/generation-proposal.js';
import { proposalView } from '../../web/src/generation-confirmation-schema.js';
import { BRIEF_COMMANDS, generationArgs, materialBrief } from '../../web/src/material-brief.js';

const OWNER = { org: 'org-1', email: 'owner@example.test', userId: 'u-owner' };
const APP = 'demo-app', THREAD = 'canvaschat-11111111-2222-3333-4444-555555555555';

function stack(t) {
  const sqlite = new DatabaseSync(':memory:'); t.after(() => sqlite.close());
  sqlite.exec(readFileSync(new URL('../repository-schema.sql', import.meta.url), 'utf8'));
  const db = { prepare(text) {
    let args = []; const statement = () => sqlite.prepare(text);
    return { bind(...v) { args = v; return this; }, first: async () => statement().get(...args) || null, all: async () => ({ results: statement().all(...args) }),
      run: async () => ({ meta: { changes: statement().run(...args).changes } }), now: () => ({ meta: { changes: statement().run(...args).changes } }) };
  }, async batch(statements) { sqlite.exec('BEGIN'); try { const out = statements.map(s => s.now()); sqlite.exec('COMMIT'); return out; } catch (error) { sqlite.exec('ROLLBACK'); throw error; } } };
  // The app lookup authorizedBoardApp makes for a non-canvas app (the Small control plane): this owner's app.
  const env = { SMALL_ENV: 'dev', LEARN_DB: db, INLINE_DECISION_KEY: 'fixture-signing-key',
    CONTROL_PLANE: { fetch: async () => Response.json({ name: APP, org: OWNER.org, email: OWNER.email }) } };
  const deps = { identity: async () => ({ ...OWNER }), owner: async () => ({ org: OWNER.org, email: OWNER.email }) };
  const post = async body => {
    const res = await chatProposalFetch(new Request('https://app/api/learn/chat/material-proposals', { method: 'POST', body: JSON.stringify({ app: APP, thread_id: THREAD, ...body }) }), env, deps);
    return { res, body: await res.json() };
  };
  const calls = [];
  const generator = reply => async (e, input) => { calls.push(input); return typeof reply === 'function' ? reply(input) : reply; };
  const generate = async (proposal, reply = { result: 'artifact', primitive: 'quiz', block: { type: 'quiz', question: 'Q?', options: [], why: '' } }, extra = {}) => {
    const res = await artifactFetch(new Request('https://app/api/learn/artifact', { method: 'POST', body: JSON.stringify({ app: APP, command: proposal.command, args: 'tampered words', selection: null, proposal, ...extra }) }), env, generator(reply), { identity: deps.identity });
    return { res, body: await res.json() };
  };
  const rows = () => sqlite.prepare('SELECT m.role, m.content, mm.meta_json FROM messages m LEFT JOIN chat_message_meta mm ON mm.message_id = m.id ORDER BY m.id').all();
  const state = async p => (await proposalRecord(db, OWNER.email, APP, p.proposal_id)).state;
  return { env, post, generate, calls, rows, state };
}

test('the compact brief: built from the words and the selected card, never the answer, never a model call', () => {
  assert.deepEqual(materialBrief('quiz', { args: "Newton's second law" }), { title: "Newton's second law", description: "One multiple-choice question about Newton's second law, with feedback after you answer.", limitations: [] });
  const back = materialBrief('practice', { args: 'explain it back: why the sky is blue' });
  assert.equal(back.title, 'Explain why the sky is blue');
  assert.equal(back.description, 'Explain the idea in your own words, then get feedback on the reasoning in your answer.');
  assert.match(materialBrief('quiz', { args: '', selection: { id: 'b1', title: 'Forces' } }).description, /about the selected card "Forces"/);
  assert.equal(materialBrief('quiz', { args: '' }), null, 'no words and no selection: nothing to be about');
  assert.deepEqual(materialBrief('3d', { args: 'a frustum' }).limitations, ['Making it uses paid generation.']);
  assert.match(materialBrief('graph', { args: 'y = sin(x)', changes: ['add cos(x) too'] }).description, /Changes you asked for: add cos\(x\) too\.$/);
  assert.equal(generationArgs({ args: 'y = sin(x)', changes: ['add cos(x) too'] }), 'y = sin(x)\nChange: add cos(x) too');
  for (const name of BRIEF_COMMANDS) assert.ok(materialBrief(name, { args: 'a topic' })?.description, name);
  assert.equal(materialBrief('motion', { args: 'x' }), null, 'Motion keeps its own planner');
  // The chat model is never offered these commands: only the server's own route signs them.
  assert.ok(!PROPOSAL_TOOL.input_schema.properties.command.enum.some(name => BRIEF_COMMANDS.includes(name)));
  assert.match(validateProposalInput({ command: 'quiz', title: 'x', description: 'a. b. c.', settings: {} }).error, /command must be one of/);
});

test('a brief is signed and saved in the chat with no generation; Generate consumes it once and runs the generator on the brief\'s own words', async t => {
  const h = stack(t);
  const made = await h.post({ command: 'quiz', request: "Newton's second law", selection: { kind: 'card', id: 'card-7', title: 'Forces' }, context: 'F = ma' });
  assert.equal(made.res.status, 201, JSON.stringify(made.body));
  const p = made.body.proposal;
  assert.match(p.sig, /^v3\./);
  assert.deepEqual([p.command, p.version, p.title], ['quiz', 1, "Newton's second law"]);
  assert.deepEqual(p.input, { request: "/quiz Newton's second law", args: "Newton's second law", selection: { kind: 'card', id: 'card-7', title: 'Forces' }, context: 'F = ma', changes: [], org: OWNER.org, app: APP });
  assert.deepEqual(h.calls, [], 'preparing a brief calls no generator');
  const view = proposalView(p);
  assert.deepEqual(view.allowed_actions, ['edit', 'generate'], 'Edit (through Chat) and Generate; no prose form, no Save');
  assert.deepEqual(h.rows().map(r => [r.role, r.content]), [['user', "/quiz Newton's second law"], ['assistant', 'Here is the brief. Generate makes it.']]);
  assert.equal((await h.state(p)).used, null);

  const first = await h.generate(p);
  assert.equal(first.res.status, 200, JSON.stringify(first.body));
  assert.equal(first.body.result, 'artifact');
  assert.deepEqual(h.calls.map(c => [c.command, c.args, c.selection, c.context]), [['quiz', "Newton's second law", { kind: 'card', id: 'card-7', title: 'Forces' }, 'F = ma']], 'the signed words, never the body\'s');
  assert.ok((await h.state(p)).used, 'consumed');
  const second = await h.generate(p);
  assert.equal(second.res.status, 409);
  assert.equal(second.body.code, 'proposal_used');
  assert.equal(h.calls.length, 1, 'a second press makes nothing');
});

test('a press that makes no card gives the brief back; a tampered, foreign-command or other-canvas brief is refused before any call', async t => {
  const h = stack(t);
  const p = (await h.post({ command: 'diagram', request: 'an HTTP request' })).body.proposal;
  const asked = await h.generate(p, { result: 'clarification', question: 'Which protocol?' });
  assert.equal(asked.body.result, 'clarification');
  assert.equal((await h.state(p)).used, null, 'given back: Generate can be pressed again');
  const failed = await h.generate(p, () => { throw new Error('model down'); });
  assert.equal(failed.res.status, 502);
  assert.equal((await h.state(p)).used, null);
  const calls = h.calls.length;
  assert.equal((await h.generate({ ...p, description: 'Something else.' })).body.code, 'proposal_refused');
  assert.equal((await h.generate(p, undefined, { command: 'graph' })).body.code, 'proposal_refused');
  assert.equal(h.calls.length, calls, 'refused before the generator');
  assert.equal((await h.generate(p)).res.status, 200, 'the brief still makes its card');
});

test('conversational Edit: the next revision of exactly the named one, with the words added; a stale one is refused and stores nothing', async t => {
  const h = stack(t);
  const v1 = (await h.post({ command: 'graph', request: 'y = sin(x)' })).body.proposal;
  const before = h.rows().length;
  const edited = await h.post({ revise: { proposal: v1 }, change: 'add cos(x) on the same axes' });
  assert.equal(edited.res.status, 201, JSON.stringify(edited.body));
  const v2 = edited.body.proposal;
  assert.deepEqual([v2.proposal_id, v2.version], [v1.proposal_id, 2]);
  assert.deepEqual(v2.input.changes, ['add cos(x) on the same axes']);
  assert.match(v2.description, /Changes you asked for: add cos\(x\) on the same axes\.$/);
  assert.deepEqual(h.rows().slice(before).map(r => [r.role, r.content]), [['user', 'add cos(x) on the same axes'], ['assistant', 'Here is the updated brief. Generate makes it.']]);
  assert.equal((await h.state(v1)).sig, v2.sig, 'published as the current revision');
  // Editing v1 again (stale), or Generate on v1: refused, nothing stored.
  const rowsNow = h.rows().length;
  const stale = await h.post({ revise: { proposal: v1 }, change: 'make it tan' });
  assert.equal(stale.res.status, 409);
  assert.equal(stale.body.code, 'proposal_edit_stale');
  assert.equal(stale.body.current.sig, v2.sig);
  assert.equal(h.rows().length, rowsNow, 'nothing stored');
  assert.equal((await h.generate(v1)).body.code, 'proposal_stale');
  assert.equal((await h.generate(v2, { result: 'artifact', primitive: 'interactive_graph', block: { type: 'graph' } })).res.status, 200);
  assert.equal(h.calls.at(-1).args, 'y = sin(x)\nChange: add cos(x) on the same axes');
});

test('the route refuses what is not a brief: another command, no subject, a bad selection', async t => {
  const h = stack(t);
  for (const body of [{ command: 'motion', request: 'x' }, { command: 'explain', request: 'x' }, { command: 'quiz', request: '' }, { command: 'quiz', request: 'x', selection: { kind: 'project', id: 'p' } }]) {
    const out = await h.post(body);
    assert.equal(out.res.status, 400, JSON.stringify(body));
  }
  assert.equal(h.rows().length, 0);
});
