import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chipHref, isLearnResource, isMine, libraryHref, libraryQuery, librarySections, ofType, SCOPES, SECTION_LIMIT } from './library-filter.js';

const apps = [{ name: 'repo-1', kind: 'repository' }, { name: 'canvas-1', kind: 'canvas' }, { name: 's3-log', kind: 'job' }, { name: 'counter', kind: 'server' }];
const names = (list) => list.map((a) => a.name);

test('the live build never reads ?type; the preview accepts only the three types', () => {
  assert.deepEqual(libraryQuery('?type=projects', false), { type: null, archived: false, section: null, folderId: null });
  assert.deepEqual(libraryQuery('?type=projects', true), { type: 'projects', archived: false, section: null, folderId: null });
  for (const bad of ['?type=bogus', '?type=constructor', '']) assert.deepEqual(libraryQuery(bad, true), { type: null, archived: false, section: null, folderId: null });
  assert.deepEqual(libraryQuery('?type=canvases&archived=1', true), { type: 'canvases', archived: true, section: null, folderId: null });
  assert.deepEqual(libraryQuery('?type=projects&archived=1', true), { type: 'projects', archived: false, section: null, folderId: null });
});

test('solo v1: the preview keeps only the Mine scope and ignores ?s=shared and ?s=apps; the live build keeps every section', () => {
  assert.equal(libraryQuery('?s=private', true).section, 'private');
  for (const s of ['shared', 'apps', 'constructor']) assert.equal(libraryQuery(`?s=${s}`, true).section, null, s);
  for (const s of ['shared', 'private']) assert.equal(libraryQuery(`?s=${s}`, false).section, s);
});

test('solo v1: Mine is what the person owns, even a project that comes back with visibility domain', () => {
  const project = { kind: 'repository', visibility: 'domain', owner_email: 'me@x.com' };
  assert.equal(isMine(project, 'me@x.com'), true);
  assert.equal(isMine({ ...project, owner_email: 'other@x.com' }, 'me@x.com'), false);
  assert.equal(isMine({ kind: 'job' }, undefined), false);
});

test('type chips filter on kind (T02 §4); no type returns the same array', () => {
  assert.equal(ofType(apps, null), apps);
  assert.deepEqual(names(ofType(apps, 'projects')), ['repo-1']);
  assert.deepEqual(names(ofType(apps, 'canvases')), ['canvas-1']);
  assert.deepEqual(names(ofType(apps, 'apps')), ['s3-log', 'counter']);
  assert.deepEqual(SCOPES, { private: 'Mine' }); // solo v1: no Shared with me or Workspace scope
});

test('All groups the Library as Projects, Canvases, then Apps, most recent first, six each with the rest behind View all', () => {
  const at = (name, kind, when) => ({ name, kind, created_at: when });
  const list = [
    at('counter', 'server', '2026-09-01'), at('repo-old', 'repository', '2026-09-02'), at('canvas-a', 'canvas', '2026-09-03'),
    at('repo-new', 'repository', '2026-09-20'), at('s3-log', 'job', '2026-09-10'), { ...at('yolo', 'server', '2026-09-01'), deployed_at: '2026-09-25' },
    ...Array.from({ length: 7 }, (_, i) => at(`job-${i}`, 'job', `2026-08-0${i + 1}`)),
  ];
  const sections = librarySections(list, ['repo-old', 'counter']);
  assert.deepEqual(sections.map((s) => s.key), ['projects', 'canvases', 'apps']);
  const [projects, canvases, appsSection] = sections;
  assert.deepEqual(names(projects.items), ['repo-old', 'repo-new']); // opened in this browser first, then newest
  assert.equal(projects.more, 0);
  assert.deepEqual(names(canvases.items), ['canvas-a']);
  assert.equal(SECTION_LIMIT, 6);
  assert.deepEqual(names(appsSection.items), ['counter', 'yolo', 's3-log', 'job-6', 'job-5', 'job-4']); // a redeploy counts as recent
  assert.equal(appsSection.more, 4); // ten apps, six shown
  assert.deepEqual(librarySections([], []).map((s) => s.items.length), [0, 0, 0]);
});

test('a chip sets or clears one parameter and keeps the rest; changing type leaves Archived', () => {
  assert.equal(chipHref('', 'type', 'projects'), '/library?type=projects');
  assert.equal(chipHref('?type=projects&s=shared', 'type', null), '/library?s=shared');
  assert.equal(chipHref('?type=canvases&archived=1', 'type', 'projects'), '/library?type=projects');
  assert.equal(chipHref('?type=canvases', 'archived', '1'), '/library?type=canvases&archived=1');
  assert.equal(chipHref('?f=Team', 's', 'private'), '/library?f=Team&s=private');
  assert.equal(chipHref('?s=private', 's', null), '/library');
});

