// Task 03 (C:/s/spec/tutor-workflow/draft.md; owner decisions 1a, 3a, 4a): the browser side of the personal Tutor controls -
// the save queue against a fake /api/learn/coaching that applies the same reducer the Worker does, the Chat's mode under the
// canvas controls, the hooks gate and the guided Rabbit Hole opening. No network, no model. Browser checks:
// e2e/tutor-controls-check.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { reduceTutorControls } from './learn-coaching-contract.js';
import { controlsNote, createCoachingSync, effectiveControls, guidedOpening, threadWithControls } from './learn-coaching-client.js';
import { askMode, tutorTurn } from './chat-route.js';
import { gateHooks, holeOpening, hooksTrigger, nextStepsController } from './learn-next-steps.js';
import { markGuidedEntry } from './learn-opening.js';
import { emptyStore } from './learn-tutor-evidence.js';
import { NANOGPT } from './learn-tutor-claims.js';

const APP = 'canvas-0a1b2c3d', SCOPE = { app: APP, board: 'main' };
const tick = async (n = 6) => { for (let i = 0; i < n; i += 1) await new Promise(resolve => setImmediate(resolve)); };
const refusal = (status, data) => Object.assign(new Error(data.error), { status, data });

// The route's save_controls as learn-coaching-store.js applies it: replay by actionId, expectedRevision, the shared reducer.
function fakeServer(controls = {}, { fail = 0 } = {}) {
  const box = { state: { controls: { mode: 'auto', tutorEnabled: true, suggestionsPaused: false, revision: 0, ...controls }, goals: [], revision: controls.revision ?? 0 }, last: null, posts: [], gets: 0, fail };
  box.state.controls.revision = box.state.revision;
  box.call = async (path, init) => {
    if (!init) { box.gets += 1; return { state: structuredClone(box.state) }; }
    const body = JSON.parse(init.body);
    box.posts.push(body);
    if (box.fail > 0) { box.fail -= 1; throw Object.assign(new Error('Rabbit Hole could not be reached.'), { status: 0 }); }
    if (body.actionId === box.last) return { state: structuredClone(box.state), effects: [], replayed: true };
    if (body.expectedRevision !== box.state.revision) throw refusal(409, { error: 'revision', state: structuredClone(box.state) });
    const step = reduceTutorControls(box.state.controls, body.payload.event);
    if (step.rejected === 'stale_revision') throw refusal(409, { error: 'undo_stale', state: structuredClone(box.state) });
    if (step.rejected) throw refusal(400, { error: 'event is not a valid control event' });
    if (step.state === box.state.controls) return { state: structuredClone(box.state), effects: [] };
    box.state = { ...box.state, controls: step.state, revision: step.state.revision };
    box.last = body.actionId;
    return { state: structuredClone(box.state), effects: step.effects };
  };
  // Another tab or device saving directly.
  box.elsewhere = event => { const step = reduceTutorControls(box.state.controls, event); box.state = { ...box.state, controls: step.state, revision: step.state.revision }; };
  return box;
}
let ids = 0;
const open = async (server, scope = SCOPE) => { const sync = createCoachingSync({ scope, call: server.call, newId: () => `a${(ids += 1)}` }); await sync.start(); await tick(); return sync; };

test('off_blocks_queued_coaching: Off stops a hook already scheduled, and proactive permission ends in this tab at once', async () => {
  const server = fakeServer({ mode: 'tutor' });
  const sync = await open(server);
  assert.equal(sync.canCoach({ chatOpen: true }), true);
  const timers = [], posts = [];
  const ctl = nextStepsController({ post: async input => { posts.push(input); return null; }, setTimer: (fn, ms) => timers.push({ fn, ms }), clearTimer: () => {} });
  const memory = {}, full = { basis: 'nb_aaaa0001', stop: null };
  const gate = trigger => gateHooks(memory, full, { allowed: sync.canCoach({ chatOpen: true }), visible: true, trigger });
  ctl.update({ ...gate(hooksTrigger({})), input: () => ({ input: {} }) });
  assert.equal(timers.length, 0, 'opening in Tutor On asks nothing: the baseline');
  ctl.update({ ...gate(hooksTrigger({ lastTurn: { turn_id: 't1' } })), input: () => ({ input: {} }) });
  assert.equal(timers.length, 1, 'a finished learner turn schedules one request');
  sync.dispatch({ type: 'set_tutor_enabled', enabled: false });
  assert.equal(sync.canCoach({ chatOpen: true }), false, 'Off applies in this tab before the save returns');
  ctl.update({ ...gate(hooksTrigger({ lastTurn: { turn_id: 't1' } })), input: () => ({ input: {} }) });
  await timers.at(-1).fn?.();
  assert.deepEqual([posts.length, ctl.view().status, ctl.view().reason], [0, 'unavailable', 'off'], 'the queued request is never sent');
  await tick();
  assert.equal(server.state.controls.tutorEnabled, false, 'and Off is saved');
});

