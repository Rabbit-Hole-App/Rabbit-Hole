// Mocked handler answers for the inline AI browser check (docs/features/inline-ai-editor.md A6): one per artifact
// handler, each block built by the real artifactBlock() so it matches what /api/learn/artifact returns - including its
// paid proposals, clarification and error answers. These prove the inline adapter's contract, never a provider.
import { artifactBlock } from '../../control-plane/src/learn-primitives.js';
import { imageSearchBlock, motionProposal } from '../src/learn-slash.js';

const artifact = (primitive, input) => ({ result: 'artifact', primitive, block: artifactBlock(primitive, input), repaired: false });
const paid = (primitive, input) => ({ result: 'paid_proposal', primitive, block: artifactBlock(primitive, input), message: 'This uses paid generation.', estimatedCost: null, repaired: false });

export const HANDLERS = {
  explain: () => artifact('explanation', { title: 'Why node 23 is a leaf', body: 'Node 23 hangs from node 4 and has no children of its own, so it ends its branch.' }),
  code: () => artifact('code_sample', { title: 'Leaves of a tree', brief: 'Collects the nodes with no children.', code: 'def leaves(tree, node):\n    kids = tree.get(node, [])\n    if not kids:\n        return [node]\n    return [leaf for kid in kids for leaf in leaves(tree, kid)]' }),
  diagram: () => artifact('flow_diagram', { title: 'Where node 23 sits', direction: 'DOWN', nodes: [{ id: 'n4', label: 'node 4' }, { id: 'n3', label: 'node 3' }, { id: 'n23', label: 'node 23 (leaf)' }], edges: [{ source: 'n4', target: 'n3' }, { source: 'n4', target: 'n23' }] }),
  graph: () => artifact('interactive_graph', { title: 'Nodes per level', brief: 'A full binary tree doubles each level.', spec: { op: 'interactive_plot', id: 'levels', renderer: 'desmos', concept: 'tree levels', expressions: [{ id: 'curve', expression: 'y=2^x' }] } }),
  walkthrough: () => artifact('walkthrough', { title: 'Finding a leaf', goal: 'Follow the branch down from the root.', steps: [{ label: 'Start at node 1' }, { label: 'Go to node 4' }, { label: 'Go to node 23: no children' }] }),
  compare: () => artifact('table', { title: 'Node 3 and node 23', caption: 'Both are children of node 4.', columns: ['Property', 'Node 3', 'Node 23'], rows: [['Parent', '4', '4'], ['Children', 'none', 'none']] }),
  animate: () => paid('maths_animation', { title: 'Counting the leaves', caption: 'Each level doubles.', operation: { op: 'generate_math_animation', id: 'leaves', concept: 'tree leaves', purpose: 'intuition', scene: { steps: [{ kind: 'equation', expressions: ['L = 2^d'] }] } } }),
  video: () => paid('video_generate', { title: 'A tree growing', caption: 'Branches split into leaves.', operation: { op: 'generate_video', id: 'tree', prompt: 'A tree diagram growing from a root node into leaves', purpose: 'physical_process' } }),
  '3d': () => paid('blender_scene', { title: 'A tree in 3D', brief: 'Spheres for nodes.', operation: { op: 'generate_3d_animation', id: 'tree3d', concept: 'tree', purpose: 'spatial_intuition', output: 'glb', scene: { objects: [{ id: 'root', type: 'sphere' }] } } }),
  // /image inserts a photo-search card with no model (runLearnCommand's own branch): the same block, staged.
  image: args => ({ result: 'artifact', primitive: 'image', block: imageSearchBlock(args) }),
};
export const MOTION = (args, about = {}) => motionProposal(args, { concept: about.concept || null }, about.selection);
export const ERRORS = {
  clarification: { result: 'clarification', question: 'Which part of the tree should the diagram show?' },
  unsupported: { result: 'unsupported', message: 'Code exercises are not available yet.' },
  validation: { result: 'validation_error', error: 'Rejected make_quiz: /diagram allows only flow_diagram, mermaid_diagram.' },
};
