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

// BE.01a (checklist 4.1.1): a typed lesson request binds to the DURABLE thread before it starts, and keeps the scope the tool call named. A brand-new chat has no thread
// id when the answer's tool request arrives (the id comes with the final event), so the lesson starts when the thread is known and the answer was not stopped.
test('ask.jsx starts a typed lesson when the answer completes, on the thread the server saved, with its scope', () => {
  const ask = read('ask.jsx');
  assert.match(ask, /lessonRequest = d\.toolRequest\.args/);
  assert.match(ask, /roadmap\?\.controller\?\.lesson\(\{[^}]*threadId: d\.threadId[^}]*scope/);
  assert.doesNotMatch(ask, /controller\?\.lesson\(\{ depth: chat\?\.settings\?\.depth \|\| 'standard', instruction, source: [^}]*threadId: chat\?\.thread\?\.id \|\| null \}\)/, 'no longer started from the tool event with the possibly empty chat.thread.id');
});
