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
