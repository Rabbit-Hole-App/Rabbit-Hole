// Composition is deliberately one level deep. The integration owner supplies a
// union containing every supported leaf kind, excluding both composition kinds.
export function createShapes({ z, titled, text, id, itemList, leafDiagram }) {
  const visualState = z.strictObject({ label: text(40), diagram: leafDiagram });
  return [
    z.strictObject({
      ...titled, kind: z.literal('comparison'),
      columns: z.array(z.strictObject({ heading: text(40), items: z.array(text(65)).min(1).max(5) })).min(2).max(4).optional(),
      variant: z.literal('panels').optional(),
      panels: z.array(z.strictObject({ heading: text(40), diagram: leafDiagram })).min(2).max(3).optional(),
      sharedAxes: z.array(z.enum(['x', 'y'])).min(1).max(2).optional(),
    }),
    z.strictObject({
      ...titled, kind: z.literal('transformation'), variant: z.literal('visual').optional(),
      before: z.union([itemList, visualState]), after: z.union([itemList, visualState]), operation: text(72),
      links: z.array(z.strictObject({ from: z.int().min(0).max(4), to: z.int().min(0).max(4), label: text(42).optional() })).min(1).max(8).optional(),
      identity: z.strictObject({
        mode: z.enum(['preserved', 'mapped']), note: text(140),
        mappings: z.array(z.strictObject({ from: id, to: id, note: text(90).optional() })).min(1).max(24).optional(),
      }).optional(),
    }),
  ];
}

const sameAxis = (first, other) => ['label', 'min', 'max', 'unit'].every(key => first[key] === other[key])
  && (first.scale ?? 'linear') === (other.scale ?? 'linear');

function validateComparison(diagram, issue) {
  if (diagram.variant !== 'panels') {
    if (!diagram.columns) issue(['columns'], 'A list comparison needs columns');
    if (diagram.panels || diagram.sharedAxes) issue(['variant'], 'Visual panels and shared axes require the panels variant');
    return;
  }
  if (diagram.columns) issue(['columns'], 'A visual comparison uses panels instead of list columns');
  if (!diagram.panels) {
    issue(['panels'], 'A visual comparison needs two or three child panels');
    return;
  }
  if (new Set(diagram.sharedAxes).size !== (diagram.sharedAxes?.length ?? 0)) issue(['sharedAxes'], 'Declare each shared axis only once');
  for (const axis of diagram.sharedAxes ?? []) {
    const first = diagram.panels[0].diagram;
    diagram.panels.forEach(({ diagram: child }, index) => {
      if (child.kind !== 'coordinate-plot' || first.kind !== 'coordinate-plot') {
        issue(['panels', index, 'diagram'], 'Shared axes require coordinate plots in every panel');
      } else if (!sameAxis(first[axis], child[axis])) {
        issue(['panels', index, 'diagram', axis], 'Shared axes must have the same label, range, unit and scale');
      }
    });
  }
}

function identities(diagram) {
  const entries = diagram.kind === 'matrix' ? diagram.rows
    : diagram.kind === 'sample-set' ? diagram.samples
      : diagram.kind === 'coordinate-plot' ? diagram.series.flatMap(series => series.points) : null;
  return entries ? { ids: new Set(entries.map(entry => entry.id).filter(Boolean)), complete: entries.every(entry => entry.id) } : null;
}

function validateTransformation(diagram, issue) {
  if (diagram.variant !== 'visual') {
    for (const side of ['before', 'after']) if (!diagram[side].items) issue([side], 'A list transformation needs an item list');
    if (diagram.identity) issue(['identity'], 'Identity notes require the visual variant');
    return;
  }
  if (diagram.links) issue(['links'], 'Visual transformations use stable identity mappings instead of item indices');
  const states = ['before', 'after'].map(side => {
    if (!diagram[side].diagram) {
      issue([side], 'A visual transformation needs a child diagram');
      return null;
    }
    const result = identities(diagram[side].diagram);
    if (!result?.complete || !result.ids.size) issue([side, 'diagram'], 'Use a plot, matrix or sample set with a stable ID on every point, row or sample');
    return result;
  });
  if (!diagram.identity) {
    issue(['identity'], 'Explain whether identities are preserved or explicitly mapped');
    return;
  }
  const { mode, mappings } = diagram.identity;
  if (mode === 'preserved' && mappings) issue(['identity', 'mappings'], 'Preserved identities do not need remapping');
  if (mode === 'mapped' && !mappings) issue(['identity', 'mappings'], 'Mapped identities need explicit input and output correspondences');
  if (states.some(state => !state?.complete)) return;
  const [before, after] = states.map(state => state.ids);
  if (mode === 'preserved') {
    if (before.size !== after.size || [...before].some(id => !after.has(id))) {
      issue(['identity'], 'Preserved identities must contain exactly the same input and output IDs');
    }
    return;
  }
  const pairs = new Set(), covered = new Set();
  (mappings ?? []).forEach(({ from, to }, index) => {
    if (!before.has(from)) issue(['identity', 'mappings', index, 'from'], 'Mapping source must refer to an input identity');
    if (!after.has(to)) issue(['identity', 'mappings', index, 'to'], 'Mapping target must refer to an output identity');
    const key = `${from}:${to}`;
    if (pairs.has(key)) issue(['identity', 'mappings', index], 'Do not repeat an identity mapping');
    pairs.add(key);
    covered.add(to);
  });
  if ([...after].some(id => !covered.has(id))) issue(['identity', 'mappings'], 'Every output identity needs an explicit mapping');
}

export function validate(diagram, issue) {
  if (diagram.kind === 'comparison') validateComparison(diagram, issue);
  if (diagram.kind === 'transformation') validateTransformation(diagram, issue);
}

// Child text and descriptions are collected recursively by the shared reader.
// These helpers return only composition-owned metadata to avoid double counting.
export function describe(diagram) {
  if (diagram.kind === 'comparison' && diagram.variant === 'panels') return [
    ...diagram.panels.map(panel => `Panel: ${panel.heading}`),
    ...(diagram.sharedAxes?.length ? [`Shared axes: ${diagram.sharedAxes.join(', ')}`] : []),
  ];
  if (diagram.kind === 'transformation' && diagram.variant === 'visual') return [
    `${diagram.before.label} → ${diagram.after.label}: ${diagram.operation}`,
    `Identity ${diagram.identity.mode}: ${diagram.identity.note}`,
    ...(diagram.identity.mappings ?? []).map(mapping => `${mapping.from} → ${mapping.to}${mapping.note ? `: ${mapping.note}` : ''}`),
  ];
  return null;
}

export function visibleText(diagram) {
  const own = [diagram.title, diagram.caption];
  // A heading equal to the child title is drawn once and counted by that child.
  if (diagram.kind === 'comparison' && diagram.variant === 'panels') return [...own,
    ...diagram.panels.filter(panel => panel.heading !== panel.diagram.title).map(panel => panel.heading)];
  if (diagram.kind === 'transformation' && diagram.variant === 'visual') return [
    ...own, diagram.before.label === diagram.before.diagram.title ? undefined : diagram.before.label, diagram.operation,
    diagram.after.label === diagram.after.diagram.title ? undefined : diagram.after.label, diagram.identity.note,
    ...(diagram.identity.mappings ?? []).flatMap(mapping => [mapping.from, mapping.to, mapping.note]),
  ];
  return null;
}
