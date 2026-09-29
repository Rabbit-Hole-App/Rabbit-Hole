// One slash-command model for every Rabbit Hole input (user, 2026-09-28). The Agent Bar reads it, and
// the Learn composer (owned by the Learn branches) imports this same module: there is one command
// system. Each command names the places it shows in, what it needs, and the semantic request it
// becomes. Pure - no React, no stores - so Learn code can import it without the bar.
// Contract for the Learn owners: docs/features/rabbit-hole-commands.md.

// Places: 'home' is Home, Library and Explore (workspace scope); 'project' is the Project hub and its
// Map; 'learn' is the Learn composer.
export const placeOf = (scope) => (scope.kind === 'workspace' ? 'home' : scope.kind === 'canvas' ? 'learn' : scope.kind);

// Selection context: what the learner has selected when they send. The bar produces 'project' and
// 'map_node' today; the owning branches add the rest when they expose them (shapes in the contract doc).
export const SELECTIONS = ['project', 'map_node', 'card', 'equation', 'notebook_cell', 'notebook_file', 'canvas_object'];

const ALL = ['home', 'project', 'learn'];
const WORKSPACE = ['home', 'project'];
export const SLASH = [
  // The four modes: global intents whose meaning adapts to the place.
  { name: 'ask', group: 'mode', places: ALL, desc: { home: 'Ask about this workspace', project: 'Ask about this project', learn: 'Explain what you are looking at' } },
  { name: 'teach', group: 'mode', places: ALL, desc: { home: 'Start or extend learning', project: 'Learn this in a canvas', learn: 'Continue teaching' } },
  { name: 'research', group: 'mode', places: ALL, desc: { home: 'Find sources', project: 'Find sources', learn: 'Find supporting sources' } },
  { name: 'do', group: 'mode', places: ALL, desc: { home: 'Take an action', project: 'Take an action', learn: 'Act on the canvas' } },
  // Home, Library and Project shortcuts: each routes as its sentence (router.js rule 1b).
  { name: 'find', group: 'shortcut', places: WORKSPACE, desc: 'Search your library' },
  { name: 'open', group: 'shortcut', places: WORKSPACE, desc: 'Go to a resource' },
  { name: 'new', group: 'shortcut', places: ['home'], desc: 'Start a rabbit hole' },
  { name: 'connect', group: 'shortcut', places: WORKSPACE, desc: 'Connect a repository' },
  { name: 'run', group: 'shortcut', places: WORKSPACE, desc: 'Run a job', needs: 'job' },
  { name: 'share', group: 'shortcut', places: WORKSPACE, desc: 'Share this' },
  // Learn intents: learning actions on the selection, or on the current concept. A `family` narrows the
  // primitives the tutor may return; without one the tutor chooses (Auto).
  { name: 'deeper', group: 'learn', places: ['learn'], desc: 'Go deeper', prompt: 'Go one level deeper on {target}.' },
  { name: 'simplify', group: 'learn', places: ['learn'], desc: 'Explain more simply', prompt: 'Explain {target} more simply. Keep the original.' },
  { name: 'example', group: 'learn', places: ['learn'], desc: 'Show a concrete example', prompt: 'Give a concrete worked example of {target}.' },
  { name: 'practice', group: 'learn', places: ['learn'], desc: 'Let me try it', prompt: 'Give me one practice task on {target} and wait for my answer.',
    family: ['challenge', 'explain_back', 'quiz', 'code_exercise'],
    narrow: [[/explain(ing)? it back/i, 'explain_back'], [/\bcoding\b/i, 'code_exercise'], [/multiple[- ]choice/i, 'quiz']] },
  { name: 'quiz', group: 'learn', places: ['learn'], desc: 'Test me', prompt: 'Ask me one short question on {target}, then wait for my answer.', family: ['quiz'] },
  { name: 'compare', group: 'learn', places: ['learn'], desc: 'Compare ideas', prompt: 'Compare side by side, with {target} as context.',
    family: ['table', 'interactive_graph', 'data_plot', 'flow_diagram', 'mermaid_diagram', 'animation'] },
  { name: 'source', group: 'learn', places: ['learn'], desc: 'Show the evidence', action: 'open_sources', deterministic: true },
  // Create: tool overrides (user, 2026-09-28). Auto stays the default; a command names the family the tutor
  // must return a validated block from, or it asks a clarifying question. Deterministic ones run no model.
  { name: 'explain', group: 'create', places: ['learn'], desc: 'Add an explanation', family: ['explanation', 'table', 'narration'] },
  { name: 'flashcards', group: 'create', places: ['learn'], desc: 'Add flashcards', family: ['flashcards'] },
  { name: 'code', group: 'create', places: ['learn'], desc: 'Add code', family: ['code_sample', 'code_exercise'] },
  { name: 'graph', group: 'create', places: ['learn'], desc: 'Add a graph or plot', family: ['interactive_graph', 'data_plot', 'knowledge_graph'] },
  { name: 'diagram', group: 'create', places: ['learn'], desc: 'Add a diagram', family: ['flow_diagram', 'mermaid_diagram'] },
  { name: 'walkthrough', group: 'create', places: ['learn'], desc: 'Add a walkthrough', family: ['walkthrough'] },
  { name: 'animate', group: 'create', places: ['learn'], desc: 'Add an animation', family: ['animation', 'reference_attention', 'maths_animation'] },
  { name: 'whiteboard', group: 'create', places: ['learn'], desc: 'Add a whiteboard', family: ['whiteboard'], action: 'insert_whiteboard', deterministic: true },
  { name: 'paper', group: 'create', places: ['learn'], desc: 'Open a paper', family: ['paper'], action: 'insert_paper', deterministic: true },
  { name: 'image', group: 'create', places: ['learn'], desc: 'Add an image', family: ['image', 'image_generate'] },
  { name: 'video', group: 'create', places: ['learn'], desc: 'Add a video', family: ['video', 'video_generate'] },
  { name: '3d', group: 'create', places: ['learn'], desc: 'Add a 3D model', family: ['3d_model', 'blender_scene'] },
  { name: 'notebook', group: 'create', places: ['learn'], desc: 'Add a notebook', family: ['notebook'], action: 'insert_notebook', deterministic: true },
  { name: 'more', group: 'create', places: ['learn'], desc: 'More learning tools', action: 'open_tool_catalog', deterministic: true },
];