// Owner 3a: "loading saved content, moving cards, changing the title and inserting Tutor-generated material must not create
// refresh loops"; a refresh follows only a meaningful learner change while Tutor is selected, On and unpaused.
test('hooks gate: open and restore ask nothing; a rename, moved or Tutor-made cards never re-ask; a learner turn asks once', () => {
  const memory = {}, gate = (basis, trigger, allowed = true, visible = true) => gateHooks(memory, { basis, stop: null }, { allowed, visible, trigger });
  const rest = hooksTrigger({ journey: { journey: { evidence: { seq: 4 }, active_section_id: 's1' }, path: { version: 2 } }, canvasState: { attempts: 1 }, graded: 0 });
  assert.deepEqual(gate('nb_open', rest), { basis: null, stop: 'at_rest' }, 'opening in Tutor On: zero requests');
  assert.deepEqual(gate('nb_renamed', rest), { basis: null, stop: 'at_rest' }, 'a rename, a loaded board, a moved or Tutor-made card: still at rest');
  const turned = hooksTrigger({ lastTurn: { turn_id: 't1' }, journey: { journey: { evidence: { seq: 4 }, active_section_id: 's1' }, path: { version: 2 } }, canvasState: { attempts: 1 } });
  assert.deepEqual(gate('nb_after_turn', turned), { basis: 'nb_after_turn', stop: null }, 'a finished learner turn asks');
  assert.deepEqual(gate('nb_cards_landed', turned), { basis: 'nb_after_turn', stop: null }, 'material the Tutor inserted after it never re-asks');
  assert.deepEqual(gate('nb_cards_landed', turned, true, false), { basis: 'nb_after_turn', stop: 'hidden' }, 'Chat closed: held back, baseline kept');
  assert.deepEqual(gate('nb_x', turned, false), { basis: null, stop: 'off' }, 'Auto, Ask, Off or paused: none');
  assert.deepEqual(gate('nb_back_on', turned), { basis: null, stop: 'at_rest' }, 'switching On again starts at rest');
  assert.notEqual(hooksTrigger({ canvasState: { attempts: 2 } }), hooksTrigger({ canvasState: { attempts: 1 } }), 'a practice attempt is a learner change');
  assert.equal(hooksTrigger({ canvasState: { attempts: 1, cards: [['k1']], title: 'Renamed' } }), hooksTrigger({ canvasState: { attempts: 1, cards: [['k1'], ['k2']] } }), 'cards and titles are not triggers');
});

