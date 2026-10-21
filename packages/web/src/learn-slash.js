// The Learn composer's / commands (docs/features/learn-artifact-generation.md).
// Definitions come from the shared contract (agent/slash.js, owned by
// smart-home); this file is the Learn side: which commands the picker offers
// here, and what running one does. Pure apart from the injected post/canvas,
// so it is tested without a browser.
import { LEARN_MENU, commandsFor, descFor, learnRequest, resolveCommand, unavailableCommand } from './agent/slash.js';
import { PRIMITIVES, isReady } from '../../control-plane/src/learn-primitives.js';
import { filterSections } from './command-search.js';
import { withPrompt } from './card-prompt.js';

// Offered only when something can satisfy it now: no family (chat or a direct
// action), or a family with a ready or direct primitive. A command typed by
// name still runs and says plainly what is not available yet.
export const available = command => !command.family || command.deterministic || command.family.some(id => isReady(id) || PRIMITIVES[id]?.direct);

const row = command => ({ name: command.name, desc: descFor(command, 'learn') });

// The picker's sections for what is typed, or null when it should be closed.
// A bare / shows the primary menu (LEARN, CREATE, then SEARCH: images and the source finders) and a collapsible
// "More learning tools" section with every other available command, so every command stays one list away (owner,
// 2026-10-20: there is no /more). A typed prefix searches every available Learn command.
// motionDev: as commandsFor (a development build offers /motion); tests pass it to see that build's list.
export function pickerSections(text, { motionDev } = {}) {
  const typed = text.match(/^\/([\w-]*)$/)?.[1];
  if (typed === undefined) return null;
  const learn = commandsFor('learn', { motionDev }).filter(available);
  if (typed) {
    const items = learn.filter(command => command.name.startsWith(typed.toLowerCase())).map(row);
    return items.length ? [{ title: null, items }] : [];
  }
  const pick = names => names.map(name => learn.find(command => command.name === name)).filter(Boolean).map(row);
  const primary = [...LEARN_MENU.learn, ...LEARN_MENU.create, ...LEARN_MENU.search];
  const rest = learn.filter(command => !primary.includes(command.name)).map(row);
  return [
    { title: 'Learn', items: pick(LEARN_MENU.learn) },
    { title: 'Create', items: pick(LEARN_MENU.create) },
    { title: 'Search', items: pick(LEARN_MENU.search) },
    { title: 'More learning tools', collapsible: true, items: rest },
  ];
}

// The Auto palette's search field (LearnSlash.jsx): the bare / menu matched by name or description, as the
// Slash commands sheet searches (command-search.js); More learning tools' matches show open, under their title.
export const searchSections = query => filterSections(pickerSections('/'), query).map(section => ({ ...section, collapsible: false }));

