// UI-25 action registry (canvas-actions.js): targeting, rows, order, permissions, states, and that opening a menu runs nothing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { COMMON_ACTIONS, GROUPS, actionForKey, actionsFor, allActions, legacyCan, registerActions, resolveTarget, runAction, selectionTarget } from './canvas-actions.js';
import { TYPE_ACTIONS } from './canvas-actions-types.js';

// ---- a tiny DOM: enough for closest() with tag, [attr] and [attr="v"] selectors, dataset and contains().
const camel = name => name.replace(/^data-/, '').replace(/-([a-z])/g, (_, c) => c.toUpperCase());
function el(tag, attrs = {}, parent = null) {
  const node = { tag, attrs, parent, dataset: {} };
  for (const [k, v] of Object.entries(attrs)) if (k.startsWith('data-')) node.dataset[camel(k)] = v;
  node.matches = sel => sel.split(',').some(part => one(node, part.trim()));
  node.closest = sel => { for (let at = node; at; at = at.parent) if (at.matches(sel)) return at; return null; };
  node.contains = other => { for (let at = other; at; at = at.parent) if (at === node) return true; return false; };
  return node;
}
function one(node, sel) {
  const m = sel.match(/^([a-z-]*)((?:\[[^\]]+\])*)$/);
  if (!m) return false;
  if (m[1] && m[1] !== node.tag) return false;
  for (const [, name, val] of m[2].matchAll(/\[([^=\]]+)(?:="([^"]*)")?\]/g)) {
    if (!(name in node.attrs)) return false;
    if (val !== undefined && String(node.attrs[name]) !== val) return false;
  }
  return true;
}

// ---- a board: two cards, an equation, a note and a shape grouped, a connector.
const board = {
  blocks: [{ id: 'c1', type: 'lesson', title: 'One' }, { id: 'c2', type: 'code', title: 'Two', status: 'running' }, { id: 'h1', type: 'heading', title: 'Part' }],
  items: [{ id: 'eq', kind: 'equation', latex: 'e^{i\\pi}' }, { id: 'n1', kind: 'sticky', groupId: 'g1' }],
  shapes: [{ id: 's1', kind: 'rect', groupId: 'g1' }],
  links: [{ id: 'l1', from: 'c1', to: 'c2' }],
};
const families = { blocks: 'block', items: 'item', shapes: 'shape', links: 'link' };
const objectOf = id => { for (const [list, family] of Object.entries(families)) { const object = board[list].find(entry => entry.id === id); if (object) return { object, family }; } return null; };
const groupOf = id => objectOf(id)?.object.groupId || null;
const membersOf = gid => [...board.items, ...board.shapes].filter(entry => entry.groupId === gid).map(entry => entry.id);
const model = (selection = [], extra = {}) => ({ selection, objectOf, groupOf, membersOf, point: { x: 10, y: 20 }, screen: { x: 1, y: 2 }, ...extra });

