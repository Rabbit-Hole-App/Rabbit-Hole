// The owned-card ⋮ menu (docs/features/visibility-menu.md): Visibility transitions through the existing share and
// publish routes, the menu's order and labels, Move to Trash, and Restore from the Library's Trash.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ACCESS, PRIVATE_CONFIRM, confirmsPrivate, copyLinkFor, setAccess } from './canvas-visibility.js';

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
  const library = read('./home/CardMenu.jsx'); // the card menu the Library and Home share (owner, 2026-10-08)
  const menu = library.slice(library.indexOf(') : menu?.a.canEdit ? <>'), library.indexOf('</> : null}'));
  const order = [...menu.matchAll(/>\s*(Rename|Edit description|Duplicate|Visibility|Share \/ Manage link|Archive|Move to Trash)\s*<|\{(copyRow)\}/g)].map(m => m[1] || 'Copy link');
  assert.deepEqual(order, ['Rename', 'Edit description', 'Duplicate', 'Visibility', 'Share / Manage link', 'Copy link', 'Archive', 'Move to Trash']);
  assert.match(menu, /role="menuitemradio" aria-checked=\{menu\.a\.access === id\}/, 'the current state is checked');
  // Share / Manage link opens the canvas page's own Share panel as a popup over the Library (owner, 2026-10-08), never the canvas.
  assert.match(menu, /data-menu-share onClick=\{\(\) => pick\(\(a\) => setDialog\(\{ kind: 'share', a, state: local\(a\) \}\)\)\}>Share \/ Manage link</);
  assert.doesNotMatch(menu, /\?share=1|navigate\(/, 'no trip into the canvas');
  assert.doesNotMatch(menu, /Pin/, 'the owned canvas menu is the owner\'s list, nothing more');
});