// One use per command for the View > Slash commands sheet, each a different topic (owner, 2026-10-20): the sheet's card is a
// sample of the card the command makes, never made from the example. Use example puts the line in the composer to edit.
export const EXAMPLES = {
  dive: '/dive how cells produce ATP', practice: '/practice explain it back: why the sky is blue', quiz: '/quiz the causes of the French Revolution',
  explain: '/explain how binary search works', code: '/code a function that reverses a linked list', graph: '/graph y = sin(x) and y = cos(x)',
  diagram: '/diagram how a bill becomes law', animate: '/animate how softmax shares the whole by score', flashcards: '/flashcards Spanish verbs for travel',
  notebook: '/notebook', whiteboard: '/whiteboard the water cycle',
  image: '/image Mount Fuji', 'generate-image': '/generate-image a watercolor mountain landscape', video: '/video raindrops falling into a pond',
  cad: '/cad an educational 40 mm by 20 mm by 5 mm rectangular plate', '3d': '/3d a model of the solar system',
  youtube: '/youtube binary search tutorial', arxiv: '/arxiv graph neural networks', wikipedia: '/wikipedia Photosynthesis',
  // Development builds only (VITE_MOTION_DEV): the committed clip it shows is 25 s.
  motion: '/motion 25s explain softmax',
};
// The canvas card each primitive becomes: its + palette sample in
// LearningBlocks' BLOCK_TYPES (the notebook is its own card).
export const CARD_OF = {
  explanation: 'explanation', table: 'table', flashcards: 'flashcards', quiz: 'quiz', challenge: 'challenge', explain_back: 'explainBack',
  code_sample: 'snippet', flow_diagram: 'flow', mermaid_diagram: 'mermaid', walkthrough: 'walkthrough', interactive_graph: 'graph', data_plot: 'plot',
  video_generate: 'videoGenerate', maths_animation: 'mathAnimation', blender_scene: 'scene', animation: 'animation', notebook: 'notebook', whiteboard: 'whiteboard',
  paper: 'paper', image: 'image', video: 'video',
};
// The cards a command or material tool can put on the canvas today. Chat-only commands have none.
// A direct primitive counts only for a command that inserts it without the
// model (the deterministic ones, and /image's photo search): /video, say,
// can only propose a generated clip, never an existing one.
export const cardsFor = name => {
  const command = commandsFor('learn', { internal: true }).find(entry => entry.name === name);
  return (command?.family || []).filter(id => CARD_OF[id] && (isReady(id) || (insertsWithoutModel(name) && PRIMITIVES[id]?.direct))).map(id => ({ primitive: id, card: CARD_OF[id] }));
};
// A command that inserts its card without the model: the deterministic ones, and /image's photo search (Task 11b fix B3: the
// Tutor's cost_tier for such a create_material is none).
export const insertsWithoutModel = name => !!commandsFor('learn', { internal: true }).find(entry => entry.name === name)?.deterministic || name === 'image';

// Whether running this command can end in a paid generation (it always asks first). /motion's action is a paid proposal.
export const mayConfirmPaid = name => name === 'motion' || learnRequest(name).paid.some(isReady);

// Professor Next Steps (contract §2.5): the commands a Tutor hook turn may run as create_material - those that can put a
// card on the canvas now (cardsFor) through the command path alone. Search, navigation and catalog actions need the learner.
// The Tutor's material tools are its own (owner, 2026-10-20): /compare and /walkthrough are no longer typed commands, but the
// Tutor still makes comparison tables and walkthroughs (agent/slash.js MATERIAL_TOOLS).
const MAKES_ALONE = command => !command.action || command.action === 'insert_notebook' || command.action === 'insert_whiteboard';
export const materialCommands = () => commandsFor('learn', { internal: true }).filter(command => available(command) && MAKES_ALONE(command) && cardsFor(command.name).length)
  .map(command => ({ command: command.name, cards: cardsFor(command.name).map(entry => entry.card), paid: mayConfirmPaid(command.name) }));

// Whether a word names a Learn command (the composer's command pill takes only these): never a removed one or a material tool.
export const isLearnCommand = name => commandsFor('learn').some(command => command.name === name);

// Whether runLearnCommand answers this line with { prompt }: a chat-only command whose words go on to the chat route, which saves
// them as the turn's user message. Every other line is saved by the Chat itself when it runs (ask.jsx recordCommand), so a
// typed command is one user message either way (UI changes brief 1). learn-slash.test.mjs holds this to runLearnCommand.
const RUN_ACTIONS = new Set(['cad', 'open_source', 'insert_notebook', 'insert_whiteboard', 'dive', 'motion']);
export function answersInChat(text, { motionDev } = {}) {
  const resolved = resolveCommand(text, 'learn', { motionDev });
  if (!resolved?.command || resolved.command.name === 'image') return false;
  let request;
  try { request = learnRequest(resolved.command.name, { args: resolved.arg }); } catch { return false; }
  return !RUN_ACTIONS.has(request.action) && !request.allowedPrimitives && !!request.prompt;
}

