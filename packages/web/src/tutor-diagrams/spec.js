import * as statistical from './ml-statistical-spec.js';
import * as plot from './ml-plot-spec.js';
import * as topology from './ml-topology-spec.js';
import * as data from './ml-data-spec.js';
import * as composition from './ml-composition-spec.js';
import { createTensorPayload, createTensorShape, tensorText, validateTensor } from './tensor-spec.js';
import { createTokenLinksShape, describeTokenLinks, tokenLinksText, validateTokenLinks } from './token-links-spec.js';
import { createBlockStackShape, describeBlockStack, blockStackText, validateBlockStack } from './block-stack-spec.js';
import { flowPathShape, flowPaths, validateFlowPaths } from './flow-paths.js';
import { z } from 'zod';
import { formatMinor, sumMinor, toMinor } from './balance-values.js';
import { tokenizeMath } from '../math-tokens.js';

const MAX_JSON_LENGTH = 16_384;
// Text is rendered literally. The SVG renderer must escape XML punctuation.
const invalidXmlText = /[\u0000-\u001f\u007f\ud800-\udfff\ufffe\uffff]/u;
// A formula ($...$, as the card's prose writes it; tokenizeMath) counts what it shows: delimiters, braces and spaces are free and a command
// such as \frac counts one, so a label with maths fits the limit its words would. Its source may be up to twice the limit.
const shownLength = value => {
  const { source, math } = tokenizeMath(value);
  return source.replace(/\n?\u{E000}(\d+)\u{E001}\n?/gu, (_, index) => math[index].expression.replace(/\\[A-Za-z]+/g, '#').replace(/[{}\s]/g, '')).length;
};
const text = max => z.string().min(1).max(2 * max)
  .refine(value => value.trim().length > 0 && !invalidXmlText.test(value), 'Use nonblank, single-line diagram text')
  .refine(value => shownLength(value) <= max, `Use at most ${max} characters`);
const id = z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,31}$/, 'Use a simple ID starting with a letter (at most 32 characters)');
const titled = { title: text(90), caption: text(140).optional() };
const endpoint = { from: id, to: id };

const numeric = z.number().min(-1e9).max(1e9);
const unit = text(12).optional();
const node = { id, label: text(60) };
const tensorPayload = createTensorPayload({ z, text, numeric });
const tensorNode = { id, label: text(60).optional(), tensor: tensorPayload.optional() };
const axes = z.strictObject({ label: text(36), min: numeric, max: numeric, unit });
const tensorItem = z.strictObject({ label: text(70).optional(), tensor: tensorPayload });
const itemList = z.strictObject({ label: text(40), items: z.array(z.union([text(70), tensorItem])).min(1).max(5) });
const evidence = z.strictObject({ label: text(100), source: text(65).optional() });
const entry = z.strictObject({ label: text(60), amount: numeric });
const directions = ['up', 'down', 'left', 'right'];
const figureAnchors = {
  cell: ['membrane', 'nucleus', 'cytoplasm', 'mitochondrion'],
  'free-body': ['body', ...directions],
  'cross-section': ['top-layer', 'core', 'bottom-layer', 'interface'],
};


