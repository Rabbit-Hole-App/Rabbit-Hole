// UI-25 (owner brief 2026-10-22, C:/s/spec/share/brief-ui25.md): ONE action registry for the canvas right-click menu, a
// card's own menu and the matching keyboard shortcuts, on the normal and the shared canvas. The contract other lanes build
// on is C:/s/spec/share/contract-actions.md. Pure: no React and no DOM at import, so node --test drives it with fakes.
//
//   resolveTarget(element, model)  what was right-clicked: the object under the pointer (never an older selection), a group,
//                                  several objects, the empty canvas, or a part inside a card (selected text, a cell, a page)
//   actionsFor(target, ctx)        the rows to show for it, in one fixed order, hidden or disabled with a short reason
//   runAction(id, target, ctx)     the one way any of them runs: menu click, card menu and keyboard alike
//
// Opening or dismissing a menu runs none of this file's handlers: only runAction calls `run`.
import { TYPE_ACTIONS } from './canvas-actions-types.js';

// The order groups render in; a separator goes between two groups that both show something.
export const GROUPS = ['primary', 'chat', 'type', 'content', 'clipboard', 'lock', 'arrange', 'group', 'canvas', 'delete'];

const SELECTION_KINDS = ['card', 'object', 'group', 'multi'];
const EVERY_KIND = ['card', 'object', 'connector', 'group', 'multi', 'canvas'];

// Native menus stay inside fields and editors (brief section 1): Cut/Copy/Paste on selected text are the browser's there.
// A RichText or CodeMirror surface is contenteditable="true" only while it is being edited.
const NATIVE = 'input, textarea, select, math-field, [contenteditable="true"], [contenteditable=""], [data-canvas-doc], iframe, [data-native-menu]';
export const wantsNativeMenu = element => !!element?.closest?.(NATIVE);

// model: { selection: ids, objectOf(id) -> { object, family } | null, groupOf(id), membersOf(gid), hitByBounds() -> id | null,
//          selectedText() -> { text, node } | null, point, screen, via }
export function resolveTarget(element, model) {
  if (wantsNativeMenu(element)) return { native: true };
  const hit = element?.closest?.('[data-block-id],[data-item-id],[data-shape-id],[data-connection]') || null;
  let id = hit ? hit.dataset.blockId || hit.dataset.itemId || hit.dataset.shapeId || hit.dataset.connection || null : null;
  if (!id && model.hitByBounds) id = model.hitByBounds() || null;
  const chip = !id && element?.closest?.('[data-group-box],[data-group-chip]');
  const chipGroup = chip ? chip.dataset.groupBox || chip.dataset.groupChip : null;
  const base = { point: model.point || null, screen: model.screen || null, via: model.via || 'pointer', part: null };
  if (chipGroup) return groupTarget(chipGroup, model, base);
  const found = id ? model.objectOf(id) : null;
  if (!found) return { ...base, kind: 'canvas', id: null, family: null, type: null, object: null, ids: [], objects: [], group: null };
  const part = partOf(element, hit, model);
  const selection = model.selection || [];
  // The hit object wins: inside the current selection the selection stays (several, or a whole group); outside it the
  // plain-click rule picks it - its whole group when it is in one - and nothing older is touched.
  let ids;
  if (selection.includes(id)) ids = selection.slice();
  else { const gid = model.groupOf(id); ids = gid ? model.membersOf(gid) : [id]; }
  const single = single_(id, found, base, part);
  if (ids.length === 1) return { ...single, ids, objects: [found.object] };
  const gid = model.groupOf(id);
  const members = gid ? model.membersOf(gid) : [];
  const objects = ids.map(other => model.objectOf(other)?.object).filter(Boolean);
  if (gid && sameSet(members, ids)) return { ...single, kind: 'group', ids, objects, group: gid };
  return { ...single, kind: 'multi', ids, objects, group: null };
}