// The Learn picker's primary menu, in order. Every other Learn command is reached through /more or by
// name; /ask, /teach and /do stay available but uncrowded.
export const LEARN_MENU = {
  learn: ['deeper', 'simplify', 'example', 'practice', 'quiz', 'compare', 'research'],
  create: ['explain', 'code', 'graph', 'diagram', 'animate', 'flashcards', 'notebook', 'more'],
};

// Canvas primitives are ids the Learn branch maps to block types. A paid primitive always confirms, even
// when named with a slash: an explicit command only skips the tutor's "would this help?" proposal.
// estimatedCost stays unset - never show a guessed amount.
const PAID = ['maths_animation', 'image_generate', 'video_generate', 'blender_scene', 'narration'];
export const primitive = (id) => (PAID.includes(id) ? { id, paid: true, needsConfirm: true, estimatedCost: undefined } : { id, paid: false, needsConfirm: false });

// Product availability (places, needs) is what Rabbit Hole offers. The review copy adds its own
// safety limits on top: a command the product offers may be off here because running it would
// touch live infrastructure. Those limits live only in reviewOff, never in the product list.
// Live mutations are blocked on the review copy (T02 §16). Here, not in commands.js, so preview-only UI can
// import it without pulling commands.js's top-level code into the live bundle.
export const D7_REASON = 'Blocked on this preview: it would change live apps.';
export const ASK_OFF = 'Asking about the workspace or apps is off on this preview: it would write to live chat history.';
const RESEARCH_OFF = 'Research here would call the live model, so it is off on this preview.';
const TEACH_OFF = 'Learn on an app would ask through live chat history, so it is off on this preview.';
export function reviewOff(name, kind, { askLive = false } = {}) {
  if (name === 'ask' && !askLive && (kind === 'workspace' || kind === 'app')) return { reason: ASK_OFF, short: 'Off on this preview' };
  // Only canvas research runs on the preview's own LEARN_DB; elsewhere it reaches the live model.
  if (name === 'research' && kind !== 'canvas') return { reason: RESEARCH_OFF, short: 'Off on this preview' };
  // The preview mounts Learn only for canvases (SharePage, D7), so /teach on an app would land nowhere.
  if (name === 'teach' && kind === 'app') return { reason: TEACH_OFF, short: 'Off on this preview' };
  return null;
}

export const descFor = (command, place) => (typeof command.desc === 'string' ? command.desc : command.desc[place]);

// The commands a place can use right now. Unavailable ones are not shown.
export const commandsFor = (place, { catalog = [] } = {}) =>
  SLASH.filter((c) => c.places.includes(place) && !(c.needs === 'job' && !catalog.some((a) => a.kind === 'job')));

const LABEL = { project: 'project', map_node: 'node', card: 'card', equation: 'equation', notebook_cell: 'notebook cell', notebook_file: 'file', canvas_object: 'object' };
const targetOf = (selection) => {
  if (!selection) return 'the current concept';
  const name = selection.title || selection.label || selection.latex || selection.path || selection.id;
  return `the selected ${LABEL[selection.kind]}${name ? ` "${name}"` : ''}`;
};

// A Learn command as one semantic request. Prompt commands go through the existing Learn ask; action
// commands name the Learn action to run; the selection always travels as context. allowedPrimitives is
// what the tutor may return (null: Auto); /practice subtype words narrow it deterministically.
export function learnRequest(name, { args = '', selection = null } = {}) {
  const command = SLASH.find((c) => c.name === name && c.places.includes('learn'));
  if (!command) throw Error(`/${name} is not a Learn command`);
  if (selection && !SELECTIONS.includes(selection.kind)) throw Error(`unknown selection: ${selection.kind}`);
  const narrowed = command.narrow?.find(([words]) => words.test(args))?.[1];
  const allowedPrimitives = narrowed ? [narrowed] : command.family || null;
  const base = {
    kind: 'learn', command: name, family: command.family ? name : null, allowedPrimitives,
    deterministic: !!command.deterministic, paid: (allowedPrimitives || []).filter((id) => primitive(id).paid),
  };
  const ends = { context: selection, selection };
  if (command.group === 'mode') return { ...base, mode: name, prompt: args, ...ends };
  if (command.action) return { ...base, action: command.action, prompt: args, ...ends };
  if (!command.prompt) return { ...base, prompt: args || `${command.desc} for ${targetOf(selection)}.`, ...ends };
  const prompt = command.prompt.replace('{target}', targetOf(selection));
  return { ...base, prompt: args ? `${prompt} Focus: ${args}.` : prompt, ...ends };
}
