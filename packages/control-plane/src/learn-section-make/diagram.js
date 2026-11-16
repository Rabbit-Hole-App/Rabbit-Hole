// Learn sections C §8: a diagram item, made by the typed /diagram command (flow_diagram, or mermaid_diagram for a shape flow cannot draw).
// The Make turn names the nodes and arrows it will ask for; every node maps to one of the beat's anchors or a term already taught.
const MAX_REQUEST = 1000, MAX_EDGES = 20;
// A file name, a path or a flag (labels are plain words; the file name goes in `detail`).
export const PATHLIKE = /[\\/]|\b[\w-]+\.(?:py|js|mjs|ts|jsx|json|md|txt|bin|pkl|pt|ipynb|toml|ya?ml|cfg|ini|sh|csv)\b|(?:^|\s)--?[a-z][\w-]*/i;
// ctx.taught: the terms of earlier beats and sections, read as strings or { term } objects, either directly or under `terms`.
export const taughtTerms = taught => (Array.isArray(taught) ? taught : [...(taught?.terms ?? []), ...(taught?.ideas ?? [])])
  .map(t => String(typeof t === 'string' ? t : t?.term ?? t?.name ?? '').trim().toLowerCase()).filter(Boolean);

export const fields = {
  request: { type: 'string', maxLength: 600, description: 'The /diagram request, from the template.' },
  nodes: {
    type: 'array', minItems: 3, maxItems: 10,
    items: {
      type: 'object', additionalProperties: false, required: ['label'], properties: {
        label: { type: 'string', maxLength: 60, description: 'Plain words, no file names.' },
        detail: { type: 'string', maxLength: 60, description: 'The file name, when the reader will open it next.' },
        anchor: { type: 'string', maxLength: 300, description: 'The beat anchor this node stands for.' },
        term: { type: 'string', maxLength: 60, description: 'Or the taught term it stands for.' },
      },
    },
  },
  edges: { type: 'array', maxItems: MAX_EDGES, items: { type: 'object', additionalProperties: false, required: ['from', 'to'], properties: { from: { type: 'string', maxLength: 60 }, to: { type: 'string', maxLength: 60 } } } },
};
export const required = ['request', 'nodes', 'edges'];
export const tools = ['read_source', 'search_code', 'get_relationships'];

export async function validate(input, ctx) {
  const request = String(input.request ?? '').trim(), nodes = input.nodes ?? [], edges = input.edges ?? [];
  if (!request) return { error: 'Write the /diagram request' };
  if (nodes.length < 3 || nodes.length > 10) return { error: 'A diagram has 3 to 10 nodes' };
  if (edges.length > MAX_EDGES) return { error: `At most ${MAX_EDGES} arrows` };
  const anchors = ctx.beat?.anchors ?? [], terms = taughtTerms(ctx.taught);
  for (const node of nodes) {
    const label = String(node.label ?? '').trim();
    if (!label) return { error: 'Every node needs a label' };
    if (PATHLIKE.test(label)) return { error: `The node "${label}" names a file or flag; put the file name in detail and the label in plain words` };
    const anchored = node.anchor && anchors.includes(node.anchor), taught = node.term && terms.includes(String(node.term).trim().toLowerCase());
    if (!anchored && !taught) return { error: `The node "${label}" maps to no anchor of this beat (${anchors.join(', ') || 'none'}) and no term taught so far; draw only what the source shows` };
  }
  const labels = new Set(nodes.map(n => n.label.trim()));
  const loose = edges.find(e => !labels.has(String(e.from).trim()) || !labels.has(String(e.to).trim()));
  if (loose) return { error: `The arrow ${loose.from} -> ${loose.to} joins a node the diagram does not have` };
  if (PATHLIKE.test(request)) return { error: 'The request names a file or flag; use plain words' };
  // The checked nodes and arrows ride in the command line, so the drawn diagram is the checked one.
  const line = `/diagram ${request} Nodes: ${nodes.map(n => (n.detail ? `${n.label.trim()} (${n.detail})` : n.label.trim())).join('; ')}.${edges.length ? ` Arrows: ${edges.map(e => `${e.from} -> ${e.to}`).join(', ')}.` : ''}`;
  if (line.length > MAX_REQUEST) return { error: `The request with its nodes and arrows is over ${MAX_REQUEST} characters; shorten it` };
  return { perform: { op: 'slash', line, madeBy: 'learn-section' } };
}
