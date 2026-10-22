// One slash-command model for every Rabbit Hole input (user, 2026-09-28). The Agent Bar reads it, and
// the Learn composer (owned by the Learn branches) imports this same module: there is one command
// system. Each command names the places it shows in, what it needs, and the semantic request it
// becomes. Pure - no React, no stores - so Learn code can import it without the bar.
// Contract for the Learn owners: docs/features/rabbit-hole-commands.md.

// Places: 'home' is Home, Library and Explore (workspace scope) and 'project' the Project hub and its Map - neither offers
// a slash command since 2026-10-20 (owner); 'learn' is the Learn composer (the canvas Chat; 'chat' names the same surface); 'ctrlk' is the canvas's inline
// Ctrl+K editor; 'insert' is the canvas Insert menu (Release B, owner 2026-10-16: one registry with surface capabilities,
// no separate list per picker). Ctrl+K offers exactly the generate and source commands that list it; anything else typed
// there is reported as unavailable, never run as a different command.
// kind: 'generate' makes canvas material, 'source' opens the shared source finder (no model), 'prompt' is a Learn intent
// worded for the tutor that makes a card (/practice, /quiz), 'dialog' opens or inserts something of its own (no generation).
// Two labels, never a /name (owner, 2026-10-20): desc is the menu label, the picker's line (/explain: Add explanation; /3d: Add
// 3D scene); label is the short pill label, the selected-command pill's text and its "Remove <label>" (/3d: 3D). A command
// with no short label shows its menu label in the pill. about: what the command does in one or two sentences - whether it
// creates a card, opens something or searches, and what it needs selected - for the Slash commands window.
// needs: 'image_generation' is offered only where image generation is on (IMAGE_GENERATION, below); 'motion_dev' only in a
// development or review build (MOTION_DEV, below), never in production.

// Selection context: what the learner has selected when they send. The bar produces 'project' and
// 'map_node' today; the owning branches add the rest when they expose them (shapes in the contract doc).
export const SELECTIONS = ['project', 'map_node', 'card', 'equation', 'notebook_cell', 'notebook_file', 'canvas_object'];

