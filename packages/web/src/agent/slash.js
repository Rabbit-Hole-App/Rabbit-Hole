// One slash-command model for every Rabbit Hole input (user, 2026-09-28). The Agent Bar reads it, and
// the Learn composer (owned by the Learn branches) imports this same module: there is one command
// system. Each command names the places it shows in, what it needs, and the semantic request it
// becomes. Pure - no React, no stores - so Learn code can import it without the bar.
// Contract for the Learn owners: docs/features/rabbit-hole-commands.md.

// Places: 'home' is Home, Library and Explore (workspace scope) and 'project' the Project hub and its Map - neither offers
// a slash command since 2026-10-20 (owner); 'learn' is the Learn composer (the canvas Chat; 'chat' names the same surface); 'ctrlk' is the canvas's inline
// Ctrl+K editor; 'insert' is the canvas Insert menu (Release B, owner 2026-10-16: one registry with surface capabilities,
// no separate list per picker). Chat and Ctrl+K offer the same 18 (owner spec 2026-10-29); Ctrl+K hands an explicit command to Chat's
// dispatcher (inline-ai-command.js). Anything else typed is reported as unavailable, never run as a different command.
// kind: 'generate' makes canvas material, 'source' opens the shared source finder (no model), 'prompt' is a Learn intent
// worded for the tutor that makes a card (/practice, /quiz), 'dialog' opens or inserts something of its own (no generation).
// Two labels, never a /name (owner, 2026-10-20): desc is the menu label, the picker's line (/explain: Add explanation; /3d: Add
// 3D scene); label is the short pill label, the selected-command pill's text and its "Remove <label>" (/3d: 3D). A command
// with no short label shows its menu label in the pill. about: what the command does in one or two sentences - whether it
// creates a card, opens something or searches, and what it needs selected - for the Slash commands window.
// Two names (owner, 2026-10-26: /image generates, /photos searches). name is the STABLE id: what a saved message, draft or
// proposal, the Tutor, the chat router and Ctrl+K's routes carry, and it never changes meaning (id `image` is still the photo
// search, `generate-image` the paid generation). typed is what a learner TYPES when it differs, and aliases are further typed
// names that still work: /image types as id `generate-image`, /photos as id `image`, /generate-image stays an alias of
// /image and /photo of /photos (owner brief 2026-10-29: still 18 commands). Every typed line goes through
// resolveCommand/idOfTyped; every line built from an id goes through typedOf. Saved ids are never remapped:
// an old `image` message keeps reading as the photo search it was.
// needs: 'image_generation' is offered only where image generation is on (IMAGE_GENERATION, below); 'motion_dev' only in a
// development or review build (MOTION_DEV, below), never in production.

// Selection context: what the learner has selected when they send. The bar produces 'project' and
// 'map_node' today; the owning branches add the rest when they expose them (shapes in the contract doc).
export const SELECTIONS = ['project', 'map_node', 'card', 'equation', 'notebook_cell', 'notebook_file', 'canvas_object'];