// Owner brief 2026-10-21 message 25 item 2 (View > Curious): hidden asks nothing, learner turns included; shown again, the saved
// set is back with no request; with none saved, an empty state whose explicit request asks once; Off and paused still win.
test('curious hidden: no request on learner turns; shown again: the saved set, no request; none saved: empty until asked once', async () => {
  const timers = [], posts = [];
  const SET = { set_id: 's1', generated_at: 't', options: ['a', 'b', 'c'].map(id => ({ id, hook: `hook ${id}`, selected_next_step: { learning_goal: id } })) };
  const ctl = nextStepsController({ post: async input => { posts.push(input); return structuredClone(SET); }, setTimer: (fn, ms) => timers.push({ fn, ms }), clearTimer: () => {} });
  const run = async () => { while (timers.length) await timers.shift().fn(); await tick(); };
  const memory = {};
  const step = async (basis, turn, { shown = true, allowed = true, ask = false } = {}) => {
    if (ask) memory.ask = true;
    const gated = gateHooks(memory, { basis, stop: null }, { allowed, visible: true, shown, trigger: hooksTrigger({ lastTurn: turn ? { turn_id: turn } : null }) });
    ctl.update({ ...gated, input: () => ({ input: { basis } }) });
    await run();
    return gated;
  };
  await step('nb_open', null);
  await step('nb_t1', 't1');
  assert.deepEqual([posts.length, ctl.view().status], [1, 'ready'], 'a learner turn with Curious shown asks once');
  assert.deepEqual(await step('nb_t1', 't1', { shown: false }), { basis: 'nb_t1', stop: 'curious_hidden' });
  await step('nb_t2', 't2', { shown: false });
  await step('nb_t3', 't3', { shown: false });
  assert.equal(posts.length, 1, 'hidden: two more learner turns ask nothing');
  assert.deepEqual(await step('nb_t3', 't3'), { basis: 'nb_t1', stop: null }, 'shown again: the saved basis');
  assert.deepEqual([posts.length, ctl.view().status, ctl.view().options.map(o => o.hook)], [1, 'ready', ['hook a', 'hook b', 'hook c']], 'the saved set, no request');
  await step('nb_t4', 't4');
  assert.equal(posts.length, 2, 'the next learner turn after that follows the usual rules');
  assert.deepEqual(await step('nb_t4', 't4', { allowed: false }), { basis: null, stop: 'off' }, 'Tutor Off or paused');
  assert.deepEqual(await step('nb_t4', 't4', { allowed: false, shown: false }), { basis: null, stop: 'off' });
  assert.deepEqual(await step('nb_t4', 't4', { allowed: false }), { basis: null, stop: 'off' }, 'shown never bypasses Off or paused');

  // None saved: hidden from the start (a fresh mount), learner turns while hidden, then shown: the empty state; only its ask asks.
  const fresh = {}, freshPosts = [], freshTimers = [];
  const ctl2 = nextStepsController({ post: async input => { freshPosts.push(input); return structuredClone(SET); }, setTimer: (fn, ms) => freshTimers.push({ fn, ms }), clearTimer: () => {} });
  const step2 = async (basis, turn, shown, ask = false) => {
    if (ask) fresh.ask = true;
    const gated = gateHooks(fresh, { basis, stop: null }, { allowed: true, visible: true, shown, trigger: hooksTrigger({ lastTurn: turn ? { turn_id: turn } : null }) });
    ctl2.update({ ...gated, input: () => ({ input: { basis } }) });
    while (freshTimers.length) await freshTimers.shift().fn();
    await tick();
    return gated;
  };
  await step2('nb_open', null, false);
  await step2('nb_t1', 't1', false);
  assert.deepEqual(await step2('nb_t1', 't1', true), { basis: null, stop: 'curious_empty' }, 'shown with nothing saved: the empty state');
  assert.deepEqual([freshPosts.length, ctl2.view().status, ctl2.view().reason], [0, 'unavailable', 'curious_empty']);
  assert.deepEqual(await step2('nb_t1', 't1', true, true), { basis: 'nb_t1', stop: null }, 'its explicit request');
  assert.deepEqual([freshPosts.length, ctl2.view().status], [1, 'ready'], 'one request, only on that click');
  await step2('nb_t1', 't1', true);
  assert.equal(freshPosts.length, 1, 'never a second for the same basis');
});

test('ask_restores_saved_tutor_preference: Auto and Ask suspend coaching and keep On/Off and the pause; Tutor restores them', async () => {
  const server = fakeServer({ mode: 'tutor', tutorEnabled: false, suggestionsPaused: true });
  const sync = await open(server);
  for (const mode of ['ask', 'auto']) {
    sync.dispatch({ type: 'select_mode', mode });
    await tick();
    assert.deepEqual([server.state.controls.mode, server.state.controls.tutorEnabled, server.state.controls.suggestionsPaused, sync.canCoach({ chatOpen: true })], [mode, false, true, false]);
  }
  sync.dispatch({ type: 'select_mode', mode: 'tutor' });
  await tick();
  const { controls } = sync.view();
  assert.deepEqual([controls.mode, controls.tutorEnabled, controls.suggestionsPaused], ['tutor', false, true], 'the saved Off and pause come back with Tutor');
  assert.equal(server.posts.every(post => post.action === 'save_controls'), true, 'control saves only: nothing else is asked');
});

