// Ordered state transitions for a schema 2 (stateful) program card (plan Task 8.2). Pure: no React, no DOM. It owns the committed
// state and the event queue; the host (host.js) runs every operation in the isolated interpreter.
//
// - Events apply one at a time, in the order dispatched, each to the state the previous one produced. None is dropped: when the queue
//   is full (cap), dispatch returns false so the card can hold the control back, instead of growing without bound.
// - Only consecutive queued changes of the same input coalesce (the newest value wins), and consecutive moves of one drag (its end
//   replaces a waiting move); nothing coalesces across another event.
// - A new state, an initial one and a reset's included, is committed only after its own frame was also valid (check, with the inputs
//   and time it was computed for): a state the program cannot draw is never kept, so it can never be saved and break the card on
//   reload. A failed operation, a failed reset included, keeps the last accepted state.
// - A result applies only to the state it was computed from and the generation (reset, dispose) it was asked in.
// - Reset and a missing or incompatible saved state initialize again with the original seed. A saved state (programStateFor) is
//   rehydrated as it is: a restart is not a replay and calls no initialize.
//   createInteractionController({ host, bundleHash, seed, saved, publish(envelope, { initial, event? }), persist(envelope, { reset }), fail(error), check(envelope, { inputs, time }) })
//     .start(inputs, { time })  .dispatch(event, { inputs, time }) -> boolean  .reset(inputs)  .current() -> envelope | null  .dispose()
// The envelope is what the card keeps (block.programState): { bundleHash, state, revision, seed, inputs }. Never source.
import { normalizeFrame } from './frame.js';
import { evaluateRequestFor } from './program-card.js';

export const ACTION_QUEUE_CAP = 16;

// The one validation rule for a state, used by the card (use-program-state.js) and by the review replay: its frame at the inputs and
// time it was computed for, evaluated through the same host (never superseded) and normalised. Throws the contract error; returns the frame.
export async function checkStateFrame({ host, manifest, block = {}, inputs, time = 0, state, requestId }) {
  const reply = await host.evaluate(evaluateRequestFor(manifest, { ...block, inputs }, time, requestId, state), { supersede: false });
  const view = normalizeFrame(reply.frame, manifest);
  if (!view.ok) throw view.error;
  return { reply, view };
}

// The review's replay of one sampled sequence (render/program-render.jsx), the card's path step by step: initialize, then each event in
// order, and every state, the initial one included, checked by checkStateFrame before the next event, so a sequence the learner could not
// get through never passes review. As on the card, an input event carries the inputs with the new value (its reduce and everything after
// see them), and { type: 'reset' } (review only, never a program event) is the card's Reset: initialize again with the default inputs.
// -> { state, inputs, reply, view } of the final state; a failure carries replayStep (0 = the initial state) and replayPhase (initialize,
// reduce or evaluate).
export async function replayTransitions({ host, manifest, inputs: defaults, seed, time = 0, events = [] }) {
  let step = 0, phase = 'initialize', inputs = defaults;
  try {
    let { state } = await host.initialize({ requestId: 'i', inputs, seed });
    phase = 'evaluate';
    let checked = await checkStateFrame({ host, manifest, block: { seed }, inputs, time, state, requestId: 'c0' });
    for (const event of events) {
      step += 1;
      if (event?.type === 'reset') {
        phase = 'initialize';
        inputs = defaults;
        ({ state } = await host.initialize({ requestId: `i${step}`, inputs, seed }));
      } else {
        phase = 'reduce';
        if (event?.type === 'input') inputs = { ...inputs, [event.input]: event.value };
        ({ state } = await host.reduce({ requestId: `r${step}`, state, event, inputs, time, seed }));
      }
      phase = 'evaluate';
      checked = await checkStateFrame({ host, manifest, block: { seed }, inputs, time, state, requestId: `c${step}` });
    }
    return { state, inputs, ...checked };
  } catch (error) {
    throw Object.assign(error, { replayStep: step, replayPhase: phase });
  }
}