// Learn's generate commands that Ctrl+K also offers (owner decision 1A, 2026-10-16).
const CTRLK = ['learn', 'ctrlk'];
// What a learner (or the Tutor's create_material request) says to pick /explain's form: a representation, never a topic.
// Plain text is checked first, so "/explain in plain text: <an interactive request>" (the failed-scene offer) is text.
export const PLAIN_WORDS = /\bplain[- ](text|words|explanation)\b|\btext[- ]only\b|\bin text\b|\bwithout (a |an )?(visual|interactive)/i;
export const INTERACTIVE_WORDS = /\binteractive\b|\bsimulat(e|ion|or)\b|\bsliders?\b|\bvisuali[sz](e|ation)\b|\banimat(e|ed|ion)\b|\bexplorable\b/i;
// The slash commands a learner can type or pick (owner, 2026-10-20: 17 commands removed, see REMOVED_COMMANDS). Home,
// Library and Project offer none: their bar takes plain words (router.js).
export const SLASH = [
  // /dive opens a nested Rabbit Hole from the selected card or a topic (docs/features/dive-v1.md). Learn runs it itself: no model.
  { name: 'dive', kind: 'dialog', group: 'learn', places: ['learn'], desc: 'Open Rabbit Hole', about: 'Opens a nested Rabbit Hole for the selected card, or for the topic you type.', action: 'dive', deterministic: true },
  { name: 'practice', kind: 'prompt', group: 'learn', places: ['learn'], label: 'Practice', desc: 'Let me try it', about: 'Creates a practice card (a challenge, explain-back, quiz or coding task) on the selected card or a topic, then waits for your answer.', prompt: 'Give me one practice task on {target} and wait for my answer.',
    family: ['challenge', 'explain_back', 'quiz', 'code_exercise'],
    narrow: [[/explain(ing)? it back/i, 'explain_back'], [/\bcoding\b/i, 'code_exercise'], [/multiple[- ]choice/i, 'quiz']] },
  // /goal (owner, 2026-10-21): goal management in Progress - add, edit, delete and choose the current goal. The words after it
  // fill a new goal's field, unsaved. Explicit only: no model runs, and plain words never route to it (inline-ai-route.js).
  { name: 'goal', kind: 'dialog', group: 'learn', places: ['learn'], label: 'Goal', desc: 'Set a learning goal', about: 'Opens your learning goals in Progress: add one (what you type after /goal fills it in, unsaved), edit or delete one, or choose your current goal. No AI is used.', action: 'goal', deterministic: true },
  { name: 'quiz', kind: 'prompt', group: 'learn', places: ['learn'], label: 'Quiz', desc: 'Test me', about: 'Creates a one-question quiz card on the selected card or a topic, then waits for your answer.', prompt: 'Ask me one short question on {target}, then wait for my answer.', family: ['quiz'] },
  // Create: tool overrides (user, 2026-09-28). Auto stays the default; a command names the family the tutor
  // must return a validated block from, or it asks a clarifying question. Deterministic ones run no model.
  // /explain makes an interactive visual (animation: the authored cards' scene format) when controls, calculations or motion
  // teach the idea, and a text explanation otherwise (owner, 2026-10-21). Asking for one in words narrows to it: a plain-text
  // request never gets a scene, and an interactive one never gets text instead (a scene that fails says so).
  { name: 'explain', kind: 'generate', group: 'create', places: CTRLK, desc: 'Add explanation', about: 'Creates an explanation card on the canvas. It is an interactive visual with controls when moving something helps the idea land, otherwise a text explanation; ask for "interactive" or "plain text" to choose. With a card selected, it uses that card as context.', family: ['explanation', 'table', 'animation', 'narration'],
    narrow: [[PLAIN_WORDS, 'explanation'], [INTERACTIVE_WORDS, 'animation']] },
  { name: 'flashcards', kind: 'generate', group: 'create', places: CTRLK, label: 'Flashcards', desc: 'Add flashcards', about: 'Creates a flashcard deck card on the canvas. With a card selected, it uses that card as context.', family: ['flashcards'] },
  { name: 'code', kind: 'generate', group: 'create', places: CTRLK, label: 'Code', desc: 'Add code', about: 'Creates a code example card on the canvas. With a card selected, it uses that card as context.', family: ['code_sample', 'code_exercise'] },
  { name: 'graph', kind: 'generate', group: 'create', places: CTRLK, label: 'Graph', desc: 'Add a graph or plot', about: 'Creates an interactive graph or plot card on the canvas. With a card selected, it uses that card as context.', family: ['interactive_graph', 'data_plot', 'knowledge_graph'] },
  { name: 'diagram', kind: 'generate', group: 'create', places: CTRLK, label: 'Diagram', desc: 'Add a diagram', about: 'Creates a diagram card on the canvas. With a card selected, it uses that card as context.', family: ['flow_diagram', 'mermaid_diagram'] },
  { name: 'whiteboard', kind: 'dialog', group: 'create', places: ['learn'], label: 'Whiteboard', desc: 'Add a whiteboard', about: 'Adds a whiteboard card to the canvas, titled with what you type.', family: ['whiteboard'], action: 'insert_whiteboard', deterministic: true },
  // Media: search and generation are separate commands (owner, 2026-10-20). A search never turns into generation and a
  // generation never into a search, so neither family holds the other's primitive.
  { name: 'image', kind: 'generate', group: 'create', places: CTRLK, desc: 'Search images', about: 'Searches for real photos and adds an image card that shows the photo and its credit. It never generates an image.', family: ['image'] },
  { name: 'generate-image', kind: 'generate', group: 'create', places: CTRLK, desc: 'Generate image', about: 'Creates an AI-generated image card. Generating it is paid, so it asks first. It never searches for photos. With a card selected, it uses that card as context.', family: ['image_generate'], needs: 'image_generation' },
  { name: 'video', kind: 'generate', group: 'create', places: CTRLK, label: 'Generate video', desc: 'Generate video', about: 'Creates an AI-generated video card. Generating it is paid, so it asks first. It never searches for videos: /youtube does. With a card selected, it uses that card as context.', family: ['video_generate'] },
  { name: 'cad', kind: 'generate', group: 'create', places: CTRLK, label: 'CAD', desc: 'Create a parametric CAD model', about: 'Creates a parametric CAD model card with checked downloads. It asks about missing dimensions and before generating.', action: 'cad', deterministic: true },
  { name: '3d', kind: 'generate', group: 'create', places: CTRLK, label: '3D', desc: 'Add 3D scene', about: 'Creates a 3D scene card on the canvas. Generating it is paid, so it asks first. With a card selected, it uses that card as context.', family: ['3d_model', 'blender_scene'] },
  // The command for the Motion explainer-video pipeline (owner, 2026-10-20: it replaces /animate). Development and review
  // builds only (needs motion_dev); a paid proposal with no model call before Generate.
  { name: 'motion', kind: 'generate', group: 'create', places: CTRLK, label: 'Motion', desc: 'Create an animated explainer video', about: 'Creates an animated explainer video card: Motion plans, reviews and renders a 5 to 30 second video of what you type. Generating it is paid, so it asks first.', action: 'motion', deterministic: true, needs: 'motion_dev' },
  { name: 'notebook', kind: 'dialog', group: 'create', places: ['learn'], label: 'Notebook', desc: 'Add a notebook', about: 'Adds an empty notebook card to the canvas.', family: ['notebook'], action: 'insert_notebook', deterministic: true },
  // Source search (owner 4A, 2026-10-16): the shared source finder opens on the source with the query, searches at once
  // when there is one, and adds nothing until Add to canvas. No model routes or reads them. /arxiv takes a topic or an
  // arXiv ID or link and previews it before adding; /youtube finds existing videos (/video generates a new clip).
  { name: 'youtube', kind: 'source', group: 'source', places: ['learn', 'ctrlk', 'insert'], label: 'Search YouTube', desc: 'Search YouTube', about: 'Opens Search on YouTube videos and searches for what you type. Nothing is added until you add a video; it never generates one.', action: 'open_source', source: 'youtube', deterministic: true },
  { name: 'arxiv', kind: 'source', group: 'source', places: ['learn', 'ctrlk', 'insert'], label: 'Search arXiv', desc: 'Search arXiv', about: 'Opens Search on arXiv papers: a topic, or an arXiv ID or link. Nothing is added until you add a paper.', action: 'open_source', source: 'arxiv', deterministic: true },
  { name: 'wikipedia', kind: 'source', group: 'source', places: ['learn', 'ctrlk', 'insert'], label: 'Search Wikipedia', desc: 'Search Wikipedia', about: 'Opens Search on Wikipedia articles. Nothing is added until you add an article.', action: 'open_source', source: 'wikipedia', deterministic: true },
];