test('not_now_survives_reload: Not now stays On and paused after a reload; Resume clears it once', async () => {
  const server = fakeServer({ mode: 'tutor' });
  const first = await open(server);
  first.dispatch({ type: 'not_now' });
  await tick();
  first.stop();
  const reloaded = await open(server);
  const { controls } = reloaded.view();
  assert.deepEqual([controls.tutorEnabled, controls.suggestionsPaused, reloaded.canCoach({ chatOpen: true })], [true, true, false]);
  assert.deepEqual(controlsNote({ ...reloaded.view(), controls }), { tone: 'info', text: 'Suggestions paused.', action: 'resume' });
  reloaded.dispatch({ type: 'resume' });
  await tick();
  assert.deepEqual([server.state.controls.suggestionsPaused, reloaded.canCoach({ chatOpen: true })], [false, true]);
});

test('thread_restore_does_not_flip_canvas_controls: a thread saved in Tutor (the old syllabus) shows the canvas mode and writes nothing', async () => {
  const server = fakeServer({ mode: 'auto', tutorEnabled: false });
  const sync = await open(server);
  const coaching = { ...sync.view(), dispatch: sync.dispatch };
  const restored = { id: 't1', mode: 'tutor', setMode: () => assert.fail('the thread mode is never written'), restore: { key: 'k' } };
  const shown = threadWithControls(restored, coaching);
  assert.deepEqual([shown.mode, shown.id, shown.restore], ['auto', 't1', restored.restore]);
  await tick();
  assert.equal(server.posts.length, 0, 'restoring writes nothing');
  shown.setMode('tutor');
  await tick();
  assert.deepEqual([server.posts.length, server.state.controls.mode, server.state.controls.tutorEnabled], [1, 'tutor', false], 'picking a mode is a control event; Off is kept');
  // Without a saved record here (not a canvas, a hole not saved yet) the thread keeps its own mode, as before.
  const local = { ...coaching, status: 'local' };
  assert.equal(threadWithControls(restored, local), restored);
  assert.equal(effectiveControls(local, restored).mode, 'tutor');
});

test('undo_does_not_overwrite_newer_revision: Undo after a newer change is refused, locally or by the server', async () => {
  const server = fakeServer({ mode: 'tutor' });
  const sync = await open(server);
  sync.dispatch({ type: 'continue_own_work' });
  await tick();
  const { undo } = sync.view();
  assert.deepEqual([server.state.controls.tutorEnabled, undo?.revision, undo?.tutorEnabled], [false, server.state.revision, true], 'the Undo token names the revision Off made');
  assert.equal(controlsNote({ ...sync.view() }).action, 'undo');
  sync.dispatch({ type: 'select_mode', mode: 'ask' });
  await tick();
  const posts = server.posts.length;
  assert.equal(sync.dispatch({ type: 'undo', undo }).ok, false);
  await tick();
  assert.deepEqual([server.posts.length, server.state.controls.tutorEnabled, sync.view().notice], [posts, false, 'undo_stale'], 'no write; Off stays');
  // Another device changed it after Off: this tab's Undo reaches the server, which refuses it and returns the newer state.
  const other = fakeServer({ mode: 'tutor' });
  const tab = await open(other);
  tab.dispatch({ type: 'continue_own_work' });
  await tick();
  const token = tab.view().undo;
  other.elsewhere({ type: 'select_mode', mode: 'auto' });
  tab.dispatch({ type: 'undo', undo: token });
  await tick();
  assert.deepEqual([other.state.controls.tutorEnabled, other.state.controls.mode, tab.view().controls.mode, tab.view().notice], [false, 'auto', 'auto', 'undo_stale']);
});

