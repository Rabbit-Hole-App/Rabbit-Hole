// One slash-command model for every Rabbit Hole input (user, 2026-09-28). The Agent Bar reads it, and
// the Learn composer (owned by the Learn branches) imports this same module: there is one command
// system. Each command names the places it shows in, what it needs, and the semantic request it
// becomes. Pure - no React, no stores - so Learn code can import it without the bar.
// Contract for the Learn owners: docs/features/rabbit-hole-commands.md.

// Places: 'home' is Home, Library and Explore (workspace scope); 'project' is the Project hub and its
// Map; 'learn' is the Learn composer (the canvas Chat; 'chat' names the same surface); 'ctrlk' is the canvas's inline
// Ctrl+K editor; 'insert' is the canvas Insert menu (Release B, owner 2026-10-16: one registry with surface capabilities,
// no separate list per picker). Ctrl+K offers exactly the generate and source commands that list it; anything else typed
// there is reported as unavailable, never run as a different command.
// kind: 'generate' makes canvas material, 'source' opens the shared source finder (no model), 'prompt' is answered in the
// chat (modes, Learn intents, workspace shortcuts), 'dialog' opens or inserts something of its own (no generation).
// hidden: typed only, never listed by a picker or the help sheet (/paper: /arxiv is the one visible paper search).
// label: the command's name in words (the pill's "Remove <label>"); desc is the picker's line.
export const placeOf = (scope) => (scope.kind === 'workspace' ? 'home' : scope.kind === 'canvas' ? 'learn' : scope.kind);

// Selection context: what the learner has selected when they send. The bar produces 'project' and
// 'map_node' today; the owning branches add the rest when they expose them (shapes in the contract doc).
export const SELECTIONS = ['project', 'map_node', 'card', 'equation', 'notebook_cell', 'notebook_file', 'canvas_object'];