const baseDiagramShapes = [
  z.strictObject({
    ...titled, kind: z.literal('flow'),
    // title (item 47, 2026-11-08): the full label when the server trimmed an over-long one; drawn as the node's SVG <title> tooltip, not as text.
    nodes: z.array(z.strictObject({ id, label: text(60), role: z.enum(['process', 'decision', 'outcome']), title: text(240).optional() })).min(2).max(12),
    edges: z.array(z.strictObject({ ...endpoint, label: text(30).optional() })).min(1).max(20),
    // E3 (explain.md EXP-12-C04): an ordered worked route through the flow, root to terminal; the renderer draws it in the theme's fixed path style. Node IDs only: no colour, CSS or SVG.
    highlightPath: z.array(id).min(2).max(12).optional(),
  }),
  z.strictObject({
    ...titled, kind: z.literal('comparison'),
    columns: z.array(z.strictObject({ heading: text(40), items: z.array(text(65)).min(1).max(5) })).min(2).max(4),
  }),
  z.strictObject({
    ...titled, kind: z.literal('timeline'),
    events: z.array(z.strictObject({ time: text(28), label: text(55), detail: text(90).optional() })).min(2).max(8),
  }),
  z.strictObject({
    ...titled, kind: z.literal('sequence'),
    actors: z.array(z.strictObject({ id, label: text(30) })).min(2).max(4),
    messages: z.array(z.strictObject({ ...endpoint, label: text(60) })).min(1).max(8),
  }),
  z.strictObject({
    ...titled, kind: z.literal('matrix'),
    columns: z.array(text(24)).min(2).max(5),
    rows: z.array(z.strictObject({ heading: text(30), cells: z.array(text(40)).min(2).max(5) })).min(2).max(6),
  }),
  z.strictObject({
    ...titled, kind: z.literal('layers'),
    layers: z.array(z.strictObject({ label: text(50), detail: text(80).optional() })).min(2).max(7),
  }),
  z.strictObject({ ...titled, kind: z.literal('cycle'), steps: z.array(text(55)).min(2).max(7) }),
  z.strictObject({
    ...titled, kind: z.literal('figure'), figure: z.enum(['cell', 'free-body', 'cross-section']), unit,
    callouts: z.array(z.strictObject({ anchor: id, label: text(48), detail: text(75).optional() })).min(1).max(4),
    vectors: z.array(z.strictObject({ direction: z.enum(directions), magnitude: numeric.positive(), label: text(32) })).min(1).max(4).optional(),
  }),
  z.strictObject({
    ...titled, kind: z.literal('tree'), layout: z.literal('binary').optional(),
    nodes: z.array(z.strictObject({ ...node, parent: id.optional(), side: z.enum(['left', 'right']).optional() })).min(2).max(12),
  }),
  z.strictObject({
    ...titled, kind: z.literal('relationship'), nodes: z.array(z.strictObject(node)).min(2).max(8),
    edges: z.array(z.strictObject({ ...endpoint, label: text(48) })).min(1).max(12),
  }),
  z.strictObject({
    ...titled, kind: z.literal('transformation'), before: itemList, after: itemList, operation: text(72),
    links: z.array(z.strictObject({
      from: z.int().min(0).max(4), to: z.int().min(0).max(4), label: text(42).optional(),
    })).min(1).max(8).optional(),
  }),
  z.strictObject({
    ...titled, kind: z.literal('argument'), claim: text(120), support: z.array(evidence).min(1).max(4),
    objections: z.array(evidence).max(4), conclusion: text(120),
  }),
  z.strictObject({
    ...titled, kind: z.literal('number-line'), min: numeric, max: numeric,
    markers: z.array(z.strictObject({ value: numeric, label: text(45) })).max(6),
    intervals: z.array(z.strictObject({
      from: numeric, to: numeric, startClosed: z.boolean(), endClosed: z.boolean(), label: text(45),
    })).max(3).optional(),
  }),
  z.strictObject({
    ...titled, kind: z.literal('coordinate-plot'), x: axes, y: axes,
    series: z.array(z.strictObject({
      label: text(42), kind: z.enum(['line', 'scatter']),
      points: z.array(z.strictObject({ x: numeric, y: numeric })).min(1).max(24),
    })).min(1).max(3),
  }),
  z.strictObject({
    ...titled, kind: z.literal('bar-chart'), unit,
    bars: z.array(z.strictObject({ label: text(42), value: numeric })).min(2).max(8),
  }),
  z.strictObject({
    ...titled, kind: z.literal('t-account'), account: text(42), unit,
    debits: z.array(entry).max(6), credits: z.array(entry).max(6),
  }),
  z.strictObject({
    ...titled, kind: z.literal('waterfall'), opening: numeric, unit, changes: z.array(entry).min(1).max(6),
  }),

];
const helpers = { z, titled, text, id, numeric, unit, axes, node, itemList, tensorNode, tensorPayload, flowPath: flowPathShape({ z, id }) };
const domains = [statistical, plot, topology, data, composition];
const shapeMap = new Map(baseDiagramShapes.map(schema => [schema.shape.kind.value, schema]));
for (const domain of domains.slice(0, -1)) {
  for (const schema of domain.createShapes(helpers)) shapeMap.set(schema.shape.kind.value, schema);
}
// Deliberately nonrecursive. A comparison/transform can contain these teaching
// leaves, never another comparison/transform. No raw JSON escape hatch.
const leafKinds = new Set(['tree', 'coordinate-plot', 'bar-chart', 'matrix', 'timeline', 'heatmap', 'sample-set', 'histogram', 'box-plot']);
const leafShapes = [...shapeMap].filter(([kind]) => leafKinds.has(kind)).map(([, schema]) => schema);
const blockStack = createBlockStackShape(helpers);
const tokenLinks = createTokenLinksShape(helpers);
const leafDiagram = z.discriminatedUnion('kind', leafShapes);
const panelDiagram = z.discriminatedUnion('kind', [...leafShapes, blockStack, tokenLinks]);
for (const schema of composition.createShapes({ ...helpers, leafDiagram, panelDiagram })) shapeMap.set(schema.shape.kind.value, schema);
for (const schema of [createTensorShape(helpers), tokenLinks, blockStack]) shapeMap.set(schema.shape.kind.value, schema);
const diagramShape = z.discriminatedUnion('kind', [...shapeMap.values()]);
const shape = z.strictObject({ version: z.literal(1), diagram: diagramShape });

