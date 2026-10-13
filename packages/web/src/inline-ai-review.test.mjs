// Regression checks for the review of cf9216b2..5b3552a5 (mocked transport; no provider). Each failed on 5b3552a5
// unless it says otherwise.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInlineSession } from './inline-ai-session.js';

let clock = 0;
const now = () => (clock += 1);
const target = { objects: [{ id: 'n23', type: 'shape', kind: 'ellipse', text: '23' }] };
const snapshot = (prints = 't1', objects = target.objects) => () => ({ context: { target: { objects } }, summary: objects.map(entry => `${entry.type}:${entry.kind} "${entry.text}"`).join('; '), frozen: { ids: objects.map(entry => entry.id), prints: { target: prints, relations: 'r' } }, prints: { target: prints, relations: 'r' }, selectionOnly: false });
const make = (transport, extra = {}) => createInlineSession({ transport, boardKey: 'b', enabled: ['note', 'diagram', 'image', 'motion'], validate: result => ({ ok: true, preview: { text: result.text, block: result.block } }), now, flushMs: 0, ...extra });
const held = () => { let release; const gate = new Promise(resolve => { release = resolve; }); return { gate, release: () => release() }; };

test('accept snapshot: a failed refine leaves the preview bound to the board it was made from', async () => {
  let round = 0;
  const session = make({ generate: async () => { round += 1; if (round === 2) throw new Error('The model failed.'); return { result: { kind: 'note', text: 'P1' } }; } });
  await session.submit({ mode: 'explain', prompt: 'explain this', prepare: snapshot('before-edit') });
  assert.equal(session.state.preview.frozen.prints.target, 'before-edit');
  await session.submit({ mode: 'explain', prompt: 'shorter', prepare: snapshot('after-edit') });
  assert.equal(session.state.status, 'preview');
  assert.equal(session.state.preview.text, 'P1');
  assert.equal(session.state.preview.frozen.prints.target, 'before-edit');
});

test('accept snapshot: a cancelled refine leaves the preview bound to the board it was made from', async () => {
  const wait = held();
  let round = 0;
  const session = make({ generate: async () => { round += 1; if (round === 2) await wait.gate; return { result: { kind: 'note', text: `P${round}` } }; } });
  await session.submit({ mode: 'explain', prompt: 'explain this', prepare: snapshot('before-edit') });
  const refine = session.submit({ mode: 'explain', prompt: 'shorter', prepare: snapshot('after-edit') });
  session.cancel();
  wait.release();
  await refine;
  assert.equal(session.state.status, 'preview');
  assert.equal(session.state.preview.text, 'P1');
  assert.equal(session.state.preview.frozen.prints.target, 'before-edit');
});

test('accept snapshot: a successful refine binds the new preview to the board at the refine', async () => {
  let round = 0;
  const session = make({ generate: async () => { round += 1; return { result: { kind: 'note', text: `P${round}` } }; } });
  await session.submit({ mode: 'explain', prompt: 'explain this', prepare: snapshot('before-edit') });
  await session.submit({ mode: 'explain', prompt: 'shorter', prepare: snapshot('after-edit') });
  assert.equal(session.state.preview.text, 'P2');
  assert.equal(session.state.preview.frozen.prints.target, 'after-edit');
});

test('accept snapshot: a reused result is bound to the board it is reused on', async () => {
  const session = make({ generate: async () => ({ result: { kind: 'note', text: 'P' } }) });
  await session.submit({ mode: 'explain', prompt: 'explain this', prepare: snapshot('same') });
  session.reject();
  assert.equal(await session.submit({ mode: 'explain', prompt: 'explain this', prepare: snapshot('same') }), 'reused');
  assert.equal(session.state.preview.frozen.prints.target, 'same');
});

// Namespace import: on 5b3552a5 the missing export fails these checks, not the whole file.
import * as sessionModule from './inline-ai-session.js';

