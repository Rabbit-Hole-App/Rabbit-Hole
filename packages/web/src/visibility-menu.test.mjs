// The owned-card ⋮ menu (docs/features/visibility-menu.md): Visibility transitions through the existing share and
// publish routes, the menu's order and labels, Move to Trash, and Restore from the Library's Trash.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ACCESS, PRIVATE_CONFIRM, PRIVATE_REPOSITORY, confirmsPrivate, copyLinkFor, projectConfirm, setAccess, setProjectAccess } from './canvas-visibility.js';
import { menuRows } from './home/card-menu-items.js';

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

test('the owned canvas menu, in the owner\'s order: Rename, Edit description, Duplicate, Change cover | Share | Move to Trash; no Visibility dropdown', () => {
  const menu = read('./home/CardMenu.jsx'); // the card menu the Library and Home share (owner, 2026-10-08)
  // Owner brief 2026-10-22: one list for canvases and projects (home/card-menu-items.js, card-menu-items.test.mjs); access is managed
  // inside Share, so there is no separate expanding Visibility dropdown, no Copy link row, no Archive and no snapshot row.
  const order = menuRows({ kind: 'canvas', canEdit: true }).filter(r => !r.separator).map(r => r.label)
    .filter(l => ['Rename', 'Edit description', 'Duplicate', 'Change cover', 'Share', 'Move to Trash'].includes(l));
  assert.deepEqual(order, ['Rename', 'Edit description', 'Duplicate', 'Change cover', 'Share', 'Move to Trash']);
  assert.doesNotMatch(menu, /data-menu-visibility|role="menuitemradio" aria-checked=\{a\.access === id\}|data-access-mixed|chooseAccess|visibilityRows/, 'no Visibility dropdown');
  // Share opens the canvas page's own Share dialog as a popup over the Library (owner, 2026-10-08), never the canvas.
  assert.match(menu, /share: \(a\) => setDialog\(\{ kind: 'share', a, state: local\(a\) \}\),/);
  assert.doesNotMatch(menu, /\?share=1/, 'no trip into the canvas');
});