function childDiagrams(diagram) {
  if (diagram.kind === 'comparison' && diagram.variant === 'panels') return (diagram.panels ?? []).map((p, index) => ({ diagram: p.diagram, path: ['panels', index, 'diagram'] }));
  if (diagram.kind === 'transformation' && diagram.variant === 'visual') return ['before', 'after'].filter(side => diagram[side]?.diagram).map(side => ({ diagram: diagram[side].diagram, path: [side, 'diagram'] }));
  return [];
}


function checkFlow(diagram, issue) {
  const { nodes, edges } = diagram;
  const outgoing = new Map(nodes.map(node => [node.id, []]));
  if (outgoing.size !== nodes.length) return issue(['nodes'], 'Flow nodes need unique IDs');
  const incoming = new Map(nodes.map(node => [node.id, 0]));
  for (const [index, edge] of edges.entries()) {
    const targets = outgoing.get(edge.from);
    if (!targets || !incoming.has(edge.to)) return issue(['edges', index], 'Edge refers to an unknown node');
    if (edge.from === edge.to) return issue(['edges', index], 'An edge cannot connect a node to itself');
    if (targets.some(other => other.to === edge.to)) return issue(['edges', index], 'An edge cannot repeat the same directed node pair');
    targets.push(edge);
    incoming.set(edge.to, incoming.get(edge.to) + 1);
  }
  for (const [index, node] of nodes.entries()) {
    const targets = outgoing.get(node.id);
    if (node.role === 'outcome' && targets.length) issue(['nodes', index], 'An outcome cannot have outgoing edges');
    if (node.role === 'process' && targets.length > 1) issue(['nodes', index], 'A process can have at most one outgoing edge');
    if (node.role === 'decision') {
      const labels = targets.map(edge => edge.label?.trim().toLowerCase());
      if (labels.length < 2 || labels.length > 3 || labels.some(label => !label) || new Set(labels).size !== labels.length) {
        issue(['nodes', index], 'A decision needs two or three outgoing edges with distinct, non-empty labels (labeled branches)');
      }
    }
  }
  const ordered = nodes.filter(node => incoming.get(node.id) === 0).map(node => node.id);
  if (ordered.length !== 1) return issue(['nodes'], 'A flow needs exactly one root');
  // A merge waits for all predecessors. Leftover nodes are cyclic or unreachable.
  for (let i = 0; i < ordered.length; i++) {
    for (const { to } of outgoing.get(ordered[i])) {
      const remaining = incoming.get(to) - 1;
      incoming.set(to, remaining);
      if (remaining === 0) ordered.push(to);
    }
  }
  if (ordered.length !== nodes.length) return issue(['edges'], 'A flow cannot contain a cycle or unreachable nodes');
  validateFlowPaths(diagram, issue);
}

