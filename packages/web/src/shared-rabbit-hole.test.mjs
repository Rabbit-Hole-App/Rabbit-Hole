// Start Rabbit Hole on a shared canvas (docs/features/shared-canvas-rabbit-hole.md): the origin sent, the sign-in round
// trip, the call - and a gate that the implementation names no particular board, lesson, card type or share.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BLANK, rabbitOrigin, requestRabbitHole, resumeHref, startHref, takeResume } from './shared-rabbit-hole.js';

test('the origin is the selected card\'s identities, or null for the canvas itself', () => {
  assert.equal(rabbitOrigin({ blocks: [] }, null), null);
  const state = { blocks: [{ id: 'k1', type: 'quiz', question: 'Why does salt melt ice?' }], exchanges: [{ id: 'c1', question: 'Why?' }] };
  assert.deepEqual(rabbitOrigin(state, 'k1'), { block_id: 'k1', scene_id: null, card_id: null, part_id: null, concept_ids: [], selected_object: null, depth: null });
  assert.equal(rabbitOrigin(state, 'c1').block_id, 'c1', 'a chat card is a card too');
  // An interactive card's runtime identities come from the same resolver /dive uses.
  const scene = { id: 'any-scene', objects: [{ id: 'o1', conceptId: 'freezing-point' }] };
  assert.deepEqual(rabbitOrigin({ blocks: [{ id: 's1', type: 'scene', scene, selectedObject: 'o1' }] }, 's1'), { block_id: 's1', scene_id: 'any-scene', card_id: null, part_id: null, concept_ids: ['freezing-point'], selected_object: 'o1', depth: null });
  assert.equal(rabbitOrigin(state, 'gone').block_id, 'gone', 'an unknown card is still named; the server refuses it');
  // The card is named as every canvas surface describes it, kind first; a card the describer cannot name is left to the server.
  const describe = block => (block.type === 'quiz' ? { kind: 'Quiz', title: block.question } : null);
  assert.equal(rabbitOrigin(state, 'k1', describe).title, 'Quiz: Why does salt melt ice?');
  assert.equal('title' in rabbitOrigin(state, 'c1', describe), false);
  assert.equal('title' in rabbitOrigin(state, 'k1', () => { throw new Error('unknown'); }), false);
});

test('signed out: the existing sign-in, back to this page with the origin, read once and dropped from the address', () => {
  assert.equal(resumeHref('/b/abc', 'k1'), `/login?next=${encodeURIComponent('/b/abc?rabbit=k1')}`);
  assert.equal(resumeHref('/b/abc', null), `/login?next=${encodeURIComponent('/b/abc?rabbit=root')}`);
  const replaced = [];
  const history = { replaceState: (_s, _t, url) => replaced.push(url) };
  assert.equal(takeResume({ search: '?rabbit=k1', pathname: '/b/abc' }, history), 'k1');
  assert.equal(takeResume({ search: '?rabbit=root', pathname: '/b/abc' }, history), null);
  assert.equal(takeResume({ search: '', pathname: '/b/abc' }, history), undefined);
  assert.deepEqual(replaced, ['/b/abc', '/b/abc']);
});

test('the call: one POST to the share\'s own route; sign-in, the hole to open, or the server\'s reason', async () => {
  const sent = [];
  const reply = (status, body) => async (url, init) => { sent.push({ url, init }); return Response.json(body, { status }); };
  assert.deepEqual(await requestRabbitHole('t/k', null, { fetchImpl: reply(201, { url: '/apps/canvas-0000abcd' }) }), { url: '/apps/canvas-0000abcd', existing: false });
  assert.equal(sent[0].url, '/api/learn/boards/shared/t%2Fk/rabbit-hole');
  assert.equal(sent[0].init.method, 'POST');
  assert.deepEqual(JSON.parse(sent[0].init.body), { origin: null });
  assert.deepEqual(await requestRabbitHole('t', { block_id: 'k1' }, { fetchImpl: reply(200, { url: '/apps/canvas-0000abcd', existing: true }) }), { url: '/apps/canvas-0000abcd', existing: true });
  assert.deepEqual(await requestRabbitHole('t', null, { fetchImpl: reply(401, { signIn: true }) }), { signIn: true });
  await assert.rejects(requestRabbitHole('t', { block_id: 'x' }, { fetchImpl: reply(404, { error: 'That card is not on this shared canvas.' }) }), /not on this shared canvas/);
});