test('telemetry route column: jev only when this request asked JEV (its meaning, pinned)', () => {
  const routeColumn = entry => sessionModule.routeColumn(entry);
  assert.equal(routeColumn({ routing: 'jev', via: 'jev' }), 'jev');
  assert.equal(routeColumn({ routing: 'jev', via: 'jev-low' }), 'jev');
  assert.equal(routeColumn({ routing: 'fallback:timeout', via: 'fallback' }), 'jev', 'it asked JEV and fell back');
  assert.equal(routeColumn({ routing: 'bypassed', via: 'command' }), 'direct');
  assert.equal(routeColumn({ routing: 'bypassed', via: 'default' }), 'bypassed');
  assert.equal(routeColumn({ routing: 'bypassed', via: 'mode' }), 'bypassed');
  assert.equal(routeColumn({ routing: 'reused', via: 'jev' }), 'bypassed', 'a reused result made no routing call');
  assert.equal(routeColumn({ routing: 'clarified', via: 'clarified' }), 'bypassed', 'the routing call was the earlier request');
});

test('telemetry units: stage times are milliseconds to 0.1 ms from the monotonic clock (passes on 5b3552a5 too)', async () => {
  const marks = [1000, 1003.27, 1003.3, 1310.45, 1400, 1520.06, 2100, 2350.5, 2350.55, 2600, 2700, 2800];
  let at = 0;
  const session = createInlineSession({ transport: { route: async () => ({ choice: 'note', confidence: 0.9, probability: 0.9, ranked: ['note'] }), generate: async (input, { onEvent }) => { onEvent({ type: 'delta', text: 'a' }); return { result: { kind: 'note', text: 'a' } }; } }, boardKey: 'b', validate: result => ({ ok: true, preview: { text: result.text } }), now: () => marks[at++], flushMs: 0 });
  await session.submit({ mode: 'explain', prompt: 'Show the shape of this', prepare: snapshot('u') });
  const timings = sessionModule.stageTimings(session.metrics(session.state.preview.requestId));
  for (const value of Object.values(timings)) assert.ok(value == null || value === 'bypassed' || (typeof value === 'number' && Math.round(value * 10) === value * 10), `ms with one decimal: ${value}`);
  assert.equal(timings.refresh, 3.3);
  assert.equal(timings.routing, 307.2);
});

import * as routeModule from './inline-ai-route.js';

test('prompt limit: one shared limit; over it nothing is sent and the editor says why', async () => {
  let calls = 0;
  const session = make({ route: async () => { calls += 1; return { choice: 'note', confidence: 0.9, probability: 0.9, ranked: ['note'] }; }, generate: async () => { calls += 1; return { result: { kind: 'note', text: 'x' } }; } });
  assert.equal(routeModule.PROMPT_MAX, 1000);
  assert.equal(await session.submit({ mode: 'explain', prompt: 'a'.repeat(1001), prepare: snapshot() }), 'too_long');
  assert.equal(calls, 0);
  assert.match(session.state.error, /1001 characters; inline requests stop at 1000\. Shorten it/);
  assert.equal(await session.submit({ mode: 'explain', prompt: `explain ${'a'.repeat(992)}`, prepare: snapshot() }), 'preview', 'exactly at the limit is sent');
});

test('prompt limit: a refused routing call (400) is an error with its reason, never a quiet plain note', async () => {
  let generated = 0;
  const session = make({ route: async () => ({ error: 'too_long', status: 400, message: 'This request is 1200 characters; inline requests stop at 1000. Shorten it and send again.' }), generate: async () => { generated += 1; return { result: { kind: 'note', text: 'x' } }; } });
  assert.equal(await session.submit({ mode: 'explain', prompt: 'Show the shape of this', prepare: snapshot() }), 'invalid');
  assert.equal(generated, 0);
  assert.equal(session.state.preview, null);
  assert.match(session.state.error, /1200 characters/);
  // Any other routing failure still falls back to a stated note (§6).
  const other = make({ route: async () => ({ error: 'timeout' }), generate: async () => ({ result: { kind: 'note', text: 'x' } }) });
  assert.equal(await other.submit({ mode: 'explain', prompt: 'Show the shape of this', prepare: snapshot() }), 'preview');
  assert.match(other.state.notice, /short note/);
});