function checkSequence({ actors, messages }, issue) {
  const ids = new Set(actors.map(actor => actor.id));
  if (ids.size !== actors.length) return issue(['actors'], 'Sequence actors need unique IDs');
  if (messages.every(({ from, to }) => from === to)) {
    issue(['messages'], 'A sequence needs at least one message between different actors');
  }
  for (const [index, { from, to }] of messages.entries()) {
    const previous = messages[index - 1];
    if (!ids.has(from) || !ids.has(to)) issue(['messages', index], 'Message refers to an unknown actor');
    else if (from === to && previous && previous.from === previous.to) {
      issue(['messages', index], 'Consecutive self-messages need an ordinary message between them');
    }
  }
}

function checkFigure({ figure, callouts, vectors, unit }, issue) {
  if (figure === 'free-body' && !vectors) issue(['vectors'], 'A free-body figure needs force vectors');
  if (figure !== 'free-body' && (vectors || unit)) issue(['figure'], 'Only free-body figures take vectors and units');
  const active = new Set(vectors?.map(vector => vector.direction));
  if (vectors && active.size !== vectors.length) issue(['vectors'], 'Vector directions must be unique');
  const anchors = new Set();
  callouts.forEach(({ anchor }, i) => {
    if (!figureAnchors[figure].includes(anchor) || (figure === 'free-body' && anchor !== 'body' && !active.has(anchor))) {
      issue(['callouts', i, 'anchor'], 'Use an anchor present in this figure');
    }
    if (anchors.has(anchor)) issue(['callouts', i, 'anchor'], 'Each anchor has at most one callout');
    anchors.add(anchor);
  });
}

function checkTree({ nodes, layout }, issue) {
  const byId = new Map(nodes.map(item => [item.id, item]));
  if (byId.size !== nodes.length) return issue(['nodes'], 'Tree nodes need unique IDs');
  if (nodes.filter(item => item.parent === undefined).length !== 1) return issue(['nodes'], 'A tree needs one root');
  for (const [i, item] of nodes.entries()) {
    const seen = new Set([item.id]);
    let parent = item.parent;
    while (parent !== undefined) {
      if (seen.has(parent)) return issue(['nodes', i, 'parent'], 'Tree parents cannot form a cycle');
      if (!byId.has(parent)) return issue(['nodes', i, 'parent'], 'Tree parent refers to an unknown node');
      seen.add(parent);
      parent = byId.get(parent).parent;
    }
  }
  const occupied = new Set();
  for (const [i, { parent, side }] of nodes.entries()) {
    const at = ['nodes', i, 'side'];
    if (layout !== 'binary') {
      if (side !== undefined) return issue(at, 'A tree node side requires the binary layout');
    } else if (parent === undefined) {
      if (side !== undefined) return issue(at, 'The root cannot have a side');
    } else {
      if (side === undefined) return issue(at, 'A binary tree child needs a left or right side');
      const position = `${parent}:${side}`;
      if (occupied.has(position)) return issue(at, `A parent can have at most one ${side} child`);
      occupied.add(position);
    }
  }
}