// The Tutor's and journeys' material tools that are no longer slash commands (owner, 2026-10-20: "separate user-facing
// slash-command availability from the Tutor's internal material tools"). No picker, sheet or typed line reaches them
// (commandsFor leaves them out); the Tutor's create_material, a journey step's make.command, Ctrl+K's automatic routing
// and /api/learn/artifact still make comparison tables and walkthroughs through them (commandsFor's `internal`, learnRequest).
export const MATERIAL_TOOLS = [
  { name: 'compare', kind: 'generate', group: 'learn', places: ['learn'], desc: 'Compare ideas', prompt: 'Compare side by side, with {target} as context.',
    // No animation: interactive scenes are /explain's and the Tutor's explanation material only (owner, 2026-10-21).
    family: ['table', 'interactive_graph', 'data_plot', 'flow_diagram', 'mermaid_diagram'] },
  { name: 'walkthrough', kind: 'generate', group: 'create', places: ['learn'], desc: 'Add a walkthrough', family: ['walkthrough'] },
  // /animate (owner, 2026-10-20: /motion is the animation command): the Tutor and journeys still make animations with it, and
  // saved animation cards keep their renderers; no picker, window, example or chat suggestion offers it.
  { name: 'animate', kind: 'generate', group: 'create', places: ['learn'], desc: 'Add an animation', family: ['reference_attention', 'maths_animation'] },
];
// A registry entry by name, user command or material tool: what a saved message, a validator or a generator looks up.
export const toolOf = (name) => SLASH.find((c) => c.name === name) || MATERIAL_TOOLS.find((c) => c.name === name);

