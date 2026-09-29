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
  { name: 'research', group: 'mode', places: ALL, desc: { home: 'Find sources', project: 'Find sources', learn: 'Bring sources and evidence' } },
  { name: 'do', group: 'mode', places: ALL, desc: { home: 'Take an action', project: 'Take an action', learn: 'Act on the canvas' } },
  // Home, Library and Project shortcuts: each routes as its sentence (router.js rule 1b).
  { name: 'find', group: 'shortcut', places: WORKSPACE, desc: 'Search your library' },
  { name: 'open', group: 'shortcut', places: WORKSPACE, desc: 'Go to a resource' },
  { name: 'new', group: 'shortcut', places: ['home'], desc: 'Start a rabbit hole' },
  { name: 'connect', group: 'shortcut', places: WORKSPACE, desc: 'Connect a repository' },
  { name: 'run', group: 'shortcut', places: WORKSPACE, desc: 'Run a job', needs: 'job' },
  { name: 'share', group: 'shortcut', places: WORKSPACE, desc: 'Share this' },
  // Learn shortcuts: learning actions on the selection, or on the current concept.
  { name: 'deeper', group: 'learn', places: ['learn'], desc: 'Go one level deeper', prompt: 'Go one level deeper on {target}.' },
  { name: 'simplify', group: 'learn', places: ['learn'], desc: 'Explain it more simply', prompt: 'Explain {target} more simply. Keep the original.' },
  { name: 'example', group: 'learn', places: ['learn'], desc: 'Show a worked example', prompt: 'Give a concrete worked example of {target}.' },
  { name: 'practice', group: 'learn', places: ['learn'], desc: 'Practise it', prompt: 'Give me one practice task on {target} and wait for my answer.' },
  { name: 'quiz', group: 'learn', places: ['learn'], desc: 'Quick check', prompt: 'Ask me one short question on {target}, then wait for my answer.' },
  { name: 'compare', group: 'learn', places: ['learn'], desc: 'Compare side by side', prompt: 'Compare side by side, with {target} as context.' },
  { name: 'source', group: 'learn', places: ['learn'], desc: 'Show the evidence', action: 'open_sources' },
  { name: 'notebook', group: 'learn', places: ['learn'], desc: 'Add a notebook', action: 'insert_notebook' },
];

// Product availability (places, needs) is what Rabbit Hole offers. The review copy adds its own
// safety limits on top: a command the product offers may be off here because running it would
// touch live infrastructure. Those limits live only in reviewOff, never in the product list.
export const ASK_OFF = 'Asking about the workspace or apps is off on this preview: it would write to live chat history.';
const RESEARCH_OFF = 'Research here would call the live model, so it is off on this preview.';
export function reviewOff(name, kind, { askLive = false } = {}) {
  if (name === 'ask' && !askLive && (kind === 'workspace' || kind === 'app')) return { reason: ASK_OFF, short: 'Off on this preview' };
  // Only canvas research runs on the preview's own LEARN_DB; elsewhere it reaches the live model.
  if (name === 'research' && kind !== 'canvas') return { reason: RESEARCH_OFF, short: 'Off on this preview' };
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

// A Learn command as one semantic request. Prompt commands go through the existing Learn ask;
// action commands name the Learn action to run; the selection always travels as context.
export function learnRequest(name, { args = '', selection = null } = {}) {
  const command = SLASH.find((c) => c.name === name && c.places.includes('learn'));
  if (!command) throw Error(`/${name} is not a Learn command`);
  if (selection && !SELECTIONS.includes(selection.kind)) throw Error(`unknown selection: ${selection.kind}`);
  const base = { kind: 'learn', command: name };
  if (command.group === 'mode') return { ...base, mode: name, prompt: args, context: selection };
  if (command.action) return { ...base, action: command.action, prompt: args, context: selection };
  const prompt = command.prompt.replace('{target}', targetOf(selection));
  return { ...base, prompt: args ? `${prompt} Focus: ${args}.` : prompt, context: selection };
}