function checkRelationships({ nodes, edges }, issue) {
  const ids = new Set(nodes.map(item => item.id));
  if (ids.size !== nodes.length) return issue(['nodes'], 'Relationship nodes need unique IDs');
  const seen = new Set(), linked = new Set();
  for (const [i, edge] of edges.entries()) {
    if (!ids.has(edge.from) || !ids.has(edge.to)) return issue(['edges', i], 'Relationship refers to an unknown node');
    if (edge.from === edge.to) return issue(['edges', i], 'A relationship needs two different nodes');
    const key = JSON.stringify([edge.from, edge.to, edge.label.trim().toLowerCase()]);
    if (seen.has(key)) return issue(['edges', i], 'A labeled relationship cannot repeat');
    seen.add(key);
    linked.add(edge.from).add(edge.to);
  }
  if (linked.size !== ids.size) issue(['nodes'], 'Every relationship node needs a link');
}

function checkNumberLine({ min, max, markers, intervals = [] }, issue) {
  if (min >= max) issue(['max'], 'The maximum must be greater than the minimum');
  if (!markers.length && !intervals.length) issue(['markers'], 'Add at least one marker or interval');
  const values = new Set();
  markers.forEach(({ value }, i) => {
    if (value < min || value > max) issue(['markers', i, 'value'], 'Marker is outside the range');
    if (values.has(value)) issue(['markers', i, 'value'], 'Markers need distinct values');
    values.add(value);
  });
  intervals.forEach(({ from, to }, i) => {
    if (from < min || to > max || from >= to) issue(['intervals', i], 'Use an increasing interval within the range');
  });
}

function checkPlot({ x, y, series }, issue) {
  for (const [name, axis] of Object.entries({ x, y })) {
    if (axis.min >= axis.max) issue([name, 'max'], 'The maximum must be greater than the minimum');
  }
  series.forEach(({ kind, points }, i) => {
    if (!points) return; // The plot schema validates compact samples.
    if (kind === 'line' && points.length < 2) issue(['series', i, 'points'], 'A line needs at least two points');
    points.forEach((point, j) => {
      if (point.x < x.min || point.x > x.max || point.y < y.min || point.y > y.max) {
        issue(['series', i, 'points', j], 'Point is outside the axis bounds');
      }
    });
  });
}

function checkAmount(value, path, issue, nonnegative = false) {
  if (toMinor(value) / 100 !== value) issue(path, 'Use at most two decimal places');
  if (nonnegative && value < 0) issue(path, 'Debit and credit amounts must be nonnegative');
}

const atPath = (issue, prefix) => (path, message) => issue([...prefix, ...path], message);

function checkTensorNodes({ nodes }, issue) {
  nodes.forEach((node, index) => {
    if (node.tensor) validateTensor(node.tensor, atPath(issue, ['nodes', index, 'tensor']));
    else if (!node.label) issue(['nodes', index, 'label'], 'A node needs a label or a tensor');
  });
}