// The target the keyboard acts on (Shift+F10, the ContextMenu key, a shortcut): the selection, or the empty canvas.
export function selectionTarget(model) {
  const ids = (model.selection || []).filter(id => model.objectOf(id));
  const base = { point: model.point || null, screen: model.screen || null, via: 'keyboard', part: null };
  if (!ids.length) return { ...base, kind: 'canvas', id: null, family: null, type: null, object: null, ids: [], objects: [], group: null };
  const found = model.objectOf(ids[0]);
  if (ids.length === 1) return { ...single_(ids[0], found, base, null), ids, objects: [found.object] };
  const gid = model.groupOf(ids[0]);
  if (gid && sameSet(model.membersOf(gid), ids)) return groupTarget(gid, model, base);
  return { ...single_(ids[0], found, base, null), kind: 'multi', ids, objects: ids.map(id => model.objectOf(id).object), group: null };
}

function groupTarget(gid, model, base) {
  const ids = model.membersOf(gid);
  return { ...base, kind: 'group', id: null, family: null, type: null, object: null, ids, objects: ids.map(id => model.objectOf(id)?.object).filter(Boolean), group: gid };
}

function single_(id, found, base, part) {
  const { object, family } = found;
  const kind = family === 'block' || family === 'chat' ? 'card' : family === 'link' ? 'connector' : 'object';
  return { ...base, kind, id, family, type: typeOf(object, family), object, part, group: null };
}

export function typeOf(object, family) {
  if (!object) return null;
  if (family === 'chat') return 'chat';
  if (family === 'link') return 'connector';
  if (family === 'block') return object.type || null;
  return object.kind || null;
}

// A part inside the clicked card: the nearest [data-ctx-part] (a notebook cell, a PDF page, an Explanation object), or a
// text selection inside the card captured now - the DOM selection may collapse once focus moves to the menu.
function partOf(element, hit, model) {
  const marked = element?.closest?.('[data-ctx-part]');
  const picked = model.selectedText?.();
  const text = picked && picked.text && hit && (hit === picked.node || hit.contains?.(picked.node)) ? picked.text : '';
  if (marked && (!hit || hit === marked || hit.contains?.(marked))) {
    const data = marked.dataset;
    const part = { kind: data.ctxPart };
    if (data.ctxPartId) part.id = data.ctxPartId;
    if (data.ctxPartIndex != null) part.index = Number(data.ctxPartIndex);
    if (data.ctxPartPage != null) part.page = Number(data.ctxPartPage);
    if (text) part.text = text;
    return part;
  }
  if (!text) return null;
  return { kind: element?.closest?.('[data-code-lines],pre,code') ? 'code-lines' : 'text', text };
}

const sameSet = (a, b) => a.length === b.length && a.every(id => b.includes(id));

// A job's state as the menu needs it. Per-type rows may read their own fields; this covers the shared ones.
export function jobOf(object) {
  if (!object) return null;
  if (object.loading || object.pending) return 'loading';
  const status = object.status || object.state;
  if (['failed', 'error', 'cancelled'].includes(status)) return 'failed';
  if (['queued', 'pending', 'running', 'generating', 'rendering', 'capturing', 'starting'].includes(status)) return 'running';
  return null;
}

// ---------------------------------------------------------------- the common actions (brief section 3)
const canvasPoint = target => target.point || { x: 0, y: 0 };
const lockable = (target, ctx) => target.ids.some(id => ctx.lockable(id));
const allLocked = (target, ctx) => target.ids.filter(id => ctx.lockable(id)).every(id => ctx.locked(id));