// Every public command is offered in Chat and Ctrl+K alike (owner spec 2026-10-29: one catalogue, one dispatcher); the source
// searches are also in the canvas Insert menu.
const CTRLK = ['learn', 'ctrlk'];
// What a learner (or the Tutor's create_material request) says to pick /explain's form: a representation, never a topic.
// Plain text is checked first, so "/explain in plain text: <an interactive request>" (the failed-scene offer) is text.
export const PLAIN_WORDS = /\bplain[- ](text|words|explanation)\b|\btext[- ]only\b|\bin text\b|\bwithout (a |an )?(visual|interactive)/i;
export const INTERACTIVE_WORDS = /\binteractive\b|\bsimulat(e|ion|or)\b|\bsliders?\b|\bvisuali[sz](e|ation)\b|\banimat(e|ed|ion)\b|\bexplorable\b/i;
// The 18 slash commands a learner can type or pick (owner spec 2026-10-29, docs/features/rabbit-hole-commands.md): /dive, /whiteboard
// and /video are removed (REMOVED_COMMANDS), /browser is added. Home, Library and Project offer none: their bar takes plain words
// (router.js). desc is the command's title (the picker line and the Slash Commands window), about its one-sentence description,
// placeholder the composer's hint while its pill is chosen. kind: 'generate' makes canvas material, 'prompt' is a Learn intent
// worded for the tutor that makes a card (/practice, /quiz), 'source' opens the shared source finder (no model), 'dialog' opens or
// inserts something of its own (no generation). Which commands prepare a brief before Generate: learn-slash.js BRIEF_COMMANDS.
export const SLASH = [
  // Learn
  // /explain makes an interactive visual (animation: the authored cards' scene format) when controls, calculations or motion
  // teach the idea, and a text explanation otherwise (owner, 2026-10-21). Asking for one in words narrows to it: a plain-text
  // request never gets a scene, and an interactive one never gets text instead (a scene that fails says so).
  { name: 'explain', kind: 'generate', group: 'learn', places: CTRLK, label: 'Explanation', desc: 'Explanation', about: 'Understand an idea with a visual explanation you can play and explore.', placeholder: 'What would you like to understand?', family: ['explanation', 'table', 'animation', 'narration'],
    narrow: [[PLAIN_WORDS, 'explanation'], [INTERACTIVE_WORDS, 'animation']] },
  // Explain Back is a mode of the Practice card reached through /practice, never a command of its own (owner spec 2026-10-29).
  { name: 'practice', kind: 'prompt', group: 'learn', places: CTRLK, label: 'Practice', desc: 'Practice', about: 'Try a task or explain an idea in your own words, then get feedback on your answer.', placeholder: 'What would you like to practise?', prompt: 'Give me one practice task on {target} and wait for my answer.',
    family: ['challenge', 'explain_back', 'quiz', 'code_exercise'],
    narrow: [[/explain(ing)? it back/i, 'explain_back'], [/\bcoding\b/i, 'code_exercise'], [/multiple[- ]choice/i, 'quiz']] },
  { name: 'quiz', kind: 'prompt', group: 'learn', places: CTRLK, label: 'Quiz', desc: 'Quiz', about: 'Check your understanding with a multiple-choice question and feedback.', placeholder: 'What should the question test?', prompt: 'Ask me one short question on {target}, then wait for my answer.', family: ['quiz'] },
  { name: 'flashcards', kind: 'generate', group: 'learn', places: CTRLK, label: 'Flashcards', desc: 'Flashcards', about: 'Review a topic with question-and-answer cards you can flip through.', placeholder: 'What would you like to remember?', family: ['flashcards'] },
  // /goal (owner, 2026-10-21): goal management in Progress - add, edit, delete and choose the current goal. The words after it
  // fill a new goal's field, unsaved. Explicit only: no model runs, and plain words never route to it (inline-ai-route.js).
  { name: 'goal', kind: 'dialog', group: 'learn', places: CTRLK, label: 'Learning goal', desc: 'Learning goal', about: 'Add or manage a learning goal in Progress.', placeholder: 'What would you like to be able to do? Or press Enter to open your goals.', action: 'goal', deterministic: true },
  // Create
  { name: 'code', kind: 'generate', group: 'create', places: CTRLK, label: 'Code example', desc: 'Code example', about: 'See a Python example for the task you describe.', placeholder: 'What should the Python example do?', family: ['code_sample', 'code_exercise'] },
  { name: 'graph', kind: 'generate', group: 'create', places: CTRLK, label: 'Graph', desc: 'Graph', about: 'Plot a function or supplied data and explore how it changes.', placeholder: 'What function or data should the graph show?', family: ['interactive_graph', 'data_plot', 'knowledge_graph'] },
  { name: 'diagram', kind: 'generate', group: 'create', places: CTRLK, label: 'Diagram', desc: 'Diagram', about: 'Show the steps or relationships in a process.', placeholder: 'What process or structure should the diagram show?', family: ['flow_diagram', 'mermaid_diagram'] },
  { name: 'notebook', kind: 'dialog', group: 'create', places: CTRLK, label: 'Notebook', desc: 'Notebook', about: 'Add an empty notebook for code, calculations and results.', placeholder: 'Press Enter to add an empty notebook.', family: ['notebook'], action: 'insert_notebook', deterministic: true },
  // Media: search and generation are separate commands (owner, 2026-10-20). A search never turns into generation and a
  // generation never into a search, so neither family holds the other's primitive.
  { name: 'generate-image', typed: 'image', aliases: ['generate-image'], kind: 'generate', group: 'create', places: CTRLK, label: 'Image generation', desc: 'Image generation', about: 'Describe a new image, review the plan, then generate it.', placeholder: 'What should the image show?', family: ['image_generate'], needs: 'image_generation' },
  // The command for the Motion explainer-video pipeline (owner, 2026-10-20: it replaces /animate); a paid proposal with no model
  // call before Generate. Offered where Motion is (needs motion_dev, below).
  { name: 'motion', kind: 'generate', group: 'create', places: CTRLK, label: 'Animated explainer', desc: 'Animated explainer', about: 'Turn a topic into an animated explainer video after reviewing its plan.', placeholder: 'What should the video explain?', action: 'motion', deterministic: true, needs: 'motion_dev' },
  { name: 'cad', kind: 'generate', group: 'create', places: CTRLK, label: 'CAD model', desc: 'CAD model', about: 'Describe a dimensioned part, review its brief, then generate a CAD model.', placeholder: 'What part should be made, and what are its dimensions?', action: 'cad', deterministic: true },
  { name: '3d', kind: 'generate', group: 'create', places: CTRLK, label: '3D scene', desc: '3D scene', about: 'Create a 3D scene to explore a spatial idea.', placeholder: 'What objects and relationships should the scene show?', family: ['3d_model', 'blender_scene'] },
  // /browser (owner spec 2026-10-29): the existing saved webpage capture (AdaptiveCanvas insertWebpage), not a web browser. A URL is
  // captured as a webpage card; none opens the address dialog. No model.
  { name: 'browser', kind: 'dialog', group: 'create', places: CTRLK, label: 'Browser', desc: 'Browser', about: 'Bring a webpage onto your canvas to read, highlight and ask questions about it.', placeholder: 'Paste a webpage URL, or press Enter to add one.', action: 'insert_webpage', deterministic: true },
  // Search (owner 4A, 2026-10-16): the shared source finder opens on the source with the query, searches at once when there is
  // one, and adds nothing until Add to canvas. No model routes or reads them. /arxiv takes a topic or an arXiv ID or link and
  // previews it before adding. /photos (id image) inserts the photo-search card, which searches once placed.
  { name: 'image', typed: 'photos', aliases: ['photo'], kind: 'generate', group: 'source', places: CTRLK, label: 'Photo search', desc: 'Photo search', about: 'Find an existing photo and add it to your canvas with its credit.', placeholder: 'What photo are you looking for? Or press Enter to open search.', family: ['image'] },
  { name: 'youtube', kind: 'source', group: 'source', places: ['learn', 'ctrlk', 'insert'], label: 'YouTube search', desc: 'YouTube search', about: 'Find an existing YouTube video, preview it, then add it to the canvas.', placeholder: 'What video would you like to find? Or press Enter to open search.', action: 'open_source', source: 'youtube', deterministic: true },
  { name: 'arxiv', kind: 'source', group: 'source', places: ['learn', 'ctrlk', 'insert'], label: 'arXiv search', desc: 'arXiv search', about: 'Find a research paper by topic, title or arXiv link and add it to the canvas.', placeholder: 'Enter a topic, paper title or arXiv link, or press Enter to open search.', action: 'open_source', source: 'arxiv', deterministic: true },
  { name: 'wikipedia', kind: 'source', group: 'source', places: ['learn', 'ctrlk', 'insert'], label: 'Wikipedia search', desc: 'Wikipedia search', about: 'Find a Wikipedia article and add it to your canvas.', placeholder: 'What topic would you like to look up? Or press Enter to open search.', action: 'open_source', source: 'wikipedia', deterministic: true },
];

