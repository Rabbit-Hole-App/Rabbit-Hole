// Chat recovery entry points (checklist 'Chat entry, routing and drafts'): source pins, no browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = name => readFileSync(new URL('./' + name, import.meta.url), 'utf8');

test('a drop reveals Chat through the always-mounted panels, not through the Chat panel handle that is null while that panel is unmounted', () => {
  const learn = read('LearnPage.jsx');
  assert.match(learn, /if \(made\.length\) panels\.openChat\(\);/);
  assert.doesNotMatch(learn, /if \(made\.length\) chatWorkspace\.current\?\.panels/);
});

// The occupied-Chat choice (Start new chat / Stay here) lives in two places: this browser's route record and the saved route message in the thread. After a reload
// on a browser without the record (another device, cleared storage) the saved message alone must make the choice actionable again, not start a second route.
import { entriesOf, routeClientId, routeFromSaved } from './roadmap-transcript.js';
import { initialState, reduce } from './roadmap-client.js';

const invitation = { id: 'iv_1', sourceKeys: ['file:fs_1'], title: 'Notes.md' };
const saved = (extra = {}) => ({ role: 'assistant', clientId: routeClientId('iv_1'), content: 'x', meta: { tutor: { v: 1, kind: 'route', invitationId: 'iv_1', ...extra } } });

test('routeFromSaved: an undecided saved route message in this thread revives the choice', () => {
  assert.deepEqual(routeFromSaved([{ role: 'user', content: 'hi' }, saved()], 'iv_1', 'canvaschat-t1'), { threadId: 'canvaschat-t1' });
  const entry = entriesOf(reduce(initialState(), { type: 'invitation', invitation }), { invitation, route: { invitationId: 'iv_1', ...routeFromSaved([saved()], 'iv_1', 'canvaschat-t1') } }).find(e => e.kind === 'route');
  assert.equal(entry.actions.every(a => a.disabled === false), true, 'both choices are actionable');
});

test('routeFromSaved: a decided stay is restored with its choice; another invitation, a draft entry or no thread gives nothing', () => {
  assert.deepEqual(routeFromSaved([saved({ choice: 'stay' })], 'iv_1', 'canvaschat-t1'), { threadId: 'canvaschat-t1', choice: 'stay' });
  assert.equal(routeFromSaved([saved()], 'iv_2', 'canvaschat-t1'), null);
  assert.equal(routeFromSaved([{ role: 'assistant', meta: { tutor: { kind: 'draft', invitationId: 'iv_1' } } }], 'iv_1', 'canvaschat-t1'), null);
  assert.equal(routeFromSaved([saved()], 'iv_1', null), null);
});

test('the occupied-Chat choice is rebuilt from the saved message before a second route is made (RoadmapTranscript)', () => {
  assert.match(read('RoadmapTranscript.jsx'), /routeFromSaved\(msgs, iv\.id, thread\.id\)/);
});

// BE.01a (a typed lesson request starting the roadmap) is removed with the roadmap (roadmap-unplug-spec.md, owner 2026-11-19): the chat starts no lesson and sends no lesson sources.
test('ask.jsx starts no lesson from a tool request and sends no lesson sources', () => {
  const ask = read('ask.jsx');
  assert.doesNotMatch(ask, /lessonRequest|lessonSources|explain-on-canvas|controller\?\.lesson\(/);
  assert.doesNotMatch(ask, /direct\?\.command === 'course'/);
});
