// Built-in answers about Rabbit Hole itself (user, 2026-09-28): "What is a Project?" gets a real
// answer without a model call - on the preview, workspace asks are off (G1). Wording follows the
// product model in docs/features/rabbit-hole-checklist.md.
const CONCEPTS = {
  project: '**A Project** is the learning hub around a codebase or topic, like nanoGPT. It holds the source repository, its Map, your Learn canvases, sources, and any apps built from it. Open one to find Overview, Learn and Map.',
  canvas: '**A Canvas** is one learning workspace: cards, notes, drawings, sources, notebooks and interactions. Opening a canvas takes you straight into Learn. Its content lives in the browser that made it.',
  app: '**An App** is something you run or deploy: a server or a job. It has a status, deployments or runs, inputs and outputs, and logs. A Project can produce several apps. Jobs can be run; servers open their address.',
  library: '**The Library** is everything you can return to: Projects and Canvases as cards, Apps as operational rows. Use Filters to narrow it by type or owner, or ask here, for example "show my canvases".',
  explore: '**Explore** is where rabbit holes shared beyond your library will appear. For now it shows examples; nothing is published yet.',
  mothership: '**The Mothership** is this bar. It steers Rabbit Hole: ask, teach, research or do, or type / for shortcuts like /find, /open, /new and /connect.',
  'source owner': '**The Source owner badge** means the resource was created by the owner of its source repository. It does not mean identity verification, quality, endorsement or popularity.',
  help: 'I can find, open and start things, and answer questions about projects and canvases. Try "find nanoGPT", "open my last project", "new canvas called Attention" or "connect karpathy/minGPT", or type / to see every shortcut.',
};

export const CONCEPT_NAMES = Object.keys(CONCEPTS);
export const explain = (concept) => CONCEPTS[concept] || CONCEPTS.help;