export const parseSlash = text => {
  const match = text.trim().match(/^\/([\w-]+)(?:\s+([\s\S]*))?$/);
  return match ? { name: match[1].toLowerCase(), args: (match[2] || '').trim() } : null;
};

// A /command sent while the dock is busy (a Tutor turn, a hole's opening turn) or while another command runs is held,
// not dropped, and runs once that ends if the composer still shows it: a cleared or edited line is a change of mind.
// One line is held; a later Enter holds the newer one.
export const holdsLine = line => !!parseSlash(String(line));
export const releaseLine = (held, input) => (held != null && String(input).trim() === held.trim() ? held : null);

// One or two model calls (learn-artifact.js); a request that never answers ends as an error, not a skeleton
// left waiting (learn-board-request.js waits as long for a board).
const ARTIFACT_TIMEOUT_MS = 120000;
// After the next paint: a slot reserved this tick is only in the canvas once it has rendered (outside a
// browser, at once).
const afterPaint = run => (globalThis.requestAnimationFrame ? requestAnimationFrame(() => requestAnimationFrame(run)) : run());
const NAMES = { explanation: 'an explanation', quiz: 'a quiz', challenge: 'a challenge', explain_back: 'an explain-back', flashcards: 'flashcards', table: 'a table', code_sample: 'a code sample', flow_diagram: 'a flow diagram', mermaid_diagram: 'a diagram', walkthrough: 'a walkthrough', interactive_graph: 'a graph', data_plot: 'a plot', animation: 'an interactive explanation' };

// The /motion paid proposal's card (M7A): built here with no model call; the card starts the paid job only once it is
// inserted already confirmed. The inline editor (inline-ai-session.js) stages the same card.
// selection: the inline editor's compact summary of what the request is about, kept on the /motion line the orchestrator
// reads (validateMotionRequest takes only request and location.concept). The direct command passes none.
export function motionProposal(args, location = null, selection = '') {
  const about = String(selection || '').replace(/\s+/g, ' ').trim();
  const block = {
    type: 'video', mode: 'generate', title: `Motion: ${args}`.slice(0, 120), src: '', caption: '', status: 'idle',
    operation: { op: 'motion_request', request: `/motion ${args}${about ? ` (about the selected canvas material: ${about})` : ''}`.slice(0, 500), location: { concept: String(location?.concept || '').slice(0, 100) || null } },
  };
  return { block, message: 'This uses paid generation.' };
}

// /image's card: a real photo search the card runs itself once placed, with no model (the inline editor stages the same card).
export const imageSearchBlock = args => ({ type: 'image', mode: 'search', title: args || 'Image', src: '', alt: '', caption: '', prompt: args, autoSearch: !!args });