const ALL = ['home', 'project', 'learn'];
const WORKSPACE = ['home', 'project'];
// Learn's generate commands that Ctrl+K also offers (owner decision 1A, 2026-10-16).
const CTRLK = ['learn', 'ctrlk'];
export const SLASH = [
  // The four modes: global intents whose meaning adapts to the place.
  { name: 'ask', kind: 'prompt', group: 'mode', places: ALL, desc: { home: 'Ask about this workspace', project: 'Ask about this project', learn: 'Explain what you are looking at' } },
  { name: 'teach', kind: 'prompt', group: 'mode', places: ALL, desc: { home: 'Start or extend learning', project: 'Learn this in a canvas', learn: 'Continue teaching' } },
  // /research and /do are Home, Library and Project workflows, never Canvas commands (owner, 2026-10-06): the Canvas
  // composer does not offer them; their own entry points stay.
  { name: 'research', kind: 'prompt', group: 'mode', places: WORKSPACE, desc: { home: 'Find sources', project: 'Find sources' } },
  { name: 'do', kind: 'prompt', group: 'mode', places: WORKSPACE, desc: { home: 'Take an action', project: 'Take an action' } },
  // Home, Library and Project shortcuts: each routes as its sentence (router.js rule 1b).
  { name: 'find', kind: 'prompt', group: 'shortcut', places: WORKSPACE, desc: 'Search your library' },
  { name: 'open', kind: 'prompt', group: 'shortcut', places: WORKSPACE, desc: 'Go to a resource' },
  { name: 'new', kind: 'prompt', group: 'shortcut', places: ['home'], desc: 'Start a rabbit hole' },
  { name: 'connect', kind: 'prompt', group: 'shortcut', places: WORKSPACE, desc: 'Connect a repository' },
  { name: 'run', kind: 'prompt', group: 'shortcut', places: WORKSPACE, desc: 'Run a job', needs: 'job' },
  // No /share: Rabbit Hole v1 is solo. The share and unshare Ask tools stay in commands.js for later.
  // Learn intents: learning actions on the selection, or on the current concept. A `family` narrows the
  // primitives the tutor may return; without one the tutor chooses (Auto).
  { name: 'deeper', kind: 'prompt', group: 'learn', places: ['learn'], desc: 'Go deeper', prompt: 'Go one level deeper on {target}.' },
  // /dive opens a nested Rabbit Hole from the selected card (docs/features/dive-v1.md). Learn runs it itself: no model.
  { name: 'dive', kind: 'dialog', group: 'learn', places: ['learn'], desc: 'Go down a Rabbit Hole', action: 'dive', deterministic: true },
  { name: 'simplify', kind: 'prompt', group: 'learn', places: ['learn'], desc: 'Explain more simply', prompt: 'Explain {target} more simply. Keep the original.' },
  { name: 'example', kind: 'prompt', group: 'learn', places: ['learn'], desc: 'Show a concrete example', prompt: 'Give a concrete worked example of {target}.' },
  { name: 'practice', kind: 'prompt', group: 'learn', places: ['learn'], desc: 'Let me try it', prompt: 'Give me one practice task on {target} and wait for my answer.',
    family: ['challenge', 'explain_back', 'quiz', 'code_exercise'],
    narrow: [[/explain(ing)? it back/i, 'explain_back'], [/\bcoding\b/i, 'code_exercise'], [/multiple[- ]choice/i, 'quiz']] },
  { name: 'quiz', kind: 'prompt', group: 'learn', places: ['learn'], desc: 'Test me', prompt: 'Ask me one short question on {target}, then wait for my answer.', family: ['quiz'] },
  { name: 'compare', kind: 'prompt', group: 'learn', places: ['learn'], desc: 'Compare ideas', prompt: 'Compare side by side, with {target} as context.',
    family: ['table', 'interactive_graph', 'data_plot', 'flow_diagram', 'mermaid_diagram', 'animation'] },
  { name: 'source', kind: 'dialog', group: 'learn', places: ['learn'], desc: 'Show the evidence', action: 'open_sources', deterministic: true },
  // Create: tool overrides (user, 2026-09-28). Auto stays the default; a command names the family the tutor
  // must return a validated block from, or it asks a clarifying question. Deterministic ones run no model.
  { name: 'explain', kind: 'generate', group: 'create', places: CTRLK, desc: 'Add an explanation', family: ['explanation', 'table', 'narration'] },
  { name: 'flashcards', kind: 'generate', group: 'create', places: CTRLK, desc: 'Add flashcards', family: ['flashcards'] },
  { name: 'code', kind: 'generate', group: 'create', places: CTRLK, desc: 'Add code', family: ['code_sample', 'code_exercise'] },
  { name: 'graph', kind: 'generate', group: 'create', places: CTRLK, desc: 'Add a graph or plot', family: ['interactive_graph', 'data_plot', 'knowledge_graph'] },
  { name: 'diagram', kind: 'generate', group: 'create', places: CTRLK, desc: 'Add a diagram', family: ['flow_diagram', 'mermaid_diagram'] },
  { name: 'walkthrough', kind: 'generate', group: 'create', places: CTRLK, desc: 'Add a walkthrough', family: ['walkthrough'] },
  { name: 'animate', kind: 'generate', group: 'create', places: CTRLK, desc: 'Add an animation', family: ['animation', 'reference_attention', 'maths_animation'] },
  { name: 'whiteboard', kind: 'dialog', group: 'create', places: ['learn'], desc: 'Add a whiteboard', family: ['whiteboard'], action: 'insert_whiteboard', deterministic: true },
  // /paper (typed only since Release B, owner A4 2026-10-16): an arXiv ID or link opens that paper directly, a topic opens
  // the arXiv search. /arxiv is the one listed paper search.
  { name: 'paper', kind: 'source', hidden: true, group: 'create', places: ['learn'], desc: 'Open a paper', family: ['paper'], action: 'insert_paper', deterministic: true },
  { name: 'image', kind: 'generate', group: 'create', places: CTRLK, desc: 'Add an image', family: ['image', 'image_generate'] },
  { name: 'video', kind: 'generate', group: 'create', places: CTRLK, label: 'Generate video', desc: 'Generate video', family: ['video', 'video_generate'] },
  { name: '3d', kind: 'generate', group: 'create', places: CTRLK, label: '3D', desc: 'Add a 3D model', family: ['3d_model', 'blender_scene'] },
  // Development only (needs motion_dev): a paid proposal with no model call before Generate.
  { name: 'motion', kind: 'generate', group: 'create', places: CTRLK, desc: 'Make a Motion explainer (dev)', action: 'motion', deterministic: true, needs: 'motion_dev' },
  { name: 'notebook', kind: 'dialog', group: 'create', places: ['learn'], desc: 'Add a notebook', family: ['notebook'], action: 'insert_notebook', deterministic: true },
  // Source search (owner 4A, 2026-10-16): the shared source finder opens on the source with the query, searches at once
  // when there is one, and adds nothing until Add to canvas. No model routes or reads them. /arxiv takes a topic or an
  // arXiv ID or link and previews it before adding; /youtube finds existing videos (/video generates a new clip).
  { name: 'youtube', kind: 'source', group: 'source', places: ['learn', 'ctrlk', 'insert'], label: 'Search YouTube', desc: 'Search YouTube', action: 'open_source', source: 'youtube', deterministic: true },
  { name: 'arxiv', kind: 'source', group: 'source', places: ['learn', 'ctrlk', 'insert'], label: 'Search arXiv', desc: 'Search arXiv', action: 'open_source', source: 'arxiv', deterministic: true },
  { name: 'wikipedia', kind: 'source', group: 'source', places: ['learn', 'ctrlk', 'insert'], label: 'Search Wikipedia', desc: 'Search Wikipedia', action: 'open_source', source: 'wikipedia', deterministic: true },
  { name: 'more', kind: 'dialog', group: 'create', places: ['learn'], desc: 'More learning tools', action: 'open_tool_catalog', deterministic: true },
];

