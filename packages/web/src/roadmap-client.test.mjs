// Roadmap client: reducer transitions against every recorded fixture, Tab ownership truth table, 409 handling, the offscreen
// indicator, dismissal scope, Ask pause, idempotent delivery, no-price, stale-version display, wire shapes, idle grouping.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { acceptedPlanOf, actionKeys, canProposeNext, chatOf, claimsFocus, deliverable, draftOf, keyboardOwned, idleGrouper, initialState, invitationOf, offerOf, pillOf, planDelivery, readyMarkdownSources, failuresOf, reduce, routes, stepLabelFor, tabAccepts, texts, tocOf } from './roadmap-client.js';
import { STRINGS } from './roadmap-strings.js';
import { entriesOf } from './roadmap-transcript.js';
import { pageKeyAllowed } from './shortcut-owner.js';
import { ROADMAP_STATES } from './roadmap-contract.js';

const DIR = fileURLToPath(new URL('../../../docs/features/explain-on-canvas/contracts/fixtures/', import.meta.url));
const fx = name => JSON.parse(readFileSync(DIR + name + '.json', 'utf8'));
const view = name => fx(name).response.body;
const withView = (name, extra = {}) => ({ ...reduce(initialState(), { type: 'view', view: view(name) }), ...extra });
const clone = value => JSON.parse(JSON.stringify(value));
const statusNames = () => readdirSync(DIR).filter(f => f.startsWith('status-')).map(f => f.replace('.json', ''));

test('every status fixture reduces to a view the UI can render, with a state from the shared enum', () => {
  assert.ok(statusNames().length >= 9);
  for (const name of statusNames()) {
    const state = withView(name);
    assert.ok(ROADMAP_STATES.includes(state.view.roadmap.state), name);
    tocOf(state); // null before acceptance (UI.02), never throws
    chatOf(state); pillOf(state); // none throws
  }
});

test('pill: only a pending acceptable proposal on an active roadmap; held/cancelled/none show nothing', () => {
  const pill = pillOf(withView('status-active-proposal-pending'));
  assert.equal(pill.accept, true);
  assert.equal(pill.source, 'Gradient descent notes.md');
  for (const name of ['status-held-for-checking', 'status-cancelled-paused', 'status-failed-card', 'status-proposed-plan', 'status-completed']) assert.equal(pillOf(withView(name)), null, name);
  const held = withView('status-active-proposal-pending'); held.view = { ...held.view, proposal: { ...held.view.proposal, state: 'held', acceptable: false } };
  assert.equal(pillOf(held), null);
  const unacceptable = withView('status-active-proposal-pending'); unacceptable.view = { ...unacceptable.view, proposal: { ...unacceptable.view.proposal, acceptable: false } };
  assert.equal(pillOf(unacceptable).accept, false, 'visible but not accept-ready');
});

test('no price, credit, cost or model text on any surface in any state (D24)', () => {
  const banned = /\$|credit|cost|price|estimate|maximum|opus|sonnet|claude|token/i;
  for (const name of statusNames()) {
    const state = withView(name);
    for (const text of texts(state)) assert.doesNotMatch(text, banned, `${name}: ${text}`);
    const toc = tocOf(state);
    for (const text of (toc?.steps || []).flatMap(s => [s.title, s.description, s.status]).filter(Boolean)) assert.doesNotMatch(text, banned, name);
  }
  for (const s of [STRINGS.accept, STRINGS.cancel, STRINGS.nextReady, STRINGS.invite('x'), STRINGS.failed, STRINGS.checking, STRINGS.stale, STRINGS.paused, STRINGS.completed]) assert.doesNotMatch(s, banned);
  for (const s of Object.values(STRINGS).filter(v => typeof v === 'string')) assert.doesNotMatch(s, /\.\.\.|…/, 'no ellipsis');
  for (const s of [STRINGS.inviteDrop('x'), STRINGS.routeChoice('x'), STRINGS.boundary('x'), STRINGS.roadmapReady('x'), ...Object.values(STRINGS.stage)]) assert.doesNotMatch(s, banned);
});

test('held result: a status line, never any result text', () => {
  assert.deepEqual(chatOf(withView('status-held-for-checking')).map(l => l.text), [STRINGS.checking]);
});

