// R5.02: the proposal target, keyboard precedence in the proposal editor (IME, repeat, Tab, Enter versus Ctrl/Cmd+Enter, Esc), stale previews, and the
// controller's edit flow against a fake server: a preview never changes the pending proposal, Apply closes only after the server confirms, Esc discards,
// an acceptance from another device clears the preview, and Tab never accepts while the editor is open.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { editKey, opensEditor, proposalTarget, sameTarget, stalePreview } from './inline-ai-proposal.js';
import { createRoadmapController } from './roadmap-controller.js';
import { pillOf, tabAccepts } from './roadmap-client.js';
import { proposalContextRef } from './roadmap-proposal-context.js';

const DIR = fileURLToPath(new URL('../../../docs/features/explain-on-canvas/contracts/fixtures/', import.meta.url));
const fixture = name => JSON.parse(readFileSync(DIR + name + '.json', 'utf8')).response.body;
const clone = v => JSON.parse(JSON.stringify(v));
const settle = () => new Promise(resolve => setTimeout(resolve, 5));
const key = (k, extra = {}) => ({ key: k, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, repeat: false, isComposing: false, keyCode: 0, ...extra });

test('the target is its own kind, frozen at the version the learner saw', () => {
  const view = fixture('status-active-proposal-pending');
  const target = proposalTarget(view);
  assert.deepEqual(Object.keys(target).sort(), ['kind', 'proposalId', 'proposalVersion', 'roadmapId', 'stepId']);
  assert.equal(target.kind, 'roadmap_proposal');
  assert.ok(Object.isFrozen(target));
  assert.equal(proposalTarget({ roadmap: view.roadmap, proposal: null }), null);
  const next = { ...view, proposal: { ...view.proposal, version: view.proposal.version + 1 } };
  assert.equal(sameTarget(target, proposalTarget(view)), true);
  assert.equal(sameTarget(target, proposalTarget(next)), false);
});

test('Ctrl/Cmd+K opens only with the keyboard on the proposal, never while composing, repeating, read-only or already open', () => {
  const ctx = { onProposal: true, editorOpen: false };
  assert.equal(opensEditor(key('k', { ctrlKey: true }), ctx), true);
  assert.equal(opensEditor(key('K', { metaKey: true }), ctx), true);
  for (const bad of [key('k'), key('k', { ctrlKey: true, shiftKey: true }), key('k', { ctrlKey: true, altKey: true }), key('k', { ctrlKey: true, repeat: true }), key('k', { ctrlKey: true, isComposing: true })]) assert.equal(opensEditor(bad, ctx), false);
  assert.equal(opensEditor(key('k', { ctrlKey: true }), { ...ctx, onProposal: false }), false, 'Quick Edit on a selected card is untouched');
  assert.equal(opensEditor(key('k', { ctrlKey: true }), { ...ctx, editorOpen: true }), false);
  assert.equal(opensEditor(key('k', { ctrlKey: true }), { ...ctx, readOnly: true }), false);
});

test('inside the editor: Enter previews, Ctrl/Cmd+Enter applies a preview, Esc discards, Tab is kept, IME and repeat do nothing', () => {
  const draft = { draftId: 'pd_1' };
  assert.equal(editKey(key('Enter'), { text: 'make it a table' }), 'preview');
  assert.equal(editKey(key('Enter'), { text: '   ' }), null);
  assert.equal(editKey(key('Enter', { shiftKey: true }), { text: 'x' }), null, 'Shift+Enter is a newline');
  assert.equal(editKey(key('Enter', { ctrlKey: true }), { draft, text: 'x' }), 'apply');
  assert.equal(editKey(key('Enter', { metaKey: true }), { draft, text: 'x' }), 'apply');
  assert.equal(editKey(key('Enter', { ctrlKey: true }), { draft: null, text: 'x' }), null, 'nothing to apply yet');
  assert.equal(editKey(key('Escape'), { draft }), 'discard');
  assert.equal(editKey(key('Tab'), { draft }), 'keep');
  assert.equal(editKey(key('Enter', { isComposing: true }), { text: 'x', draft }), null);
  assert.equal(editKey(key('Enter', { keyCode: 229 }), { text: 'x' }), null);
  assert.equal(editKey(key('Enter', { ctrlKey: true, repeat: true }), { draft }), null);
  assert.equal(editKey(key('Enter', { ctrlKey: true }), { draft, busy: true }), null, 'repeated Apply while one is in flight');
  assert.equal(editKey(key('Escape', { isComposing: true }), { draft }), null);
});