// The Tutor's and journeys' material tools that are no longer slash commands (owner, 2026-10-20: "separate user-facing
// slash-command availability from the Tutor's internal material tools"). No picker, sheet or typed line reaches them
// (commandsFor leaves them out); the Tutor's create_material, a journey step's make.command, Ctrl+K's automatic routing
// and /api/learn/artifact still make comparison tables and walkthroughs through them (commandsFor's `internal`, learnRequest).
// /whiteboard and /video (owner spec 2026-10-29) left the public commands; the Tutor still adds whiteboards and proposes generated
// clips through them, and saved Whiteboard and Video cards keep their renderers.
export const MATERIAL_TOOLS = [
  { name: 'compare', kind: 'generate', group: 'learn', places: ['learn'], desc: 'Compare ideas', prompt: 'Compare side by side, with {target} as context.',
    // No animation: interactive scenes are /explain's and the Tutor's explanation material only (owner, 2026-10-21).
    family: ['table', 'interactive_graph', 'data_plot', 'flow_diagram', 'mermaid_diagram'] },
  { name: 'walkthrough', kind: 'generate', group: 'create', places: ['learn'], desc: 'Add a walkthrough', family: ['walkthrough'] },
  // /animate (owner, 2026-10-20: /motion is the animation command): the Tutor and journeys still make animations with it, and
  // saved animation cards keep their renderers; no picker, window, example or chat suggestion offers it.
  { name: 'animate', kind: 'generate', group: 'create', places: ['learn'], desc: 'Add an animation', family: ['reference_attention', 'maths_animation'] },
  { name: 'whiteboard', kind: 'dialog', group: 'create', places: ['learn'], label: 'Whiteboard', desc: 'Add a whiteboard', family: ['whiteboard'], action: 'insert_whiteboard', deterministic: true },
  { name: 'video', kind: 'generate', group: 'create', places: ['learn'], label: 'Generate video', desc: 'Generate video', family: ['video_generate'] },
];
// A registry entry by name, user command or material tool: what a saved message, a validator or a generator looks up.
export const toolOf = (name) => SLASH.find((c) => c.name === name) || MATERIAL_TOOLS.find((c) => c.name === name);
// The typed name <-> stable id (see typed above). A name no entry types or aliases (a removed command, an unknown word) is its own.
// /imagine is not one: nothing types or aliases it.
const entryOfTyped = (typed) => SLASH.find((c) => (c.typed || c.name) === typed) || SLASH.find((c) => c.aliases?.includes(typed));
export const typedOf = (name) => toolOf(name)?.typed || name;
export const idOfTyped = (typed) => entryOfTyped(typed)?.name ?? typed;