test('Ask mode pauses unsolicited initiative: no invitation, no plan-ready line; an offer the server made stays acceptable (explicit action, UI.03); accepted progress still reads', () => {
  const asked = { ...withView('status-active-proposal-pending'), mode: 'ask' };
  assert.equal(pillOf(asked).accept, true, 'Accept / Next card / Tab work in Ask without changing the preference');
  assert.equal(pillOf(asked).gesture, pillOf(withView('status-active-proposal-pending')).gesture, 'one gesture for every surface, so one coalesced request');
  assert.equal(offerOf(asked).accept, true, 'Chat Accept works in Ask too');
  const inv = reduce({ ...initialState(), mode: 'ask' }, { type: 'invitation', invitation: view('invitation-offered').invitation });
  assert.equal(invitationOf(inv).id, inv.invitation.id);
  assert.ok(!chatOf({ ...withView('status-proposed-plan'), mode: 'ask' }).some(l => l.id === 'plan'));
  const generating = { ...withView('status-held-for-checking'), mode: 'ask' };
  assert.equal(tocOf(generating).steps[0].state, 'generating');
  assert.equal(chatOf(generating).length, 1, 'held line stays');
});

test('invitation: two exact choices and the drop sentence; never deferred for typing or answering; dismissal scopes to that invitation', () => {
  const iv = view('invitation-offered').invitation;
  let state = reduce(initialState(), { type: 'invitation', invitation: iv });
  const shown = invitationOf(state);
  assert.deepEqual(shown.choices.map(c => c.label), ['Explain on canvas', 'Just keep it here']);
  assert.deepEqual(shown.sourceKeys, iv.sourceKeys);
  assert.equal(shown.text, `You’ve added **${iv.title}**. Would you like me to explain it on the canvas?`);
  assert.equal(invitationOf(state, { typing: true })?.id, iv.id, 'no indefinite typing deferral (UI.01)');
  state = reduce(state, { type: 'dismissed', id: iv.id });
  assert.equal(invitationOf(state), null);
  assert.equal(invitationOf(reduce(state, { type: 'invitation', invitation: iv })), null, 'reload does not re-prompt the same invitation');
  const second = { ...iv, id: 'iv_other00000000000000000000' };
  assert.ok(invitationOf(reduce(state, { type: 'invitation', invitation: second })), 'a different invitation is offered normally');
  assert.equal(state.flag, 'on'); // dismissal changes nothing global
  assert.equal(invitationOf(reduce(initialState(), { type: 'invitation', invitation: null, suppressed: view('invitation-suppressed').suppressed })), null);
});

test('an invitation is not shown over an unfinished roadmap', () => {
  assert.equal(invitationOf(reduce(withView('status-active-proposal-pending'), { type: 'invitation', invitation: view('invitation-offered').invitation })), null);
});

test('409: the response replaces local state with the current view and shows the plain sentence', () => {
  const held = withView('status-active-proposal-pending');
  assert.equal(held.view.roadmap.revision, 7);
  const next = reduce(held, { type: 'conflict', current: view('error-stale-409').current });
  assert.equal(next.view.roadmap.revision, 8);
  assert.equal(next.view.proposal.state, 'accepted');
  assert.equal(next.notice, 'This roadmap changed. Showing the latest.');
  assert.equal(pillOf(next), null, 'nothing left to accept');
  assert.equal(chatOf(next)[0].text, STRINGS.stale);
});

test('stale-version display: a slow older poll never rolls the screen back', () => {
  const newest = reduce(withView('status-active-proposal-pending'), { type: 'view', view: view('accept-proposal-response-generating') });
  assert.equal(newest.view.roadmap.revision, 8);
  assert.equal(reduce(newest, { type: 'view', view: view('status-active-proposal-pending') }).view.roadmap.revision, 8);
  assert.equal(reduce(newest, { type: 'view', view: view('status-delivered-next-ready') }).view.roadmap.revision, 10);
});

test('insufficient credits: the response sentence is shown, the proposal stays pending and acceptable', () => {
  const body = view('error-insufficient-allowance');
  const state = reduce(withView('status-active-proposal-pending'), { type: 'refused', message: body.error, current: body.current });
  assert.equal(state.notice, body.error);
  assert.equal(pillOf(state).accept, true);
});