export const COMMON_ACTIONS = [
  // Add comment (canvas-comments.md section 5): the pin goes on the object or group under the pointer.
  { id: 'add-comment', label: 'Add comment', icon: 'MessageCircle', group: 'primary', order: 20, targets: ['card', 'object', 'group', 'multi'],
    applies: (t, ctx) => !!ctx.canvas.addComment && !!(t.id || t.group), requires: 'comment.draft', hint: 'C', keyshortcuts: 'C',
    data: 'data-menu-add-comment', run: (t, ctx) => ctx.canvas.addComment(canvasPoint(t), t.id || t.group) },
  { id: 'link-canvas', label: 'Link to canvas', icon: 'Link2', group: 'primary', order: 30, targets: ['card', 'canvas'],
    applies: (t, ctx) => !!ctx.canvas.linkCanvas && (t.kind === 'canvas' || (t.family === 'block' && t.type !== 'canvas-ref')), requires: 'source.write',
    data: 'data-menu-link-canvas', run: (t, ctx) => ctx.canvas.linkCanvas(t.kind === 'canvas' ? { point: canvasPoint(t) } : { blockId: t.id }) },
  { id: 'rename', label: 'Rename', icon: 'PencilLine', group: 'primary', order: 40, targets: ['card'], mutates: true,
    applies: (t, ctx) => !!ctx.canvas.renamable?.(t.object), requires: 'canvas.local-edit', data: 'data-menu-rename', run: (t, ctx) => ctx.canvas.rename(t.id) },

  // Add to chat attaches the context and opens the composer; it never sends. Quick Edit is the AI editor (a model call
  // only once its own Send is pressed); a local Edit is a per-type row.
  { id: 'add-to-chat', label: 'Add to chat', icon: 'MessageSquarePlus', group: 'chat', order: 10, targets: SELECTION_KINDS, hint: 'Ctrl L',
    applies: (t, ctx) => !!ctx.canvas.describable?.(t), requires: 'chat.ask', data: 'data-menu-add-to-chat',
    attrs: t => (t.type === 'equation' ? { 'data-menu-ask-equation': '' } : {}), run: (t, ctx) => ctx.canvas.addToChat() },
  { id: 'quick-edit', label: 'Quick Edit', icon: 'Wand', group: 'chat', order: 20, targets: SELECTION_KINDS, hint: 'Ctrl K',
    applies: (t, ctx) => !!ctx.canvas.quickEdit, requires: 'generate.paid', data: 'data-menu-inline-ai',
    state: t => (t.kind === 'card' && jobOf(t.object) === 'running' ? { disabled: 'Still generating' } : null), run: (t, ctx) => ctx.canvas.quickEdit() },

  // Duplicate, Copy card, Lock, Arrange, Group, Delete: one order everywhere (brief section 3).
  { id: 'duplicate', label: 'Duplicate', icon: 'CopyPlus', group: 'clipboard', order: 10, targets: SELECTION_KINDS, hint: 'Ctrl D',
    shortcut: { key: 'd', mod: true }, applies: t => t.ids.length > 0, requires: 'canvas.local-edit', data: 'data-menu-duplicate', run: (t, ctx) => ctx.commands.duplicate() },
  { id: 'copy', label: t => (t.kind === 'card' ? 'Copy card' : 'Copy'),
    icon: 'Copy', group: 'clipboard', order: 20, targets: SELECTION_KINDS, hint: 'Ctrl C', applies: (t, ctx) => !!ctx.canvas.copyable?.(t.ids), requires: 'content.copy',
    data: 'data-menu-copy', run: (t, ctx) => ctx.commands.copy() },
  { id: 'cut', label: 'Cut', icon: 'Scissors', group: 'clipboard', order: 30, targets: SELECTION_KINDS, hint: 'Ctrl X', mutates: true,
    applies: (t, ctx) => !!ctx.canvas.copyable?.(t.ids), requires: 'canvas.local-edit', data: 'data-menu-cut', run: (t, ctx) => ctx.commands.cut() },
  { id: 'paste', label: 'Paste', icon: 'ClipboardPaste', group: 'clipboard', order: 40, targets: EVERY_KIND, hint: 'Ctrl V', requires: 'canvas.local-edit',
    state: (t, ctx) => (ctx.canvas.canPaste ? null : { disabled: 'Nothing copied' }), data: 'data-menu-paste', run: (t, ctx) => ctx.commands.paste() },
  { id: 'copy-style', label: 'Copy style', icon: 'Pipette', group: 'clipboard', order: 50, targets: ['object', 'connector', 'multi', 'group'], hint: 'Ctrl Alt C',
    applies: (t, ctx) => !!ctx.canvas.styleable?.(t.ids), requires: 'canvas.local-edit', data: 'data-menu-copy-style', run: (t, ctx) => ctx.commands.copyStyle() },
  { id: 'paste-style', label: 'Paste style', icon: 'PaintRoller', group: 'clipboard', order: 60, targets: ['object', 'connector', 'multi', 'group'], hint: 'Ctrl Alt V', mutates: true,
    applies: (t, ctx) => !!ctx.canvas.styleable?.(t.ids), state: (t, ctx) => (ctx.canvas.canPasteStyle ? null : { disabled: 'No style copied' }),
    requires: 'canvas.local-edit', data: 'data-menu-paste-style', run: (t, ctx) => ctx.commands.pasteStyle() },

  { id: 'lock', label: (t, ctx) => (allLocked(t, ctx) ? 'Unlock' : 'Lock'), icon: (t, ctx) => (allLocked(t, ctx) ? 'LockOpen' : 'Lock'), group: 'lock', order: 10,
    targets: SELECTION_KINDS, hint: 'Ctrl Shift L', shortcut: { key: 'l', mod: true, shift: true }, applies: lockable, requires: 'canvas.local-edit',
    data: 'data-menu-lock', run: (t, ctx) => ctx.commands.lockSelection() },
  // Full content (owner, 2026-10-21): one checkable row on a card that supports it; checked is full, unchecked scrolls.
  { id: 'full-content', label: 'Full content', icon: (t, ctx) => (ctx.canvas.fullContent?.(t.object) ? 'UnfoldVertical' : 'ScrollText'), group: 'lock', order: 20,
    targets: ['card'], applies: (t, ctx) => !!ctx.canvas.supportsCardLayout?.(t.object), checked: (t, ctx) => !!ctx.canvas.fullContent?.(t.object), mutates: true,
    requires: 'canvas.local-edit', data: 'data-card-layout-toggle', run: (t, ctx) => ctx.canvas.setCardLayout(t.id, ctx.canvas.fullContent(t.object) ? 'scrollable' : 'full') },

  ...[['front', 'Bring to front', 'BringToFront', 'Ctrl Shift ]', { key: ']', mod: true, shift: true }],
    ['forward', 'Bring forward', 'ArrowUp', 'Ctrl ]', { key: ']', mod: true }],
    ['backward', 'Send backward', 'ArrowDown', 'Ctrl [', { key: '[', mod: true }],
    ['back', 'Send to back', 'SendToBack', 'Ctrl Shift [', { key: '[', mod: true, shift: true }]].map(([how, label, icon, hint, shortcut], n) => ({
    id: `order-${how}`, label, icon, group: 'arrange', order: 10 + n, targets: SELECTION_KINDS, hint, shortcut, mutates: true, requires: 'canvas.local-edit',
    applies: t => t.ids.length > 0, data: `data-menu-order-${how}`, run: (t, ctx) => ctx.commands.order(how) })),
  { id: 'zoom-to-selection', label: 'Zoom to selection', icon: 'ZoomIn', group: 'arrange', order: 50, targets: [...SELECTION_KINDS, 'connector'],
    applies: t => t.ids.length > 0, requires: 'canvas.view', data: 'data-menu-zoom-selection', run: (t, ctx) => ctx.canvas.zoomToSelection() },

  { id: 'group', label: 'Group', icon: 'Group', group: 'group', order: 10, targets: ['multi'], hint: 'Ctrl G', shortcut: { key: 'g', mod: true },
    applies: t => t.ids.length > 1, mutates: true, requires: 'canvas.local-edit', data: 'data-menu-group', run: (t, ctx) => ctx.commands.group() },
  // Ungroup keeps every member where it is (brief section 3).
  { id: 'ungroup', label: 'Ungroup', icon: 'Ungroup', group: 'group', order: 20, targets: SELECTION_KINDS, hint: 'Ctrl Shift G', shortcut: { key: 'g', mod: true, shift: true },
    applies: (t, ctx) => t.ids.some(id => ctx.groupOf(id)), requires: 'canvas.local-edit', data: 'data-menu-ungroup', run: (t, ctx) => ctx.commands.ungroup() },
  { id: 'rename-group', label: 'Rename group', icon: 'Pencil', group: 'group', order: 30, targets: SELECTION_KINDS,
    applies: (t, ctx) => !!(t.group || t.ids.map(id => ctx.groupOf(id)).find(Boolean)), requires: 'canvas.local-edit', data: 'data-menu-rename-group',
    run: (t, ctx) => ctx.canvas.renameGroup(t.group || t.ids.map(id => ctx.groupOf(id)).find(Boolean)) },

  { id: 'select-all', label: 'Select all', icon: 'BoxSelect', group: 'canvas', order: 10, targets: ['canvas'], hint: 'Ctrl A', requires: 'canvas.local-edit',
    data: 'data-menu-select-all', run: (t, ctx) => ctx.commands.selectAll() },

  // A group's Delete removes its members too, so it says so (brief section 3).
  { id: 'delete', label: t => (t.kind === 'group' ? 'Delete group and contents' : 'Delete'), icon: 'Trash2', group: 'delete', order: 10,
    targets: [...SELECTION_KINDS, 'connector'], hint: 'Del', shortcut: { key: 'Delete' }, danger: true, mutates: true, requires: 'canvas.local-edit',
    applies: t => t.ids.length > 0, data: 'data-menu-delete', run: (t, ctx) => ctx.commands.deleteSelection() },
];