// ---- the canvas context: every hook that does work records its call; queries answer from the board.
function fakeCtx({ readOnly = false, comment = true, rabbitHole = true, locked = [], can = null, paste = true } = {}) {
  const calls = [];
  const work = name => (...args) => { calls.push([name, ...args]); return true; };
  const commands = Object.fromEntries(['duplicate', 'copy', 'cut', 'paste', 'copyStyle', 'pasteStyle', 'lockSelection', 'order', 'group', 'ungroup', 'selectAll', 'zoomFit', 'deleteSelection'].map(name => [name, work(`commands.${name}`)]));
  const canvas = {
    select: work('select'), startRabbitHole: work('startRabbitHole'), addComment: work('addComment'), linkCanvas: work('linkCanvas'), rename: work('rename'),
    renameGroup: work('renameGroup'), addToChat: work('addToChat'), quickEdit: work('quickEdit'), copyText: work('copyText'), zoomToSelection: work('zoomToSelection'),
    setCardLayout: work('setCardLayout'), cardAction: work('cardAction'), openUrl: work('openUrl'), openInNotebook: work('openInNotebook'), downloadCad: work('downloadCad'),
    toggleDone: work('toggleDone'), presentFrom: work('presentFrom'), toast: work('toast'),
    canStartRabbitHole: id => board.blocks.some(block => block.id === id), renamable: object => !!object?.title, describable: t => t.ids.length > 0,
    copyable: ids => ids.some(id => objectOf(id)?.family !== 'link'), styleable: ids => ids.length > 0 && ids.every(id => ['shape', 'item', 'link'].includes(objectOf(id)?.family)),
    canPaste: paste, canPasteStyle: false, supportsCardLayout: object => object?.type === 'lesson', fullContent: () => false, attached: () => false,
    reader: () => null, notebookFrom: object => (object?.type === 'code' ? { disabled: null } : null), cadArtifact: () => null,
  };
  const ctx = {
    can: can || legacyCan({ readOnly, comment, rabbitHole }), readOnly, commands, canvas,
    familyOf: id => objectOf(id)?.family || null, groupOf, locked: id => locked.includes(id), lockable: id => objectOf(id)?.family !== 'link',
  };
  return { ctx, calls };
}
const labels = rows => rows.filter(row => !row.separator).map(row => row.label);

test('targeting: the object right-clicked wins over an older selection; the empty canvas clears it', () => {
  const card = el('div', { 'data-block-id': 'c2' }), inner = el('span', {}, card);
  const t = resolveTarget(inner, model(['c1']));
  assert.equal(t.kind, 'card');
  assert.equal(t.id, 'c2');
  assert.deepEqual(t.ids, ['c2'], 'never c1, the previous selection');
  const empty = resolveTarget(el('div', { 'data-canvas-surface': '' }), model(['c1']));
  assert.equal(empty.kind, 'canvas');
  assert.deepEqual(empty.ids, []);
});

test('targeting: a group versus one member, several objects, a group chip and a connector', () => {
  const note = el('div', { 'data-item-id': 'n1' });
  assert.equal(resolveTarget(note, model([])).kind, 'group', 'a plain click picks the whole group');
  assert.deepEqual(resolveTarget(note, model([])).ids, ['n1', 's1']);
  const member = resolveTarget(note, model(['n1']));
  assert.equal(member.kind, 'object', 'one member picked on its own (Ctrl+click) stays one member');
  assert.equal(member.type, 'sticky');
  const multi = resolveTarget(el('div', { 'data-block-id': 'c1' }), model(['c1', 'eq']));
  assert.equal(multi.kind, 'multi');
  assert.deepEqual(multi.ids, ['c1', 'eq']);
  const chip = resolveTarget(el('div', { 'data-group-chip': 'g1' }), model([]));
  assert.equal(chip.kind, 'group');
  assert.equal(chip.group, 'g1');
  const link = resolveTarget(el('path', {}, el('g', { 'data-connection': 'l1' })), model([]));
  assert.equal(link.kind, 'connector');
  assert.equal(link.type, 'connector');
});

test('targeting: fields, editors, the document and embedded pages keep their own menu', () => {
  const card = el('div', { 'data-block-id': 'c1' });
  for (const inside of [el('input', {}, card), el('textarea', {}, card), el('div', { contenteditable: 'true' }, card), el('iframe', {}, card), el('div', { 'data-native-menu': '' }, card), el('math-field', {}, card)]) {
    assert.deepEqual(resolveTarget(inside, model([])), { native: true }, inside.tag);
  }
  assert.notEqual(resolveTarget(el('div', { contenteditable: 'false' }, card), model([])).native, true, 'a read-only editor is the card');
});

