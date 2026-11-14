export const id = 'step-rail';
export const bindingTypes = Object.freeze({ items: 'State[]', active: 'Integer', aha: 'StateId' });

// The reference kit's 600 px rail and completed trace share the control's one
// integer cursor. Every visible word is supplied by the state table or words.
export function draw(ctx, sdk) {
  const fail = (path, message) => { const e = new Error(`step-rail: ${message}`); e.code = 'part_binding'; e.path = path; throw e; };
  const { variant, state, index, composition, words } = ctx, items = variant?.states;
  if (!Array.isArray(items) || items.length < 2 || items.length > 12) fail('variant.states', 'expected 2 to 12 ordered states');
  const seen = new Set();
  for (const s of items) {
    if (!s || typeof s.id !== 'string' || !s.id || typeof s.label !== 'string' || !s.label || seen.has(s.id)) fail('variant.states', 'state ids and labels must be nonempty and ids unique');
    seen.add(s.id);
  }
  if (!Number.isInteger(index) || index < 0 || index >= items.length) fail('inputs.step', 'selection must address an existing integer index');
  if (state?.id !== items[index].id) fail('state.id', 'selected state must agree with the cursor');
  if (!seen.has(composition?.aha?.stateId)) fail('composition.aha.stateId', 'aha must name an existing state');
  if (ctx.presentation === 'completed-trace') {
    if (typeof words?.completed !== 'string' || !words.completed) fail('words.completed', 'completed trace needs its bound heading');
    const out = [sdk.text('trace.label', 20, 371, words.completed, { role: 'neutral' })], w = 600 / items.length;
    items.forEach((s, i) => {
      const style = { role: i < index ? 'input' : 'neutral', opacity: i < index ? 1 : 0.35 };
      out.push(sdk.line(`trace.${s.id}.rule`, 20 + i * w, 383, 16 + (i + 1) * w, 383, style));
      const text = s.short ?? s.label;
      if (typeof text !== 'string' || !text) fail(`variant.states.${i}.short`, 'trace label must be text');
      const lines = []; let line = '';
      for (const word of text.split(/\s+/)) { if (line && `${line} ${word}`.length > 10) { lines.push(line); line = ''; } line += (line ? ' ' : '') + word; }
      if (line) lines.push(line);
      lines.forEach((value, j) => out.push(sdk.text(`trace.${s.id}.${j}`, 20 + i * w, 403 + j * 17, value, style)));
    });
    return out;
  }
  const w = (600 - 5 * (items.length - 1)) / items.length;
  return items.map((s, i) => sdk.box(`rail.${s.id}`, 20 + i * (w + 5), 8, w, 5, { role: i === index ? 'input' : 'neutral', opacity: 1 }));
}

export const stepRail = Object.freeze({ id, bindingTypes, draw });
export default stepRail;
