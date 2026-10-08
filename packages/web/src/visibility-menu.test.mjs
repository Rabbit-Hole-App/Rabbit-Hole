// The owned-card ⋮ menu (docs/features/visibility-menu.md): Visibility transitions through the existing share and
// publish routes, the menu's order and labels, Move to Trash, and Restore from the Library's Trash.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ACCESS, PRIVATE_CONFIRM, confirmsPrivate, setAccess } from './canvas-visibility.js';

const read = file => readFileSync(new URL(file, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
// A stand-in api(): records each call, answers a board GET as the server does - its version, or exists: false.
const recorder = (board = { version: 1 }) => {
  const calls = [];
  const call = async (path, init = {}) => { calls.push(`${init.method || 'GET'} ${path}${init.body && init.body !== '{}' ? ` ${init.body}` : ''}`); return init.method ? {} : board; };
  return { calls, call };
};
const canvas = (access, shared = access === 'unlisted') => ({ name: 'canvas-0000000a', access, shared });
const STATE = { blocks: [{ id: 'b1' }] };

test('three states, in order, each saying who can open it', () => {
  assert.deepEqual(ACCESS.map(a => a.id), ['private', 'unlisted', 'public']);
  assert.deepEqual(ACCESS.map(a => a.label), ['Private', 'Unlisted', 'Public']);
});

test('Private -> Unlisted turns the share link on (with this browser\'s copy); -> Public publishes', async () => {
  const unlisted = recorder();
  assert.deepEqual(await setAccess(unlisted.call, canvas('private'), 'unlisted', STATE), ['share']);
  assert.deepEqual(unlisted.calls, [`POST /api/learn/boards/canvas-0000000a/main/share {"shared":true,"view":true,"state":${JSON.stringify(STATE)}}`]);
  const pub = recorder();
  assert.deepEqual(await setAccess(pub.call, canvas('private'), 'public', STATE), ['publish'], 'a server copy already exists: publish only');
  const fresh = recorder({ exists: false });
  assert.deepEqual(await setAccess(fresh.call, canvas('private'), 'public', STATE), ['save', 'publish'], 'no server copy: its first copy, then publish');
  // A canvas's empty board, made with its row at version 0 (owner, 2026-10-08): nothing saved on it yet either.
  const blank = recorder({ version: 0 });
  assert.deepEqual(await setAccess(blank.call, canvas('private'), 'public', STATE), ['save', 'publish'], 'an empty version 0 board: this browser\'s copy first');
});

// Owner, 2026-10-08: a canvas this browser holds none of (local null) never sends a null or missing-object state; the
// server's empty board answers instead ("state must be a board object" reached a person once).
test('a canvas with no copy in this browser goes Unlisted or Public without sending any state', async () => {
  const unlisted = recorder({ version: 0 });
  assert.deepEqual(await setAccess(unlisted.call, canvas('private'), 'unlisted', null), ['share']);
  assert.deepEqual(unlisted.calls, ['POST /api/learn/boards/canvas-0000000a/main/share {"shared":true,"view":true}']);
  const pub = recorder({ exists: false });
  assert.deepEqual(await setAccess(pub.call, canvas('private'), 'public', null), ['publish'], 'no PUT of a null board');
  assert.deepEqual(pub.calls, ['GET /api/learn/boards/canvas-0000000a/main', 'POST /api/apps/canvas-0000000a/publish']);
});

test('Public -> Unlisted unpublishes and keeps (or makes) the link; Unlisted -> Public keeps the link', async () => {
  const down = recorder();
  assert.deepEqual(await setAccess(down.call, canvas('public', false), 'unlisted', STATE), ['unpublish', 'share']);
  const downShared = recorder();
  assert.deepEqual(await setAccess(downShared.call, canvas('public', true), 'unlisted', STATE), ['unpublish']);
  const up = recorder();
  assert.deepEqual(await setAccess(up.call, canvas('unlisted'), 'public', STATE), ['publish']);
});

test('-> Private takes every outside access away, and asks first only when there is access to take', async () => {
  const fromPublic = recorder();
  assert.deepEqual(await setAccess(fromPublic.call, canvas('public', true), 'private'), ['unpublish', 'unshare']);
  const fromUnlisted = recorder();
  assert.deepEqual(await setAccess(fromUnlisted.call, canvas('unlisted'), 'private'), ['unshare']);
  assert.deepEqual(await setAccess(recorder().call, canvas('private'), 'private'), [], 'the current state is a no-op');
  assert.equal(confirmsPrivate('public', 'private'), true);
  assert.equal(confirmsPrivate('unlisted', 'private'), true);
  assert.equal(confirmsPrivate('private', 'private'), false);
  assert.equal(confirmsPrivate('private', 'public'), false);
  assert.deepEqual(PRIVATE_CONFIRM, { title: 'Make this canvas private?', body: 'It will be visible only to you. Existing public and shared links will stop working. Existing forks will not be deleted.', action: 'Make private' });
});

test('the owned canvas menu, in the owner\'s order: Rename, Edit description, Duplicate | Visibility, Share / Manage link | Archive, Move to Trash', () => {
  const library = read('./LibraryViews.jsx');
  const menu = library.slice(library.indexOf(') : menu?.a.canEdit ? <>'), library.indexOf('</> : null}'));
  const order = [...menu.matchAll(/>\s*(Rename|Edit description|Duplicate|Visibility|Share \/ Manage link|Archive|Move to Trash)\s*</g)].map(m => m[1]);
  assert.deepEqual(order, ['Rename', 'Edit description', 'Duplicate', 'Visibility', 'Share / Manage link', 'Archive', 'Move to Trash']);
  assert.match(menu, /role="menuitemradio" aria-checked=\{menu\.a\.access === id\}/, 'the current state is checked');
  // Share / Manage link opens the canvas page's own Share panel as a popup over the Library (owner, 2026-10-08), never the canvas.
  assert.match(menu, /data-menu-share onClick=\{\(\) => pick\(\(a\) => setDialog\(\{ kind: 'share', a, state: local\(a\) \}\)\)\}>Share \/ Manage link</);
  assert.doesNotMatch(menu, /\?share=1|navigate\(/, 'no trip into the canvas');
  assert.doesNotMatch(menu, /Pin/, 'the owned canvas menu is the owner\'s list, nothing more');
});

test('the Library\'s Share popup is the canvas page\'s SharePanel on the same routes; closing it leaves the Library as it was', () => {
  const library = read('./LibraryViews.jsx');
  assert.match(library, /import SharePanel from '\.\/SharePanel\.jsx';/, 'the existing panel, not a new share UI');
  assert.match(library, /\{dialog\?\.kind === 'share' && <ShareDialog a=\{dialog\.a\} state=\{dialog\.state\} onClose=\{\(\) => setDialog\(null\)\} onChanged=\{\(\) => ctx\.onForked\?\.\(\)\} \/>\}/);
  const share = library.slice(library.indexOf('function ShareDialog('), library.indexOf('// Apps in All'));
  assert.match(share, /<div data-share-dialog className="fixed inset-0 z-50 flex items-start justify-center bg-black\/20/, 'a modal popup over the Library');
  assert.match(share, /<SharePanel place="relative mt-\[26vh\] max-w-\[90vw\]"/);
  // The routes the canvas page uses (LearnPage.jsx changeSharing, changeRepositoryAccess, changePublication).
  assert.match(share, /useEffect\(\(\) => \{ api\(base\)\.then\(\(board\) => setSharing\(board\.sharing\)/);
  assert.match(share, /post\(`\$\{base\}\/share`, \{ \.\.\.next, \.\.\.\(state \? \{ state \} : \{\}\) \}\)/, 'a null copy is never sent');
  assert.match(share, /post\(`\$\{base\}\/share\/repository`, \{ allow \}\)/);
  assert.match(share, /post\(`\/api\/apps\/\$\{a\.name\}\/\$\{publish \? 'publish' : 'unpublish'\}`\)/);
  assert.match(share, /setSharing\(\(await api\(base\)\)\.sharing\); onChanged\(\);/, 'the panel and the Library card follow each change');
  assert.doesNotMatch(share, /navigate\(/);
  // The canvas page keeps the panel under its Share button.
  assert.match(read('./SharePanel.jsx'), /place = 'absolute top-full right-0 mt-2'/);
});

test('Move to Trash confirms with the owner\'s words; projects get it too; nothing is deleted from the menu', () => {
  const library = read('./LibraryViews.jsx');
  assert.match(library, /title=\{`Move this \$\{kindWord\(dialog\.a\)\} to Trash\?`\} confirmLabel="Move to Trash"/);
  assert.match(library, /body="It will disappear from your Library and public\/shared access will stop\. Existing forks will not be deleted\. You can restore it from Trash\."/);
  assert.match(library, /api\(`\/api\/apps\/\$\{a\.name\}\/trash`, \{ method: 'POST', body: '\{\}' \}\)/);
  assert.doesNotMatch(library, /method: 'DELETE'/);
  const project = library.slice(library.indexOf("{menu?.a.kind === 'repository' ? ("), library.indexOf(') : menu?.a.canEdit ? <>'));
  assert.match(project, /Move to Trash/);
});

test('a typed title is kept: a repeat only earns a quiet note; the description is capped at 500', () => {
  const library = read('./LibraryViews.jsx');
  assert.match(library, /You already have another canvas with this name\./);
  assert.match(library, /patch\(a, kind === 'rename' \? \{ title: value \} : \{ description: value \}\)/);
  assert.match(library, /maxLength=\{500\}/);
  assert.match(library, /\{dialog\.value\.length\}\/500/);
});

test('Trash restores canvases and projects from the Library\'s own list; Share / Manage link opens the panel once', () => {
  const sidebar = read('./Sidebar.jsx');
  assert.match(sidebar, /api\('\/api\/library\/trash'\)/);
  assert.match(sidebar, /`\/api\/apps\/\$\{name\}\/\$\{learnPreview \? 'untrash' : 'restore'\}`/);
  assert.match(sidebar, /Items stay in Trash until you restore them\. Nothing here is deleted\./);
  const learn = read('./LearnPage.jsx');
  assert.match(learn, /useState\(\(\) => new URLSearchParams\(window\.location\.search\)\.get\('share'\) === '1'\)/);
  assert.match(learn, /url\.searchParams\.delete\('share'\);/);
});
