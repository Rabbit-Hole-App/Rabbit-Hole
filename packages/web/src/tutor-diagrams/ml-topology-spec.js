// Additive semantics only. The shared spec retains tree/flow identity, cycle,
// binary-slot, and edge-reference checks for both old and extended diagrams.
import { flowPaths } from './flow-paths.js';
import { tensorText } from './tensor-spec.js';

export function createShapes({ z, titled, text, id, numeric, node, axes, tensorNode = node, flowPath = z.array(id).min(2).max(12) }) {
  const endpoint = { from: id, to: id };
  return [
    z.strictObject({
      ...titled, kind: z.literal('tree'), layout: z.enum(['binary', 'hierarchy', 'dendrogram']).optional(),
      nodes: z.array(z.strictObject({
        ...node, parent: id.optional(), side: z.enum(['left', 'right']).optional(),
        edgeLabel: text(30).optional(), count: numeric.int().nonnegative().optional(),
        detail: text(90).optional(), pruned: z.boolean().optional(), height: numeric.nonnegative().optional(),
      })).min(2).max(12),
      highlightPath: z.array(id).min(2).max(12).optional(),
      heightAxis: axes.optional(), cutoff: z.strictObject({ value: numeric, label: text(48) }).optional(),
    }),
    z.strictObject({
      ...titled, kind: z.literal('relationship'), layout: z.literal('graph').optional(),
      nodes: z.array(z.strictObject(tensorNode)).min(2).max(8),
      edges: z.array(z.strictObject({ ...endpoint, label: text(48) })).min(1).max(12),
    }),
    z.strictObject({
      ...titled, kind: z.literal('flow'),
      // title (item 47): the server-written full text of a trimmed label, the node's tooltip; spec.js removes it from the author schema.
      nodes: z.array(z.strictObject({ ...tensorNode, role: z.enum(['process', 'decision', 'outcome', 'fork', 'merge']), title: text(240).optional() })).min(2).max(12),
      edges: z.array(z.strictObject({ ...endpoint, label: text(30).optional() })).min(1).max(20),
      highlightPath: flowPath.optional(),
    }),
  ];
}

export const extendedTree = d => d.layout === 'hierarchy' || d.layout === 'dendrogram' || !!d.highlightPath ||
  d.nodes.some(n => ['edgeLabel', 'count', 'detail', 'pruned', 'height'].some(key => n[key] !== undefined));
export const extendedFlow = d => d.nodes.some(n => n.role === 'fork' || n.role === 'merge');
const nodeName = node => node.label ?? node.tensor?.name ?? node.tensor?.dimensions;
const tensors = d => d.nodes.flatMap(n => n.tensor ? tensorText(n.tensor) : []);
export const flowLabel = node => node.role === 'fork' ? `Parallel: ${nodeName(node)}` : node.role === 'merge' ? `Merge: ${nodeName(node)}` : node.label;
export const nodeMetadata = node => [node.count !== undefined ? `n = ${node.count}` : null, node.detail, node.pruned ? 'Pruned' : null].filter(Boolean);

function validateTree(d, issue) {
  const byId = new Map(d.nodes.map(n => [n.id, n]));
  const children = new Map(d.nodes.map(n => [n.id, d.nodes.filter(c => c.parent === n.id)]));
  d.nodes.forEach((n, i) => {
    if (n.parent === undefined && n.edgeLabel !== undefined) issue(['nodes', i, 'edgeLabel'], 'Only a child has an incoming edge label');
    const parent = byId.get(n.parent);
    if (parent?.count !== undefined && n.count !== undefined && n.count > parent.count) {
      issue(['nodes', i, 'count'], 'A child count cannot exceed its parent count');
    }
  });
  if (d.highlightPath) {
    const route = d.highlightPath;
    if (new Set(route).size !== route.length) issue(['highlightPath'], 'A highlighted tree path cannot repeat a node');
    route.forEach((id, i) => {
      const node = byId.get(id);
      if (!node) return issue(['highlightPath', i], 'The highlighted path names an unknown tree node');
      if (i === 0 && node.parent !== undefined) issue(['highlightPath', i], 'A highlighted tree path starts at the root');
      if (i > 0 && node.parent !== route[i - 1]) issue(['highlightPath', i], 'A highlighted tree path must follow parent-to-child edges');
      if (node.pruned) issue(['highlightPath', i], 'A highlighted path cannot enter a pruned branch');
    });
  }
  if (d.layout !== 'dendrogram') {
    if (d.heightAxis !== undefined || d.cutoff !== undefined) issue(['layout'], 'Height axes and cutoffs require the dendrogram layout');
    d.nodes.forEach((n, i) => { if (n.height !== undefined) issue(['nodes', i, 'height'], 'Merge heights require the dendrogram layout'); });
    return;
  }
  if (!d.heightAxis) issue(['heightAxis'], 'A dendrogram requires an explicit merge-height axis');
  else if (d.heightAxis.min !== 0 || d.heightAxis.max <= 0) issue(['heightAxis'], 'A dendrogram height axis starts at zero and has a positive maximum');
  d.nodes.forEach((n, i) => {
    if (n.height === undefined) return issue(['nodes', i, 'height'], 'Every dendrogram node needs a numeric height');
    if (d.heightAxis && n.height > d.heightAxis.max) issue(['nodes', i, 'height'], 'A merge height must fit the height axis');
    const descendants = children.get(n.id);
    if (!descendants.length && n.height !== 0) issue(['nodes', i, 'height'], 'A dendrogram leaf has height zero');
    if (descendants.length === 1) issue(['nodes', i], 'A dendrogram merge needs at least two children');
    if (descendants.some(child => child.height > n.height)) issue(['nodes', i, 'height'], 'A merge height cannot be lower than a child height');
  });
  if (d.cutoff && d.heightAxis && (d.cutoff.value < 0 || d.cutoff.value > d.heightAxis.max)) {
    issue(['cutoff', 'value'], 'The cutoff must be inside the dendrogram height axis');
  }
}