test('targeting: selected text, code lines and marked parts (a cell, a PDF page) are captured at open', () => {
  const card = el('div', { 'data-block-id': 'c2' }), pre = el('pre', {}, card), line = el('span', {}, pre);
  const t = resolveTarget(line, model([], { selectedText: () => ({ text: 'x = 1', node: line }) }));
  assert.deepEqual(t.part, { kind: 'code-lines', text: 'x = 1' });
  assert.equal(labels(actionsFor(t, fakeCtx().ctx))[0] !== 'Copy card', true);
  assert.ok(labels(actionsFor(t, fakeCtx().ctx)).includes('Copy selected lines'));
  const elsewhere = resolveTarget(line, model([], { selectedText: () => ({ text: 'other card', node: el('p', {}, el('div', { 'data-block-id': 'c1' })) }) }));
  assert.equal(elsewhere.part, null, 'text selected in another card is not this card');
  const cell = el('div', { 'data-ctx-part': 'cell', 'data-ctx-part-index': '3', 'data-ctx-part-id': 'k3' }, card);
  assert.deepEqual(resolveTarget(el('span', {}, cell), model([])).part, { kind: 'cell', id: 'k3', index: 3 });
  const page = el('div', { 'data-ctx-part': 'pdf-page', 'data-ctx-part-page': '7' }, card);
  assert.deepEqual(resolveTarget(page, model([])).part, { kind: 'pdf-page', page: 7 });
});

test('common actions: Duplicate, Copy card, Lock, Arrange, Group and Delete in one order on every target', () => {
  const { ctx } = fakeCtx();
  const order = ['Duplicate', 'Copy card', 'Lock', 'Bring to front', 'Ungroup', 'Delete'];
  const card = labels(actionsFor(selectionTarget(model(['c1'])), ctx));
  const at = name => card.indexOf(name.replace('Copy card', 'Copy card'));
  for (const name of ['Duplicate', 'Copy card', 'Lock', 'Bring to front', 'Delete']) assert.ok(at(name) >= 0, `${name} in ${card}`);
  assert.deepEqual(['Duplicate', 'Copy card', 'Lock', 'Bring to front', 'Delete'].map(at), ['Duplicate', 'Copy card', 'Lock', 'Bring to front', 'Delete'].map(at).slice().sort((a, b) => a - b));
  const group = labels(actionsFor(resolveTarget(el('div', { 'data-group-chip': 'g1' }), model([])), ctx));
  const g = name => group.indexOf(name);
  assert.ok(g('Duplicate') < g('Copy') && g('Copy') < g('Lock') && g('Lock') < g('Bring to front') && g('Bring to front') < g('Ungroup') && g('Ungroup') < g('Delete group and contents'), group.join(', '));
  assert.ok(order.length);
  // separators only between groups, never first or last or doubled
  const rows = actionsFor(selectionTarget(model(['c1'])), ctx);
  assert.ok(!rows[0].separator && !rows.at(-1).separator);
  rows.forEach((row, n) => assert.ok(!(row.separator && rows[n + 1]?.separator)));
});

test('clarity: Copy card vs Copy LaTeX, Ungroup keeps contents, the group delete says it deletes the contents', () => {
  const { ctx } = fakeCtx();
  const eq = labels(actionsFor(selectionTarget(model(['eq'])), ctx));
  assert.ok(eq.includes('Copy LaTeX') && eq.includes('Copy') && !eq.includes('Copy card'), eq.join(', '));
  const group = labels(actionsFor(resolveTarget(el('div', { 'data-group-chip': 'g1' }), model([])), ctx));
  assert.ok(group.includes('Ungroup') && group.includes('Rename group') && group.includes('Delete group and contents') && !group.includes('Delete'), group.join(', '));
  const quick = labels(actionsFor(selectionTarget(model(['c1'])), fakeCtx().ctx));
  assert.ok(quick.includes('Quick Edit'), 'AI Quick Edit is its own row');
});