test('the Library\'s Share popup is the canvas page\'s SharePanel on the same routes; closing it leaves the Library as it was', () => {
  const library = read('./home/CardMenu.jsx'); // the card menu the Library and Home share (owner, 2026-10-08)
  assert.match(library, /import SharePanel from '\.\.\/SharePanel\.jsx';/, 'the existing panel, not a new share UI');
  assert.match(library, /\{dialog\?\.kind === 'share' && <ShareDialog a=\{dialog\.a\} state=\{dialog\.state\} onClose=\{\(\) => setDialog\(null\)\} onChanged=\{\(\) => ctx\.onForked\?\.\(\)\} \/>\}/);
  const share = library.slice(library.indexOf('function ShareDialog('));
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
  const library = read('./home/CardMenu.jsx'); // the card menu the Library and Home share (owner, 2026-10-08)
  assert.match(library, /title=\{`Move this \$\{kindWord\(dialog\.a\)\} to Trash\?`\} confirmLabel="Move to Trash"/);
  assert.match(library, /body="It will disappear from your Library and public\/shared access will stop\. Existing forks will not be deleted\. You can restore it from Trash\."/);
  assert.match(library, /api\(`\/api\/apps\/\$\{a\.name\}\/trash`, \{ method: 'POST', body: '\{\}' \}\)/);
  // The one DELETE is a custom card picture's (Use canvas snapshot, card-thumbnails.md), never the canvas or project.
  assert.deepEqual(library.match(/api\([^\n]*method: 'DELETE'/g), ["api(`/api/learn/boards/${a.name}/main/thumbnail/custom`, { method: 'DELETE'"]);
  const project = library.slice(library.indexOf("{menu?.a.kind === 'repository' ? ("), library.indexOf(') : menu?.a.canEdit ? <>'));
  assert.match(project, /Move to Trash/);
});

test('a typed title is kept: a repeat only earns a quiet note; the description is capped at 500', () => {
  const library = read('./home/CardMenu.jsx'); // the card menu the Library and Home share (owner, 2026-10-08)
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

// Owner, 2026-10-08: Copy link in the ⋮ of your own canvas and project cards, the link that matches what the card is.
test('Copy link copies the link that matches the card: public /e, unlisted its share link, private or a project /apps', () => {
  const origin = 'https://app.test';
  assert.deepEqual(copyLinkFor({ kind: 'canvas', name: 'canvas-1', access: 'public', publication_token: 'pub' }, { origin }), { url: 'https://app.test/e/pub', copied: 'Public link copied' });
  assert.deepEqual(copyLinkFor({ kind: 'canvas', name: 'canvas-1', access: 'unlisted' }, { origin, view: 'tok' }), { url: 'https://app.test/b/tok', copied: 'Share link copied' });
  assert.deepEqual(copyLinkFor({ kind: 'canvas', name: 'canvas-1', access: 'unlisted' }, { origin }), { url: 'https://app.test/apps/canvas-1', copied: 'Private link copied, opens only for you' }, 'view link off: its own page');
  assert.deepEqual(copyLinkFor({ kind: 'canvas', name: 'canvas-1', access: 'private' }, { origin }), { url: 'https://app.test/apps/canvas-1', copied: 'Private link copied, opens only for you' });
  assert.equal(copyLinkFor({ kind: 'repository', name: 'repo-1', access: undefined }, { origin }).url, 'https://app.test/apps/repo-1');
  const menu = read('./home/CardMenu.jsx');
  // The row itself says what was copied, then the menu closes: no corner toast (toasts rule).
  assert.match(menu, /const copyRow = <MenuItem icon=\{copied \? Check : Link\} data-menu-copy-link onClick=\{copyLink\}>\{copied \|\| 'Copy link'\}<\/MenuItem>;/);
  const copy = menu.slice(menu.indexOf('const copyLink = async'), menu.indexOf('const kindWord'));
  assert.doesNotMatch(copy, /toast\(/);
  assert.match(copy, /closing\.current = setTimeout\(\(\) => setMenu\(null\), 1400\);/);
  assert.match(copy, /api\(`\/api\/learn\/boards\/\$\{a\.name\}\/main`\)/, 'an unlisted canvas reads its share link from its board');
  // Both menus: an owned canvas (after Share / Manage link) and an owned project.
  const project = menu.slice(menu.indexOf("{menu?.a.kind === 'repository' ? ("), menu.indexOf(') : menu?.a.canEdit ? <>'));
  assert.match(project, /\{menu\.a\.canEdit && copyRow\}/);
});

// Owner, 2026-10-08: Home's Recent cards open the same ⋮ the Library shows, in place; a card the Library shows no menu
// for (a canvas you do not own, a job or a server) shows none.
test('Home Recent cards open the Library card menu; only what the Library shows for each', () => {
  const home = read('./Home.jsx'), library = read('./LibraryViews.jsx'), menu = read('./home/CardMenu.jsx');
  assert.match(home, /const cardMenu = useCardMenu\(\{ org: data\?\.org, email: data\?\.email, apps, onChanged: load \}\);/);
  assert.match(home, /<RecentCard key=\{`\$\{a\.org\}\/\$\{a\.name\}`\} app=\{a\} card=\{recentCard\(a, cardCtx\)\} email=\{data\.email\} onMore=\{cardMenu\.onMore\(a\)\} \/>/);
  assert.match(home, /note=\{note\} onMore=\{onMore\}/);
  assert.match(library, /const cardMenu = useCardMenu\(\{ org: data\?\.org, email: data\?\.email, apps: data\?\.apps \|\| \[\], onArchive, onChanged: onForked \}\);/);
  assert.match(menu, /export const hasCardMenu = \(a\) => a\.kind === 'repository' \|\| \(a\.kind === 'canvas' && !!a\.canEdit\);/);
  assert.match(menu, /setMenu\(\{ a, \.\.\.menuAt\(e\.currentTarget, 224\) \}\)/, 'opened in place, kept inside the window');
  // Without the Library's App.jsx confirm, Archive asks in the menu itself, in the same words.
  assert.match(menu, /const archive = \(a\) => \(onArchive \? onArchive\(a\) : setDialog\(\{ kind: 'archive', a \}\)\);/);
  assert.match(menu, /body="It leaves the Library\. Its content stays in this browser, and Restore brings it back\." confirmLabel="Archive"/);
});