import * as slashModule from './learn-slash.js';

// A session whose handlers record what they were given. route: what JEV answers for a routed sentence.
const recorder = (route = null) => {
  const seen = { artifact: [], generate: [], motion: [] };
  const session = make({
    route: async () => route,
    artifact: async input => { seen.artifact.push(input.args); return { result: 'artifact', primitive: input.command, block: { type: 'flow' } }; },
    generate: async input => { seen.generate.push(input.prompt); return { result: { kind: 'note', text: 'x' } }; },
  }, { motion: (args, about) => { const proposal = slashModule.motionProposal(args, { concept: about?.concept || null }, about?.selection); seen.motion.push(proposal.block.operation); return proposal; } });
  return { session, seen };
};
const empty = [{ id: 's1', type: 'shape', kind: 'rect', text: '' }];

test('command input: a bare /motion builds its request from the selection, never the token or the canvas title', async () => {
  const { session, seen } = recorder();
  assert.equal(await session.submit({ mode: 'explain', prompt: '/motion', prepare: snapshot() }), 'proposal');
  assert.deepEqual(seen.motion, [{ op: 'motion_request', request: '/motion explain the selected canvas material (about the selected canvas material: shape:ellipse "23")', location: { concept: '23' } }]);
  const none = recorder();
  assert.equal(await none.session.submit({ mode: 'explain', prompt: '/motion', prepare: snapshot('e', empty) }), 'clarify');
  assert.match(none.session.state.clarify.question, /What should the video explain\?/);
  assert.equal(none.seen.motion.length, 0);
});

test('command input: a bare /image searches the selection\'s words; with none it asks', async () => {
  const { session, seen } = recorder();
  await session.submit({ mode: 'explain', prompt: '/image', prepare: snapshot() });
  await session.submit({ mode: 'explain', prompt: '/image an oak tree', prepare: snapshot('t2') });
  assert.deepEqual(seen.artifact, ['23', 'an oak tree']);
  const none = recorder();
  assert.equal(await none.session.submit({ mode: 'explain', prompt: '/image', prepare: snapshot('e', empty) }), 'clarify');
  assert.match(none.session.state.clarify.question, /What should the photo show\?/);
  assert.equal(none.seen.artifact.length, 0);
});

test('command input: a bare /diagram names the selection as its subject; with none it asks', async () => {
  const { session, seen } = recorder();
  await session.submit({ mode: 'explain', prompt: '/diagram', prepare: snapshot() });
  assert.deepEqual(seen.artifact, ['the selected canvas material: 23']);
  const none = recorder();
  assert.equal(await none.session.submit({ mode: 'explain', prompt: '/diagram', prepare: snapshot('e', empty) }), 'clarify');
  assert.match(none.session.state.clarify.question, /What should the diagram show\?/);
  assert.equal(none.seen.artifact.length, 0);
});

test('command input: a routed sentence goes as written with the selection as Motion\'s concept; a routed photo searches the selection', async () => {
  const video = recorder({ choice: 'motion', confidence: 0.95, probability: 0.95, ranked: ['motion'] });
  await video.session.submit({ mode: 'explain', prompt: 'Explain this in a video', prepare: snapshot() });
  assert.deepEqual(video.seen.motion, [{ op: 'motion_request', request: '/motion Explain this in a video (about the selected canvas material: shape:ellipse "23")', location: { concept: '23' } }]);
  const photo = recorder({ choice: 'image', confidence: 0.95, probability: 0.95, ranked: ['image'] });
  await photo.session.submit({ mode: 'explain', prompt: 'Show me a real photo of this', prepare: snapshot() });
  assert.deepEqual(photo.seen.artifact, ['23']);
  const diagram = recorder({ choice: 'diagram', confidence: 0.95, probability: 0.95, ranked: ['diagram'] });
  await diagram.session.submit({ mode: 'explain', prompt: 'Explain this with a diagram', prepare: snapshot() });
  assert.deepEqual(diagram.seen.artifact, ['Explain this with a diagram']);
});