test('mixed selections show only valid batch actions; single-object rows never appear', () => {
  const { ctx } = fakeCtx();
  const multi = actionsFor(resolveTarget(el('div', { 'data-block-id': 'c1' }), model(['c1', 'eq'])), ctx);
  const names = labels(multi);
  for (const single of ['Rename', 'Full content', 'Copy LaTeX', 'Open in notebook', 'Mark done']) assert.ok(!names.includes(single), `${single} on a mixed selection`);
  // Start Rabbit Hole stays: it starts from the card right-clicked, never from the first selected one (owner, 2026-10-07).
  assert.equal(multi.find(row => row.id === 'start-rabbit-hole')?.attrs['data-origin'], 'c1');
  assert.ok(names.includes('Group') && names.includes('Delete') && names.includes('Duplicate'));
  assert.ok(!names.includes('Copy style') && !names.includes('Paste style'), 'a card in the mix: no style rows that would skip it');
  assert.ok(labels(actionsFor(resolveTarget(el('div', { 'data-group-chip': 'g1' }), model([])), ctx)).includes('Copy style'), 'a group of shapes and notes keeps them');
  // a per-type row with `types` shows on several objects only when EVERY member has that type
  const off = registerActions([{ id: 'test.batch', label: 'Lesson only', icon: 'Copy', group: 'type', targets: ['multi'], types: ['lesson'], run: () => {} }]);
  assert.ok(!labels(actionsFor(selectionTarget(model(['c1', 'eq'])), ctx)).includes('Lesson only'));
  off();
});

test('read-only: a viewer sees Start Rabbit Hole (and Add comment where comments are on), nothing that edits', () => {
  const card = el('div', { 'data-block-id': 'c1' });
  assert.deepEqual(labels(actionsFor(resolveTarget(card, model([])), fakeCtx({ readOnly: true, comment: false }).ctx)), ['Start Rabbit Hole']);
  assert.deepEqual(labels(actionsFor(resolveTarget(card, model([])), fakeCtx({ readOnly: true }).ctx)), ['Start Rabbit Hole', 'Add comment']);
  assert.deepEqual(actionsFor(resolveTarget(el('div'), model([])), fakeCtx({ readOnly: true }).ctx), [], 'a view-only empty canvas opens nothing');
  assert.deepEqual(labels(actionsFor(resolveTarget(el('div', { 'data-item-id': 'eq' }), model([])), fakeCtx({ readOnly: true, comment: false }).ctx)), [], 'no Rabbit Hole on a non-card');
});

test('roles through S1 can(): hidden hides, signIn keeps the row and hands over to sign-in, a refusal disables with its reason', () => {
  const viewer = capability => ({
    'generate.paid': { allowed: false, reason: 'Fork to generate in your own copy' },
    'source.write': { allowed: false, hidden: true, reason: 'Owner only' },
    'canvas.child': { allowed: false, signIn: true, reason: 'Sign in to start a Rabbit Hole' },
  }[capability] || { allowed: true });
  const { ctx, calls } = fakeCtx({ can: viewer });
  ctx.canvas.linkCanvas = () => {};
  const rows = actionsFor(selectionTarget(model(['c1'])), ctx);
  const row = id => rows.find(entry => entry.id === id);
  assert.deepEqual([row('quick-edit').disabled, row('quick-edit').reason], [true, 'Fork to generate in your own copy']);
  assert.equal(row('link-canvas'), undefined, 'hidden');
  assert.deepEqual([row('start-rabbit-hole').disabled, row('start-rabbit-hole').signIn], [false, true]);
  assert.deepEqual(runAction('start-rabbit-hole', selectionTarget(model(['c1'])), ctx), { ran: false, signIn: true, reason: 'Sign in to start a Rabbit Hole' });
  ctx.canvas.signIn = (capability) => { calls.push(['signIn', capability]); return true; };
  assert.deepEqual(runAction('start-rabbit-hole', selectionTarget(model(['c1'])), ctx), { ran: false, signIn: true, reason: null });
  assert.deepEqual(calls, [['signIn', 'canvas.child']], 'nothing started, only sign-in');
  const off = registerActions([{ id: 'test.denied', label: 'Generate', icon: 'Wand', group: 'chat', targets: ['card'], requires: 'generate.paid', denied: 'hide', run: () => {} }]);
  assert.equal(actionsFor(selectionTarget(model(['c1'])), ctx).find(entry => entry.label === 'Generate'), undefined, 'an entry may ask to hide when refused');
  off();
});

