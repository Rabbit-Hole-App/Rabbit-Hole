// Creator analytics read (docs/features/creator-analytics-contract.md "Dashboard read contract", owner brief 2026-10-23)
// on the shared-canvas fixture: owner-only on the server, range and canvas validated, real numbers only for the canonical
// counters (public canvases now, FORK_COUNT all time), every other section not_collected, the cohort rule applied before
// anything leaves the server, and no write of any kind.
import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, BOARD } from './shared-canvas-fixture.js';
import { creatorAnalyticsFetch, creatorAnalyticsRoute } from '../src/creator-analytics.js';
import { COHORT_MIN, STATE, suppress } from '../../web/src/creator-analytics-shape.js';

const NOW = Date.parse('2026-10-23T12:00:00Z');
const handle = (f, email, h) => {
  f.sqlite.prepare('INSERT INTO user_profiles (email) VALUES (?)').run(email);
  f.sqlite.prepare('INSERT INTO user_handles (email, handle) VALUES (?, ?)').run(email, h);
};
const canvasOf = async (f, as, title) => {
  const made = (await f.call('POST', '/api/canvases', { as, body: { title } })).body;
  await f.call('PUT', `/api/learn/boards/${made.name}/main`, { as, body: { state: BOARD } });
  return made;
};
const publish = async (f, as, c) => (await f.call('POST', `/api/apps/${c.name}/publish`, { as })).body.publication_token;
const get = async (f, query = '', as = 'ana', method = 'GET') => {
  const req = new Request(`https://app.test/api/analytics/creator${query}`, { method, headers: as ? { cookie: `small_session=${as}` } : {} });
  const res = await creatorAnalyticsFetch(req, f.env, { now: () => NOW });
  const text = await res.text();
  for (const email of ['ana@test', 'ben@test', 'cara@test']) assert.ok(!text.includes(email), `answered with ${email}`);
  return { status: res.status, body: JSON.parse(text), text };
};
const numbers = body => { const n = []; JSON.stringify(body, (k, v) => { if (k === 'value' && typeof v === 'number') n.push(v); return v; }); return n.sort((a, b) => a - b); };

async function world(t) {
  const f = setup(t);
  handle(f, 'ana@test', 'ana'); handle(f, 'ben@test', 'ben'); handle(f, 'cara@test', 'cara');
  const tides = await canvasOf(f, 'ana', 'Tides'), volcanoes = await canvasOf(f, 'ana', 'Volcanoes'), secret = await canvasOf(f, 'ana', 'Private plans');
  const tok = await publish(f, 'ana', tides); await publish(f, 'ana', volcanoes);
  const bridges = await canvasOf(f, 'cara', 'Bridges'); await publish(f, 'cara', bridges);
  for (const [as, key] of [['ben', 'cp-fork-1'], ['cara', 'cp-fork-2']]) assert.equal((await f.call('POST', '/api/learn/boards/fork', { as, body: { source: { token: tok }, key } })).status, 201, 'fork');
  f.statements.length = 0;
  return { f, tides, volcanoes, secret, bridges };
}

test('creator analytics: signed out 401; another creator\'s, a private or an unknown canvas 404 alike; only GET', async t => {
  const { f, tides, secret, bridges } = await world(t);
  assert.equal(creatorAnalyticsRoute('/api/analytics/creator'), true);
  assert.equal(creatorAnalyticsRoute('/api/analytics/creator/x'), false);
  assert.equal((await get(f, '', null)).status, 401);
  assert.equal((await get(f, `?canvas=${tides.name}`, null)).status, 401);
  const theirs = await get(f, `?canvas=${bridges.name}`); // ana asks for cara's public canvas
  const mine = await get(f, `?canvas=${secret.name}`); // ana's own, but private
  const none = await get(f, '?canvas=canvas-00000000');
  assert.deepEqual([theirs.status, mine.status, none.status], [404, 404, 404]);
  assert.equal(theirs.text, none.text, 'the same answer: existence is not revealed');
  assert.ok(!theirs.text.includes('Bridges'));
  assert.equal((await get(f, `?canvas=${tides.name}`, 'ben')).status, 404, 'a non-owner who forked it still gets 404');
  // cara reading her own dashboard sees only her canvas, never ana's.
  const cara = (await get(f, '', 'cara')).body;
  assert.deepEqual(cara.canvases.map(c => c.title), ['Bridges']);
  assert.equal((await get(f, '', 'ana', 'POST')).status, 405);
});