export function createInteractionController({ host, bundleHash, seed, saved = null, publish, persist = () => {}, fail = () => {}, check = async () => {}, cap = ACTION_QUEUE_CAP }) {
  let committed = null, queue = [], busy = false, dead = false, generation = 0, count = 0, openDrag = null; // openDrag: the admitted drag whose end is still to come
  const requestId = () => `s${++count}`;
  // inputs: the snapshot the state was computed and checked with; the card draws the state with these, never with newer ones.
  const envelope = (state, revision, inputs) => ({ bundleHash, state, revision, seed, inputs });
  const failed = (error, mine) => { if (!dead && mine === generation && error?.name !== 'AbortError') { queue = []; openDrag = null; fail(error); } };

  // check(next, { inputs, time }) runs before anything is replaced: a state that fails it is never published or saved, so a failed
  // reset keeps the last good state, in memory and as saved.
  async function initialize(inputs, { time = 0, reset = false } = {}) {
    const mine = ++generation;
    queue = [];
    openDrag = null;
    busy = true;
    try {
      const reply = await host.initialize({ requestId: requestId(), inputs, seed });
      if (dead || mine !== generation) return;
      const next = envelope(reply.state, committed ? committed.revision + 1 : 0, inputs); // revisions only grow, so an older frame never matches
      await check(next, { inputs, time });
      if (dead || mine !== generation) return;
      committed = next;
      publish(next, { initial: true });
      if (reset) persist(next, { reset: true });
    } catch (error) { failed(error, mine); } finally { if (mine === generation) { busy = false; pump(); } }
  }

  async function pump() {
    if (busy || dead || !committed || !queue.length) return;
    const mine = generation, base = committed, { event, inputs, time } = queue.shift();
    busy = true;
    try {
      const reply = await host.reduce({ requestId: requestId(), state: base.state, event, inputs, time, seed });
      if (dead || mine !== generation) return;
      const next = envelope(reply.state, base.revision + 1, inputs);
      await check(next, { inputs, time });
      if (dead || mine !== generation) return;
      committed = next;
      publish(next, { initial: false, event }); // event: the learner event this transition committed (Tutor context, FX-61)
      persist(next, { reset: false });
    } catch (error) { failed(error, mine); } finally { if (mine === generation) { busy = false; pump(); } }
  }

  return {
    start(inputs, { time = 0 } = {}) {
      if (saved) { committed = saved; publish(saved, { initial: false }); return; }
      initialize(inputs, { time });
    },
    dispatch(event, { inputs, time = 0 }) {
      if (dead) return false;
      const last = queue[queue.length - 1];
      if (event?.type === 'input' && last?.event.type === 'input' && last.event.input === event.input) { queue[queue.length - 1] = { event, inputs, time }; return true; }
      // A drag's moves merge into the newest one, and its end takes the place of a waiting move (it carries the final point). A start is
      // admitted only with room for its end, and from then until its end is queued one slot stays reserved for that end, whatever else
      // arrives meanwhile: an admitted drag always ends, in order, and the queue never passes the cap.
      const ending = event?.type === 'drag_end' && event.target === openDrag;
      const sameDrag = last?.event.type === 'drag_move' && last.event.target === event?.target;
      if ((event?.type === 'drag_move' || event?.type === 'drag_end') && sameDrag) { queue[queue.length - 1] = { event, inputs, time }; if (ending) openDrag = null; return true; }
      const free = cap - queue.length - (openDrag !== null && !ending ? 1 : 0);
      if (free < (event?.type === 'drag_start' ? 2 : 1)) return false;
      queue.push({ event, inputs, time });
      if (event?.type === 'drag_start') openDrag = event.target;
      else if (ending) openDrag = null;
      pump();
      return true;
    },
    reset(inputs) { if (!dead) initialize(inputs, { reset: true }); },
    current: () => committed,
    pending: () => queue.length,
    dispose() { dead = true; queue = []; },
  };
}
