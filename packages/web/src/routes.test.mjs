import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getSurface, patchSurface, setSurface } from './agent/surface.js';
import { baseSurfaceFor, canonicalPath, pageFor, projectTab, sectionActive, sectionHref, takeWs } from './routes.js';

test('the live build routes exactly as today (main.jsx:57-70)', () => {
  for (const p of ['/apps', '/dash', '/members', '/chat', '/apps/counter', '/apps/counter/runs/r-1']) assert.equal(canonicalPath(p, false), null);
  for (const p of ['/', '/library', '/explore', '/home', '/apps/Bad_Slug', '/apps/a/b']) assert.equal(canonicalPath(p, false), '/apps');
  for (const [p, s] of [['/apps', ''], ['/apps', '?s=shared'], ['/apps', '?f=Team'], ['/dash', '']]) assert.deepEqual(pageFor(p, s, false), { page: 'library' });
  assert.deepEqual(pageFor('/apps/counter', '', false), { page: 'app', slug: 'counter', runId: undefined });
  assert.deepEqual(pageFor('/apps/counter/runs/r-1', '', false), { page: 'app', slug: 'counter', runId: 'r-1' });
  assert.deepEqual(pageFor('/members', '', false), { page: 'members' });
  assert.deepEqual(pageFor('/chat', '?app=counter', false), { page: 'chat' });
});

test('the preview serves Home at bare /apps and keeps filtered links on the Library (T02 §1)', () => {
  for (const p of ['/library', '/explore']) assert.equal(canonicalPath(p, true), null);
  assert.equal(canonicalPath('/home', true), '/apps');
  for (const p of ['/apps', '/dash']) assert.deepEqual(pageFor(p, '', true), { page: 'home' });
  for (const s of ['?s=shared', '?f=Team']) assert.deepEqual(pageFor('/apps', s, true), { page: 'library' });
  assert.deepEqual(pageFor('/library', '?type=projects', true), { page: 'library' });
  assert.deepEqual(pageFor('/explore', '', true), { page: 'explore' });
  assert.deepEqual(pageFor('/apps/canvas-1a2b3c4d', '', true), { page: 'app', slug: 'canvas-1a2b3c4d', runId: undefined });
});

test('sidebar section labels: live unchanged (Sidebar.jsx:714,717); the preview opens and lights the Library', () => {
  assert.equal(sectionHref(null, false), '/apps');
  assert.equal(sectionHref('shared', false), '/apps?s=shared');
  assert.equal(sectionHref(null, true), '/library');
  assert.equal(sectionHref('private', true), '/apps?s=private');
  assert.equal(sectionActive('/apps', '', null, false), true);
  assert.equal(sectionActive('/apps', '?s=shared', 'shared', false), true);
  assert.equal(sectionActive('/apps', '?s=shared', null, false), false);
  assert.equal(sectionActive('/apps', '', null, true), false);
  assert.equal(sectionActive('/library', '', null, true), true);
  assert.equal(sectionActive('/library', '?s=shared&type=projects', 'shared', true), true);
  assert.equal(sectionActive('/apps', '?s=shared', null, true), false);
});

const at = (url) => { const [p, s = ''] = url.split('?'); const b = baseSurfaceFor(p, s); return [b.place, b.barHidden]; };

test('the baseline surface names the place and hides the bar where another input owns the bottom (T02 §6.1; every canvas route, contract v3)', () => {
  assert.deepEqual(at('/apps'), ['home', false]);
  assert.deepEqual(at('/dash'), ['home', false]);
  assert.deepEqual(at('/library?type=canvases'), ['library', false]);
  assert.deepEqual(at('/apps?s=shared'), ['library', false]);
  assert.deepEqual(at('/explore'), ['explore', false]);
  assert.deepEqual(at('/apps/repo-1a2b3c4d-nanogpt'), ['project', false]);
  assert.deepEqual(at('/apps/repo-1a2b3c4d-nanogpt?tab=map'), ['project', false]);
  assert.deepEqual(at('/apps/repo-1a2b3c4d-nanogpt?tab=learn'), ['learn', true]);
  assert.deepEqual(at('/apps/counter'), ['app', false]); // WP6: app pages show the bar
  assert.deepEqual(at('/apps/counter?tab=learn'), ['learn', true]);
  assert.deepEqual(at('/apps/canvas-1a2b3c4d'), ['canvas', true]);
  assert.deepEqual(at('/apps/counter/runs/r-1'), ['run', true]);
  assert.deepEqual(at('/chat?app=counter'), ['chat', true]);
  assert.deepEqual(at('/members'), ['members', false]);
});

