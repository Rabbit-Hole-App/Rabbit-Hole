// The /animation (animation3d) capability registry: what the currently enabled phase may use (plan section 3 "Planner contract",
// section 5 "Proposed feature limits"). The contract (contract.js) knows every reserved enum value; this file decides which are
// enabled. The server chooses the phase; validators accept only a registry object exported here (contract.js resolveCapabilities),
// so nothing browser-side can enable more by passing its own object. Imports nothing: safe for server, worker and page bundles.

const deepFreeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(deepFreeze); Object.freeze(value); } return value; };

export const ANIMATION_CAPABILITIES = deepFreeze({
  version: 'animation-capabilities/1',
  phase: 'mvp',
  experiences: ['inspect', 'watch', 'experiment', 'game'], // reserved, not enabled: assembly, walkthrough
  behaviors: ['prescribed', 'analytical', 'rules'], // reserved, not enabled: physics
  controlProfiles: ['inspect', 'manipulate'], // reserved, not enabled: walk
  // Node geometry kinds. A node without geometry is a group (always available).
  geometry: ['box', 'sphere', 'cylinder', 'cone', 'plane', 'line', 'curve', 'arrow', 'label'],
  events: ['parameter', 'action', 'select', 'drag_start', 'drag_move', 'drag_end', 'step'],
  // Values a plan may list in requiredCapabilities. Reserved post-MVP features (physics, assembly, walkthrough, attached_models,
  // image_reference) are known to the contract and refused here.
  features: ['loop', 'speed', 'seek', 'parameters', 'actions', 'select', 'drag', 'step', 'labels', 'readouts'],
  seekBehaviors: ['prescribed', 'analytical'], // rule-based state is not seekable; restart instead
  speeds: [0.25, 0.5, 1, 2],
  stepSeconds: 1 / 30, // the host-owned fixed dt for a stepped rules scene
  limits: {
    nodes: 256, // authored logical nodes, groups included
    triangles: 100000, // procedural triangles after expansion (contract.js triangleCost), summed over every node
    linePoints: 4096, // line points plus tessellated curve points, summed over every node
    parameters: 8,
    actions: 8,
    labels: 24, // label nodes plus readouts
    sourceRefs: 0, // attached assets are post-MVP (AN-09); the contract reserves the field
    sourceBytes: 16 * 1024, // the QuickJS program source, as /explain
  },
});

// Every registry a validator accepts. A later phase is a new entry here, chosen by the server.
export const CAPABILITY_REGISTRIES = Object.freeze([ANIMATION_CAPABILITIES]);
