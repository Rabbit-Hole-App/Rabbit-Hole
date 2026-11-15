export const id = 'ghost-previous';
export const bindingTypes = Object.freeze({ regions: 'RegionId[]', predecessor: 'StateId?' });

// Preserve the exact predecessor relation. SDK-8 has no legal dashed, unfilled
// rounded box; a nonempty requested ghost is refused instead of approximated.
export function draw(ctx, sdk) {
  const fail = (path, message) => { const e = new Error(`ghost-previous: ${message}`); e.code = 'part_binding'; e.path = path; throw e; };
  const { variant, state, previous, index } = ctx;
  if (!Array.isArray(variant?.states) || !Number.isInteger(index) || index < 0 || index >= variant.states.length || state?.id !== variant.states[index].id) fail('inputs.step', 'cursor must select an admitted state');
  if (index === 0) { if (previous != null) fail('previous.id', 'first state has no predecessor'); return []; }
  if (previous?.id !== variant.states[index - 1].id || (state.predecessor !== undefined && state.predecessor !== previous.id)) fail('previous.id', 'ghost must bind the immediately preceding state');
  if (!Array.isArray(previous.active) || previous.active.some(key => !variant.regions?.some(r => r.id === key))) fail('previous.active', 'predecessor regions must exist in the same picture');
  if (previous.active.every(key => state.active?.includes(key))) return [];
  const e = new Error('ghost-previous: SDK-8 cannot express the approved dashed unfilled outline'); e.code = 'part_unrepresentable'; e.path = 'previous.active'; throw e;
}

export const ghostPrevious = Object.freeze({ id, bindingTypes, draw });
export default ghostPrevious;