test('stale preview: any view that is not the same pending proposal version drops it', () => {
  const view = fixture('status-active-proposal-pending');
  const draft = { proposalId: view.proposal.id, proposalVersion: view.proposal.version };
  assert.equal(stalePreview(draft, view), false);
  assert.equal(stalePreview(draft, { ...view, proposal: { ...view.proposal, version: 2 } }), true);
  assert.equal(stalePreview(draft, { ...view, proposal: { ...view.proposal, state: 'held' } }), true);
  assert.equal(stalePreview(draft, { ...view, proposal: null }), true);
  assert.equal(stalePreview(null, view), false);
});

function harness({ get, onDraft, onApply, onAccept }) {
  const calls = [];
  const api = async (path, opts = {}) => {
    const method = opts.method || 'GET', tail = path.replace('/api/learn/roadmap', '').replace(/\?.*/, ''), body = opts.body ? JSON.parse(opts.body) : null;
    calls.push({ method, tail, body });
    if (method === 'GET' && tail === '') return get();
    if (tail.endsWith('/drafts')) return onDraft(body);
    if (tail.endsWith('/apply')) return onApply(body);
    if (tail.endsWith('/discard')) return { draftId: 'pd_1', state: 'discarded' };
    if (tail.endsWith('/accept')) return onAccept(body);
    throw Object.assign(new Error('no route'), { status: 404, data: { code: 'not_found' } });
  };
  const host = { hasBlock: () => false, insertCard: () => {}, persist: async () => {}, boardRevision: () => 1, readOnly: () => false };
  const controller = createRoadmapController({ api, boardId: 'lb_7c1e5a90d2b84f63a1c07e92', host, schedule: () => 1, cancel() {}, random: (() => { let n = 0; return () => `key${++n}aaaaaaaa`; })() });
  return { controller, calls };
}
const draftBody = (view, extra = {}) => ({ draft: { draftId: 'pd_1', revision: 1, proposalId: view.proposal.id, proposalVersion: view.proposal.version, title: 'As a table', description: 'A table.', format: 'table', checkStatus: 'passed', ...extra }, ...clone(view) });
const v2 = view => { const next = clone(view); next.proposal.version += 1; next.proposal.title = 'As a table'; next.roadmap.revision += 1; return next; };

test('preview keeps the original proposal; Apply closes only after the server confirms and shows the new version', async () => {
  const view = fixture('status-active-proposal-pending');
  let phase = 'pending';
  const { controller, calls } = harness({ get: () => (phase === 'pending' ? view : v2(view)), onDraft: () => draftBody(view), onApply: () => { phase = 'applied'; return v2(view); }, onAccept: () => { throw new Error('must not accept'); } });
  controller.start(); await settle();
  controller.openEditor();
  assert.equal(controller.getState().editing, true);
  await controller.previewEdit('make it a table'); await settle();
  assert.equal(controller.getState().draft.title, 'As a table');
  assert.equal(controller.getState().view.proposal.version, view.proposal.version, 'the original is still the pending proposal');
  assert.equal(pillOf(controller.getState()).accept, true);
  assert.equal(tabAccepts({ event: key('Tab'), pill: pillOf(controller.getState()), blocked: false, editorOpen: controller.getState().editing, presenting: false, readOnly: false }), false, 'Tab does not accept while the editor is open');
  const apply = controller.applyEdit();
  assert.equal(controller.getState().editing, true, 'still open until the server confirms');
  await apply; await settle();
  assert.equal(controller.getState().editing, false);
  assert.equal(controller.getState().draft, null);
  assert.equal(controller.getState().view.proposal.version, view.proposal.version + 1);
  assert.equal(calls.filter(c => c.tail.endsWith('/accept')).length, 0, 'editing never accepts');
  assert.equal(calls.find(c => c.tail.endsWith('/drafts')).body.proposalVersion, view.proposal.version);
  assert.equal(calls.find(c => c.tail.endsWith('/apply')).body.draftRevision, 1);
  assert.equal(tabAccepts({ event: key('Tab'), pill: pillOf(controller.getState()), blocked: false, editorOpen: false, presenting: false, readOnly: false }), true, 'one Tab accepts after the editor closed');
});