export function validate(d, issue) {
  if (d.kind === 'tree') validateTree(d, issue);
  if (d.kind === 'relationship' && d.layout === 'graph') {
    const neighbors = new Map(d.nodes.map(n => [n.id, []]));
    for (const edge of d.edges) {
      neighbors.get(edge.from)?.push(edge.to);
      neighbors.get(edge.to)?.push(edge.from);
    }
    const seen = new Set(), pending = [d.nodes[0].id];
    while (pending.length) {
      const id = pending.pop();
      if (seen.has(id)) continue;
      seen.add(id);
      pending.push(...(neighbors.get(id) ?? []).filter(next => !seen.has(next)));
    }
    if (d.nodes.some(n => !seen.has(n.id))) issue(['edges'], 'The graph layout needs one connected relationship graph');
  }
  if (d.kind === 'flow') d.nodes.forEach((node, i) => {
    const incoming = d.edges.filter(e => e.to === node.id).length;
    const outgoing = d.edges.filter(e => e.from === node.id).length;
    if (node.role === 'fork' && outgoing < 2) issue(['nodes', i, 'role'], 'A fork needs at least two simultaneous outgoing routes');
    if (node.role === 'merge' && (incoming < 2 || outgoing !== 1)) issue(['nodes', i, 'role'], 'A merge needs at least two incoming routes and exactly one outgoing route');
  });
}

const connections = d => {
  const names = new Map(d.nodes.map(n => [n.id, nodeName(n)]));
  return d.edges.map(e => `${names.get(e.from)}${e.label ? ` — ${e.label}` : ''} → ${names.get(e.to)}`);
};
const heightText = (n, d) => `${n.height}${d.heightAxis?.unit ? ` ${d.heightAxis.unit}` : ''}`;

export function describe(d) {
  if (d.kind === 'tree' && extendedTree(d)) {
    const names = new Map(d.nodes.map(n => [n.id, n.label]));
    return [
      ...(d.layout === 'dendrogram' ? [`${d.heightAxis.label}: 0 to ${d.heightAxis.max}${d.heightAxis.unit ? ` ${d.heightAxis.unit}` : ''}`] : []),
      ...d.nodes.map(n => [n.parent === undefined ? `Root: ${n.label}` :
        `${names.get(n.parent)} → ${n.label}${n.side ? ` (${n.side} child)` : ''}${n.edgeLabel ? `; branch: ${n.edgeLabel}` : ''}`,
      ...nodeMetadata(n), ...(d.layout === 'dendrogram' ? [`height = ${heightText(n, d)}`] : [])].join('; ')),
      ...(d.highlightPath ? [`Highlighted path: ${d.highlightPath.map(id => names.get(id)).join(' → ')}`] : []),
      ...(d.cutoff ? [`Cutoff: ${d.cutoff.label} = ${d.cutoff.value}${d.heightAxis?.unit ? ` ${d.heightAxis.unit}` : ''}`] : []),
    ];
  }
  if (d.kind === 'relationship' && d.layout === 'graph') return [...connections(d), ...tensors(d)];
  if (d.kind === 'flow' && extendedFlow(d)) return [
    ...d.nodes.filter(n => n.role === 'fork' || n.role === 'merge').map(n => n.role === 'fork'
      ? `${nodeName(n)}: simultaneous parallel routes` : `${nodeName(n)}: merge incoming routes before continuing`),
    ...connections(d), ...tensors(d),
    ...flowPaths(d.highlightPath).map(path => `Highlighted path: ${path.map(id => nodeName(d.nodes.find(n => n.id === id))).join(' → ')}`),
  ];
  return null;
}

export function visibleText(d) {
  const own = [d.title, d.caption].filter(Boolean);
  if (d.kind === 'tree' && extendedTree(d)) return [
    ...own, ...d.nodes.flatMap(n => [n.label, n.edgeLabel, ...nodeMetadata(n),
      ...(d.layout === 'dendrogram' ? [`height = ${heightText(n, d)}`] : [])].filter(Boolean)),
    ...(d.heightAxis ? [d.heightAxis.label, d.heightAxis.unit].filter(Boolean) : []),
    ...(d.cutoff ? [`Cutoff: ${d.cutoff.label} = ${d.cutoff.value}`] : []),
  ];
  if (d.kind === 'relationship' && d.layout === 'graph') return [...own, ...d.nodes.map(n => n.label), ...connections(d), ...tensors(d)];
  if (d.kind === 'flow' && extendedFlow(d)) return [...own, ...d.nodes.map(flowLabel), ...d.edges.map(e => e.label).filter(Boolean), ...tensors(d)];
  return null;
}