// Removed slash commands (owner, 2026-10-20). Typed on any surface, each says it is unavailable and runs nothing; ordinary
// words still ask, compare, simplify or explore, and the Tutor keeps its material tools (MATERIAL_TOOLS).
export const REMOVED_COMMANDS = ['walkthrough', 'do', 'find', 'open', 'connect', 'run', 'new', 'research', 'more', 'ask', 'teach', 'deeper',
  'simplify', 'example', 'compare', 'source', 'paper', 'animate'];
// Image generation from a command: off while the image_generate primitive is not ready (learn-primitives.js; slash.test.mjs
// holds the two equal). /generate-image is hidden and refused while it is off; this cleanup does not turn it on.
export const IMAGE_GENERATION = false;
// What a typed command that is not offered says: a removed one, or /generate-image while image generation is off. null for
// any other name (each surface words its own line). listed: false where / lists nothing (the Home, Library and Project bar).
export function unavailableCommand(name, { listed = true } = {}) {
  if (REMOVED_COMMANDS.includes(name)) return `/${name} is no longer available. ${listed ? 'Type / to see the commands, or ask' : 'Ask'} in your own words.`;
  if (name === 'generate-image') return 'Image generation is not available here. /image searches for real photos.';
  return null;
}

// The Learn picker's primary menu, in order. Every other Learn command is listed under More learning tools.
export const LEARN_MENU = {
  learn: ['dive', 'practice', 'quiz', 'goal'],
  create: ['explain', 'code', 'graph', 'diagram', 'motion', 'flashcards', 'notebook'],
  search: ['image', 'youtube', 'arxiv', 'wikipedia'],
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
const TEACH_OFF = 'Learn on an app would ask through live chat history, so it is off on this preview.';
export function reviewOff(name, kind, { askLive = false } = {}) {
  // A Home question goes to /api/learn/home-ask (LEARN_DB), never the old apps agent's chat history, so /ask is on there
  // as a typed question is (r28 audit); only an app's ask would still write that history.
  if (name === 'ask' && !askLive && kind === 'app') return { reason: ASK_OFF, short: 'Off on this preview' };
  // The preview mounts Learn only for canvases (SharePage, D7), so /teach on an app would land nowhere.
  if (name === 'teach' && kind === 'app') return { reason: TEACH_OFF, short: 'Off on this preview' };
  return null;
}

export const descFor = (command, place) => (typeof command.desc === 'string' ? command.desc : command.desc[place]);

// The commands a place can use right now. Unavailable ones are not shown.
// /motion (Motion V1) is offered by the production build (VITE_MOTION, scripts/prod-release.mjs BUILD_ENV: owner activation
// GO, 2026-10-21), by a development or review build (VITE_COACHING_DEV) and by the local Motion stack's build (VITE_MOTION_DEV).
// Generate also needs the Motion orchestrator: where none is configured, the card says Motion is not available here and
// nothing starts (control-plane motion-provider.js). `?.` keeps this importable by node tests.
const MOTION_DEV = import.meta.env?.VITE_MOTION === 'true' || import.meta.env?.VITE_MOTION_DEV === 'true' || import.meta.env?.VITE_COACHING_DEV === 'true';
// internal: true adds the Tutor's material tools (MATERIAL_TOOLS), for its create_material, a journey's steps and Ctrl+K's
// automatic routing; never for a picker, the Slash commands window or a typed line.
const placeFor = (surface) => (surface === 'chat' ? 'learn' : surface);
export const commandsFor = (place, { motionDev = MOTION_DEV, imageGeneration = IMAGE_GENERATION, internal = false } = {}) =>
  (internal ? [...SLASH, ...MATERIAL_TOOLS] : SLASH).filter((c) => c.places.includes(placeFor(place)) && !(c.needs === 'motion_dev' && !motionDev) && !(c.needs === 'image_generation' && !imageGeneration));

// The selected-command pill's text: the short pill label, else the menu label (/explain: Add explanation; /3d: 3D). A name the
// registry no longer has (a saved message's removed command) reads as its capitalised name (/simplify: Simplify).
export const labelOf = (command) => command.label || (typeof command.desc === 'string' ? command.desc : null) || command.name[0].toUpperCase() + command.name.slice(1);
// The same by name: what every selected-command pill shows (Chat, Ctrl+K and the Home, Library and Project bar).
// A saved message's command that was since removed still reads as its capitalised name (/simplify: Simplify).
export const commandLabel = (name) => labelOf(toolOf(name) || { name });

// A typed line on a surface, resolved to the registry entry a picker would have chosen (the same object), so typed and
// picked commands run alike. { command, arg }: a command this surface offers now; { unsupported: name }: a leading /name this
// surface does not offer (a removed one included), to be said so rather than run as anything else; null: not a command (no
// leading /name). Options as commandsFor: only the Tutor's own create_material passes internal.
export function resolveCommand(text, surface, options = {}) {
  const match = String(text ?? '').trim().match(/^\/([\w-]+)(?:\s+([\s\S]*))?$/);
  if (!match) return null;
  const name = match[1].toLowerCase();
  const command = commandsFor(surface, options).find((c) => c.name === name);
  return command ? { command, arg: (match[2] || '').trim() } : { unsupported: name };
}

const LABEL = { project: 'project', map_node: 'node', card: 'card', equation: 'equation', notebook_cell: 'notebook cell', notebook_file: 'file', canvas_object: 'object' };
const targetOf = (selection) => {
  if (!selection) return 'the current concept';
  const name = selection.title || selection.label || selection.latex || selection.path || selection.id;
  return `the selected ${LABEL[selection.kind]}${name ? ` "${name}"` : ''}`;
};

// A Learn command or material tool as one semantic request. Prompt commands go through the existing Learn ask; action
// commands name the Learn action to run; the selection always travels as context. allowedPrimitives is
// what the tutor may return (null: Auto); /practice subtype words narrow it deterministically. It never decides what a
// learner may type (resolveCommand does): /api/learn/artifact makes a material tool's card for the Tutor and journeys.
export function learnRequest(name, { args = '', selection = null } = {}) {
  const command = toolOf(name);
  if (!command?.places.includes('learn')) throw Error(`/${name} is not a Learn command`);
  if (selection && !SELECTIONS.includes(selection.kind)) throw Error(`unknown selection: ${selection.kind}`);
  const narrowed = command.narrow?.find(([words]) => words.test(args))?.[1];
  const allowedPrimitives = narrowed ? [narrowed] : command.family || null;
  const base = {
    kind: 'learn', command: name, family: command.family ? name : null, allowedPrimitives,
    deterministic: !!command.deterministic, paid: (allowedPrimitives || []).filter((id) => primitive(id).paid),
  };
  const ends = { context: selection, selection };
  if (command.action) return { ...base, action: command.action, prompt: args, ...ends };
  if (!command.prompt) return { ...base, prompt: args || `${command.desc} for ${targetOf(selection)}.`, ...ends };
  const prompt = command.prompt.replace('{target}', targetOf(selection));
  return { ...base, prompt: args ? `${prompt} Focus: ${args}.` : prompt, ...ends };
}
