import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  aboutScope, applyEvent, cardView, shortcutsFor, carry, EXPIRY_MS, follow, getLatest, getTurns, labelOf, learnOutcome, lineOf, MODES, modeAvailability, modeQuery,
  offerFor, placeholderFor, pushTurn, rejectBody, resetThread, resultsKey, resultsView, subscribeTurns, threadIds, threadsPath, updateTurn, widen,
} from './bar.js';
import { scopeKey } from './scope.js';

const home = { org: 'gmail-com', kind: 'workspace', slug: null, title: null, selected: null };
const nano = { org: 'gmail-com', kind: 'project', slug: 'repo-1a2b', title: 'karpathy/nanoGPT', selected: null };
const attn = { ...nano, selected: { id: 'n7', label: 'CausalSelfAttention', commit: '3f2a1c9' } };
const counter = { org: 'gmail-com', kind: 'app', slug: 'counter', title: 'counter', selected: null };
const OFF = 'Asking about the workspace or apps is off on this preview: it would write to live chat history.';

test('results and threads are per resource (org|kind:slug); drafts stay per selection', () => {
  assert.equal(resultsKey(nano), 'gmail-com|project:repo-1a2b');
  assert.equal(resultsKey(attn), resultsKey(nano)); // what the Context panel reads while a node is selected
  assert.equal(resultsKey(home), 'gmail-com|workspace:');
  assert.notEqual(resultsKey(nano), resultsKey(counter));
  assert.notEqual(scopeKey(attn), scopeKey(nano));
});

test('the store keeps one list per key, tracks the latest entry, and tells listeners new from updated', () => {
  const events = [];
  const stop = subscribeTurns((e) => events.push(e));
  assert.equal(getTurns('t1|a'), getTurns('t1|b')); // one stable empty list keeps useSyncExternalStore quiet
  pushTurn('t1|a', { id: 'a1', kind: 'note', text: 'one', label: 'A' });
  pushTurn('t1|b', { id: 'b1', kind: 'note', text: 'two', label: 'B' });
  assert.deepEqual(getTurns('t1|a').map((t) => t.id), ['a1']);
  assert.equal(getLatest().id, 'b1');
  const untouched = getTurns('t1|a');
  updateTurn('t1|b', 'b1', (t) => ({ ...t, text: 'two!' }));
  assert.equal(getTurns('t1|a'), untouched);
  assert.equal(getLatest().text, 'two!');
  assert.deepEqual(events, [{ key: 't1|a', pushed: true }, { key: 't1|b', pushed: true }, { key: 't1|b', pushed: false }]);
  stop();
});

test('a new thread forgets the thread id and the results of that key only', () => {
  threadIds.set('t2|a', 7);
  threadIds.set('t2|b', 8);
  pushTurn('t2|a', { id: 'x1', kind: 'note', text: 'x', label: 'A' });
  resetThread('t2|a');
  assert.equal(threadIds.has('t2|a'), false);
  assert.equal(threadIds.get('t2|b'), 8);
  assert.equal(getTurns('t2|a').length, 0);
});

test('SSE events fold into one answer; canvas-only and unknown events change nothing', () => {
  let a = { kind: 'answer', text: '', label: 'nanoGPT' };
  a = applyEvent(a, 'progress', { stage: 'Reading the graph' });
  a = applyEvent(a, 'chunk', { text: 'Start at ' });
  a = applyEvent(a, 'chunk', { text: 'model.py' });
  a = applyEvent(a, 'graph', { title: 'Attention', nodes: [] });
  a = applyEvent(a, 'papers', { papers: [{ id: '1706.03762', title: 'Attention Is All You Need', pdfUrl: 'https://arxiv.org/pdf/1706.03762' }] });
  a = applyEvent(a, 'wiki', { title: 'Transformer', url: 'https://en.wikipedia.org/wiki/Transformer' });
  a = applyEvent(a, 'video', { videoId: 'kCc8FmEb1nY', title: 'GPT from scratch', start: 0, end: null });
  assert.equal(a.text, 'Start at model.py');
  assert.equal(a.stage, 'Reading the graph');
  assert.equal(a.graph.title, 'Attention');
  assert.deepEqual(a.sources.map((s) => s.label), ['Attention Is All You Need', 'Transformer', 'GPT from scratch']);
  assert.equal(a.sources[2].href, 'https://www.youtube.com/watch?v=kCc8FmEb1nY');
  // T02 §9 research request sources: an id or a link resolves exactly
  assert.deepEqual(a.sources.map((s) => s.ref), [
    { kind: 'arxiv', ref: '1706.03762' }, { kind: 'wiki', ref: 'https://en.wikipedia.org/wiki/Transformer' }, { kind: 'youtube', ref: 'kCc8FmEb1nY' },
  ]);
  for (const type of ['outline', 'paper', 'proposal', 'mystery']) assert.equal(applyEvent(a, type, {}), a, type);
  assert.equal(applyEvent(a, 'done', { ok: true, threadId: 3 }).done, true);
  assert.deepEqual(applyEvent(a, 'error', { error: 'anthropic 529' }), { ...a, error: 'anthropic 529', done: true });
});