test('command input: the page gives inline Motion the selection, never the canvas title', async () => {
  const { readFileSync } = await import('node:fs');
  const page = readFileSync(new URL('./LearnPage.jsx', import.meta.url), 'utf8');
  assert.match(page, /motion: isLearnCommand\('motion'\) \? \(args, about = \{\}\) => motionProposal\(args, \{ concept: about\.concept \|\| null \}, about\.selection\) : null,/);
});

import * as transportModule from './inline-ai-transport.js';

test('refine: the instruction, the previous output and the original request go to the same output, which revises it', async () => {
  const seen = [];
  let routes = 0;
  const session = make({
    route: async () => { routes += 1; return { choice: 'diagram', confidence: 0.9, probability: 0.9, ranked: ['diagram'] }; },
    generate: async input => { seen.push(input); return { result: { kind: 'note', text: ['Node 23 is a child of node 4.', 'Child of 4.', 'Leaf; child of 4.'][seen.length - 1] } }; },
  });
  await session.submit({ mode: 'explain', prompt: 'Explain this node', prepare: snapshot() });
  await session.submit({ mode: 'explain', prompt: 'make it much shorter', prepare: snapshot() });
  assert.equal(routes, 0, 'a refine keeps its output: no routing call');
  assert.deepEqual([seen[1].route, seen[1].prompt, seen[1].revise], ['note', 'make it much shorter', { prompt: 'Explain this node', result: 'Node 23 is a child of node 4.' }]);
  assert.equal(session.state.preview.text, 'Child of 4.', 'the candidate on screen is the revision');
  // A second refine revises the newest candidate, with the original request still as context.
  await session.submit({ mode: 'explain', prompt: 'say it is a leaf', prepare: snapshot() });
  assert.deepEqual(seen[2].revise, { prompt: 'Explain this node', result: 'Child of 4.' });
  // A / command or the other pill while a preview shows is a new request, not a revision.
  await session.submit({ mode: 'explain', prompt: '/simplify', prepare: snapshot() });
  assert.equal(seen[3].revise, undefined);
});

