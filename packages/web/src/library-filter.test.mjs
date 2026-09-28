import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chipHref, hiddenFor, isLearnResource, libraryQuery, ofType, opsView, SCOPES } from './library-filter.js';

const apps = [{ name: 'repo-1', kind: 'repository' }, { name: 'canvas-1', kind: 'canvas' }, { name: 's3-log', kind: 'job' }, { name: 'counter', kind: 'server' }];
const names = (list) => list.map((a) => a.name);

test('the live build never reads ?type; the preview accepts only the three types', () => {
  assert.deepEqual(libraryQuery('?type=projects', false), { type: null, archived: false });
  assert.deepEqual(libraryQuery('?type=projects', true), { type: 'projects', archived: false });
  for (const bad of ['?type=bogus', '?type=constructor', '']) assert.deepEqual(libraryQuery(bad, true), { type: null, archived: false });
  assert.deepEqual(libraryQuery('?type=canvases&archived=1', true), { type: 'canvases', archived: true });
  assert.deepEqual(libraryQuery('?type=projects&archived=1', true), { type: 'projects', archived: false });
});

test('type chips filter on kind (T02 §4); no type returns the same array', () => {
  assert.equal(ofType(apps, null), apps);
  assert.deepEqual(names(ofType(apps, 'projects')), ['repo-1']);
  assert.deepEqual(names(ofType(apps, 'canvases')), ['canvas-1']);
  assert.deepEqual(names(ofType(apps, 'apps')), ['s3-log', 'counter']);
  assert.deepEqual(SCOPES, { private: 'Mine', shared: 'Shared with me', apps: 'Workspace' });
});

test('Projects and Canvases hide the ops columns by default; the Apps view keeps small.tblCols', () => {
  const stored = { kind: true };
  assert.equal(hiddenFor(null, stored), stored);
  assert.equal(hiddenFor('apps', stored), stored);
  assert.deepEqual(hiddenFor('projects', stored), { watch: true, deployed: true, lastrun: true });
  assert.deepEqual(hiddenFor('canvases', stored, { deployed: false, people: true }), { watch: true, deployed: false, lastrun: true, people: true });
  assert.deepEqual([null, 'apps', 'projects', 'canvases'].map(opsView), [false, false, true, true]);
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
