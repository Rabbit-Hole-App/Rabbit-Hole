// The "Choose your handle" step (docs/features/user-handles.md): a signed-in person without a public handle chooses
// one in place, before anything else, and the same URL then carries on - never a redirect, so a deep link (a share, a
// fork or Rabbit Hole resumed after sign-in) resumes. Signed out, or no profile service, nothing changes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gateFor } from './session-display.js';
import { fieldHandle, normalizeHandle } from '../../control-plane/src/handle.js';

const read = file => readFileSync(new URL(file, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

test('who sees the step: a signed-in profile without a handle; never the signed out or someone with a handle', () => {
  assert.equal(gateFor(null), 'ok', 'signed out, or no profile service');
  assert.equal(gateFor({ name: 'Ada', avatar: null, handle: null }), 'needed');
  assert.equal(gateFor({ name: null, avatar: null, handle: 'ada' }), 'ok');
});

test('the step sits in front of every Rabbit Hole page, in place, and resumes the same URL', () => {
  const main = read('./main.jsx'), gate = read('./HandleGate.jsx');
  assert.match(main, /return learnPreview \? <HandleGate>\{page\}<\/HandleGate> : page;/);
  assert.match(main, /const page = sharedBoard \? <Suspense[^\n]*<SharedBoardPage token=\{sharedBoard\[1\]\} \/>[^\n]*\n\s+: creator \? <Suspense[^\n]*<CreatorProfilePage handle=\{creator\[1\]\} \/>[^\n]* : <AppRoot \/>;/, 'shared links, creator profiles and the app alike');
  // Claimed, it renders the page it was given: no navigation, no reload, nothing that drops ?fork=1 or ?rabbit=.
  assert.match(gate, /return state === 'needed' \? <ChooseHandle onDone=\{\(\) => setState\('ok'\)\} \/> : children;/);
  assert.doesNotMatch(gate, /location\.|navigate\(|history\./);
  // The server decides; the browser's hint uses the same rules module, and sends only the canonical handle.
  assert.match(gate, /import \{ HANDLE_MAX, fieldHandle, normalizeHandle \} from '\.\.\/\.\.\/control-plane\/src\/handle\.js';/);
  assert.match(gate, /await saveProfile\(\{ handle: checked\.handle \}\)/);
  assert.doesNotMatch(gate, /email/i, 'nothing here is made from an email');
});

test('Settings > Profile can change the handle; the server is the authority', () => {
  const sidebar = read('./Sidebar.jsx');
  const row = sidebar.slice(sidebar.indexOf('function HandleRow('), sidebar.indexOf('function SectionHead('));
  assert.match(sidebar, /<HandleRow profile=\{profile\} \/>/);
  assert.match(row, /await saveProfile\(\{ handle: value \}\)/);
  assert.match(row, /\{error && <p data-handle-error role="alert"/, 'a taken or invalid handle says why, beside the field');
});

test('the shared header names the creator by @handle only when there is one', () => {
  const page = read('./SharedBoardPage.jsx');
  // A share says "Shared by", an Explore publication "Published by" (docs/features/explore-publish.md); both by @handle.
  assert.ok(page.includes("{shared.creator && <span data-shared-creator className=\"truncate text-xs text-ink-3\">{shared.published ? 'Published by' : 'Shared by'} {shared.published"));
  // A publication's @handle links to the public profile (docs/features/creator-profile.md); a share link's stays text.
  assert.ok(page.includes("? <a data-creator-link href={`/@${shared.creator.handle}`} className=\"rounded-sm text-ink-2 hover:text-ink hover:underline\">{creatorLabel(shared.creator)}</a> : creatorLabel(shared.creator)}</span>}"));
  assert.doesNotMatch(page, /shared\.owner\b/, 'the owner email is gone from the page');
});

// Owner review of Figma 189:222: the field's @ prefix is the only @ ever shown - a typed or pasted leading @ leaves the
// editable value, which keeps its case until the server canonicalizes it.
test('a handle field never shows @@: a typed or pasted leading @ leaves the value, and the canonical form is unchanged', () => {
  assert.deepEqual(['@Viewer_Mux9hucx', '@@Viewer_Mux9hucx', 'Viewer_Mux9hucx', 'a@b'].map(fieldHandle), ['Viewer_Mux9hucx', 'Viewer_Mux9hucx', 'Viewer_Mux9hucx', 'a@b']);
  assert.deepEqual(normalizeHandle(fieldHandle('@Viewer_Mux9hucx')), { handle: 'viewer_mux9hucx' });
  assert.deepEqual(normalizeHandle('@Viewer_Mux9hucx'), { handle: 'viewer_mux9hucx' }, 'the server still accepts one leading @');
  const gate = read('./HandleGate.jsx'), sidebar = read('./Sidebar.jsx');
  assert.ok(gate.includes('onChange={event => { setValue(fieldHandle(event.target.value));'), 'the setup field');
  assert.ok(sidebar.includes('onChange={(e) => { setDraft(fieldHandle(e.target.value));'), 'the Settings field');
});