test('flag off (404 roadmap_disabled): all roadmap UI disappears', () => {
  const state = reduce(withView('status-active-proposal-pending'), { type: 'flag_off' });
  assert.equal(tocOf(state), null); assert.equal(pillOf(state), null); assert.deepEqual(chatOf(state), []);
  assert.equal(reduce(state, { type: 'view', view: view('status-active-proposal-pending') }).flag, 'on', 'a served view restores the UI when the flag returns');
});

test('accept busy latch: a second gesture on the same proposal version is not accept-ready', () => {
  let state = withView('status-active-proposal-pending');
  const { gesture } = pillOf(state);
  state = reduce(state, { type: 'begin', gesture });
  assert.equal(pillOf(state).accept, false);
  state = reduce(state, { type: 'end', gesture });
  assert.equal(pillOf(state).accept, true);
});

const key = (over = {}) => ({ key: 'Tab', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, repeat: false, isComposing: false, keyCode: 9, ...over });
test('Tab ownership truth table (D18)', () => {
  const pill = pillOf(withView('status-active-proposal-pending'));
  const ok = { event: key(), pill };
  assert.equal(tabAccepts(ok), true);
  const no = [
    ['shift', { event: key({ shiftKey: true }) }], ['ctrl', { event: key({ ctrlKey: true }) }], ['meta', { event: key({ metaKey: true }) }], ['alt', { event: key({ altKey: true }) }],
    ['repeat', { event: key({ repeat: true }) }], ['ime', { event: key({ isComposing: true }) }], ['229', { event: key({ keyCode: 229 }) }],
    ['other key', { event: key({ key: 'Enter' }) }], ['no pill', { pill: null }], ['accept in flight', { pill: { ...pill, accept: false } }],
    ['field/composer/dialog/menu/widget', { blocked: true }], ['editor open', { editorOpen: true }], ['presenting', { presenting: true }], ['read-only', { readOnly: true }],
  ];
  for (const [name, over] of no) assert.equal(tabAccepts({ ...ok, ...over }), false, name);
});

test('idempotent delivery: the same minted card is inserted once however often deliver runs (reload, second device, lost ack)', () => {
  const body = view('result-deliver-response');
  const board = new Set();
  const run = () => { const plan = planDelivery(body, id => board.has(id)); plan.insert.forEach(b => board.add(b.id)); return plan; };
  const first = run(), again = run(), reload = run();
  assert.equal(first.insert.length, 1); assert.equal(again.insert.length, 0); assert.equal(reload.insert.length, 0);
  assert.deepEqual(again.cardIds, ['cd_71e20ac49f8b3d5612a7c0e4']);
  assert.equal(again.ackRequired, true, 'a lost acknowledgement is re-sent, not a new purchase');
  assert.equal(first.insert[0].id, body.cards[0].slot.cardId, 'server-minted id, never a client one');
  assert.equal(planDelivery({ cards: [] }, () => false).ackRequired, false);
});

test('deliverable results: generated, not held, not yet delivered', () => {
  assert.equal(deliverable(view('accept-proposal-response-generating')).length, 0, 'still generating');
  assert.equal(deliverable(view('status-held-for-checking')).length, 0, 'held');
  assert.equal(deliverable(view('status-delivered-next-ready')).length, 0, 'delivered');
  assert.equal(deliverable(view('status-failed-card')).length, 0, 'failed');
  const generated = clone(view('status-held-for-checking')); delete generated.results[0].held;
  assert.equal(deliverable(generated).length, 1);
});

test('failed card: its sentence comes from the server once (the existing error toast), with no recovery actions; the next step can follow (owner 2026-11-06: no Retry, Replace or Omit on explanation cards)', () => {
  const state = withView('status-failed-card');
  assert.equal(chatOf(state).some(l => l.kind === 'recovery'), false, 'no recovery block in Chat');
  assert.deepEqual(failuresOf(state.view), [{ resultId: state.view.results[0].id, stepId: state.view.results[0].stepId, message: 'This explanation could not be made. You were not charged.' }]);
  assert.equal('recovery' in tocOf(state), false);
  assert.equal(canProposeNext(state), true, 'a failed card closed its step: Propose next step is offered');
});

