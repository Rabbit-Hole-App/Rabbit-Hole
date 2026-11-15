export const id = 'readouts';
export const bindingTypes = Object.freeze({ values: 'Readout[]' });

// The reference row reads typed state values verbatim; it invents no rounding,
// labels, denominator, unit, accumulated work or final-output count.
export function draw(ctx, sdk) {
  const fail = (path, message) => { const e = new Error(`readouts: ${message}`); e.code = 'part_binding'; e.path = path; throw e; };
  const values = ctx.state?.readouts;
  if (!Array.isArray(values) || values.length > 8) fail('state.readouts', 'readouts must be an array of at most eight values');
  if (!values.length) return [];
  const ids = new Set(), out = [sdk.line('readouts.rule', 20, 296, 620, 296, { role: 'neutral', opacity: 1 })];
  values.forEach((value, i) => {
    const path = `state.readouts.${i}`;
    if (!value || typeof value.id !== 'string' || !value.id || ids.has(value.id) || typeof value.label !== 'string' || !value.label) fail(path, 'readout needs a unique id and label');
    if (typeof value.value !== 'string' && !(typeof value.value === 'number' && Number.isFinite(value.value))) fail(`${path}.value`, 'readout must retain a finite number or exact text');
    if (value.source !== undefined && value.source !== ctx.state.id) fail(`${path}.source`, 'readout must come from the selected state');
    ids.add(value.id);
    const x = 24 + i * 600 / values.length;
    out.push(sdk.text(`readout.${value.id}.label`, x, 317, value.label, { role: 'neutral', opacity: 1 }), sdk.text(`readout.${value.id}.value`, x, 344, String(value.value), { role: 'input', opacity: 1 }));
  });
  return out;
}

export const valueReadouts = Object.freeze({ id, bindingTypes, draw });
export default valueReadouts;