// SHARE lanes register their own entries here (contract section 6); each call returns its undo.
const registered = new Set();
export function registerActions(entries) {
  const list = [...entries];
  for (const entry of list) registered.add(entry);
  return () => { for (const entry of list) registered.delete(entry); };
}

export const allActions = (extra = []) => [...COMMON_ACTIONS, ...TYPE_ACTIONS, ...registered, ...extra];

const value = (field, target, ctx) => (typeof field === 'function' ? field(target, ctx) : field);
const allowed = (ctx, capability) => (capability ? ctx.can(capability) : { allowed: true });

// Whether `entry` belongs on `target` at all (kind, type, part and its own applies); false means hidden.
function fits(entry, target, ctx) {
  if (!entry.targets.includes(target.kind)) return false;
  if (entry.types) {
    const types = target.kind === 'multi' || target.kind === 'group' ? target.objects.map((object, n) => typeOf(object, ctx.familyOf(target.ids[n]))) : [target.type];
    if (!types.length || !types.every(type => entry.types.includes(type))) return false;
  }
  if (entry.part && !entry.part.includes(target.part?.kind)) return false;
  return !entry.applies || !!entry.applies(target, ctx);
}

// The verdict for one entry: null (hidden) or { disabled, reason, signIn }. can() follows S1's contract
// (contract-permissions.md): hidden -> no row; signIn -> an enabled row that goes through sign-in; otherwise refused ->
// disabled with can()'s short reason, unless the entry asks to be hidden when refused (denied: 'hide').
export function verdict(entry, target, ctx) {
  if (!fits(entry, target, ctx)) return null;
  const permit = allowed(ctx, entry.requires);
  if (!permit.allowed) {
    if (permit.hidden || entry.denied === 'hide') return null;
    if (permit.signIn) return { disabled: false, reason: permit.reason || 'Sign in to continue', signIn: true };
    return { disabled: true, reason: permit.reason || 'Not available' };
  }
  const state = entry.state?.(target, ctx) || null;
  if (state?.hidden) return null;
  if (state?.disabled) return { disabled: true, reason: state.disabled };
  if (entry.mutates && target.ids.length && target.ids.every(id => ctx.locked(id))) return { disabled: true, reason: 'Locked' };
  return { disabled: false, reason: null };
}