// UI.02 / BE.04: the ToC carries the ACCEPTED roadmap only: no draft, parameters, stopping point or actions; steps with description and status.
test('ToC: accepted plan only, no draft leak, no actions; steps with descriptions and status; navigation only where something exists', () => {
  assert.equal(tocOf(withView('status-proposed-plan')), null, 'a draft stays in Chat');
  const active = tocOf(withView('status-active-proposal-pending'));
  assert.deepEqual(Object.keys(active).sort(), ['roadmapId', 'state', 'steps']);
  assert.ok(active.steps.every(s => s.description && s.status && s.format));
  const pending = withView('status-active-proposal-pending');
  const revising = reduce(initialState(), { type: 'view', view: { ...pending.view, planDraft: { version: 9, steps: [{ position: 1, title: 'Draft-only step' }] } } });
  assert.deepEqual(tocOf(revising).steps.map(s => s.title), active.steps.map(s => s.title), 'a revision draft never replaces the accepted tree');
  assert.deepEqual(active.steps.map(s => s.nav?.kind ?? null), ['proposal', null, null]);
  const delivered = tocOf(withView('status-delivered-next-ready'));
  assert.deepEqual(delivered.steps.map(s => s.nav?.kind ?? null), ['card', 'proposal', null]);
  assert.equal(delivered.steps[0].nav.cardId, 'cd_71e20ac49f8b3d5612a7c0e4');
});

test('manual progression: Propose next step after Cancel; blocked while one is offered or at the ceiling; End roadmap offered while unfinished', () => {
  const paused = withView('status-cancelled-paused');
  assert.equal(canProposeNext(paused), true);
  assert.deepEqual(chatOf(paused).map(l => l.text), [STRINGS.cancelled, STRINGS.paused]);
  assert.equal(canProposeNext(withView('status-delivered-next-ready')), false, 'a proposal is already offered');
  const atCeiling = { ...paused, view: { ...paused.view, roadmap: { ...paused.view.roadmap, deliveredCount: paused.view.roadmap.ceiling } } };
  assert.equal(canProposeNext(atCeiling), false);
  assert.equal(canProposeNext(withView('status-completed')), false);
  assert.equal(chatOf(withView('status-completed')).at(-1).text, STRINGS.completed);
});

test('questioning and limitation fixtures: one question with options; oversize source says so and offers a scope', () => {
  assert.equal(chatOf(withView('status-questioning')).find(l => l.kind === 'question').options.length, 2);
  const l = chatOf(withView('status-limitation')).find(x => x.kind === 'limitation');
  assert.match(l.text, /longer than one roadmap can read completely/);
  assert.deepEqual(l.offers.map(o => o.label), ['Select a passage', 'Pick a section']);
});

test('hover step label comes from the private index, not the card', () => {
  const v = view('status-delivered-next-ready');
  assert.equal(stepLabelFor(v, 'cd_71e20ac49f8b3d5612a7c0e4'), 'Step 1 of 3');
  assert.equal(stepLabelFor(v, 'cd_unknown'), null);
});

test('wire shapes match the recorded request fixtures key for key', () => {
  const keys = o => Object.keys(o).sort();
  const pending = view('status-active-proposal-pending');
  const accept = routes.acceptProposal(pending, 'ak_accept_0001');
  assert.deepEqual(keys(accept.body), keys(fx('accept-proposal-request').request));
  assert.equal(accept.path, `/api/learn/roadmap/${pending.roadmap.id}/proposals/${pending.proposal.id}/accept`);
  assert.equal(accept.body.revision, 7);
  assert.deepEqual(keys(routes.acceptPlan(view('status-proposed-plan'), 'ak_acceptplan_0001').body), keys(fx('accept-plan-request').request));
  assert.deepEqual(keys(routes.end(pending, 'ak_end_0001').body), keys(fx('end-request').request));
  assert.deepEqual(keys(routes.dismiss('lb_1', 'iv_1', 'ak_dismiss_0001').body), keys(fx('invitation-dismiss').request));
  const result = view('accept-proposal-response-generating').results[0];
  assert.deepEqual(keys(routes.ack(pending, result, result.slot.cardId, 41, 'ak_ack_0001').body), keys(fx('result-ack-request').request));
  assert.deepEqual(keys(routes.revise(pending, { instruction: 'x', settings: { depth: 'overview' } }, 'ak_revise_0001').body), keys(fx('revise-request').request));
});