test('a failed save is shown as this tab only, kept, and sent again on Retry; it never claims other devices stopped', async () => {
  const server = fakeServer({ mode: 'tutor' }, { fail: 1 });
  const sync = await open(server);
  sync.dispatch({ type: 'set_tutor_enabled', enabled: false });
  await tick();
  const view = sync.view();
  assert.deepEqual([view.saveStatus, view.controls.tutorEnabled, server.state.controls.tutorEnabled], ['error', false, true]);
  const note = controlsNote(view);
  assert.deepEqual(note, { tone: 'error', text: 'Not saved: this change applies in this tab only.', action: 'retry' });
  assert.doesNotMatch(note.text, /devices|everywhere|all tabs/i);
  sync.retry();
  await tick();
  assert.deepEqual([sync.view().saveStatus, server.state.controls.tutorEnabled], ['saved', false]);
  assert.equal(new Set(server.posts.map(post => post.actionId)).size, 1, 'the retry is the same action, so the server applies it once');
});

test('rapid toggles and another tab: events go up in order on the newest revision; a stale tab adopts and reapplies', async () => {
  const server = fakeServer({ mode: 'tutor' });
  const sync = await open(server);
  for (const enabled of [false, true, false, true, false]) sync.dispatch({ type: 'set_tutor_enabled', enabled });
  assert.equal(sync.view().controls.tutorEnabled, false, 'this tab shows the last choice at once');
  await tick(20);
  assert.deepEqual([server.state.controls.tutorEnabled, server.state.revision, sync.view().saveStatus], [false, 5, 'saved']);
  server.elsewhere({ type: 'select_mode', mode: 'ask' }); // another tab, unseen here
  sync.dispatch({ type: 'not_now' });
  await tick(20);
  assert.equal(sync.view().controls.tutorEnabled, false);
  // not_now is refused while Off on both sides; the stale tab took the newer mode from the 409.
  sync.dispatch({ type: 'set_tutor_enabled', enabled: true });
  await tick(20);
  assert.deepEqual([server.state.controls.mode, server.state.controls.tutorEnabled, sync.view().controls.mode], ['ask', true, 'ask']);
  // A broadcast from another tab of this canvas replaces an older state; another canvas's never does.
  const newer = { ...server.state, controls: { ...server.state.controls, suggestionsPaused: true, revision: 99 }, revision: 99 };
  sync.receive({ app: 'canvas-ffffffff', board: 'main', state: newer });
  assert.equal(sync.view().controls.suggestionsPaused, false);
  sync.receive({ ...SCOPE, state: newer });
  assert.equal(sync.view().controls.suggestionsPaused, true);
});

test('a late read for a canvas the page left is dropped; a hole not saved yet keeps its choices for this page only', async () => {
  let release;
  const slow = { call: () => new Promise(resolve => { release = resolve; }) };
  const left = createCoachingSync({ scope: SCOPE, call: slow.call });
  left.start();
  left.stop();
  release({ state: { controls: { mode: 'tutor', tutorEnabled: true, suggestionsPaused: false, revision: 3 }, goals: [], revision: 3 } });
  await tick();
  assert.deepEqual([left.view().status, left.view().controls.mode], ['loading', 'auto'], 'the earlier canvas\'s state never shows here');
  const pending = createCoachingSync({ scope: { app: 'canvas-0000beef', board: 'main' }, call: async () => { throw refusal(404, { error: 'Not found' }); } });
  await pending.start(); await tick();
  pending.dispatch({ type: 'select_mode', mode: 'tutor' });
  assert.deepEqual([pending.view().status, pending.view().controls.mode, pending.canCoach({ chatOpen: true })], ['local', 'tutor', true]);
  const failed = createCoachingSync({ scope: SCOPE, call: async () => { throw refusal(503, { error: 'coaching_unavailable' }); } });
  await failed.start(); await tick();
  assert.deepEqual([failed.view().status, failed.canCoach({ chatOpen: true }), controlsNote(failed.view()).action], ['error', false, 'retry'], 'unavailable is never an empty default');
});