test('creator analytics: range and canvas are validated with a one-line fix', async t => {
  const { f } = await world(t);
  for (const q of ['?range=90d', '?range=', '?range=ALL', '?range=7d&range=x']) {
    const r = await get(f, q);
    if (q === '?range=7d&range=x') { assert.equal(r.status, 200, 'the first value is read'); continue; }
    assert.deepEqual([r.status, r.body.error], [400, 'Use range=7d, 30d or all'], q);
  }
  for (const q of ['?canvas=', '?canvas=repo-0a1b2c3d-nanogpt', "?canvas=canvas-1' OR 1=1", '?canvas=CANVAS-0A1B2C3D']) assert.equal((await get(f, q)).status, 400, q);
  for (const q of ['?compare=0', '?compare=true', '?compare=']) assert.deepEqual([(await get(f, q)).status, (await get(f, q)).body.error], [400, 'Use compare=1 to compare with the previous period'], q);
  const cmp = (await get(f, '?range=7d&compare=1')).body;
  assert.deepEqual([cmp.compare.periods.current, cmp.compare.periods.previous], [{ from: '2026-10-16', to: '2026-10-22', complete: false }, { from: '2026-10-09', to: '2026-10-15', complete: false }]);
  assert.deepEqual([cmp.overview.metrics.active_learners.change.state, cmp.overview.metrics.forks.change.state], ['unavailable', 'not_applicable']);
  assert.equal((await get(f, '?range=all&compare=1')).body.compare.state, 'not_applicable');
  for (const [q, from] of [['', '2026-09-24'], ['?range=7d', '2026-10-17'], ['?range=all', null]]) {
    const { body } = await get(f, q);
    assert.deepEqual(body.range, { id: q ? q.slice(7) : '30d', from, to: '2026-10-23', timezone: 'UTC' }, q || 'default 30d');
  }
});

test('creator analytics: today the only numbers are public canvases and canonical forks; the rest is not_collected, never 0', async t => {
  const { f, tides, volcanoes } = await world(t);
  const all = (await get(f)).body;
  assert.deepEqual(all.canvases.map(c => c.title), ['Volcanoes', 'Tides'], 'the session\'s own live public canvases, newest first; never the private one');
  assert.deepEqual(all.overview.metrics.public_canvases, { period: 'current', state: 'ready', value: 2 });
  assert.deepEqual(all.overview.metrics.forks, { period: 'all_time', state: 'ready', value: 2 });
  assert.deepEqual(all.comparison.rows.map(r => [r.title, r.forks.state, r.forks.value]), [['Volcanoes', 'measured_zero', 0], ['Tides', 'ready', 2]]);
  assert.deepEqual(numbers(all), [0, 2, 2, 2], 'nothing else is a number');
  for (const k of ['active_learners', 'avg_active_seconds', 'rabbit_holes_started', 'returning_learners', 'visit_to_learning']) assert.deepEqual([all.overview.metrics[k].state, all.overview.metrics[k].value], ['not_collected', null], k);
  for (const s of ['overview', 'audience', 'series', 'topics', 'traffic']) assert.equal(all[s].reason, 'storage_not_approved', s);
  assert.equal(all.support.reason, 'assessment_evidence_unsupported');
  assert.equal(all.campaigns.reason, 'campaign_links_not_built');
  assert.deepEqual(all.series.points, [], 'no invented or backfilled history');
  assert.equal(all.canvas_detail, null);
  const one = (await get(f, `?range=7d&canvas=${tides.name}`)).body;
  assert.deepEqual([one.canvas, one.overview.metrics.public_canvases.value, one.overview.metrics.forks.value, one.range.id], [{ canvas: tides.name, title: 'Tides' }, 1, 2, '7d']);
  assert.deepEqual(one.comparison.rows.map(r => r.canvas), [tides.name]);
  assert.equal(one.canvas_detail.conversion.metrics.forks.value, 2);
  assert.equal(one.canvases.length, 2, 'the selector still lists every public canvas');
  assert.equal((await get(f, `?canvas=${volcanoes.name}`)).body.overview.metrics.forks.state, STATE.ZERO);
});

test('creator analytics: an unpublished or trashed canvas leaves the scope at once', async t => {
  const { f, tides, volcanoes } = await world(t);
  f.sqlite.prepare('DELETE FROM canvas_publications WHERE canvas = ?').run(volcanoes.name);
  f.sqlite.prepare("INSERT INTO library_trash (org, name, trashed_at) VALUES ('ana-ws', ?, '2026-10-23')").run(tides.name);
  const body = (await get(f)).body;
  assert.deepEqual([body.canvases, body.overview.metrics.public_canvases.value, body.overview.metrics.forks.value], [[], 0, 0]);
  assert.equal(body.comparison.state, STATE.ZERO);
  assert.equal((await get(f, `?canvas=${tides.name}`)).status, 404);
});

test('creator analytics: reading writes nothing', async t => {
  const { f, tides } = await world(t);
  await get(f); await get(f, `?range=all&canvas=${tides.name}`);
  assert.ok(f.statements.length > 0);
  assert.deepEqual(f.statements.filter(s => s === 'BATCH' || /^(INSERT|UPDATE|DELETE|REPLACE|CREATE|DROP|ALTER)\b/i.test(s)), []);
});

test('creator analytics: the server\'s cohort rule returns null and not_enough_learners below 10, never the raw value', () => {
  // The route builds every protected cell with suppress() (creator-analytics-shape.js); this is the rule it applies.
  for (const n of [0, 1, COHORT_MIN - 1]) {
    const cell = suppress(n, 0.73);
    assert.deepEqual(cell, { state: STATE.NOT_ENOUGH, value: null });
    assert.doesNotMatch(JSON.stringify(cell), /0\.73|"count"/);
  }
  assert.deepEqual(suppress(COHORT_MIN, 0.73), { state: STATE.READY, value: 0.73 });
});
