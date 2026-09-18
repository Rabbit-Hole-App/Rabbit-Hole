import { registerBehavior } from './scene-engine.js';

// Reviewed behaviours. Each one owns its legal actions, its state transitions
// and how its result is produced; a new lesson reuses a behaviour with new
// data, and only a genuinely new mechanism needs a new behaviour here.

// Walk a process one step at a time. Illustration: it reveals authored steps,
// it does not compute anything.
export const walkthrough = registerBehavior({
  id: 'walkthrough_v1',
  renderers: ['svg', 'flow'],
  actions: ['advance_step', 'previous_step', 'go_to_step', 'reset_attempt'],
  start(spec) {
    const steps = spec.initialState.steps;
    if (!Array.isArray(steps) || !steps.length) throw new Error('walkthrough_v1 needs a non-empty steps array');
    for (const step of steps) {
      if (typeof step.label !== 'string' || !step.label.trim()) throw new Error('every walkthrough step needs a label');
    }
    return { step: 0, visited: [0], steps };
  },
  reduce(state, action) {
    const last = state.steps.length - 1;
    const move = index => {
      if (!Number.isInteger(index)) throw new Error('step index must be a whole number');
      if (index < 0 || index > last) throw new Error(`step ${index + 1} is outside this walkthrough`);
      return { ...state, step: index, visited: state.visited.includes(index) ? state.visited : [...state.visited, index] };
    };
    if (action.type === 'advance_step') return move(Math.min(last, state.step + 1));
    if (action.type === 'previous_step') return move(Math.max(0, state.step - 1));
    if (action.type === 'go_to_step') return move(action.index);
    if (action.type === 'reset_attempt') return { ...state, step: 0, visited: [0] };
    return state;
  },
  // Artifact completion and understanding evidence stay separate: seeing every
  // step completes the walkthrough, it does not prove understanding.
  progress(state) {
    return { complete: state.visited.length === state.steps.length, seen: state.visited.length, total: state.steps.length };
  },
  describe(state) {
    const current = state.steps[state.step];
    return {
      step: state.step + 1,
      of: state.steps.length,
      currentLabel: current.label,
      currentDetail: current.detail || null,
      highlighted: current.highlight || [],
      visitedSteps: state.visited.map(index => state.steps[index].label),
    };
  },
});

// Pull a vector, read its projection. Local calculation: the numbers below are
// computed here from the learner's own values, not scripted.
const round = value => Math.round(value * 1000) / 1000;

export function project(a, b) {
  const denominator = b[0] * b[0] + b[1] * b[1];
  // A zero-length axis has no direction to project onto; say so instead of
  // dividing by zero and drawing a plausible arrow.
  if (denominator === 0) return { defined: false, reason: 'The projection axis has zero length, so it has no direction.' };
  const scale = (a[0] * b[0] + a[1] * b[1]) / denominator;
  const vector = [scale * b[0], scale * b[1]];
  return {
    defined: true,
    scale: round(scale),
    vector: vector.map(round),
    dot: round(a[0] * b[0] + a[1] * b[1]),
    length: round(Math.hypot(vector[0], vector[1])),
  };
}

const LIMIT = 10;
const clampVector = value => {
  if (!Array.isArray(value) || value.length !== 2 || !value.every(Number.isFinite)) throw new Error('a vector needs two finite numbers');
  return value.map(component => Math.max(-LIMIT, Math.min(LIMIT, round(component))));
};

export const vectorProjection = registerBehavior({
  id: 'vector_projection_v1',
  renderers: ['svg'],
  actions: ['set_vector', 'nudge_vector', 'reset_attempt'],
  start(spec) {
    const { a, b } = spec.initialState;
    return { a: clampVector(a), b: clampVector(b), starter: { a: clampVector(a), b: clampVector(b) } };
  },
  reduce(state, action) {
    if (action.type === 'reset_attempt') return { ...state, a: [...state.starter.a], b: [...state.starter.b] };
    const target = action.target;
    if (target !== 'a' && target !== 'b') throw new Error('only vectors a and b can change');
    if (action.type === 'set_vector') return { ...state, [target]: clampVector(action.value) };
    if (action.type === 'nudge_vector') {
      const axis = action.axis === 'y' ? 1 : 0;
      const next = [...state[target]];
      if (!Number.isFinite(action.by)) throw new Error('nudge needs a finite amount');
      next[axis] = next[axis] + action.by;
      return { ...state, [target]: clampVector(next) };
    }
    return state;
  },
  // Moving the handle is not building: the artifact is complete once the
  // learner has produced a projection that is defined and not the zero vector.
  progress(state) {
    const result = project(state.a, state.b);
    return { complete: result.defined && result.length > 0, seen: result.defined ? 1 : 0, total: 1 };
  },
  describe(state) {
    const result = project(state.a, state.b);
    return { a: state.a, b: state.b, projection: result };
  },
});

// Assemble a pipeline: drop pieces into ordered slots. The artifact is what
// the learner built, so completion is the arrangement, never the gesture.
export const pipelineAssembly = registerBehavior({
  id: 'pipeline_assembly_v1',
  renderers: ['dnd'],
  actions: ['place_item', 'clear_slot', 'reset_attempt'],
  start(spec) {
    const { pieces, slots } = spec.initialState;
    if (!Array.isArray(pieces) || !pieces.length) throw new Error('pipeline_assembly_v1 needs pieces');
    if (!Array.isArray(slots) || !slots.length) throw new Error('pipeline_assembly_v1 needs slots');
    for (const slot of slots) {
      if (!slot.id || !slot.accepts) throw new Error('every slot needs an id and the piece id it accepts');
      if (!pieces.some(piece => piece.id === slot.accepts)) throw new Error(`slot "${slot.id}" accepts unknown piece "${slot.accepts}"`);
    }
    return { pieces, slots, placed: {}, mistakes: 0 };
  },
  reduce(state, action) {
    if (action.type === 'reset_attempt') return { ...state, placed: {}, mistakes: 0 };
    if (action.type === 'clear_slot') {
      if (!state.slots.some(slot => slot.id === action.slot)) throw new Error(`no slot "${action.slot}"`);
      const placed = { ...state.placed };
      delete placed[action.slot];
      return { ...state, placed };
    }
    if (action.type === 'place_item') {
      const slot = state.slots.find(entry => entry.id === action.slot);
      if (!slot) throw new Error(`no slot "${action.slot}"`);
      if (!state.pieces.some(piece => piece.id === action.piece)) throw new Error(`no piece "${action.piece}"`);
      // A piece lives in one place: dropping it elsewhere moves it.
      const placed = Object.fromEntries(Object.entries(state.placed).filter(([, piece]) => piece !== action.piece));
      placed[action.slot] = action.piece;
      const wrong = slot.accepts !== action.piece;
      return { ...state, placed, mistakes: state.mistakes + (wrong ? 1 : 0) };
    }
    return state;
  },
  progress(state) {
    const correct = state.slots.filter(slot => state.placed[slot.id] === slot.accepts).length;
    return { complete: correct === state.slots.length, seen: correct, total: state.slots.length };
  },
  describe(state) {
    return {
      order: state.slots.map(slot => ({ slot: slot.label || slot.id, holds: state.placed[slot.id] || null, correct: state.placed[slot.id] === slot.accepts })),
      unplaced: state.pieces.filter(piece => !Object.values(state.placed).includes(piece.id)).map(piece => piece.label),
      wrongDrops: state.mistakes,
    };
  },
});
