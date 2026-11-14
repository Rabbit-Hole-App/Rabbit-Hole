import { writeSubject, isMain } from './before-after-reference-kit.mjs';

export function normalisationModel(depth = 'brief') {
  const fixed = [2, 3, 4, 4, 5, 6, 6, 7];
  const axes = { raw: [0, 20], z: [-3, 3] };
  const controls = [{ id: 'last', kind: 'range', label: 'Last measurement', min: 8, max: 20, step: 1, default: 8 }, ...(depth === 'brief' ? [] : [{ id: 'selected', kind: 'range', label: 'Marked sample', min: 1, max: fixed.length + 1, step: 1, default: fixed.length + 1 }])];
  const defaults = () => ({ last: 8, selected: fixed.length + 1 });
  const bounded = (value, min, max, fallback) => Math.max(min, Math.min(max, Math.round(Number.isFinite(Number(value)) ? Number(value) : fallback)));
  const normalize = (p = {}) => ({ last: bounded(p.last, 8, 20, 8), selected: depth === 'brief' ? fixed.length + 1 : bounded(p.selected, 1, fixed.length + 1, fixed.length + 1) });
  const stats = values => {
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const sd = Math.sqrt(values.reduce((sum, x) => sum + (x - mean) ** 2, 0) / values.length);
    return { mean, sd };
  };
  const evaluate = p => {
    p = normalize(p);
    const raw = [...fixed, p.last], { mean, sd } = stats(raw), z = raw.map(x => (x - mean) / sd), after = stats(z);
    return { raw, z, mean, sd, zMean: after.mean, zSd: after.sd, count: raw.length, selected: p.selected,
      marked: { raw: raw[p.selected - 1], z: z[p.selected - 1] },
      state: p.last === defaults().last ? 'Original sample' : 'Last measurement changed',
      description: `Before: ${raw.length} measurements in raw units, mean ${mean.toFixed(3)} and population standard deviation ${sd.toFixed(3)}. After: the same measurements in z-score units, mean ${after.mean.toFixed(3)} and population standard deviation ${after.sd.toFixed(3)}. Marked sample ${p.selected} changes from ${raw[p.selected - 1]} to ${z[p.selected - 1].toFixed(3)}. Each dot is one sample; repeated values stack. The raw and z-score axes use different, fixed units.` };
  };
  const controlValue = (id, p, frame) => id === 'selected' ? `${p.selected} of ${frame.count}` : String(p.last);
  return { depth, axes, controls, defaults, normalize, evaluate, controlValue };
}

export function normalisationScene(depth) {
  return { prompt: 'What changes when I normalize a distribution with z-scores?', title: 'Same measurements, new units.',
    concept: depth === 'brief' ? 'Z-score normalization subtracts the mean and divides by population standard deviation. The same measurements keep their order while moving into new units.' : depth === 'balanced' ? 'Changing a measurement changes the sample mean and spread, so every z-score can move. Normalization preserves order; each plot keeps a fixed scale in its own units.' : 'μ is the sample mean; σ is its population standard deviation. z = (x − μ) / σ preserves order and relative gaps. Distinct measurements keep σ positive.',
    instructions: depth === 'brief' ? 'Move Last measurement. Compare the dot plots and their mean and spread.' : depth === 'balanced' ? 'Change Last measurement and Marked sample. Follow the warm dot and compare the readouts.' : 'Change Last measurement and Marked sample. Trace the warm dot through the formula.',
    heading: depth === 'detailed' ? 'Z-score: z = (x − μ) / σ' : 'Distribution before and after', height: 380 };
}

export function drawNormalisation(frame, model, scene) {
  let svg = '';
  for (const [side, values, x, title, axis] of [['before', frame.raw, 20, 'Before · raw values', model.axes.raw], ['after', frame.z, 340, 'After · z-scores', model.axes.z]]) {
    const left = x + 24, right = x + 256, baseline = 184;
    const px = value => left + (value - axis[0]) / (axis[1] - axis[0]) * (right - left);
    svg += R.panel(side, x, 228, title);
    svg += R.text(`${side}.subtitle`, x + 14, 65, side === 'before' ? `${frame.count} samples · each dot is a sample` : 'Same samples · different units', { size: 13, color: R.C.muted });
    svg += R.line(`${side}.axis`, [[left, baseline + 10], [right, baseline + 10]]);
    const ticks = side === 'before' ? [0, 5, 10, 15, 20] : [-3, 0, 3];
    for (const tick of ticks) svg += R.line(`${side}.tick.${tick}`, [[px(tick), baseline + 7], [px(tick), baseline + 15]]) + R.text(`${side}.tick.${tick}.label`, px(tick), baseline + 34, R.fmt(tick, 0), { size: 13, anchor: 'middle', color: R.C.muted });
    const stacks = new Map();
    let marker;
    values.forEach((value, index) => {
      // Equal measurements remain exactly equal after the affine transform.
      const level = stacks.get(value) || 0; stacks.set(value, level + 1);
      const y = baseline - level * 15, selected = index === frame.selected - 1;
      svg += R.dot(`${side}.sample.${index + 1}`, px(value), y, selected);
      if (selected) marker = [px(value), y];
    });
    const cx = x + 134, cy = 88, width = 128;
    svg += `<g id="callout.${side}.marked" data-part="linked-marker">` + R.line(`${side}.marked.link`, [[marker[0], marker[1] - 8], [marker[0], 139], [cx + width / 2, 139], [cx + width / 2, cy + 33]], true);
    svg += R.box(`${side}.marked.box`, cx, cy, width, 33, false, 'process') + R.text(`${side}.marked.label`, cx + width / 2, cy + 22, 'Marked sample', { anchor: 'middle', color: '#375d92', size: 14, weight: 600 }) + '</g></g>';
  }
  svg += R.line('comparison.transform', [[307, 160], [332, 160]], true, true);
  svg += R.line('readouts.rule', [[20, 263], [620, 263]]);
  if (scene.depth === 'detailed') {
    svg += R.readout('formula', 24, 287, 'Marked sample · z = (x − μ) / σ', `(${R.fmt(frame.marked.raw)} − ${R.fmt(frame.mean)}) / ${R.fmt(frame.sd, 3)} ≈ ${R.fmt(frame.marked.z, 3)}`, 22);
    svg += R.text('readout.invariant.label', 24, 350, 'After · mean / population SD', { size: 13, color: R.C.muted });
    svg += R.text('readout.invariant.value', 350, 350, `${R.fmt(frame.zMean, 3)} / ${R.fmt(frame.zSd, 3)}`, { size: 22, color: '#375d92', weight: 600 });
  } else {
    svg += R.readout('mean', 24, 294, 'Mean · raw → z', `${R.fmt(frame.mean)} → ${R.fmt(frame.zMean)}`);
    svg += R.readout('sd', scene.depth === 'brief' ? 340 : 224, 294, 'Population SD · raw → z', `${R.fmt(frame.sd)} → ${R.fmt(frame.zSd)}`);
    if (scene.depth === 'balanced') svg += R.readout('marked', 440, 294, 'Marked value · raw → z', `${R.fmt(frame.marked.raw)} → ${R.fmt(frame.marked.z)}`, 20);
    svg += R.text('axes.note', 24, 359, 'Compare units and relative gaps; the axes use different scales.', { size: 13, color: R.C.muted });
  }
  return svg;
}

if (isMain(import.meta.url)) writeSubject('normalisation', normalisationModel, normalisationScene, drawNormalisation);