function validateDiagram(diagram, issue) {
  switch (diagram.kind) {
    case 'flow': checkFlow(diagram, issue); checkTensorNodes(diagram, issue); break;
    case 'sequence': checkSequence(diagram, issue); break;
    case 'matrix':
      diagram.rows.forEach(({ cells }, index) => {
        if (cells.length !== diagram.columns.length) issue(['rows', index, 'cells'], 'The number of cells must match the number of columns');
      });
      break;
    case 'figure': checkFigure(diagram, issue); break;
    case 'tree': checkTree(diagram, issue); break;
    case 'relationship': checkRelationships(diagram, issue); checkTensorNodes(diagram, issue); break;
    case 'tensor': validateTensor(diagram.tensor, atPath(issue, ['tensor'])); break;
    case 'token-links': validateTokenLinks(diagram, issue); break;
    case 'block-stack': validateBlockStack(diagram, issue, validateTensor); break;
    case 'transformation':
      // The composition validator reports a mixed representation. Do not read
      // list fields on a visual state before it can return that useful error.
      if (diagram.variant === 'visual' || !diagram.before.items || !diagram.after.items) break;
      for (const side of ['before', 'after']) diagram[side].items.forEach((item, index) => {
        if (typeof item !== 'string') validateTensor(item.tensor, atPath(issue, [side, 'items', index, 'tensor']));
      });
      diagram.links?.forEach(({ from, to }, index) => {
        if (from >= diagram.before.items.length || to >= diagram.after.items.length) {
          issue(['links', index], 'Mapping indices must refer to existing items');
        }
      });
      break;
    case 'number-line': checkNumberLine(diagram, issue); break;
    case 'coordinate-plot': checkPlot(diagram, issue); break;
    case 't-account':
      if (!diagram.debits.length && !diagram.credits.length) issue(['debits'], 'Add at least one posting');
      for (const side of ['debits', 'credits']) {
        diagram[side].forEach(({ amount }, i) => checkAmount(amount, [side, i, 'amount'], issue, true));
      }
      break;
    case 'waterfall':
      checkAmount(diagram.opening, ['opening'], issue);
      diagram.changes.forEach(({ amount }, i) => checkAmount(amount, ['changes', i, 'amount'], issue));
      break;
  }
  for (const domain of domains) domain.validate(diagram, issue);
  for (const child of childDiagrams(diagram)) validateDiagram(child.diagram, (path, message) => issue([...child.path, ...path], message));
}
export const tutorDiagramSchema = shape.superRefine(({ diagram }, ctx) => {
  validateDiagram(diagram, (path, message) => ctx.addIssue({ code: 'custom', path: ['diagram', ...path], message }));
});

// Provider constraints describe the JSON shape. The local parse additionally
// checks topology, labels, child slots and row widths that JSON Schema cannot express here.
const { $schema, ...jsonSchema } = z.toJSONSchema(shape, { target: 'draft-7', io: 'input' });
// A flow node's title is written by the server only (a trimmed label's full text), so the author is never asked for it.
const flowNode = (jsonSchema.properties.diagram.oneOf ?? jsonSchema.properties.diagram.anyOf).find(s => s.properties.kind.const === 'flow').properties.nodes.items;
delete flowNode.properties.title;
export const tutorDiagramJsonSchema = jsonSchema;

export function parseTutorDiagram(value) {
  if (typeof value === 'string') {
    if (value.length > MAX_JSON_LENGTH) throw new Error('Diagram JSON is too long');
    try { value = JSON.parse(value); }
    catch { throw new Error('Invalid diagram JSON'); }
  }
  if (JSON.stringify(value)?.length > MAX_JSON_LENGTH) throw new Error('Diagram JSON is too long');
  return tutorDiagramSchema.parse(value);
}

const nodeName = node => node.label ?? node.tensor?.name ?? node.tensor?.dimensions;
const itemText = item => typeof item === 'string' ? [item] : [item.label, ...tensorText(item.tensor)].filter(Boolean);
const describeTensors = nodes => nodes.flatMap(node => node.tensor ? [tensorText(node.tensor).join(', ')] : []);

function describeConnections(nodes, edges) {
  const names = new Map(nodes.map(node => [node.id, nodeName(node)]));
  return edges.map(({ from, to, label }) => `${names.get(from)}${label ? ` — ${label}` : ''} → ${names.get(to)}`);
}

const withUnit = (value, unit) => unit ? `${value} ${unit}` : String(value);
const describeEntry = ({ label, amount }, unit) => `${label}: ${withUnit(formatMinor(toMinor(amount)), unit)}`;