test('the Library\'s Share popup is the canvas page\'s SharePanel on the same routes; closing it leaves the Library as it was', () => {
  const library = read('./home/CardMenu.jsx'); // the card menu the Library and Home share (owner, 2026-10-08)
  assert.match(library, /import SharePanel from '\.\.\/SharePanel\.jsx';/, 'the existing panel, not a new share UI');
  assert.match(library, /\{dialog\?\.kind === 'share' && \(\s*<ShareDialog a=\{dialog\.a\} state=\{dialog\.state\} canvases=\{dialog\.a\.kind === 'repository' \? projectCanvasesOf\(dialog\.a\) : \[\]\} stateOf=\{\(x\) => local\(x\)\}\s*onClose=\{\(\) => setDialog\(null\)\} onChanged=\{\(\) => ctx\.onForked\?\.\(\)\} onManage=/);
  const share = library.slice(library.indexOf('function ShareDialog('));
  assert.match(share, /<div data-share-dialog className="fixed inset-0 z-50 flex items-start justify-center bg-black\/20/, 'a modal popup over the Library');
  assert.match(share, /<SharePanel place="relative mt-\[26vh\] max-w-\[90vw\]"/);
  // The routes the canvas page uses (LearnPage.jsx changeSharing, changePublication). No private repository switch (owner
  // decision A2, 2026-10-16): no link opens a private repository.
  assert.match(share, /useEffect\(\(\) => \{ api\(base\)\.then\(\(board\) => setSharing\(board\.sharing\)/);
  assert.match(share, /post\(`\$\{base\}\/share`, \{ \.\.\.next, \.\.\.\(state \? \{ state \} : \{\}\) \}\)/, 'a null copy is never sent');
  assert.match(share, /onPublish=\{project \? null : run\(/, 'a project itself is never published to Explore');
  assert.doesNotMatch(share, /share\/repository|onRepository/);
  assert.match(share, /post\(`\/api\/apps\/\$\{a\.name\}\/\$\{publish \? 'publish' : 'unpublish'\}`\)/);
  assert.match(share, /setSharing\(\(await api\(base\)\)\.sharing\); if \(project\) await reload\(\); onChanged\(\);/, 'the panel and the Library card follow each change');
  assert.doesNotMatch(share, /navigate\(/);
  // The canvas page keeps the panel under its Share button.
  assert.match(read('./SharePanel.jsx'), /place = 'absolute top-full right-0 mt-2'/);
});

test('Move to Trash confirms with the owner\'s words; projects get it too; nothing is deleted from the menu', () => {
  const library = read('./home/CardMenu.jsx'); // the card menu the Library and Home share (owner, 2026-10-08)
  assert.match(library, /title=\{`Move this \$\{kindWord\(dialog\.a\)\} to Trash\?`\} confirmLabel="Move to Trash"/);
  assert.match(library, /body="It will disappear from your Library and public\/shared access will stop\. Existing forks will not be deleted\. You can restore it from Trash\."/);
  assert.match(library, /api\(`\/api\/apps\/\$\{a\.name\}\/trash`, \{ method: 'POST', body: '\{\}' \}\)/);
  // The one DELETE is a custom card picture's (Use canvas snapshot, card-thumbnails.md), never the canvas or project.
  assert.deepEqual(library.match(/api\([^\n]*method: 'DELETE'/g), ["api(`/api/learn/boards/${a.name}/main/thumbnail/custom`, { method: 'DELETE'"]);
  assert.deepEqual(menuRows({ kind: 'repository', canEdit: true }).at(-1), { id: 'trash', label: 'Move to Trash', icon: 'Trash2', types: ['canvas', 'repository'], owner: true }, 'projects get it too');
});

test('a typed title is kept: a repeat only earns a quiet note; the description is capped at 500', () => {
  const library = read('./home/CardMenu.jsx'); // the card menu the Library and Home share (owner, 2026-10-08)
  assert.match(library, /You already have another canvas with this name\./);
  assert.match(library, /patch\(a, kind === 'rename' \? \{ title: value \} : \{ description: value \}\)/);
  assert.match(library, /maxLength=\{500\}/);
  assert.match(library, /\{dialog\.value\.length\}\/500/);
});

test('Trash restores canvases and projects from the Library\'s own list; Share opens the panel once', () => {
  const sidebar = read('./Sidebar.jsx');
  assert.match(sidebar, /api\('\/api\/library\/trash'\)/);
  assert.match(sidebar, /`\/api\/apps\/\$\{name\}\/\$\{learnPreview \? 'untrash' : 'restore'\}`/);
  assert.match(sidebar, /Items stay in Trash until you restore them\. Nothing here is deleted\./);
  const learn = read('./LearnPage.jsx');
  assert.match(learn, /useState\(\(\) => new URLSearchParams\(window\.location\.search\)\.get\('share'\) === '1'\)/);
  assert.match(learn, /url\.searchParams\.delete\('share'\);/);
});

// Owner, 2026-10-08: the link that matches what the card is (copyLinkFor). Owner brief 2026-10-22: Copy link left the menu; copying lives
// inside Share beside the relevant link (SharePanel CopyLink) and never enables sharing.
test('copyLinkFor names the link that matches the card; the menu has no Copy link row, Share has the copy beside the link', () => {
  const origin = 'https://app.test';
  assert.deepEqual(copyLinkFor({ kind: 'canvas', name: 'canvas-1', access: 'public', publication_token: 'pub' }, { origin }), { url: 'https://app.test/e/pub', copied: 'Public link copied' });
  assert.deepEqual(copyLinkFor({ kind: 'canvas', name: 'canvas-1', access: 'unlisted' }, { origin, view: 'tok' }), { url: 'https://app.test/b/tok', copied: 'Share link copied' });
  assert.deepEqual(copyLinkFor({ kind: 'canvas', name: 'canvas-1', access: 'unlisted' }, { origin }), { url: 'https://app.test/apps/canvas-1', copied: 'Private link copied, opens only for you' }, 'view link off: its own page');
  assert.deepEqual(copyLinkFor({ kind: 'canvas', name: 'canvas-1', access: 'private' }, { origin }), { url: 'https://app.test/apps/canvas-1', copied: 'Private link copied, opens only for you' });
  assert.equal(copyLinkFor({ kind: 'repository', name: 'repo-1', access: undefined }, { origin }).url, 'https://app.test/apps/repo-1');
  const menu = read('./home/CardMenu.jsx'), panel = read('./SharePanel.jsx');
  assert.doesNotMatch(menu, /data-menu-copy-link|copyLink|navigator\.clipboard/, 'the menu copies nothing');
  for (const kind of ['canvas', 'repository']) assert.deepEqual(menuRows({ kind, canEdit: true }).map(r => r.id).filter(id => ['share', 'copy'].includes(id)), ['share'], kind);
  // Copy link sits beside the link inside Share and only reports Copied after the clipboard accepted it; failure selects the field.
  assert.match(panel, /\{shareUrl && <CopyLink url=\{shareUrl\} fieldLabel="Share link URL" \/>\}/);
  assert.match(panel, /try \{ await navigator\.clipboard\.writeText\(url\); setState\('copied'\); \} catch \{ input\.current\?\.focus\(\); input\.current\?\.select\(\); setState\('failed'\); \}/);
  // A link that is off is not offered as a working one: the private address says recipients cannot open it, and copying turns nothing on.
  assert.match(panel, /\{!shareUrl && privateUrl && \(\s*<div data-private-link>/);
  assert.match(panel, /Private link: people you send it to cannot open it\. Copying it does not share anything/);
});

// Owner, 2026-10-08: Home's Recent cards open the same ⋮ the Library shows, in place; a card the Library shows no menu
// for (a canvas you do not own, a job or a server) shows none.
test('Home Recent cards open the Library card menu; only what the Library shows for each', () => {
  const home = read('./Home.jsx'), library = read('./LibraryViews.jsx'), menu = read('./home/CardMenu.jsx');
  assert.match(home, /const cardMenu = useCardMenu\(\{ org: data\?\.org, email: data\?\.email, apps, onChanged: load, folders \}\);/);
  assert.match(home, /onMore=\{cardMenu\.onMore\(a\)\} onVaries=\{cardMenu\.onVaries\(a\)\} \/>/);
  assert.match(home, /onVaries=\{onVaries\} note=\{note\} onMore=\{onMore\}/);
  assert.match(library, /const cardMenu = useCardMenu\(\{ org: data\?\.org, email: data\?\.email, apps: data\?\.apps \|\| \[\], onChanged: onForked, folders \}\);/); // folders: Move to folder rows (library-folders.md), on Home too
  assert.match(library, /onMore=\{cardMenu\.onMore\(a\)\} onVaries=\{cardMenu\.onVaries\(a\)\}/);
  assert.match(menu, /export const hasCardMenu = \(a\) => a\.kind === 'repository' \|\| \(a\.kind === 'canvas' && !!a\.canEdit\);/);
  assert.match(menu, /setMenu\(\{ a, anchor: e\.currentTarget, \.\.\.menuAt\(e\.currentTarget, 224\) \}\)/, 'opened in place, kept inside the window');
  // Archive left the active-card menu (owner brief 2026-10-22); the Library's Archived canvas filter keeps the restore path (App.jsx).
  assert.doesNotMatch(menu, /onArchive|kind: 'archive'|\/archive`|Archive/);
  assert.match(read('./LibraryViews.jsx'), /'Archived canvas', archived/);
});

// A project's visibility (owner, 2026-10-09; visibility-menu.md "Projects"): every canvas in it set at once through its own
// routes, and its Main canvas board's link, which is the project's link. Nothing is stored on the project.
test('a project goes Unlisted, Public or Private by setting each canvas and its Main canvas link; a private repository is never Public', async () => {
  const project = { kind: 'repository', name: 'repo-0000000a-demo', repo_public: true };
  const canvases = [{ name: 'canvas-0000000a', access: 'private', shared: false }, { name: 'canvas-0000000b', access: 'public', shared: false }];
  const unlisted = recorder();
  assert.deepEqual(await setProjectAccess(unlisted.call, project, canvases, 'unlisted', c => (c.name === 'canvas-0000000a' ? STATE : null)),
    { 'canvas-0000000a': ['share'], 'canvas-0000000b': ['unpublish', 'share'], 'repo-0000000a-demo': ['share'] });
  assert.deepEqual(unlisted.calls, [
    `POST /api/learn/boards/canvas-0000000a/main/share {"shared":true,"view":true,"state":${JSON.stringify(STATE)}}`,
    'POST /api/apps/canvas-0000000b/unpublish',
    'POST /api/learn/boards/canvas-0000000b/main/share {"shared":true,"view":true}',
    'POST /api/learn/boards/repo-0000000a-demo/main/share {"shared":true,"view":true,"public_view":false}',
  ]);
  const pub = recorder();
  await setProjectAccess(pub.call, project, canvases, 'public');
  assert.deepEqual(pub.calls, ['GET /api/learn/boards/canvas-0000000a/main', 'POST /api/apps/canvas-0000000a/publish',
    'POST /api/learn/boards/repo-0000000a-demo/main/share {"shared":true,"view":true,"public_view":true}'], 'the project link opens signed out; it is never itself in Explore');
  const off = recorder();
  await setProjectAccess(off.call, project, [{ name: 'canvas-0000000a', access: 'unlisted', shared: true }], 'private');
  assert.deepEqual(off.calls, ['POST /api/learn/boards/canvas-0000000a/main/share {"shared":false}', 'POST /api/learn/boards/repo-0000000a-demo/main/share {"shared":false}']);
  const blocked = recorder();
  await assert.rejects(setProjectAccess(blocked.call, { ...project, repo_public: false }, canvases, 'public'), { message: PRIVATE_REPOSITORY });
  assert.deepEqual(blocked.calls, [], 'nothing is touched');
  // The confirm names the count, as the card counts the project's canvases; Make private keeps the canvas confirm's words.
  assert.deepEqual(projectConfirm(3, 'public').title, 'Make 3 canvases public?');
  assert.deepEqual(projectConfirm(1, 'unlisted').title, 'Make 1 canvas unlisted?');
  const menu = read('./home/CardMenu.jsx');
  // Owner brief 2026-10-22: the menu no longer sets a project's visibility (no Visibility dropdown, no "Mixed" row); its Share window
  // shows each canvas and Apply to all canvases is the one explicit bulk action (project-access.test.mjs).
  assert.doesNotMatch(menu, /setProjectAccess|countOf|data-access-mixed|>Mixed</);
  // A project's Copy link is its link while it is on.
  assert.deepEqual(copyLinkFor({ kind: 'repository', name: 'repo-1', access: 'mixed' }, { origin: 'https://app.test', view: 'tok' }), { url: 'https://app.test/b/tok', copied: 'Project link copied' });
});