// An entry's data attributes: a name ('data-menu-rename' -> ''), an object of name -> value, or (target, ctx) -> object.
const attributes = (entry, target, ctx) => {
  const data = value(entry.data, target, ctx);
  return { ...(typeof data === 'string' ? { [data]: '' } : data || {}), ...(entry.attrs ? entry.attrs(target, ctx) : {}) };
};

// The rows for `target`: entries in group order, then their own order; a separator between groups.
export function actionsFor(target, ctx, extra = []) {
  const rows = [];
  let last = null;
  const entries = allActions(extra).slice().sort((a, b) => GROUPS.indexOf(a.group) - GROUPS.indexOf(b.group) || (a.order || 0) - (b.order || 0));
  for (const entry of entries) {
    const v = verdict(entry, target, ctx);
    if (!v) continue;
    if (last !== null && entry.group !== last) rows.push({ separator: true, key: `sep-${entry.group}` });
    last = entry.group;
    rows.push({
      id: entry.id, label: value(entry.label, target, ctx), icon: value(entry.icon, target, ctx), hint: entry.hint || null,
      keyshortcuts: entry.keyshortcuts || null, attrs: attributes(entry, target, ctx), danger: !!entry.danger,
      checked: entry.checked ? !!entry.checked(target, ctx) : null, disabled: v.disabled, reason: v.reason, signIn: !!v.signIn,
    });
  }
  return rows;
}