test('states: locked rows are disabled with a reason (Unlock stays); a running job disables Quick Edit; Paste says why', () => {
  const rows = actionsFor(selectionTarget(model(['c1'])), fakeCtx({ locked: ['c1'], paste: false }).ctx);
  const row = name => rows.find(entry => entry.label === name);
  assert.deepEqual([row('Delete').disabled, row('Delete').reason], [true, 'Locked']);
  assert.equal(row('Unlock').disabled, false);
  assert.deepEqual([row('Paste').disabled, row('Paste').reason], [true, 'Nothing copied']);
  const running = actionsFor(selectionTarget(model(['c2'])), fakeCtx().ctx).find(entry => entry.label === 'Quick Edit');
  assert.deepEqual([running.disabled, running.reason], [true, 'Still generating']);
});

test('opening and dismissing a menu calls no handler: no model, execution, capture or edit', () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error('a menu opened a request'); };
  try {
    const { ctx, calls } = fakeCtx();
    const targets = [
      selectionTarget(model([])), selectionTarget(model(['c1'])), selectionTarget(model(['c2'])), selectionTarget(model(['h1'])), selectionTarget(model(['eq'])),
      selectionTarget(model(['l1'])), selectionTarget(model(['c1', 'eq'])), resolveTarget(el('div', { 'data-group-chip': 'g1' }), model([])),
      resolveTarget(el('span', {}, el('pre', {}, el('div', { 'data-block-id': 'c2' }))), model([], { selectedText: () => ({ text: 'x', node: null }) })),
    ];
    for (const target of targets) for (const readOnly of [false, true]) actionsFor(target, { ...ctx, can: legacyCan({ readOnly, comment: true, rabbitHole: true }) });
    assert.deepEqual(calls, []);
  } finally { globalThis.fetch = realFetch; }
});

test('runAction: the clicked target becomes the selection before its handler; refusals run nothing', () => {
  const { ctx, calls } = fakeCtx({ locked: ['c1'] });
  const target = resolveTarget(el('div', { 'data-block-id': 'c2' }), model(['c1']));
  assert.equal(runAction('duplicate', target, ctx).ran, true);
  assert.deepEqual(calls, [['select', ['c2']], ['commands.duplicate']]);
  calls.length = 0;
  assert.deepEqual(runAction('delete', selectionTarget(model(['c1'])), ctx), { ran: false, reason: 'Locked' });
  assert.deepEqual(runAction('rename', selectionTarget(model(['c1', 'eq'])), ctx), { ran: false, reason: null }, 'no single-object action on several');
  assert.deepEqual(calls, []);
});

test('the keyboard finds the same rows: Ctrl/Cmd+D, Ctrl+G, Ctrl+Shift+G, Ctrl+Shift+L, Delete', () => {
  assert.equal(actionForKey({ key: 'd', ctrlKey: true }).id, 'duplicate');
  assert.equal(actionForKey({ key: 'D', metaKey: true }).id, 'duplicate');
  assert.equal(actionForKey({ key: 'g', ctrlKey: true }).id, 'group');
  assert.equal(actionForKey({ key: 'G', ctrlKey: true, shiftKey: true }).id, 'ungroup');
  assert.equal(actionForKey({ key: 'L', ctrlKey: true, shiftKey: true }).id, 'lock');
  assert.equal(actionForKey({ key: 'Delete' }).id, 'delete');
  assert.equal(actionForKey({ key: 'd' }), null);
});