// One artifact command's generation, with no side effect: the /api/learn/artifact answer ({ result: 'artifact' |
// 'paid_proposal' | 'clarification' | 'unsupported' | ... }). runLearnCommand inserts what comes back; the inline editor
// stages it as a preview (docs/features/inline-ai-editor.md §7). A caller's signal (Cancel) aborts it too.
export function generateCommand(name, args, { app, selection = null, context = null, post, signal = null }) {
  const timeout = AbortSignal.timeout(ARTIFACT_TIMEOUT_MS);
  return post('/api/learn/artifact', { app, command: name, args, selection, context }, { signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
}

// Run one typed command. Returns what the composer shows next:
//   { prompt }   send this through the existing Learn ask (Auto commands)
//   { notice }   a one-line result or reason ({ tone, text })
//   { proposal } a paid artifact waiting for Cancel / Generate
//   { finder }   a source search's finder is open: a promise of { added } once it closes (the composer keeps its draft)
// promptUsed: the typed words a made card keeps (card-prompt.js): the line itself, or a Tutor turn's learner words; null for none.
// Deterministic commands never reach the model. A typed command resolves to the entry the picker lists (resolveCommand).
// openSearch({ source, query }): the shared source finder (Release B: B3's opener takes the page's binding); it may return
// a promise of { added } that settles when the finder closes.
// internal: the Tutor's own create_material (runMaterials) may run its material tools; a typed line never can, and a removed
// command says it is unavailable and runs nothing (owner, 2026-10-20).
export async function runLearnCommand(text, { app, target = null, location = null, canvas, openSearch, post, motionDev, promptUsed = text, internal = false }) {
  const resolved = resolveCommand(text, 'learn', { motionDev, internal });
  if (!resolved?.command) return { notice: { tone: 'error', text: (resolved && unavailableCommand(resolved.unsupported)) || `${resolved ? `/${resolved.unsupported}` : 'That'} is not a Learn command. Type / to see them.` } };
  const { command: { name, source }, arg: args } = resolved;
  const selection = target?.id ? { kind: 'card', id: target.id, title: String(target.title || '').slice(0, 200) } : null;
  const request = learnRequest(name, { args, selection });
  if (request.action === 'cad') {
    if (!args.trim()) return { notice: { tone: 'question', text: 'What would you like to create? Include dimensions or explain its purpose.' }, keep: '/cad ' };
    if (!canvas.startCad) return { notice: { tone: 'error', text: 'CAD generation is not available on this canvas.' } };
    let started;
    return { proposal: { message: 'Generate this CAD model? Bounded generation includes model and executor work.',
      generate: () => started ||= Promise.resolve().then(() => canvas.startCad(args, { promptUsed })) } };
  }
  // /youtube, /arxiv, /wikipedia: the source finder opens on its source and query (searching at once when there is one);
  // nothing reaches the Tutor or a model, and nothing is added until the learner adds a result. The finder says the rest.
  if (request.action === 'open_source') {
    const finder = Promise.resolve(openSearch({ source, query: args })).then(done => ({ added: !!done?.added }));
    return { notice: null, finder };
  }
  if (request.action === 'insert_notebook') { canvas.insertNotebook(); return { notice: { tone: 'done', text: 'Added a notebook.' } }; }
  if (request.action === 'insert_whiteboard') { canvas.insertBlock({ type: 'whiteboard', title: args || 'Whiteboard', narration: '', snapshot: null }); return { notice: { tone: 'done', text: 'Added a whiteboard.' } }; }
  // /dive: the page opens the hole from the selected card, or keeps the intent until one is selected.
  if (request.action === 'dive') return canvas.dive ? canvas.dive(args) : { notice: { tone: 'info', text: 'Rabbit Holes are not available here yet.' } };
  // /motion (M7A, development builds only): the paid proposal comes back without any model call.
  // Generate inserts the existing video card already confirmed; LearnVideos hands the request to the
  // development orchestrator (operation motion_request), which plans, reviews and renders it.
  if (request.action === 'motion') {
    if (!args) return { notice: { tone: 'info', text: 'Add what to explain after /motion, for example /motion 15s explain softmax.' } };
    const { block, message } = motionProposal(args, location);
    return { proposal: { primitive: 'motion', message, generate: () => canvas.insertBlock(withPrompt({ ...block, confirmedStart: true }, promptUsed)) } };
  }
  // /image finds a real picture: the card searches and the learner chooses. It never generates (/generate-image does).
  if (name === 'image') {
    canvas.insertBlock(imageSearchBlock(args));
    return { notice: { tone: 'done', text: args ? `Searching photos for "${args}".` : 'Added an image card; search for a picture.' } };
  }
  if (!request.allowedPrimitives) return request.prompt ? { prompt: request.prompt } : { notice: { tone: 'info', text: `Add what you want after /${name}.` } };
  // The card's place is held from the moment the command is sent (docs/features/canvas-skeleton-cards.md),
  // sized as the command's first card; anything but a card (a question, a proposal, an error, a request
  // that never answers) gives it up. A skeleton means a card is committed: a command that can end in a paid
  // proposal holds no place until the learner confirms it (generate, below).
  const hold = () => canvas.reserve?.({ label: `Creating /${name}…`, card: cardsFor(name)[0]?.card ?? null, ...(String(promptUsed ?? '').trim() ? { prompt: true } : {}) });
  const slot = mayConfirmPaid(name) ? null : hold();
  let result;
  try { result = await generateCommand(name, args, { app, selection, context: target?.text ? String(target.text).slice(0, 8000) : null, post }); }
  catch (error) { if (error.name === 'TimeoutError') return { notice: { tone: 'error', text: `/${name} took too long. Try again.` } }; throw error; }
  finally { if (slot && result?.result !== 'artifact') canvas.release?.(slot); }
  // The notice names the new card and can take the learner to it.
  if (result.result === 'artifact') { const blockId = canvas.insertBlock(withPrompt(result.block, promptUsed), { into: slot }); return { notice: { tone: 'done', text: `Added ${NAMES[result.primitive] || 'the artifact'}.`, ...(blockId ? { blockId } : {}) } }; }
  // Generate inserts the card already confirmed, so it starts once (useConfirmedStart). Confirming commits it:
  // its place is held at once (the camera glides there), and the card - which shows its own progress while the
  // paid job runs - takes that slot as soon as the skeleton has been drawn. Cancel holds nothing.
  if (result.result === 'paid_proposal') return { proposal: { primitive: result.primitive, message: result.message, generate: () => {
    const held = hold();
    afterPaint(() => canvas.insertBlock(withPrompt({ ...result.block, confirmedStart: true }, promptUsed), { into: held }));
  } } };
  if (result.result === 'clarification') return { notice: { tone: 'question', text: result.question }, keep: `/${name} ` };
  if (result.result === 'unsupported') return { notice: { tone: 'info', text: result.message } };
  // An interactive scene that failed its checks (and its one repair) is no card and never silently text: the line comes back
  // to try again, and a plain explanation is one click away (owner, 2026-10-21). PLAIN_WORDS narrows that line to text.
  if (result.result === 'validation_error' && result.primitive === 'animation') return { keep: `/${name} ${args}`, notice: { tone: 'error',
    text: 'The interactive explanation could not be made: it failed its checks, so nothing was added. Send the line again to retry.',
    detail: result.error || null, actions: [{ label: 'Make a plain explanation instead', line: `/${name} in plain text: ${args}` }] } };
  return { notice: { tone: 'error', text: result.error || 'That could not be made. Try again.' } };
}

// A Tutor hook turn's create_material actions (contract §2.5), in the plan's order, each run by runLearnCommand exactly as
// if typed: no second generator. A paid card answers with its Generate / Not now proposal; offer(proposal) shows it and
// resolves once the learner has answered, and the next proposal waits for that, so proposals come one at a time while
// free cards keep arriving. deps: runLearnCommand's { app, canvas, post, openSearch, target } (target: the turn's selected card, as
// a typed command's; null on a hook click). onNotice(notice) gets each command's
// notice as soon as it answers, never held behind a proposal. Resolves to each command's answer once every proposal is
// answered; a command that throws answers an error notice and the next one still runs. deps.promptUsed: the learner's words for
// the turn (null on a hook click), kept on each card instead of the model-written line.
// ponytail: one command at a time (each waits for its card); post them together with ordered inserts if latency matters.
export async function runMaterials(actions, { offer, onNotice = () => {}, promptUsed = null, ...deps }) {
  const results = [];
  let asked = Promise.resolve();
  for (const action of actions.filter(entry => entry.type === 'create_material')) {
    const result = await runLearnCommand(`/${action.command} ${action.request}`, { target: null, ...deps, promptUsed, internal: true })
      .catch(error => ({ notice: { tone: 'error', text: `/${action.command} could not be made${error?.message ? `: ${error.message}` : '.'} Try again.` } }));
    results.push(result);
    if (result.notice) onNotice(result.notice);
    if (result.proposal) asked = asked.then(() => offer(result.proposal));
  }
  await asked;
  return results;
}