test('the baseline clears page state, keeps the workspace identity it is given, and invents none', () => {
  const identity = { org: 'gmail-com', email: 'a@gmail.com', orgName: 'Gmail', catalog: [{ name: 'counter' }] };
  const previous = { ...identity, place: 'project', resource: { kind: 'project', slug: 'repo-x', title: 'x' }, selected: { id: 'n1' }, barHidden: true, resultsHost: 'panel', handlers: { onGraph() {} } };
  assert.deepEqual(baseSurfaceFor('/apps/counter', '', previous),
    { ...identity, place: 'app', resource: null, selected: null, barHidden: false, resultsHost: 'sheet', handlers: {} });
  assert.deepEqual(Object.keys(baseSurfaceFor('/apps', '')).sort(), ['barHidden', 'handlers', 'place', 'resource', 'resultsHost', 'selected']);
});

// main.jsx Root keeps pathname + search in one string (main.jsx:61) and splits it on '?', so
// search arrives WITHOUT its '?'; `from` is agent-core's live surface after Shell's patch.
const rootInputs = (path) => { const [pathname, search = ''] = path.split('?'); return [pathname, search, getSurface()]; };

test('Root inputs: a split path and getSurface(); a chip click keeps who is looking and drops the old page', () => {
  const identity = { org: 'gmail-com', email: 'a@gmail.com', orgName: 'Gmail', catalog: [{ name: 'counter' }] };
  patchSurface(identity);
  setSurface({ place: 'project', resource: { kind: 'project', slug: 'repo-x', title: 'x' }, selected: { id: 'n1' }, resultsHost: 'panel', handlers: { onGraph() {} } });
  setSurface(baseSurfaceFor(...rootInputs('/library?type=canvases&s=private')));
  assert.deepEqual(getSurface(), { ...identity, place: 'library', resource: null, selected: null, barHidden: false, resultsHost: 'sheet', handlers: {} });
  for (const [path, place, hidden] of [['/apps?s=shared', 'library', false], ['/apps/counter?tab=learn', 'learn', true], ['/apps/canvas-1a2b3c4d', 'canvas', true], ['/apps/repo-1a2b3c4d-nanogpt?tab=map', 'project', false]]) {
    setSurface(baseSurfaceFor(...rootInputs(path)));
    assert.deepEqual([getSurface().place, getSurface().barHidden, getSurface().org], [place, hidden, 'gmail-com'], path);
  }
});

test('a workspace switch travels in the URL and applies only on the page it loads (Stay keeps this workspace)', () => {
  assert.deepEqual(takeWs('?ws=acme-team&s=shared'), { ws: 'acme-team', search: '?s=shared' });
  assert.deepEqual(takeWs('?ws='), { ws: '', search: '' }); // the domain workspace
  assert.equal(takeWs('?s=shared'), null);
  assert.equal(takeWs(''), null);
});

test('a project opens on Overview; learn is Learn; map and the legacy code, graph and agent open Map (T02 §1; WP6 has no Sources tab)', () => {
  for (const s of ['', '?tab=overview', '?tab=sources', '?canvas=canvas-1a2b3c4d']) assert.equal(projectTab(s), 'overview', s);
  assert.equal(projectTab('?tab=learn&canvas=canvas-1a2b3c4d'), 'learn');
  for (const t of ['map', 'code', 'graph', 'agent']) assert.equal(projectTab(`tab=${t}`), 'map', t);
});