test('the registry: unique ids, known groups, an icon on every row, no ellipsis in any label', () => {
  const entries = allActions();
  assert.equal(new Set(entries.map(entry => entry.id)).size, entries.length);
  assert.ok(TYPE_ACTIONS.length > 0 && COMMON_ACTIONS.length > 0);
  const { ctx } = fakeCtx();
  for (const entry of entries) {
    assert.ok(GROUPS.includes(entry.group), entry.id);
    assert.ok(entry.icon, entry.id);
    assert.ok(Array.isArray(entry.targets) && entry.targets.length, entry.id);
    assert.equal(typeof entry.run, 'function', entry.id);
    if (typeof entry.label === 'string') assert.doesNotMatch(entry.label, /\.\.\.|…/, entry.id);
  }
  for (const target of [selectionTarget(model(['c1'])), selectionTarget(model([])), selectionTarget(model(['eq']))]) {
    for (const row of actionsFor(target, ctx)) if (!row.separator) { assert.ok(row.icon, row.id); assert.doesNotMatch(row.label, /\.\.\.|…/); }
  }
  // the menu draws every icon a row can name
  const menu = readFileSync(new URL('./CanvasMenu.jsx', import.meta.url), 'utf8');
  const named = new Set(COMMON_ACTIONS.concat(TYPE_ACTIONS).flatMap(entry => (typeof entry.icon === 'string' ? [entry.icon] : [])));
  for (const name of ['Lock', 'LockOpen', 'ScrollText', 'UnfoldVertical', 'Unlink', 'Paperclip', 'Circle', 'CircleCheck']) named.add(name);
  const icons = menu.slice(menu.indexOf('export const ICONS = {'), menu.indexOf('};', menu.indexOf('export const ICONS = {')));
  for (const name of named) assert.match(icons, new RegExp(`\\b${name}\\b`), name);
});

test('the canvas uses the registry: one CanvasMenu, keyboard shortcuts through runAction, no hand-written rows', () => {
  const canvas = readFileSync(new URL('./AdaptiveCanvas.jsx', import.meta.url), 'utf8');
  assert.match(canvas, /<CanvasMenu rows=\{actionsFor\(menuAt\.target, actionCtx\)\}/);
  assert.doesNotMatch(canvas, /aria-label="Canvas actions"/, 'no second canvas menu beside CanvasMenu');
  for (const id of ['duplicate', 'lock', 'delete']) assert.match(canvas, new RegExp(`keyActionRef\\.current\\('${id}'\\)`));
  assert.doesNotMatch(canvas, /Mark a region to ask about/);
});

test("a card's own ⋮ menu draws the same rows and runs them through runAction (NotebookCard)", () => {
  const card = readFileSync(new URL('./NotebookCard.jsx', import.meta.url), 'utf8'), canvas = readFileSync(new URL('./AdaptiveCanvas.jsx', import.meta.url), 'utf8');
  assert.match(card, /<CardActionRows id=\{block\.id\} groups=\{\['type', 'content'\]\}/);
  assert.match(canvas, /run: \(id, actionId\) => \{ const done = runAction\(actionId, cardTarget\(id\), actionCtx\);/);
  const { ctx, calls } = fakeCtx();
  ctx.canvas.downloadText = (...args) => { calls.push(['downloadText', args[0], args[2]]); };
  const nb = { id: 'nb', type: 'notebook', ipynb: { cells: [] }, ipynb_path: 'work/lesson.ipynb' };
  board.blocks.push(nb);
  try {
    const target = selectionTarget(model(['nb']));
    const row = actionsFor(target, ctx).find(entry => entry.id === 'notebook.download');
    assert.equal(row.label, 'Download lesson.ipynb');
    assert.deepEqual(calls, [], 'listing the rows downloads nothing');
    assert.equal(runAction('notebook.download', target, ctx).ran, true);
    assert.deepEqual(calls.at(-1), ['downloadText', 'lesson.ipynb', 'application/x-ipynb+json']);
  } finally { board.blocks.pop(); }
});

test('rows written with the early short names (edit, copy, open, chat) are checked under S1 names', () => {
  const asked = [];
  const s1 = capability => { asked.push(capability); return capability === 'canvas.local-edit' ? { allowed: false, reason: 'Fork to keep your changes' } : { allowed: true }; };
  const off = registerActions([{ id: 'test.alias', label: 'Alias edit', icon: 'Pencil', group: 'type', targets: ['card'], requires: 'edit', run: () => {} }]);
  const row = actionsFor(selectionTarget(model(['c1'])), fakeCtx({ can: s1 }).ctx).find(entry => entry.id === 'test.alias');
  off();
  assert.deepEqual([row.disabled, row.reason], [true, 'Fork to keep your changes']);
  assert.ok(asked.includes('canvas.local-edit') && !asked.includes('edit'));
});
