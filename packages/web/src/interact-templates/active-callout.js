export const id = 'active-callout';
export const bindingTypes = Object.freeze({ target: 'RegionId', text: 'Text', reason: 'Text?' });

// Manual bound box + texts retain every line. sdk.callout silently truncates
// after four; the approved Brief needs a title and four sentence lines.
export function draw(ctx, sdk) {
  const fail = (path, message) => { const e = new Error(`active-callout: ${message}`); e.code = 'part_binding'; e.path = path; throw e; };
  const { composition, variant, state } = ctx;
  if (composition?.canonical !== 'algorithm-over-collection') fail('composition.canonical', 'this callout preset is not implemented');
  const positions = { input: [135, 30, 156, 40], left: [32, 83, 160, 40], right: [236, 83, 160, 40], singles: [32, 136, 364, 40], mergeLeft: [32, 189, 160, 40], mergeRight: [236, 189, 160, 40], output: [135, 242, 156, 40] };
  const target = state?.calloutRegion;
  if (typeof target !== 'string' || !Object.hasOwn(positions, target) || !variant?.regions?.some(r => r.id === target) || !state.active?.includes(target)) fail('state.calloutRegion', 'target must be a drawn active region anchor');
  for (const field of ['label', 'sentence', ...(composition.depth === 'detailed' ? ['why'] : [])]) if (typeof state[field] !== 'string' || !state[field].trim() || state[field].length > 600) fail(`state.${field}`, 'callout words must be bounded text');
  const wrap = text => {
    const lines = []; let line = '';
    for (const word of text.split(/\s+/)) { if (line && `${line} ${word}`.length > 22) { lines.push(line); line = ''; } line += (line ? ' ' : '') + word; }
    if (line) lines.push(line); return lines;
  };
  const sentence = wrap(state.sentence), why = composition.depth === 'detailed' ? wrap(state.why) : [], [x, y, w, h] = positions[target], anchor = [x + w / 2, y + h];
  const out = [sdk.polyline('callout.anchor', [anchor, [anchor[0], anchor[1] + 5], [430, anchor[1] + 5], [430, 82], [444, 82]], { role: 'input', opacity: 1 }),
    sdk.box('callout.active.l0', 444, 66, 178, 44 + (sentence.length + why.length) * 20 + (why.length ? 12 : 0), { role: 'input', opacity: 1 }),
    sdk.text('callout.active.title', 455, 90, state.label, { role: 'input', opacity: 1 })];
  sentence.forEach((value, i) => out.push(sdk.text(`callout.active.s${i}`, 455, 116 + i * 20, value, { role: 'neutral', opacity: 1 })));
  why.forEach((value, i) => out.push(sdk.text(`callout.active.why${i}`, 455, 128 + (sentence.length + i) * 20, value, { role: 'neutral', opacity: 1 })));
  return out;
}

export const activeCallout = Object.freeze({ id, bindingTypes, draw });
export default activeCallout;
