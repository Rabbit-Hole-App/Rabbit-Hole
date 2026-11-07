import { z } from 'zod';

const MAX_JSON_LENGTH = 16_384;
// Text is rendered literally. The SVG renderer must escape XML punctuation.
const invalidXmlText = /[\u0000-\u001f\u007f\ud800-\udfff\ufffe\uffff]/u;
const text = max => z.string().min(1).max(max)
  .refine(value => value.trim().length > 0 && !invalidXmlText.test(value), 'Use nonblank, single-line diagram text');
const id = z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,31}$/, 'Use a simple ID starting with a letter (at most 32 characters)');
const titled = { title: text(90), caption: text(140).optional() };
const endpoint = { from: id, to: id };

const diagramShape = z.discriminatedUnion('kind', [
  z.strictObject({
    ...titled, kind: z.literal('flow'),
    nodes: z.array(z.strictObject({ id, label: text(60), role: z.enum(['process', 'decision', 'outcome']) })).min(2).max(12),
    edges: z.array(z.strictObject({ ...endpoint, label: text(30).optional() })).min(1).max(20),
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
]);
const shape = z.strictObject({ version: z.literal(1), diagram: diagramShape });

function checkFlow({ nodes, edges }, issue) {
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
  if (ordered.length !== nodes.length) issue(['edges'], 'A flow cannot contain a cycle or unreachable nodes');
}

function checkSequence({ actors, messages }, issue) {
  const ids = new Set(actors.map(actor => actor.id));
  if (ids.size !== actors.length) return issue(['actors'], 'Sequence actors need unique IDs');
  for (const [index, { from, to }] of messages.entries()) {
    if (!ids.has(from) || !ids.has(to)) issue(['messages', index], 'Message refers to an unknown actor');
    else if (from === to) issue(['messages', index], 'An actor cannot send a message to itself');
  }
}

export const tutorDiagramSchema = shape.superRefine(({ diagram }, ctx) => {
  const issue = (path, message) => ctx.addIssue({ code: 'custom', path: ['diagram', ...path], message });
  switch (diagram.kind) {
    case 'flow': checkFlow(diagram, issue); break;
    case 'sequence': checkSequence(diagram, issue); break;
    case 'matrix':
      diagram.rows.forEach(({ cells }, index) => {
        if (cells.length !== diagram.columns.length) issue(['rows', index, 'cells'], 'The number of cells must match the number of columns');
      });
      break;
  }
});

// Provider constraints describe the JSON shape. The local parse additionally
// checks topology, labels and row widths that JSON Schema cannot express here.
const { $schema, ...jsonSchema } = z.toJSONSchema(shape, { target: 'draft-7', io: 'input' });
export const tutorDiagramJsonSchema = jsonSchema;

export function parseTutorDiagram(value) {
  if (typeof value === 'string') {
    if (value.length > MAX_JSON_LENGTH) throw new Error('Diagram JSON is too long');
    try { value = JSON.parse(value); }
    catch { throw new Error('Invalid diagram JSON'); }
  }
  return tutorDiagramSchema.parse(value);
}

function describeConnections(nodes, edges) {
  const names = new Map(nodes.map(({ id, label }) => [id, label]));
  return edges.map(({ from, to, label }) => `${names.get(from)}${label ? ` — ${label}` : ''} → ${names.get(to)}`);
}

function describeContent(diagram) {
  switch (diagram.kind) {
    case 'flow': return describeConnections(diagram.nodes, diagram.edges);
    case 'comparison': return diagram.columns.map(({ heading, items }) => `${heading}: ${items.join('; ')}`);
    case 'timeline': return diagram.events.map(({ time, label, detail }) => `${time}: ${[label, detail].filter(Boolean).join(' — ')}`);
    case 'sequence': return [diagram.actors.map(actor => actor.label).join(', '), ...describeConnections(diagram.actors, diagram.messages)];
    case 'matrix':
      return diagram.rows.map(({ heading, cells }) => `${heading}: ${cells.map((cell, index) => `${diagram.columns[index]}: ${cell}`).join('; ')}`);
    case 'layers': return diagram.layers.map(({ label, detail }) => [label, detail].filter(Boolean).join(' — '));
    case 'cycle': return [[...diagram.steps, diagram.steps[0]].join(' → ')];
  }
}

export function describeTutorDiagram({ diagram }) {
  return [diagram.title, ...describeContent(diagram), diagram.caption].filter(Boolean).join('\n');
}