function describeContent(diagram) {
  for (const domain of domains) {
    const description = domain.describe(diagram);
    if (description !== null && description !== undefined) return [...description, ...childDiagrams(diagram).flatMap(child => [child.diagram.title, ...describeContent(child.diagram), child.diagram.caption].filter(Boolean))];
  }
  switch (diagram.kind) {
    case 'flow': return [...describeConnections(diagram.nodes, diagram.edges), ...describeTensors(diagram.nodes),
      ...flowPaths(diagram.highlightPath).map(path => `Highlighted path: ${path.map(step => nodeName(diagram.nodes.find(node => node.id === step))).join(' → ')}`)];
    case 'comparison': return diagram.columns.map(({ heading, items }) => `${heading}: ${items.join('; ')}`);
    case 'timeline': return diagram.events.map(({ time, label, detail }) => `${time}: ${[label, detail].filter(Boolean).join(' — ')}`);
    case 'sequence': return [diagram.actors.map(actor => actor.label).join(', '), ...describeConnections(diagram.actors, diagram.messages)];
    case 'matrix':
      return diagram.rows.map(({ heading, cells }) => `${heading}: ${cells.map((cell, index) => `${diagram.columns[index]}: ${cell}`).join('; ')}`);
    case 'layers': return diagram.layers.map(({ label, detail }) => [label, detail].filter(Boolean).join(' — '));
    case 'cycle': return [[...diagram.steps, diagram.steps[0]].join(' → ')];
    case 'figure':
      return [
        ...diagram.callouts.map(({ label, detail, anchor }) => `${label} (${anchor})${detail ? `: ${detail}` : ''}`),
        ...(diagram.vectors ?? []).map(({ direction, label, magnitude }) => `${label}: ${withUnit(magnitude, diagram.unit)} ${direction}`),
      ];
    case 'tree': {
      const labels = new Map(diagram.nodes.map(({ id, label }) => [id, label]));
      return diagram.nodes.map(({ label, parent, side }) => {
        if (!parent) return `Root: ${label}`;
        if (diagram.layout === 'binary') return `${label} is the ${side} child of ${labels.get(parent)}`;
        return `${labels.get(parent)} → ${label}`;
      });
    }
    case 'relationship': return [...describeConnections(diagram.nodes, diagram.edges), ...describeTensors(diagram.nodes)];
    case 'tensor': return tensorText(diagram.tensor);
    case 'token-links': return describeTokenLinks(diagram);
    case 'block-stack': return describeBlockStack(diagram, tensorText);
    case 'transformation':
      return [
        `${diagram.before.label}: ${diagram.before.items.map(item => itemText(item).join(', ')).join('; ')}`, diagram.operation,
        `${diagram.after.label}: ${diagram.after.items.map(item => itemText(item).join(', ')).join('; ')}`,
        ...(diagram.links ?? []).map(({ from, to, label }) =>
          `${itemText(diagram.before.items[from]).join(', ')} → ${itemText(diagram.after.items[to]).join(', ')}${label ? `: ${label}` : ''}`),
      ];
    case 'argument':
      return [
        `Claim: ${diagram.claim}`,
        ...diagram.support.map(({ label, source }) => `Support: ${label}${source ? ` (${source})` : ''}`),
        ...diagram.objections.map(({ label, source }) => `Objection: ${label}${source ? ` (${source})` : ''}`),
        `Conclusion: ${diagram.conclusion}`,
      ];
    case 'number-line':
      return [
        `Range: ${diagram.min} to ${diagram.max}`,
        ...diagram.markers.map(({ value, label }) => `${label}: ${value}`),
        ...(diagram.intervals ?? []).map(({ from, to, startClosed, endClosed, label }) =>
          `${label}: ${startClosed ? '[' : '('}${from}, ${to}${endClosed ? ']' : ')'}`),
      ];
    case 'coordinate-plot':
      return [
        ...[diagram.x, diagram.y].map(({ label, min, max, unit }) => `${label}: ${min} to ${withUnit(max, unit)}`),
        ...diagram.series.map(({ label, points }) => `${label}: ${points.map(({ x, y }) => `(${x}, ${y})`).join(', ')}`),
      ];
    case 'bar-chart': return diagram.bars.map(({ label, value }) => `${label}: ${withUnit(value, diagram.unit)}`);
    case 't-account': {
      const debit = sumMinor(diagram.debits), credit = sumMinor(diagram.credits), difference = debit - credit;
      const money = amount => withUnit(formatMinor(amount), diagram.unit);
      const side = difference === 0 ? 'Balance' : difference > 0 ? 'Debit balance' : 'Credit balance';
      return [
        diagram.account,
        ...diagram.debits.map(item => `Debit ${describeEntry(item, diagram.unit)}`), `Total debits: ${money(debit)}`,
        ...diagram.credits.map(item => `Credit ${describeEntry(item, diagram.unit)}`), `Total credits: ${money(credit)}`,
        `${side}: ${money(Math.abs(difference))}`,
      ];
    }
    case 'waterfall': {
      const opening = toMinor(diagram.opening);
      return [
        `Opening: ${withUnit(formatMinor(opening), diagram.unit)}`,
        ...diagram.changes.map(item => describeEntry(item, diagram.unit)),
        `Closing: ${withUnit(formatMinor(opening + sumMinor(diagram.changes)), diagram.unit)}`,
      ];
    }

  }
}