// The Learn picker's primary menu, in order. Every other Learn command is reached through /more or by
// name; /ask and /teach stay available but uncrowded.
export const LEARN_MENU = {
  learn: ['deeper', 'dive', 'simplify', 'example', 'practice', 'quiz', 'compare'],
  create: ['explain', 'code', 'graph', 'diagram', 'animate', 'flashcards', 'notebook', 'more'],
  search: ['youtube', 'arxiv', 'wikipedia'],
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
export const ASK_OFF = 'Asking about an app is off on this preview: it would write to live chat history.';
const RESEARCH_OFF = 'Research here would call the live model, so it is off on this preview.';
const TEACH_OFF = 'Learn on an app would ask through live chat history, so it is off on this preview.';
export function reviewOff(name, kind, { askLive = false } = {}) {
  // A Home question goes to /api/learn/home-ask (LEARN_DB), never the old apps agent's chat history, so /ask is on there
  // as a typed question is (r28 audit); only an app's ask would still write that history.
  if (name === 'ask' && !askLive && kind === 'app') return { reason: ASK_OFF, short: 'Off on this preview' };
  // Research reaches the live model, and a canvas never offers it (a Home, Library and Project workflow, owner 2026-10-06).
  if (name === 'research') return { reason: RESEARCH_OFF, short: 'Off on this preview' };
  // The preview mounts Learn only for canvases (SharePage, D7), so /teach on an app would land nowhere.
  if (name === 'teach' && kind === 'app') return { reason: TEACH_OFF, short: 'Off on this preview' };
  return null;
}

export const descFor = (command, place) => (typeof command.desc === 'string' ? command.desc : command.desc[place]);

// The commands a place can use right now. Unavailable ones are not shown.
// /motion (Motion V1 M7A) exists only in a development build made with VITE_MOTION_DEV=true (the
// local Motion stack): production has no /motion. `?.` keeps this importable by node tests.
const MOTION_DEV = import.meta.env?.VITE_MOTION_DEV === 'true';
// hidden: true also returns the typed-only commands (/paper), for code that runs or recognises a typed command.
const placeFor = (surface) => (surface === 'chat' ? 'learn' : surface);
export const commandsFor = (place, { catalog = [], motionDev = MOTION_DEV, hidden = false } = {}) =>
  SLASH.filter((c) => c.places.includes(placeFor(place)) && (hidden || !c.hidden) && !(c.needs === 'job' && !catalog.some((a) => a.kind === 'job')) && !(c.needs === 'motion_dev' && !motionDev));

// The command's name in words: its label, else its capitalised name (/explain: Explain).
export const labelOf = (command) => command.label || command.name[0].toUpperCase() + command.name.slice(1);

// A typed line on a surface, resolved to the registry entry a picker would have chosen (the same object), so typed and
// picked commands run alike. { command, arg }: a command this surface offers now (typed-only ones included);
// { unsupported: name }: a leading /name this surface does not offer, to be said so rather than run as anything else;
// null: not a command (no leading /name). Options as commandsFor.
export function resolveCommand(text, surface, options = {}) {
  const match = String(text ?? '').trim().match(/^\/([\w-]+)(?:\s+([\s\S]*))?$/);
  if (!match) return null;
  const name = match[1].toLowerCase();
  const command = commandsFor(surface, { ...options, hidden: true }).find((c) => c.name === name);
  return command ? { command, arg: (match[2] || '').trim() } : { unsupported: name };
}

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