// Owner 1a: Chat's Tutor is the teaching Tutor; the Table of contents keeps the syllabus.
test('mode routing: Tutor takes the Tutor workflow like Auto; Ask never does; the TOC keeps the syllabus on /api/learn/ask', () => {
  const tutor = { ask: () => {} }, chat = {};
  assert.deepEqual(['auto', 'tutor', 'ask'].map(mode => tutorTurn({ tutor, chat, mode })), [true, true, false]);
  assert.equal(tutorTurn({ tutor, chat, mode: 'tutor', toc: true }), false, 'the TOC conversation posts its held Tutor to /api/learn/ask');
  assert.equal(tutorTurn({ tutor, chat, mode: 'tutor', codeTurn: true }), false);
  assert.deepEqual([askMode('tutor'), askMode('tutor', true), askMode('ask'), askMode('auto')], ['auto', 'tutor', 'ask', 'auto'], 'only the TOC sends tutor (the syllabus)');
});

// Owner 4a with the contract's guided entry (start_guided, then GUIDED_ENTRY: selected, enabled Tutor only).
test('guided Rabbit Hole opening: one turn only from an explicit entry, and only where coaching may run', () => {
  const ctx = { chatOpen: true, ready: true };
  const tutorOn = { mode: 'tutor', tutorEnabled: true, suggestionsPaused: true, revision: 4 };
  assert.equal(guidedOpening({ own: tutorOn, context: ctx }), true, 'the guided entry clears a pause in selected, enabled Tutor');
  assert.equal(guidedOpening({ own: { ...tutorOn, tutorEnabled: false }, context: ctx }), false, 'Off: the static prompt instead');
  assert.equal(guidedOpening({ own: { ...tutorOn, mode: 'auto' }, context: ctx }), false, 'Auto: the static prompt instead');
  const fresh = { mode: 'auto', tutorEnabled: true, suggestionsPaused: false, revision: 0 };
  assert.equal(guidedOpening({ own: fresh, entry: tutorOn, context: ctx }), true, 'a new hole follows the controls it was made under');
  assert.equal(guidedOpening({ own: fresh, entry: null, context: ctx }), false);
  assert.equal(guidedOpening({ own: { ...tutorOn, suggestionsPaused: false }, context: ctx }), true);
  // holeOpening: no mark (a URL restore, a refresh in a new tab, Back, a reopen) - restored, never opened; a mark - once.
  const memory = () => { const m = new Map(); return { m, getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; };
  const s = memory(), record = { dive_id: 'canvas-0000cafe', title: 'Masks' };
  let saved = emptyStore();
  const run = () => { const out = holeOpening({ storage: s, load: () => saved, record, hookTurns: true, settled: true, active: true, domain: () => NANOGPT, mint: () => 'o1' }); if (out.store) saved = out.store; return out.opening; };
  assert.equal(run(), null, 'a reopened hole: no turn');
  assert.equal(run(), null);
  saved = emptyStore();
  markGuidedEntry(s, record.dive_id, tutorOn);
  assert.deepEqual(run(), { key: `${record.dive_id}:o1`, question: 'Take me into Masks.', entry: tutorOn });
  assert.equal(run(), null, 'once: the refresh after it finds no mark');
});

test('wiring: the Chat mode is the canvas control, the switch sits beside selected Tutor, hooks and openings go through the gate', () => {
  const read = file => readFileSync(new URL(file, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const workspace = read('./chat-workspace.jsx'), selector = read('./ModeSelector.jsx'), ask = read('./ask.jsx'), page = read('./LearnPage.jsx'), steps = read('./LearnNextSteps.jsx');
  assert.match(workspace, /const thread = useMemo\(\(\) => threadWithControls\(ownThread, coaching\)/);
  assert.match(selector, /\{mode === 'tutor' && chat\.coaching && <TutorSwitch coaching=\{chat\.coaching\} \/>\}/, 'only beside selected Tutor');
  assert.match(read('./use-learn-coaching.jsx'), /aria-label="Proactive Tutor suggestions"/);
  assert.match(ask, /mode: askMode\(chat\.thread\.mode, tocView\)/);
  assert.match(ask, /!openGuided\(chat\.coaching, chat\.thread,/);
  assert.match(page, /<NextStepsHost on=\{nextStepsHere\} coaching=\{hooksCoaching\}/);
  assert.match(steps, /gateHooks\(gate, steps\.state\(\), \{ allowed: !!coaching\?\.allowed/);
});