export function describeTutorDiagram({ diagram }) {
  return [diagram.title, ...describeContent(diagram), diagram.caption].filter(Boolean).join('\n');
}

// The words an author wrote that the renderer draws: title, caption and every label, heading, item, detail, source, unit and account name.
// Ids, roles, anchors, directions and numbers are not words. The written-Explanation validator counts exactly these against the Depth cap.
export function tutorDiagramVisibleText({ diagram: d }) {
  for (const domain of domains) {
    const content = domain.visibleText(d);
    if (content !== null && content !== undefined) return [...content, ...childDiagrams(d).flatMap(child => tutorDiagramVisibleText({ diagram: child.diagram }))];
  }
  const own = [d.title, d.caption];
  const labels = list => list.map(item => item.label);
  switch (d.kind) {
    case 'flow': case 'relationship': return [...own, ...labels(d.nodes), ...labels(d.edges),
      ...d.nodes.flatMap(node => node.tensor ? tensorText(node.tensor) : [])];
    case 'tensor': return [...own, ...tensorText(d.tensor)];
    case 'token-links': return tokenLinksText(d);
    case 'block-stack': return blockStackText(d, tensorText);
    case 'comparison': return [...own, ...d.columns.flatMap(c => [c.heading, ...c.items])];
    case 'timeline': return [...own, ...d.events.flatMap(e => [e.time, e.label, e.detail])];
    case 'sequence': return [...own, ...labels(d.actors), ...labels(d.messages)];
    case 'matrix': return [...own, ...d.columns, ...d.rows.flatMap(r => [r.heading, ...r.cells])];
    case 'layers': return [...own, ...d.layers.flatMap(l => [l.label, l.detail])];
    case 'cycle': return [...own, ...d.steps];
    case 'figure': return [...own, d.unit, ...d.callouts.flatMap(c => [c.label, c.detail]), ...(d.vectors ?? []).map(v => v.label)];
    case 'tree': return [...own, ...labels(d.nodes)];
    case 'transformation': return [...own, d.before.label, ...d.before.items.flatMap(itemText), d.after.label, ...d.after.items.flatMap(itemText), d.operation, ...(d.links ?? []).map(l => l.label)];
    case 'argument': return [...own, d.claim, ...[...d.support, ...d.objections].flatMap(e => [e.label, e.source]), d.conclusion];
    case 'number-line': return [...own, ...labels(d.markers), ...labels(d.intervals ?? [])];
    case 'coordinate-plot': return [...own, d.x.label, d.x.unit, d.y.label, d.y.unit, ...labels(d.series)];
    case 'bar-chart': return [...own, d.unit, ...labels(d.bars)];
    case 't-account': return [...own, d.account, d.unit, ...labels(d.debits), ...labels(d.credits)];
    case 'waterfall': return [...own, d.unit, ...labels(d.changes)];
  }
}
