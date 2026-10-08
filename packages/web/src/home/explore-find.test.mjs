import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FIND_DEBOUNCE_MS, findQuery, readFind, scheduleFind } from './explore-find.js';

test('only a sentence-length query asks the model: four or more words, spaces collapsed, capped at 300 characters', () => {
  for (const short of ['', '   ', 'attention', 'how attention works', '  how   attention   works ']) assert.equal(findQuery(short), null, short);
  assert.equal(findQuery('  how   does attention  work '), 'how does attention work');
  assert.equal(findQuery(`${'word '.repeat(100)}`).length, 300);
});

test('one find per pause in typing: each keystroke cancels the pending find, and only the last one runs', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const ran = [];
    let cancel = scheduleFind('how does attention work', q => ran.push(q));
    mock.timers.tick(FIND_DEBOUNCE_MS - 1);
    cancel();
    cancel = scheduleFind('how does attention work here', q => ran.push(q));
    mock.timers.tick(FIND_DEBOUNCE_MS - 1);
    assert.deepEqual(ran, []);
    mock.timers.tick(1);
    assert.deepEqual(ran, ['how does attention work here']);
  } finally { mock.timers.reset(); }
});

test('a refusal becomes the one-line note; the picks pass through', async () => {
  assert.deepEqual(await readFind(Response.json({ error: 'AI answers aren’t configured on this preview.', notConfigured: true }, { status: 503 })), { canvases: [], creators: [], note: 'AI answers aren’t configured on this preview.' });
  assert.deepEqual(await readFind(new Response('down', { status: 502 })), { canvases: [], creators: [], note: 'Recommendations are unavailable right now.' });
  assert.deepEqual(await readFind(Response.json({ canvases: [{ title: 'A' }], creators: [], note: '' })), { canvases: [{ title: 'A' }], creators: [], note: '' });
});

test('Explore wires Recommended above each tab\'s keyword results, signed in only, through the debounced find', () => {
  const home = readFileSync(new URL('../Home.jsx', import.meta.url), 'utf8'), explore = home.slice(home.indexOf('function Explore()'));
  assert.match(explore, /const found = useExploreFind\(term, !!me\);/);
  const creators = explore.indexOf('<Recommended found={found} me={me} kind="creators" />'), canvases = explore.indexOf('<Recommended found={project ? null : found} me={me} kind="canvases" />');
  assert.ok(creators > 0 && creators < explore.indexOf('{creators === null'), 'Creators tab: above the creator results');
  assert.ok(canvases > 0 && canvases < explore.indexOf('<div data-explore-list>'), 'Explainers tab: above the explainer results');
  const cards = readFileSync(new URL('./PublicCards.jsx', import.meta.url), 'utf8');
  assert.match(cards, /const q = signedIn \? findQuery\(term\) : null;/);
  assert.match(cards, /scheduleFind\(q, query => fetch\('\/api\/learn\/boards\/published\/find'/);
});
