// Learn sections C §8: a diagram item, made by the typed /diagram command (flow_diagram, or mermaid_diagram for a shape flow cannot draw).
// The Make turn names the nodes and arrows it will ask for. The one rule (Reviewer 2026-11-17 20:35, applied here 2026-11-18 11:35): a label or the request is refused only
// for a path, a file name or a flag (the file name goes in `detail`); a node need not map to an anchor or a taught term.
import { codeNameError } from '../learn-section-brief.js';
const MAX_REQUEST = 1000, MAX_EDGES = 20;

export const fields = {
  request: { type: 'string', maxLength: 600, description: 'The /diagram request, from the template.' },
  nodes: {
    type: 'array', minItems: 3, maxItems: 10,
    items: {
      type: 'object', additionalProperties: false, required: ['label'], properties: {
        label: { type: 'string', maxLength: 60, description: 'Plain words, no file names.' },
        detail: { type: 'string', maxLength: 60, description: 'The file name, when the reader will open it next.' },
        anchor: { type: 'string', maxLength: 300, description: 'The beat anchor this node stands for, if any.' },
        term: { type: 'string', maxLength: 60, description: 'Or the taught term it stands for, if any.' },
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
  for (const node of nodes) {
    const label = String(node.label ?? '').trim();
    if (!label) return { error: 'Every node needs a label' };
    const wrong = codeNameError(label);
    if (wrong) return { error: `The node "${label}" ${wrong}; put the file name in detail and the label in plain words` };
  }
  const labels = new Set(nodes.map(n => n.label.trim()));
  const loose = edges.find(e => !labels.has(String(e.from).trim()) || !labels.has(String(e.to).trim()));
  if (loose) return { error: `The arrow ${loose.from} -> ${loose.to} joins a node the diagram does not have` };
  const wrongRequest = codeNameError(request);
  if (wrongRequest) return { error: `The request ${wrongRequest}; use plain words` };
  // The checked nodes and arrows ride in the command line, so the drawn diagram is the checked one.
  const line = `/diagram ${request} Nodes: ${nodes.map(n => (n.detail ? `${n.label.trim()} (${n.detail})` : n.label.trim())).join('; ')}.${edges.length ? ` Arrows: ${edges.map(e => `${e.from} -> ${e.to}`).join(', ')}.` : ''}`;
  if (line.length > MAX_REQUEST) return { error: `The request with its nodes and arrows is over ${MAX_REQUEST} characters; shorten it` };
  return { perform: { op: 'slash', line, madeBy: 'learn-section' } };
}