// Removed slash commands (owner, 2026-10-20). Typed on any surface, each says it is unavailable and runs nothing; ordinary
// words still ask, compare, simplify or explore, and the Tutor keeps its material tools (MATERIAL_TOOLS).
export const REMOVED_COMMANDS = ['walkthrough', 'do', 'find', 'open', 'connect', 'run', 'new', 'research', 'more', 'ask', 'teach', 'deeper',
  'simplify', 'example', 'compare', 'source', 'paper', 'animate',
  // Owner spec 2026-10-29: Rabbit Hole navigation, Whiteboard cards and Motion's video stay; only the typed commands go.
  'dive', 'whiteboard', 'video'];
// Image generation from a command: off while the image_generate primitive is not ready (learn-primitives.js; slash.test.mjs
// holds the two equal). /generate-image is hidden and refused while it is off; this cleanup does not turn it on.
export const IMAGE_GENERATION = false;
// The live switch (owner 2026-10-25): whether the SERVER offers image generation to THIS signed-in person (the public flag, else the
// listed owner-only operator; GET /api/learn/image-jobs, image-capability.js). It is not a build constant: a production build carries
// IMAGE_GENERATION false and a person the server does not list never sees the command, and a direct API call is refused by the server anyway.
let imageOffered = false;
export const setImageGeneration = on => { imageOffered = on === true; };
export const imageGenerationLive = () => IMAGE_GENERATION || imageOffered;
// What a typed command that is not offered says: a removed one, or /image (or its alias /generate-image) while image generation
// is off. name is what the learner TYPED, never an id: the string `image` means the generation here. null for any other name
// (each surface words its own line). listed: false where / lists nothing (the Home, Library and Project bar).
export function unavailableCommand(name, { listed = true, imageGeneration = imageGenerationLive() } = {}) {
  if (REMOVED_COMMANDS.includes(name)) return `/${name} is no longer available. ${listed ? 'Type / to see the commands, or ask' : 'Ask'} in your own words.`;
  if (entryOfTyped(name)?.needs === 'image_generation' && !imageGeneration) return 'Image generation is not available here. /photos searches for real photos.';
  return null;
}

// The sections of the picker, Ctrl+K and the Slash Commands window, in order (owner spec 2026-10-29). Every public command is in
// exactly one (slash.test.mjs), so no surface keeps a list of its own.
export const LEARN_MENU = {
  learn: ['explain', 'practice', 'quiz', 'flashcards', 'goal'],
  create: ['code', 'graph', 'diagram', 'notebook', 'generate-image', 'motion', 'cad', '3d', 'browser'],
  search: ['image', 'youtube', 'arxiv', 'wikipedia'],
};
export const MENU_TITLES = { learn: 'Learn', create: 'Create', search: 'Search' };

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
export const commandsFor = (place, { motionDev = MOTION_DEV, imageGeneration = imageGenerationLive(), internal = false } = {}) =>
  (internal ? [...SLASH, ...MATERIAL_TOOLS] : SLASH).filter((c) => c.places.includes(placeFor(place)) && !(c.needs === 'motion_dev' && !motionDev) && !(c.needs === 'image_generation' && !imageGeneration));

// The selected-command pill's text: the short pill label, else the menu label (/explain: Add explanation; /3d: 3D). A name the
// registry no longer has (a saved message's removed command) reads as its capitalised name (/simplify: Simplify).
export const labelOf = (command) => command.label || (typeof command.desc === 'string' ? command.desc : null) || command.name[0].toUpperCase() + command.name.slice(1);
// The same by name: what every selected-command pill shows (Chat, Ctrl+K and the Home, Library and Project bar).
// A saved message's command that was since removed still reads as its capitalised name (/simplify: Simplify).
export const commandLabel = (name) => labelOf(toolOf(name) || { name });

// A typed line on a surface (its /name is a typed name, typed above), resolved to the registry entry a picker would have chosen (the same object), so typed and
// picked commands run alike. { command, arg }: a command this surface offers now; { unsupported: name }: a leading /name this
// surface does not offer (a removed one included), to be said so rather than run as anything else; null: not a command (no
// leading /name). Options as commandsFor: only the Tutor's own create_material passes internal.
export function resolveCommand(text, surface, options = {}) {
  const match = String(text ?? '').trim().match(/^\/([\w-]+)(?:\s+([\s\S]*))?$/);
  if (!match) return null;
  const name = match[1].toLowerCase();
  const command = commandsFor(surface, options).find((c) => c.name === idOfTyped(name));
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