// The one way an action runs. Re-checks everything at the moment of the click or key, then makes the target the selection
// (so a handler that reads the selection acts on what was clicked) and runs it. A sign-in answer hands over to sign-in
// (ctx.canvas.signIn) and runs nothing. Returns { ran, result } or { ran: false, reason, signIn? }.
export function runAction(id, target, ctx, extra = []) {
  const entry = allActions(extra).find(other => other.id === id);
  if (!entry) return { ran: false, reason: 'Unknown action' };
  const v = verdict(entry, target, ctx);
  if (!v) return { ran: false, reason: null };
  if (v.disabled) return { ran: false, reason: v.reason };
  if (v.signIn) { const handled = !!ctx.canvas.signIn?.(entry.requires, target); return { ran: false, signIn: true, reason: handled ? null : v.reason }; }
  if (target.kind !== 'canvas') ctx.canvas.select?.(target.ids);
  return { ran: true, result: entry.run(target, ctx) };
}

// The keyboard's entry for an event, if any (shortcut field): Ctrl and Cmd are the same modifier.
export function actionForKey(event, extra = []) {
  const mod = !!(event.ctrlKey || event.metaKey);
  const key = event.key?.length === 1 ? event.key.toLowerCase() : event.key;
  return allActions(extra).find(entry => entry.shortcut && entry.shortcut.key === key && !!entry.shortcut.mod === mod
    && !!entry.shortcut.shift === !!event.shiftKey && !!entry.shortcut.alt === !!event.altKey) || null;
}

// The capability fallback when the page passes no S1 permissions ctx (contract section 4): built from what the canvas is told
// today, with S1's capability names. A view-only board without that ctx keeps the menu it had before UI-25: Start Rabbit
// Hole and Add comment only, so every other capability is hidden there rather than shown disabled.
export function legacyCan({ readOnly = false, comment = false, rabbitHole = false } = {}) {
  const yes = { allowed: true }, hide = { allowed: false, hidden: true, reason: 'View only' };
  const table = {
    'canvas.view': readOnly ? hide : yes, 'card.open': readOnly ? hide : yes, 'canvas.local-edit': readOnly ? hide : yes,
    'content.copy': readOnly ? hide : yes, 'chat.ask': readOnly ? hide : yes, 'generate.paid': readOnly ? hide : yes,
    'source.write': readOnly ? hide : yes, 'media.playback': yes,
    'comment.draft': comment ? yes : { allowed: false, hidden: true, reason: 'Comments are off' },
    'canvas.child': rabbitHole ? yes : { allowed: false, hidden: true, reason: 'Not available here' },
  };
  return capability => table[capability] || (readOnly ? hide : yes);
}