test('the collapsed line names the scope and shows one line', () => {
  assert.equal(lineOf({ kind: 'answer', label: 'nanoGPT', text: 'Start at model.py\nThen train.py' }), 'nanoGPT · Start at model.py');
  assert.equal(lineOf({ kind: 'answer', label: 'Gmail', text: '', error: "Couldn't reach the server." }), "Gmail · ✗ Couldn't reach the server.");
  assert.equal(lineOf({ kind: 'card', label: 'Gmail', card: { model: { title: 'Share counter' } } }), 'Gmail · Share counter');
  assert.equal(lineOf({ kind: 'results', label: 'Gmail', results: [{}, {}] }), 'Gmail · 2 matches');
  assert.equal(lineOf({ kind: 'results', label: 'Gmail', results: [] }), 'Gmail · No matches');
  assert.equal(lineOf({ kind: 'note', label: 'Gmail', text: 'Canvas created · Attention', undo: () => {} }), 'Gmail · Canvas created · Attention');
  assert.equal(lineOf({ kind: 'note', label: 'Gmail', text: 'Open an app to search its runs.', error: true }), 'Gmail · Open an app to search its runs.');
});

test('an empty draft follows the page; a waiting one keeps its scope (T02 §6.3)', () => {
  assert.equal(follow(null, nano, new Map()), nano);
  assert.equal(follow(nano, counter, new Map([[scopeKey(nano), '   ']])), counter);
  assert.equal(follow(nano, counter, new Map([[scopeKey(nano), 'Explain the merge loop']])), nano);
  assert.equal(follow(nano, counter, new Map([[scopeKey(counter), 'kept for counter']])), counter); // restored on return
});

test('switching a waiting draft moves or copies it, and never overwrites or drops one', () => {
  const d = new Map([[scopeKey(nano), 'why sqrt(dk)?']]);
  assert.deepEqual([...carry(d, nano, attn, false)], [[scopeKey(attn), 'why sqrt(dk)?']]);
  assert.deepEqual([...carry(d, nano, counter, true)], [[scopeKey(nano), 'why sqrt(dk)?'], [scopeKey(counter), 'why sqrt(dk)?']]);
  const both = new Map([...d, [scopeKey(counter), 'about counter']]);
  assert.equal(carry(both, nano, counter, false), both);
  assert.equal(carry(d, nano, nano, false), d);
});

test('a scope is named by its chips, the workspace scope by Rabbit Hole', () => {
  assert.equal(labelOf(home), 'Rabbit Hole');
  assert.equal(labelOf(nano), 'karpathy/nanoGPT');
  assert.equal(labelOf(attn), 'karpathy/nanoGPT · CausalSelfAttention');
});

test('the offer names what changed: another page, or a node on the same project', () => {
  assert.equal(offerFor(nano, nano), null);
  assert.equal(offerFor(nano, counter), 'resource');
  assert.equal(offerFor(nano, attn), 'selection');
  assert.equal(offerFor(attn, nano), 'resource'); // deselecting is a change too
});

test('× widens: dropping the resource drops its selection', () => {
  const surface = { org: 'gmail-com', place: 'project', resource: { kind: 'project', slug: 'repo-1a2b', title: 'nanoGPT' }, selected: { id: 'n7', label: 'CausalSelfAttention' } };
  assert.deepEqual(widen(surface, ['selected']), { ...surface, selected: null });
  assert.deepEqual(widen(surface, ['resource']), { ...surface, resource: null, selected: null });
  assert.equal(widen(surface, []), surface);
});

