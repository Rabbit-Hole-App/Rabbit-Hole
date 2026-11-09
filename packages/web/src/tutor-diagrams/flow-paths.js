export function flowPathShape({ z, id }) {
  const route = z.array(id).min(2).max(12);
  return z.union([route, z.array(route).length(2)]);
}

export function flowPaths(highlightPath) {
  if (!highlightPath) return [];
  return Array.isArray(highlightPath[0]) ? highlightPath : [highlightPath];
}

export function validateFlowPaths({ nodes, edges, highlightPath }, issue) {
  const paths = flowPaths(highlightPath);
  if (!paths.length) return;
  const byId = new Map(nodes.map(node => [node.id, node]));
  const at = ['highlightPath'];
  const paired = paths.length === 2;

  for (const [index, path] of paths.entries()) {
    const where = paired ? [...at, index] : at;
    if (new Set(path).size !== path.length) return issue(where, 'A highlighted path cannot repeat a node');
    const unknown = path.findIndex(step => !byId.has(step));
    if (unknown >= 0) return issue([...where, unknown], 'The highlighted path names an unknown node');
    for (let i = 1; i < path.length; i++) {
      if (!edges.some(edge => edge.from === path[i - 1] && edge.to === path[i])) {
        return issue([...where, i], 'The highlighted path must follow existing edges in their direction');
      }
    }
    if (edges.some(edge => edge.to === path[0])) {
      return issue([...where, 0], 'The highlighted path must start at the start node of the flow');
    }
    if (edges.some(edge => edge.from === path.at(-1))) {
      return issue([...where, path.length - 1], 'The highlighted path must end at a node with no outgoing edge');
    }
  }
  if (!paired) return;

  const [first, second] = paths;
  const split = first.findIndex((step, index) => step !== second[index]);
  if (split < 0) return issue(at, 'Highlighted paths must be distinct');
  if (byId.get(first[split - 1])?.role !== 'fork') return issue(at, 'Highlighted paths must diverge at a fork');
  if (first.at(-1) !== second.at(-1)) return issue(at, 'Highlighted paths must end at the same terminal');

  const join = first.findIndex((step, index) => index >= split && second.includes(step));
  const merge = first[join];
  if (byId.get(merge)?.role !== 'merge') return issue(at, 'Highlighted paths must reconverge at a merge');
  const tail = first.slice(join);
  const otherTail = second.slice(second.indexOf(merge));
  if (tail.length !== otherTail.length || tail.some((step, index) => step !== otherTail[index])) {
    return issue(at, 'Highlighted paths must stay together after their merge');
  }
}