test('action keys: one per gesture, stable across retries, fresh after the server answered, valid for CLIENT_KEY', () => {
  let n = 0;
  const keys = actionKeys(() => `uuid-${++n}-aaaaaaaa`);
  const a = keys.for('accept:pr:1');
  assert.equal(keys.for('accept:pr:1'), a);
  assert.match(a, /^[A-Za-z0-9_-]{8,128}$/);
  keys.done('accept:pr:1');
  assert.notEqual(keys.for('accept:pr:1'), a);
});

test('idle grouping: sources ready in one idle window go out as one report; nothing is sent while typing or answering', () => {
  let idle = false; const sent = [];
  const g = idleGrouper({ isIdle: () => idle, report: r => sent.push(r) });
  g.ready('file:fs_b'); g.ready('file:fs_a'); g.ready('file:fs_a');
  assert.equal(g.tick(), false); assert.equal(sent.length, 0);
  idle = true;
  assert.equal(g.tick(), true);
  assert.deepEqual(sent[0].sourceKeys, ['file:fs_a', 'file:fs_b']);
  assert.match(sent[0].idleKey, /^[A-Za-z0-9_-]+$/);
  assert.equal(g.tick(), false, 'one report per window');
});

test('a dropped Markdown card is a ready source only once its stored revision is in the saved board', () => {
  const card = (id, source) => ({ id, type: 'file', kind: 'markdown', fileRef: { source } });
  const stored = { id: 'fs_aaaaaaaaaaaaaaaaaaaaaaaa', rev: 'a'.repeat(64) };
  const pending = new Set(['b1']);
  assert.deepEqual(readyMarkdownSources({ pending, blocks: [card('b1', null)], savedBlocks: [card('b1', null)] }), [], 'still uploading');
  assert.deepEqual(readyMarkdownSources({ pending, blocks: [card('b1', stored)], savedBlocks: [card('b1', null)] }), [], 'stored, but the saved board does not name it yet');
  assert.deepEqual(readyMarkdownSources({ pending, blocks: [card('b1', stored)], savedBlocks: [] }), [], 'not saved at all');
  assert.deepEqual(readyMarkdownSources({ pending, blocks: [card('b1', stored)], savedBlocks: [card('b1', { ...stored, rev: 'b'.repeat(64) })] }), [], 'the saved board names another revision');
  assert.deepEqual(readyMarkdownSources({ pending, blocks: [card('b1', stored)], savedBlocks: [card('b1', stored)] }), [{ blockId: 'b1', key: 'file:fs_aaaaaaaaaaaaaaaaaaaaaaaa', rev: stored.rev }]);
  assert.deepEqual(readyMarkdownSources({ pending: new Set(), blocks: [card('b9', stored)], savedBlocks: [card('b9', stored)] }), [], 'a card that was not just dropped (reload, older card) is never reported');
  assert.deepEqual(readyMarkdownSources({ pending: new Set(['t1']), blocks: [{ ...card('t1', stored), kind: 'text' }], savedBlocks: [{ ...card('t1', stored), kind: 'text' }] }), [], 'only Markdown is a supported source');
});

test('acceptPlan binds the displayed draft version (contracts.md draft.version), falling back to the plan version', () => {
  const v = withView('status-proposed-plan').view;
  assert.equal(routes.acceptPlan(v, 'ak_1').body.planVersion, v.roadmap.planVersion);
  assert.equal(routes.acceptPlan({ ...v, planDraft: { version: 7 } }, 'ak_1').body.planVersion, 7);
  assert.equal(draftOf(v).version, v.plan.version, 'before acceptance the plan is the draft');
  assert.equal(acceptedPlanOf(v), null);
  const active = withView('status-active-proposal-pending').view;
  assert.equal(draftOf(active), null);
  assert.equal(acceptedPlanOf(active).version, active.plan.version);
  assert.equal(acceptedPlanOf({ ...active, acceptedPlan: null }), null, 'an explicit field wins');
});

// --- Fix A: Tab through the real acceptance sequence, the indicator once the server field is true, honest acknowledgement ---------
test('Tab while the accept is in flight still belongs to the proposal (no focus jump), but it never asks for a second accept', () => {
  let state = withView('status-active-proposal-pending');
  const { gesture } = pillOf(state);
  state = reduce(state, { type: 'begin', gesture });
  const pill = pillOf(state);
  assert.equal(pill.accept, false);
  assert.equal(pill.accepting, true);
  const ctx = over => ({ event: key(), pill, blocked: false, editorOpen: false, presenting: false, readOnly: false, ...over });
  assert.equal(tabAccepts(ctx()), true, 'Tab is swallowed, not passed to the browser');
  assert.equal(tabAccepts(ctx({ pill: { ...pill, accepting: false } })), false, 'a version that is not accept-ready and not accepting keeps normal Tab');
  assert.equal(tabAccepts(ctx({ editorOpen: true })), false, 'the editor still owns Tab');
  assert.equal(tabAccepts(ctx({ blocked: true })), false, 'a field still owns Tab');
});