test('Esc discards without touching the proposal; an acceptance from another device makes Apply fail safely and clears the preview', async () => {
  const view = fixture('status-active-proposal-pending');
  const accepted = fixture('accept-proposal-response-generating');
  const stale = Object.assign(new Error('stale'), { status: 409, data: { code: 'proposal_not_pending', error: 'This roadmap changed. Showing the latest.', current: accepted } });
  const { controller, calls } = harness({ get: () => view, onDraft: () => draftBody(view), onApply: () => { throw stale; }, onAccept: () => accepted });
  controller.start(); await settle();
  controller.openEditor(); await controller.previewEdit('shorter'); await settle();
  controller.closeEditor(); await settle();
  assert.equal(controller.getState().draft, null);
  assert.equal(controller.getState().editing, false);
  assert.equal(calls.filter(c => c.tail.endsWith('/discard')).length, 1);
  assert.equal(controller.getState().view.proposal.version, view.proposal.version);
  controller.openEditor(); await controller.previewEdit('longer'); await settle();
  await controller.applyEdit(); await settle();
  assert.equal(controller.getState().draft, null, 'the stale preview is cleared');
  assert.equal(controller.getState().editing, false);
  assert.equal(controller.getState().notice, 'This roadmap changed. Showing the latest.');
  assert.equal(controller.getState().view.proposal ?? null, accepted.proposal ?? null, 'the actual accepted state is shown');
});

test('a repeated Apply press joins the first request; a failed preview shows the server sentence and keeps the proposal', async () => {
  const view = fixture('status-active-proposal-pending');
  let applies = 0;
  const { controller } = harness({ get: () => view, onDraft: body => { if (body.instruction === 'bad') throw Object.assign(new Error('x'), { status: 422, data: { code: 'edit_rejected', error: 'That change could not be made.' } }); return draftBody(view); }, onApply: () => { applies += 1; return v2(view); }, onAccept: () => view });
  controller.start(); await settle();
  controller.openEditor();
  await controller.previewEdit('bad'); await settle();
  assert.equal(controller.getState().notice, 'That change could not be made.');
  assert.equal(controller.getState().draft, null);
  assert.equal(controller.getState().view.proposal.version, view.proposal.version);
  await controller.previewEdit('good'); await settle();
  const a = controller.applyEdit(), b = controller.applyEdit();
  await a; await b; await settle();
  assert.equal(applies, 1);
});

test('the Chat reference is identity only, in the exact shape the server accepts', () => {
  const ref = proposalContextRef({ id: 'pr_c0ffee0123456789abcdef02', version: 3, title: 'T'.repeat(300) });
  assert.deepEqual(Object.keys(ref).sort(), ['kind', 'name', 'range', 'sourceId', 'version']);
  assert.deepEqual([ref.kind, ref.sourceId, ref.version, ref.range], ['proposal', 'proposal:pr_c0ffee0123456789abcdef02', '3', null]);
  assert.equal(ref.name.length, 120);
  assert.equal(proposalContextRef(null), null);
});