test('projects and canvases carry no live-app actions', () => {
  assert.deepEqual(apps.map(isLearnResource), [true, true, false, false]);
});

test('one URL for a Library state: the Filters control, View all and the Agent Bar all build it here', () => {
  assert.equal(libraryHref({}), '/library');
  assert.equal(libraryHref({ type: 'canvases', s: 'private' }), '/library?s=private&type=canvases');
  assert.equal(libraryHref({ type: 'canvases', archived: '1' }), '/library?type=canvases&archived=1');
  assert.equal(libraryHref({ type: 'projects', archived: '1' }), '/library?type=projects'); // Archived is canvases only
  assert.equal(chipHref('?s=private', 'type', 'canvases'), libraryHref({ type: 'canvases', s: 'private' }));
});

// Owner, 2026-10-08: "put sort and filter next to each other", "put a search near filter and sort to search by
// project/canvas name". One row beside the title: Search, Filters, Sort, then Start; Sort and Search only on card views.
test('the Library title row: Search by name, Filters and Sort side by side; the search narrows the cards by title', async () => {
  const { readFileSync } = await import('node:fs');
  const app = readFileSync(new URL('./App.jsx', import.meta.url), 'utf8');
  const row = app.slice(app.indexOf('{learnPreview && <div className="flex shrink-0 items-center gap-2">'), app.indexOf('Start a rabbit hole</Button></div>}'));
  const order = ['data-library-search', '<LibraryFilters', '<SortMenu size="md"', 'onClick={startRabbitHole}'].map((x) => row.indexOf(x));
  assert.ok(order.every((at, i) => at > 0 && (i === 0 || at > order[i - 1])), `order ${order}`);
  assert.match(app, /const found = needle \? withFixtures\.filter\(\(a\) => \[a\.title, titleOf\(a\)\]\.some\(\(t\) => t\?\.toLowerCase\(\)\.includes\(needle\)\)\) : withFixtures;/);
  assert.match(app, /<LibraryViews apps=\{found\} type=\{type\} data=\{data\} sort=\{cardSort\}/);
  assert.doesNotMatch(readFileSync(new URL('./LibraryViews.jsx', import.meta.url), 'utf8'), /<SortMenu/, 'one Sort, beside Filters');
});

// Explore's Type filter is the Library's (owner 2026-10-09: "same filter as library?"): the same builder makes its URL.
test('libraryHref and chipHref build an /explore URL with the same ?type= values; exploreType reads only Explore\'s two', async () => {
  const { EXPLORE_TYPES, exploreType } = await import('./library-filter.js');
  assert.deepEqual(EXPLORE_TYPES, ['projects', 'canvases']);
  assert.equal(libraryHref({ type: 'projects' }, '/explore'), '/explore?type=projects');
  assert.equal(libraryHref({}, '/explore'), '/explore');
  assert.equal(chipHref('?type=projects', 'type', 'canvases', '/explore'), '/explore?type=canvases');
  assert.equal(chipHref('?type=canvases&project=a%2Fb', 'type', null, '/explore'), '/explore?project=a%2Fb', 'clearing the type preserves the independent project filter');
  assert.equal(chipHref('?type=canvases', 'type', 'projects'), '/library?type=projects', 'the Library unchanged');
  assert.deepEqual(['?type=projects', '?type=canvases', '?type=apps', '?type=', ''].map(exploreType), ['projects', 'canvases', null, null, null], 'Apps is the Library\'s alone');
});

test('Explore type changes preserve project scope and clearing project preserves type', () => {
  const changed = new URL(chipHref('?project=acme%2Fattention', 'type', 'canvases', '/explore'), 'https://local');
  assert.equal(changed.searchParams.get('project'), 'acme/attention');
  assert.equal(changed.searchParams.get('type'), 'canvases');
  const cleared = new URL(chipHref(changed.search, 'project', null, '/explore'), 'https://local');
  assert.equal(cleared.searchParams.get('project'), null);
  assert.equal(cleared.searchParams.get('type'), 'canvases');
  assert.equal(libraryHref({ project: 'acme/attention' }, '/explore'), '/explore?project=acme%2Fattention');
});