test('the placeholder follows the scope; the map status comes from the page first (T02 §12, §13)', () => {
  const catalog = [{ name: 'repo-1a2b', kind: 'repository', status: 'indexing' }, { name: 'repo-9f9f', kind: 'repository', status: 'ready' }];
  const surface = { resource: null, catalog };
  assert.equal(placeholderFor(home, surface), 'Start, open, ask, or paste a link…');
  assert.equal(placeholderFor(nano, surface), 'Code answers are available once the map is ready');
  // RepositoryPage's poll saw the map finish; the catalog Shell loaded has not.
  assert.equal(placeholderFor(nano, { catalog, resource: { kind: 'project', slug: 'repo-1a2b', title: 'karpathy/nanoGPT', status: 'ready' } }), 'Ask about karpathy/nanoGPT…');
  // A draft held for another project reads that project's catalog row, not this page's status.
  assert.equal(placeholderFor(nano, { catalog, resource: { kind: 'project', slug: 'repo-9f9f', status: 'ready' } }), 'Code answers are available once the map is ready');
  assert.equal(placeholderFor({ ...nano, slug: 'repo-9f9f', title: 'karpathy/minbpe' }, surface), 'Ask about karpathy/minbpe…');
  assert.equal(placeholderFor({ ...attn, slug: 'repo-9f9f' }, surface), 'Ask about CausalSelfAttention…');
  assert.equal(placeholderFor(counter, surface), 'Ask about counter…');
});

test('catalog matches show as an empty state, pills, or a list (T02 §6.6)', () => {
  const r = (n) => Array.from({ length: n }, (_, i) => ({ slug: `a${i}`, title: `A${i}`, kind: 'job' }));
  assert.equal(resultsView(r(0)), 'empty');
  assert.equal(resultsView(r(1)), 'pills');
  assert.equal(resultsView(r(5)), 'pills');
  assert.equal(resultsView(r(6)), 'list');
});

test('"/" at position 0 opens the picker with exactly four modes', () => {
  assert.deepEqual(MODES.map(([m]) => m), ['ask', 'teach', 'research', 'do']);
  assert.equal(modeQuery('/'), '');
  assert.equal(modeQuery('/te'), 'te');
  assert.equal(modeQuery('/teach why'), null);
  assert.equal(modeQuery('why /teach'), null);
  assert.equal(modeQuery(''), null);
});

test('modes a scope cannot serve carry their reason: T02 §6.4, and live chat history stays off on the preview', () => {
  assert.deepEqual(modeAvailability('auto', 'workspace'), { ok: true });
  // The third argument is flags.js askLiveOnPreview; passed here so this test holds whichever way the user decides.
  for (const kind of ['workspace', 'app']) assert.deepEqual(modeAvailability('ask', kind, false), { ok: false, reason: OFF, short: 'Off on this preview' }, kind);
  for (const kind of ['project', 'canvas']) assert.deepEqual(modeAvailability('ask', kind, false), { ok: true }, kind); // LEARN_DB
  for (const kind of ['workspace', 'app']) assert.deepEqual(modeAvailability('ask', kind, true), { ok: true }, kind);
  const RESEARCH_OFF = { ok: false, reason: 'Research here would call the live model, so it is off on this preview.', short: 'Off on this preview' };
  for (const kind of ['workspace', 'app', 'project']) assert.deepEqual(modeAvailability('research', kind), RESEARCH_OFF, kind); // a review-copy limit, not the product
  assert.deepEqual(modeAvailability('research', 'canvas'), { ok: true });
  assert.deepEqual(modeAvailability('teach', 'workspace'), { ok: true, reason: 'creates a canvas first' });
  assert.deepEqual(modeAvailability('teach', 'project'), { ok: true });
  assert.deepEqual(modeAvailability('do', 'app'), { ok: true });
});

test('card states follow T02 §7.3 and the server 409 statuses of §7.4', () => {
  const t0 = Date.parse('2026-09-23T10:00:00Z');
  const card = { blocked: false, createdAt: t0 };
  const failed = (status, data) => ({ ...card, phase: 'failed', error: { status, data } });
  assert.deepEqual(cardView(card, t0 + 60_000), { state: 'pending' });
  assert.equal(cardView(card, t0 + EXPIRY_MS + 1).state, 'expired');
  assert.deepEqual(cardView({ ...card, phase: 'executing' }, t0), { state: 'executing' });
  assert.deepEqual(cardView({ ...card, phase: 'done' }, t0), { state: 'done' });
  assert.deepEqual(cardView(failed(500, { error: 'boom' }), t0), { state: 'failed' });
  assert.deepEqual(cardView(failed(409, { error: 'already approved', status: 'approved' }), t0), { state: 'done-elsewhere', note: 'Already approved.' });
  assert.deepEqual(cardView(failed(409, { error: 'already rejected', status: 'rejected' }), t0), { state: 'cancelled', note: 'Cancelled.' });
  assert.deepEqual(cardView(failed(409, { error: 'already invalidated', status: 'invalidated' }), t0), { state: 'cancelled', note: 'This thread was deleted.' });
  assert.equal(cardView(failed(409, { error: 'already expired', status: 'expired' }), t0).state, 'expired');
  assert.equal(cardView(failed(409, { error: 'failed - ask again', status: 'failed' }), t0).state, 'failed'); // WP3 review: a claimed proposal whose tool failed
  assert.equal(cardView(failed(409, { error: 'already approved' }), t0).state, 'done-elsewhere'); // live today: no status field (index.js:1422)
  assert.equal(cardView(failed(403, { error: 'no access' }), t0).state, 'no-longer-allowed');
  assert.equal(cardView(failed(400, { error: 'no edit access' }), t0).state, 'no-longer-allowed'); // index.js:1428,1505
});