test('refine: a card is revised by its own handler, with the card and the original request in its context', async () => {
  const seen = [];
  const session = make({
    route: async () => ({ choice: 'diagram', confidence: 0.95, probability: 0.95, ranked: ['diagram'] }),
    artifact: async input => { seen.push(input); return { result: 'artifact', primitive: 'diagram', block: { type: 'flow', title: `Where node 23 sits ${seen.length}` } }; },
  });
  await session.submit({ mode: 'explain', prompt: 'Explain this with a diagram', prepare: snapshot() });
  await session.submit({ mode: 'explain', prompt: 'add the root', prepare: snapshot() });
  assert.equal(seen[1].command, 'diagram');
  assert.equal(seen[1].args, 'add the root');
  assert.deepEqual(seen[1].revise, { prompt: 'Explain this with a diagram', result: JSON.stringify({ type: 'flow', title: 'Where node 23 sits 1', text: '' }) });
  const context = transportModule.artifactContext({ target: { ids: ['n23'] } }, seen[1].revise);
  assert.match(context, /^Revise this earlier card .* original request was: "Explain this with a diagram"\nEarlier card: \{"type":"flow","title":"Where node 23 sits 1"/);
});

test('refine telemetry: the candidate a refine revised is settled as refined, not left provisional', async () => {
  const rows = [];
  const session = make({ generate: async () => ({ result: { kind: 'note', text: 'x' } }) }, { onMetrics: entry => rows.push([entry.requestId, entry.outcome]) });
  await session.submit({ mode: 'explain', prompt: 'Explain this node', prepare: snapshot() });
  const first = session.state.preview.requestId;
  await session.submit({ mode: 'explain', prompt: 'shorter', prepare: snapshot() });
  assert.deepEqual(rows.filter(([id]) => id === first).map(([, outcome]) => outcome), ['previewed', 'refined']);
});

test('S2: an Accept that throws or cannot apply is undone and says so; Accept stays usable', async () => {
  const session = make({ generate: async () => ({ result: { kind: 'note', text: 'x' } }) });
  await session.submit({ mode: 'explain', prompt: 'Explain this', prepare: snapshot() });
  let out;
  assert.doesNotThrow(() => { out = session.accept(() => { throw new TypeError('no place for the note'); }); });
  assert.match(out.error, /could not be added to the canvas: no place for the note/);
  assert.equal(session.state.accepted, false);
  assert.equal(session.state.status, 'preview');
  assert.match(session.state.error, /could not be added/);
  const said = session.accept(() => ({ error: 'There is no place on the canvas beside the selection for this note.' }));
  assert.match(said.error, /no place on the canvas/);
  assert.deepEqual(session.accept(() => ({ ok: true })), { ok: true }, 'a later Accept still applies');
});

import * as applyModule from './inline-ai-apply.js';

test('S3: a whole-text replace is refused on a target longer than the edit could read', () => {
  const long = 'word '.repeat(1000); // 5000 characters: the context clips it at 4000
  const board = { shapes: [], items: [{ id: 't1', kind: 'text', x: 0, y: 0, w: 300, text: long }], links: [], blocks: [] };
  const frozen = { ids: ['t1'], range: null };
  const checked = applyModule.validateEdit({ summary: 'Shorter', ops: [{ op: 'replace_text', id: 't1', text: 'word' }] }, frozen, board);
  assert.equal(checked.ok, false);
  assert.match(checked.errors[0], /longer than the 4000 characters an edit can read.*Select the words to change/);
  const short = { ...board, items: [{ ...board.items[0], text: 'a short line' }] };
  assert.equal(applyModule.validateEdit({ summary: 'x', ops: [{ op: 'replace_text', id: 't1', text: 'a shorter line' }] }, frozen, short).ok, true, 'a target the edit read whole can still be replaced');
});

test('S3: a target the context clipped (the total budget, not only its own length) is not replaced whole', () => {
  const board = { shapes: [], items: [{ id: 't2', kind: 'text', x: 0, y: 0, w: 300, text: 'x'.repeat(3000) }], links: [], blocks: [] };
  const checked = applyModule.validateEdit({ summary: 'x', ops: [{ op: 'replace_text', id: 't2', text: 'y' }] }, { ids: ['t2'], range: null, clipped: ['t2'] }, board);
  assert.equal(checked.ok, false);
  assert.match(checked.errors[0], /Select the words to change/);
});

test('S4: a routing call the worker refused before calling JEV is recorded as bypassed, never jev', async () => {
  const rows = [];
  const run = async read => {
    const session = make({ route: async () => read, generate: async () => ({ result: { kind: 'note', text: 'x' } }) }, { onMetrics: entry => rows.push(entry) });
    await session.submit({ mode: 'explain', prompt: 'Show the shape of this', prepare: snapshot() });
    const entry = rows.at(-1);
    return [entry.routing, sessionModule.routeColumn(entry), sessionModule.stageTimings(entry).routing];
  };
  assert.deepEqual(await run({ error: 'unavailable', called: false }), ['skipped:unavailable', 'bypassed', 'bypassed']);
  const [routing, column, stage] = await run({ error: 'timeout', called: true });
  assert.deepEqual([routing, column, typeof stage], ['fallback:timeout', 'jev', 'number'], 'a call that reached JEV and failed is still jev');
});

test('M2: a refine of a long edit sends at most the worker limit, cut per operation and marked', () => {
  const ops = [{ op: 'replace_text', id: 't1', text: 'x'.repeat(20000) }, { op: 'replace_text', id: 't2', text: 'short' }];
  const sent = sessionModule.earlierResult({ kind: 'edit', summary: 'Rewrote both', raw: { ops } });
  assert.ok(sent.length <= routeModule.EARLIER_MAX, String(sent.length));
  const read = JSON.parse(sent);
  assert.equal(read.truncated, true);
  assert.equal(read.ops[1].text, 'short');
  assert.ok(read.ops[0].text.endsWith('…'));
  assert.equal(sessionModule.earlierResult({ kind: 'edit', summary: 's', raw: { ops: [ops[1]] } }), JSON.stringify({ summary: 's', ops: [ops[1]] }), 'a short edit goes whole');
});

import * as contextModule from './inline-ai-context.js';

test('M3: a node with hundreds of links lists a capped number and counts the rest', () => {
  const hub = { id: 'hub', kind: 'ellipse', x1: 0, y1: 0, x2: 60, y2: 60, text: 'hub' };
  const leaves = Array.from({ length: 300 }, (_, i) => ({ id: `leaf${i}`, kind: 'ellipse', x1: 100 + i, y1: 200, x2: 160 + i, y2: 260, text: `leaf ${i}` }));
  const links = leaves.map((leaf, i) => ({ id: `l${i}`, from: 'hub', to: leaf.id, label: 'a fairly long label on this link '.repeat(4) }));
  const board = { shapes: [hub, ...leaves], items: [], links, blocks: [], groups: [], exchanges: [], boxes: {} };
  const target = contextModule.freezeTarget(board, ['hub']);
  const context = contextModule.buildContext(board, target, { cache: contextModule.createContextCache(), boardKey: 'b' });
  assert.equal(context.connections.length, contextModule.LIMITS.connections);
  assert.equal(context.omitted.connections, 300 - contextModule.LIMITS.connections);
  assert.equal(context.complete.hub, false, 'the model is told it did not see every link');
  assert.ok(JSON.stringify(context).length < 60000, String(JSON.stringify(context).length));
});

test('M4: the telemetry streaming flag is the mode the worker reports, not a guess from chunks', async () => {
  const rows = [];
  const whole = make({ generate: async (input, { onEvent }) => { onEvent({ type: 'meta', streaming: false }); onEvent({ type: 'delta', text: 'All at once.' }); return { result: { kind: 'note', text: 'All at once.' } }; } }, { onMetrics: entry => rows.push(entry) });
  await whole.submit({ mode: 'explain', prompt: 'Explain this', prepare: snapshot() });
  assert.equal(rows.at(-1).streaming, false, 'one delta from a whole answer is not streaming');
  const streamed = make({ generate: async (input, { onEvent }) => { onEvent({ type: 'meta', streaming: true }); onEvent({ type: 'delta', text: 'a' }); return { result: { kind: 'note', text: 'a' } }; } }, { onMetrics: entry => rows.push(entry) });
  await streamed.submit({ mode: 'explain', prompt: 'Explain this', prepare: snapshot('s') });
  assert.equal(rows.at(-1).streaming, true);
});

test('M5: the dead code the review found is gone', async () => {
  const { readFileSync } = await import('node:fs');
  const source = name => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
  assert.equal('applied' in applyModule, false, 'applied (used only by its own test)');
  assert.equal('proposal' in sessionModule.STAGES, false, 'STAGES.proposal (never shown)');
  assert.doesNotMatch(source('inline-ai-session.js'), /requestId: state\.preview \? state\.requestId : id/, 'the no-op requestId conditional');
  assert.doesNotMatch(source('inline-ai-route.js'), /inline-ai-route-bench\.mjs/, 'a reference to a file that does not exist');
});