// Privacy test 11 (Ruling F1, contract §1.4): a hook clicked while signed out survives the sign-in round trip by its id, and
// the start sends the step and gets back the server-checked one; a stale one comes back as { stale: true } to start without it.
test('a hook survives sign-in: the hook resume key, read only when asked; the step travels and comes back checked', async () => {
  assert.equal(resumeHref('/b/abc', 'k1', 'ns_01020304.2'), `/login?next=${encodeURIComponent('/b/abc?rabbit=k1&hook=ns_01020304.2')}`);
  assert.equal(resumeHref('/b/abc', null, null), `/login?next=${encodeURIComponent('/b/abc?rabbit=root')}`, 'no hook: as before');
  const replaced = [];
  const history = { replaceState: (_s, _t, url) => replaced.push(url) };
  const back = { search: `?rabbit=k1&hook=${encodeURIComponent('ns_01020304.2')}`, pathname: '/b/abc' };
  assert.deepEqual(takeResume(back, history, { hook: true }), { origin: 'k1', hook: 'ns_01020304.2' });
  assert.equal(takeResume(back, history), 'k1', 'the default return is unchanged');
  assert.deepEqual(takeResume({ search: '?rabbit=root', pathname: '/b/abc' }, history, { hook: true }), { origin: null, hook: null });
  assert.equal(takeResume({ search: '', pathname: '/b/abc' }, history, { hook: true }), undefined);
  assert.deepEqual(replaced, ['/b/abc', '/b/abc', '/b/abc'], 'the hook leaves the address with the origin');
  const sent = [];
  const reply = (status, body) => async (url, init) => { sent.push(JSON.parse(init.body)); return Response.json(body, { status }); };
  const step = { v: 1, set_id: 'ns_01020304', suggestion_id: 'ns_01020304.2', learning_goal: 'g', scope: 'shared' };
  assert.deepEqual(await requestRabbitHole('t', null, { step, fetchImpl: reply(201, { url: '/apps/canvas-0000abcd', name: 'canvas-0000abcd', next_step: step }) }),
    { url: '/apps/canvas-0000abcd', existing: false, name: 'canvas-0000abcd', next_step: step });
  assert.deepEqual(sent.at(-1), { origin: null, selected_next_step: step });
  assert.deepEqual(await requestRabbitHole('t', { block_id: 'k1' }, { step, fetchImpl: reply(409, { error: 'stale_hook' }) }), { stale: true });
  await assert.rejects(requestRabbitHole('t', null, { step, fetchImpl: reply(409, { error: 'Turn the view link on first.' }) }), /view link/, 'any other refusal still throws');
  await requestRabbitHole('t', null, { fetchImpl: reply(201, { url: '/apps/canvas-0000abcd' }) });
  assert.deepEqual(sent.at(-1), { origin: null }, 'no step: the body is as before');
});

// Anti-hardcoding: the start is generic Shared Canvas behaviour. Its code names no lesson, topic, card type, board
// or fixture, on either side.
test('the implementation special-cases no board, lesson, topic, card type or share', () => {
  const server = readFileSync(new URL('../../control-plane/src/learn-boards.js', import.meta.url), 'utf8');
  const route = server.slice(server.indexOf('// Start Rabbit Hole'), server.indexOf('// The owner of a board'));
  const client = readFileSync(new URL('./shared-rabbit-hole.js', import.meta.url), 'utf8');
  const page = readFileSync(new URL('./SharedBoardPage.jsx', import.meta.url), 'utf8');
  const button = page.slice(page.indexOf('function StartRabbitHole'), page.indexOf('const SOURCE_ICON'));
  assert.ok(route.length > 1000 && button.length > 300, 'found the code under test');
  for (const [name, code] of [['server route', route], ['client', client], ['button', button]]) {
    assert.doesNotMatch(code, /nano ?gpt|karpathy|attention|softmax|token id|deep-dive|board=|\b(quiz|challenge|flashcards|scene|video|wiki|paper|notebook)\b'|['"](quiz|challenge|flashcards|video|wiki|paper)['"]/i, name);
  }
});