test('D7: a blocked card stays blocked however old; Cancel on it stays local', () => {
  assert.deepEqual(cardView({ blocked: true, createdAt: 0 }, EXPIRY_MS * 2), { state: 'blocked' });
  assert.deepEqual(cardView({ blocked: true, createdAt: 0, phase: 'cancelled' }, 0), { state: 'cancelled', note: 'Cancelled.' });
  assert.equal(rejectBody({ blocked: true, proposalId: 12 }), null);
  assert.equal(rejectBody({ blocked: false }), null); // a rule-routed card has no proposal to reject
  assert.deepEqual(rejectBody({ blocked: false, proposalId: 12 }), { proposal_id: 12 });
});

test('a Learn result: the bar shows the message learnAction wrote; only prefilled or added is done', () => {
  assert.deepEqual(learnOutcome({ status: 'prefilled', message: null }), { done: true, text: null, tone: null });
  assert.deepEqual(learnOutcome({ status: 'added', resourceId: 'r1', message: 'Added to canvas.' }), { done: true, text: 'Added to canvas.', tone: null });
  assert.deepEqual(learnOutcome({ status: 'fallback', message: "Opened Learn. Your prompt wasn't transferred; it's kept here." }), { done: false, text: "Opened Learn. Your prompt wasn't transferred; it's kept here.", tone: null });
  assert.deepEqual(learnOutcome({ status: 'timeout', message: 'Still working, check the canvas' }), { done: false, text: 'Still working, check the canvas', tone: null });
  assert.deepEqual(learnOutcome({ status: 'rejected', message: 'The composer already holds other text.' }), { done: false, text: 'The composer already holds other text.', tone: 'error' });
  assert.deepEqual(learnOutcome({ status: 'failed', message: 'Search failed. Try again.' }), { done: false, text: 'Search failed. Try again.', tone: 'error' });
});

test('History reads the existing thread endpoints for the scope', () => {
  assert.equal(threadsPath(home), '/api/ask/threads?scope=org');
  assert.equal(threadsPath(counter), '/api/ask/threads?scope=app&ref=counter');
  assert.equal(threadsPath(counter, 12), '/api/ask/threads/12');
  assert.equal(threadsPath(nano), '/api/repositories/repo-1a2b/threads');
  assert.equal(threadsPath(attn, 'th-9'), '/api/repositories/repo-1a2b/threads/th-9');
  // backend-canvas 'Learn resolves canvas-*': canvas chat history in LEARN_DB
  const canvas = { ...nano, kind: 'canvas', slug: 'canvas-0f3c9a1e', title: 'Attention deep dive' };
  assert.equal(threadsPath(canvas), '/api/ask/threads?scope=learn&ref=canvas-0f3c9a1e');
  assert.equal(threadsPath(canvas, 'canvaschat-9b1d'), '/api/ask/threads/canvaschat-9b1d');
});

test('a question about a connected repository asks in that project scope, keeping a selection on the same project', () => {
  const about = { slug: 'repo-9z', kind: 'repository', title: 'octocat/Hello-World' };
  const other = aboutScope(attn, about);
  assert.deepEqual(other, { org: 'gmail-com', kind: 'project', slug: 'repo-9z', title: 'octocat/Hello-World', selected: null });
  assert.equal(resultsKey(other), 'gmail-com|project:repo-9z'); // the project page's own results key
  assert.equal(aboutScope(attn, { slug: nano.slug, kind: 'repository', title: nano.title }), attn);
  assert.equal(aboutScope(home, about).kind, 'project');
});

test('the picker lists the shortcuts a place can use: /new stays off a project, /run needs a job', () => {
  const names = (list) => list.map(([name]) => name);
  const job = [{ name: 's3-log', kind: 'job' }];
  assert.deepEqual(names(shortcutsFor(home, job)), ['find', 'open', 'new', 'connect', 'run', 'share']);
  assert.deepEqual(names(shortcutsFor(home, [])), ['find', 'open', 'new', 'connect', 'share']);
  assert.deepEqual(names(shortcutsFor(nano, job)), ['find', 'open', 'connect', 'run', 'share']);
});
