// A project's Share window (owner brief 2026-10-22 items 4-5): the per-canvas breakdown, "Varies by canvas", the explicit
// "Apply to all canvases" with partial failure, and the wiring that keeps link access and Explore publication apart.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MODES, PATCH, accessMode, affected, applyToAll, loadRows, modeLabel, varies } from './project-access.js';

const read = file => readFileSync(new URL(file, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const project = { name: 'repo-0000000a-demo' };
const canvases = [{ name: 'canvas-0000000a', title: 'Alpha' }, { name: 'canvas-0000000b', title: 'Beta' }, { name: 'canvas-0000000c', title: 'Gamma' }];
const SHARING = {
  [project.name]: { shared: true, view: 'tok', public_view: false },
  'canvas-0000000a': { shared: true, view: 'tok-a', public_view: true },
  'canvas-0000000b': { shared: false, view: null, published: true },
  'canvas-0000000c': { shared: true, view: 'tok-c', public_view: false },
};
// A stand-in api(): boards answer from `server`; a write changes it unless the canvas is in `refuse`.
const stub = (refuse = []) => {
  const server = structuredClone(SHARING), calls = [];
  const call = async (path, init = {}) => {
    calls.push(`${init.method || 'GET'} ${path}${init.body ? ` ${init.body}` : ''}`);
    const name = path.split('/')[4];
    if (!init.method) { if (refuse.includes(`read:${name}`)) throw Error('Board unavailable'); return { sharing: server[name] }; }
    if (refuse.includes(name)) throw Error('Could not save');
    Object.assign(server[name], JSON.parse(init.body));
    return {};
  };
  return { server, calls, call };
};

test('the three link modes are the share route\'s own fields; invited access is never "Only you"', () => {
  assert.deepEqual(MODES.map(([id]) => id), ['invited', 'signin', 'public']);
  assert.deepEqual(PATCH, { invited: { shared: false }, signin: { shared: true, view: true, public_view: false }, public: { shared: true, view: true, public_view: true } });
  assert.equal(accessMode({ shared: true, view: null }), 'invited', 'a link that is off opens for nobody by link');
  assert.equal(accessMode({ shared: true, view: 't', public_view: true }), 'public');
  assert.equal(accessMode(undefined), 'invited');
  for (const [, label] of MODES) assert.doesNotMatch(label, /only you/i);
  assert.equal(modeLabel('signin'), 'Anyone with the link · sign-in required');
});

test('the breakdown lists the Main canvas first and every canvas with its actual link access and publication', async () => {
  const { call } = stub();
  const rows = await loadRows(call, project, canvases);
  assert.deepEqual(rows.map(r => [r.title, r.main, r.mode, r.published]), [
    ['Main canvas', true, 'signin', false], ['Alpha', false, 'public', false], ['Beta', false, 'invited', true], ['Gamma', false, 'signin', false]]);
  assert.equal(varies(rows), true);
});

test('Varies by canvas only when the rows differ: a uniform project (or a single canvas) never varies', async () => {
  const same = [{ mode: 'signin', published: false }, { mode: 'signin', published: false }];
  assert.equal(varies(same), false);
  assert.equal(varies([{ mode: 'signin', published: false }]), false, 'one canvas never varies');
  assert.equal(varies([...same, { mode: 'signin', published: true }]), true, 'a published canvas differs');
  assert.equal(varies([...same, { mode: null, published: false, error: 'x' }]), false, 'a board that could not be read is not a difference');
});

test('a board that cannot be read keeps its row with the reason; nothing throws', async () => {
  const { call } = stub(['read:canvas-0000000b']);
  const rows = await loadRows(call, project, canvases);
  assert.equal(rows[2].error, 'Board unavailable');
  assert.equal(rows[2].mode, null);
  assert.equal(rows.length, 4);
});

test('Apply to all canvases counts only the canvases that change, never the Main canvas', async () => {
  const rows = await loadRows(stub().call, project, canvases);
  assert.deepEqual(affected(rows, 'signin').map(r => r.title), ['Alpha', 'Beta']);
  assert.deepEqual(affected(rows, 'invited').map(r => r.title), ['Alpha', 'Gamma']);
  assert.equal(affected(rows, 'public').some(r => r.main), false, 'the project link is its own setting');
});

test('Apply to all canvases writes link access only: no publish, no unpublish, no write to the project link', async () => {
  const { call, calls } = stub();
  const rows = await loadRows(call, project, canvases);
  calls.length = 0;
  const out = await applyToAll(call, rows, 'invited', name => (name === 'canvas-0000000a' ? { blocks: [] } : null));
  assert.deepEqual(out, { changed: ['canvas-0000000a', 'canvas-0000000c'], failed: [] });
  assert.deepEqual(calls, [
    'POST /api/learn/boards/canvas-0000000a/main/share {"shared":false,"state":{"blocks":[]}}',
    'POST /api/learn/boards/canvas-0000000c/main/share {"shared":false}',
  ]);
  assert.ok(calls.every(c => !/publish|\/repo-/.test(c)));
});

test('a partial failure keeps going, lists which canvases failed, and never claims all changed; reloading shows the truth', async () => {
  const { call, server } = stub(['canvas-0000000a']);
  const rows = await loadRows(call, project, canvases);
  const out = await applyToAll(call, rows, 'invited');
  assert.deepEqual(out.changed, ['canvas-0000000c']);
  assert.deepEqual(out.failed, [{ name: 'canvas-0000000a', title: 'Alpha', message: 'Could not save' }]);
  const after = await loadRows(call, project, canvases);
  assert.deepEqual(after.map(r => r.mode), ['signin', 'public', 'invited', 'invited'], 'Alpha kept its previous access');
  assert.equal(server['canvas-0000000b'].published, true, 'Explore publication untouched');
});

test('the dialog wires it: confirmation with the count, failures listed, authoritative reload, project never published', () => {
  const tab = read('./ProjectCanvases.jsx'), menu = read('./CardMenu.jsx'), panel = read('../SharePanel.jsx');
  assert.match(tab, /Apply to all canvases\{count \? ` \(\$\{count\}\)` : ''\}/, 'the button carries the affected count');
  assert.match(tab, /on \{count\} \{count === 1 \? 'canvas' : 'canvases'\}\? Each of them replaces its own link setting\./, 'confirmation names the count');
  assert.match(tab, /could not be changed, so they keep their previous access/);
  assert.match(tab, /role="alert" data-apply-failed/);
  assert.match(tab, /Canvases in this project have different access settings\./);
  assert.match(tab, /Link access and Explore publication are separate/);
  assert.match(menu, /const \{ failed \} = await applyToAll\(api, rows, mode,[^\n]*\n\s*await reload\(\);\n\s*setResult\(\{ failed, total \}\);/, 'reload before reporting');
  assert.match(menu, /onPublish=\{project \? null : run\(/);
  assert.match(panel, /project\?\.publicBlocked && value === 'public'/, 'a private repository cannot be opened without signing in');
  assert.match(panel, /This is the project link only\. The project itself is never listed on Explore/);
  assert.match(panel, /const tabs = project \? \[\['share', 'Share'\], \['canvases', 'Canvases'\]\]/, 'no Explore or Embed tab for a project');
});

test('the badge: Varies by canvas for a project only, a button that opens its Share window; the Card options button is the three dots', () => {
  const card = read('./LearningCard.jsx'), menu = read('./CardMenu.jsx');
  assert.match(card, /if \(!Icon \|\| \(access === 'mixed' && kind !== 'repository'\)\) return null;/, 'a canvas never shows it');
  assert.match(card, /Varies by canvas<\/>/);
  assert.match(card, /const VARIES = 'Canvases in this project have different access settings\.';/);
  assert.doesNotMatch(card, />Mixed</);
  assert.match(card, /<IconBtn title="Card options" aria-label="Card options" aria-haspopup="menu" onClick=\{stop\(onMore\)\}><MoreHorizontal /);
  assert.doesNotMatch(card, /ChevronDown/);
  assert.match(menu, /const onVaries = \(a\) => \(a\.kind === 'repository' && a\.canEdit && a\.access === 'mixed' \?/, 'an owned project that varies');
  assert.match(menu, /role="group" aria-label="Card options" onKeyDown=\{menuKeys\}/);
  assert.match(menu, /if \(e\.key === 'Escape'\) \{ menu\.anchor\?\.focus\?\.\(\{ preventScroll: true \}\); return; \}/, 'Escape returns focus to the button');
  assert.match(menu, /thumbnail: \(a\) => setDialog\(\{ kind: 'cover', a \}\)/);
  assert.match(menu, /Reset to canvas snapshot/);
});