// Owner, 2026-10-08: Start Rabbit Hole on someone else's canvas asks From this canvas or Blank; the choice survives sign-in.
test('Blank rides the same start: its body names no card or step, and ?rabbit=blank survives sign-in', async () => {
  const sent = [];
  const fetchImpl = async (path, init) => { sent.push([path, JSON.parse(init.body)]); return new Response(JSON.stringify({ url: '/apps/canvas-0000000b', name: 'canvas-0000000b' }), { status: 201 }); };
  assert.deepEqual(await requestRabbitHole('tok', BLANK, { fetchImpl, step: { set_id: 'x' } }), { url: '/apps/canvas-0000000b', existing: false });
  assert.deepEqual(sent[0], ['/api/learn/boards/shared/tok/rabbit-hole', { origin: null, blank: true }], 'no card, no step');
  assert.equal(resumeHref('/b/tok', BLANK), `/login?next=${encodeURIComponent('/b/tok?rabbit=blank')}`);
  assert.equal(resumeHref('/b/tok', null), `/login?next=${encodeURIComponent('/b/tok?rabbit=root')}`, 'From this canvas is unchanged');
  const replaced = [];
  const history = { replaceState: (...args) => replaced.push(args) };
  assert.equal(takeResume({ search: '?rabbit=blank', pathname: '/e/tok' }, history), BLANK);
  assert.equal(takeResume({ search: '?rabbit=root', pathname: '/e/tok' }, history), null);
  assert.deepEqual([startHref('/e/tok', BLANK), startHref('/e/tok', null)], ['/e/tok?rabbit=blank', '/e/tok?rabbit=root']);
});

test('every Start Rabbit Hole on someone else\'s canvas opens the choice first: the header, Explore cards, the card menu', () => {
  const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const page = read('./SharedBoardPage.jsx'), cards = read('./home/PublicCards.jsx'), choice = read('./RabbitHoleChoice.jsx');
  assert.match(choice, /<ConfirmDialog title="Start a Rabbit Hole" confirmLabel="From this canvas" confirmVariant="primary" altLabel="Blank"\n\s+onConfirm=\{\(\) => onPick\(card\?\.id \|\| null\)\} onAlt=\{\(\) => onPick\(BLANK\)\} onCancel=\{onCancel\}/);
  assert.match(choice, /"\{title\} notes", linked back to this one\. Nothing is copied\./);
  assert.match(page, /onClick=\{\(\) => ask\(card\?\.id \|\| null\)\}/, 'the header asks');
  assert.match(page, /const startFromCard = useCallback\(cardId => rabbitAsk\.current\?\.\(cardId\), \[\]\);/, 'the card menu asks');
  assert.match(page, /onPick=\{\(origin\) => \{ setAsking\(null\); run\(origin\); \}\}/);
  assert.match(page, /useEffect\(\(\) => \{ if \(resume !== undefined\) run\(resume\.origin/, 'back from sign-in, the choice already made starts');
  assert.match(page, /onPick=\{\(step, hook\) => startRef\.current\?\.\(card, step, hook\.id\)\}/, 'a Next Steps hook starts its own step, no popup');
  assert.match(cards, /data-card-start-rabbit-hole onClick=\{stop\(\(\) => setStarting\(card\)\)\}/);
  assert.match(cards, /onPick=\{\(origin\) => \{ setStarting\(null\); go\(startHref\(starting\.url, origin\)\); \}\}/);
});