test('the first proposal takes the keyboard only from nothing or from Accept plan, never from a field or another control, or while typing', () => {
  const el = (tagName, selectors = []) => ({ tagName, ownerDocument: { documentElement: {} }, matches: sel => selectors.includes(sel) });
  assert.equal(claimsFocus(null), true);
  assert.equal(claimsFocus(el('BODY')), true);
  assert.equal(claimsFocus(el('BUTTON', ['[data-roadmap-accept-plan]'])), true, 'the control that started it');
  assert.equal(claimsFocus(el('BUTTON')), false, 'another control');
  assert.equal(claimsFocus(el('TEXTAREA')), false, 'a field');
  assert.equal(claimsFocus(el('BODY'), { typing: true }), false, 'the learner started typing');
});

test('Accept roadmap reports busy at once so the Chat button shows Accepting and refuses a second press', () => {
  let state = withView('status-proposed-plan');
  const gesture = `plan:${state.view.roadmap.id}:${state.view.plan.version}`;
  const accept = s => entriesOf(s).find(e => e.kind === 'draft').actions.find(a => a.id === 'accept_roadmap');
  assert.equal(accept(state).disabled, false);
  state = reduce(state, { type: 'begin', gesture });
  assert.equal(accept(state).disabled, true);
  assert.equal(accept(state).label, 'Accepting');
  assert.equal(pillOf(withView('status-active-proposal-pending')).accepting, false);
});

test('accepted work says what the server says in Chat: making; nothing invented', () => {
  const making = withView('accept-proposal-response-generating');
  assert.ok(chatOf(making).some(line => line.text === STRINGS.making));
  for (const text of [STRINGS.accepting, STRINGS.making]) assert.doesNotMatch(text, /\.\.\.|…|\$|credit|%/);
});

test('the natural flow: focus on Accept plan is not Tab-owned (the defect), the handoff moves it to the overlay, and there Tab is owned and allowed', () => {
  const el = (tagName, within = []) => ({ nodeType: 1, tagName, ownerDocument: { documentElement: {} }, isContentEditable: false, closest: sel => (within.some(s => sel.includes(s)) ? {} : null), matches: sel => within.includes(sel) });
  const acceptPlan = el('BUTTON', ['[data-roadmap-accept-plan]', '[role="tabpanel"]']);
  assert.equal(keyboardOwned(acceptPlan), false, 'Tab from the initiating control moved focus on instead of accepting');
  assert.equal(claimsFocus(acceptPlan), true);
  const overlay = el('SECTION', ['[data-roadmap-overlay]']);
  assert.equal(keyboardOwned(overlay), true);
  assert.equal(pageKeyAllowed(key(), overlay), true);
  assert.equal(pageKeyAllowed(key(), el('TEXTAREA', ['[data-chat-composer]'])), false, 'the Chat composer keeps its Tab');
});

// UI.04/05/08: the first offer is Accept, a later one Next card; both are the same acceptance (gesture, route, version) the canvas, Chat and eligible Tab share.
test('pillOf: first offer Accept, a later one Next card, one gesture and route for every surface', () => {
  const first = pillOf(withView('status-active-proposal-pending'));
  assert.deepEqual([first.next, first.label], [false, 'Accept']);
  const later = withView('status-delivered-next-ready'), pill = pillOf(later);
  assert.deepEqual([pill.next, pill.label], [true, 'Next card']);
  assert.equal(pill.gesture, `accept:${later.view.proposal.id}:${later.view.proposal.version}`);
  assert.deepEqual(routes.acceptProposal(later.view, 'ak_x').body, { boardId: later.view.roadmap.boardId, revision: later.view.roadmap.revision, proposalVersion: later.view.proposal.version, actionKey: 'ak_x' });
  assert.equal(tabAccepts({ event: { key: 'Tab' }, pill }), true, 'eligible Tab accepts the same Next card offer');
});
