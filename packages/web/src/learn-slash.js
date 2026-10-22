// The Learn composer's / commands (docs/features/learn-artifact-generation.md).
// Definitions come from the shared contract (agent/slash.js, owned by
// smart-home); this file is the Learn side: which commands the picker offers
// here, and what running one does. Pure apart from the injected post/canvas,
// so it is tested without a browser.
import { reviewRequired } from './proposal-capabilities.js';
import { LEARN_MENU, commandsFor, descFor, learnRequest, resolveCommand, unavailableCommand } from './agent/slash.js';
import { PRIMITIVES, isReady } from '../../control-plane/src/learn-primitives.js';
import { filterSections } from './command-search.js';
import { withPrompt } from './card-prompt.js';
import { existingGeneration } from './generation-state.js';

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
  diagram: '/diagram how a bill becomes law', flashcards: '/flashcards Spanish verbs for travel', goal: '/goal read a balance sheet with confidence',
  notebook: '/notebook', whiteboard: '/whiteboard the water cycle',
  image: '/image Mount Fuji', 'generate-image': '/generate-image a watercolor mountain landscape', video: '/video raindrops falling into a pond',
  cad: '/cad an educational 40 mm by 20 mm by 5 mm rectangular plate', '3d': '/3d perspective projection: a camera frustum with a cube inside it and a ray',
  youtube: '/youtube binary search tutorial', arxiv: '/arxiv graph neural networks', wikipedia: '/wikipedia Photosynthesis',
  // The exact request that made the window's real Motion clip (job 8a2015a4, slash-sheet.js MOTION_CLIP).
  motion: '/motion 15s explain me softmax func',
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
const RUN_ACTIONS = new Set(['cad', 'open_source', 'insert_notebook', 'insert_whiteboard', 'dive', 'motion', 'goal']);
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

// The / line a Chat Send runs through LearnSlash (ask.jsx send), or null when the text is a chat turn: a chosen pill sends
// "/command words", and a typed /line runs as typed, replacing the pill. A command's own prompt coming back (prompted:
// LearnSlash onPrompt) is a chat turn, never a line again: its Send can still see the pill it was sent with, and wrapping it
// once more lost the turn (L5, 2026-10-20).
export const commandLine = (raw, { command = null, prompted = false } = {}) => {
  const text = String(raw ?? '').trim();
  if (prompted) return null;
  if (text.startsWith('/')) return text;
  return command ? `/${command} ${text}`.trim() : null;
};

// One or two model calls (learn-artifact.js); a request that never answers ends as an error, not a skeleton
// left waiting (learn-board-request.js waits as long for a board).
const ARTIFACT_TIMEOUT_MS = 120000;
// After the next paint: a slot reserved this tick is only in the canvas once it has rendered (outside a
// browser, at once).
const afterPaint = run => (globalThis.requestAnimationFrame ? requestAnimationFrame(() => requestAnimationFrame(run)) : run());
const NAMES = { explanation: 'an explanation', quiz: 'a quiz', challenge: 'a challenge', explain_back: 'an explain-back', flashcards: 'flashcards', table: 'a table', code_sample: 'a code sample', flow_diagram: 'a flow diagram', mermaid_diagram: 'a diagram', walkthrough: 'a walkthrough', interactive_graph: 'a graph', data_plot: 'a plot', animation: 'an interactive explanation' };

// MOT-20b: /motion has no proposal of its own here: every entry point is the Chat's /motion turn (generation-proposal-chat.js).

// The frozen motion_request.context: the card's id, kind, title and at most 4000 characters of its plain text. A card with
// no text has nothing to ground on and sends none.
// ponytail: no selectable card carries a repository source today (code cards are not composer targets), so the web sends no
// sourceRefs; add them from block.source when code cards can be selected.
export const MOTION_SELECTION_TEXT = 4000;
export function motionContext(selection) {
  const text = String(selection?.text ?? '').trim().slice(0, MOTION_SELECTION_TEXT);
  const cardId = String(selection?.id ?? '').slice(0, 200);
  if (!cardId || !text) return null;
  return { selection: { cardId, kind: String(selection.kind || 'Card').slice(0, 200), ...(selection.title ? { title: String(selection.title).slice(0, 300) } : {}), text } };
}

// /image's card: a real photo search the card runs itself once placed, with no model (the inline editor stages the same card).
export const imageSearchBlock = args => ({ type: 'image', mode: 'search', title: args || 'Image', src: '', alt: '', caption: '', prompt: args, autoSearch: !!args });

// One artifact command's generation, with no side effect: the /api/learn/artifact answer ({ result: 'artifact' |
// 'paid_proposal' | 'clarification' | 'unsupported' | ... }). runLearnCommand inserts what comes back; the inline editor
// stages it as a preview (docs/features/inline-ai-editor.md §7). A caller's signal (Cancel) aborts it too.
// image (EXP-T15, /explain only): an uploaded image's media id; the server reads its bytes under this canvas's own
// authorization (learn-image-context.js), never from a browser URL. Its role is a layout reference by default.
export function generateCommand(name, args, { app, selection = null, context = null, image = null, post, signal = null }) {
  const timeout = AbortSignal.timeout(ARTIFACT_TIMEOUT_MS);
  return post('/api/learn/artifact', { app, command: name, args, selection, context, ...(image ? { image_context: { id: image }, image_role: 'layout_reference' } : {}) }, { signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
}

// What a typed /motion says in a build that does not offer it (production): it runs nothing.
export const MOTION_OFF = 'Motion (animated explainer videos) is not available here.';

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
// attachedImage: the composer's attached image (an uploaded media id), used by /explain when the target carries none.
export async function runLearnCommand(text, { app, target = null, attachedImage = null, canvas, openSearch, post, motionDev, promptUsed = text, internal = false }) {
  const resolved = resolveCommand(text, 'learn', { motionDev, internal });
  if (!resolved?.command) return { notice: { tone: 'error', text: (resolved && (unavailableCommand(resolved.unsupported) || (resolved.unsupported === 'motion' ? MOTION_OFF : null))) || `${resolved ? `/${resolved.unsupported}` : 'That'} is not a Learn command. Type / to see them.` } };
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
  // /goal: goal management in Progress, the words after it in a new goal's field, unsaved. The same entry as Progress's Set a
  // goal (chat-workspace.jsx goals.open). No model, no save.
  if (request.action === 'goal') return canvas.goal ? (canvas.goal(args), { notice: null }) : { notice: { tone: 'info', text: 'Learning goals are kept on a saved canvas.' } };
  // /dive: the page opens the hole from the selected card, or keeps the intent until one is selected.
  if (request.action === 'dive') return canvas.dive ? canvas.dive(args) : { notice: { tone: 'info', text: 'Rabbit Holes are not available here yet.' } };
  // A proposed capability (its declaration's flow, proposal-capabilities.js; /motion first, MOT-20/UI-15): a chat turn. The chat proposes it on the shared card
  // (generation-proposal-chat.js), the learner refines it in chat, and the card's Generate makes it. Nothing starts here.
  if (reviewRequired(name)) {
    if (!args) return { notice: { tone: 'info', text: `Add what you want after /${name}.` } };
    return { prompt: args };
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
  const hold = () => canvas.reserve?.({ label: `Creating /${name}`, card: cardsFor(name)[0]?.card ?? null, ...(String(promptUsed ?? '').trim() ? { prompt: true } : {}) });
  // /explain with an image: the target's own (a region crop or an image card, uploaded) first, else the composer's attached
  // image, as ask.jsx picks one for a question. The words say what to show; an image alone asks. A crop whose upload has not
  // landed is waited for, never dropped.
  const image = name === 'explain' ? (typeof target?.image === 'string' ? target.image : typeof attachedImage === 'string' ? attachedImage : null) : null;
  if (name === 'explain' && !image && target?.preview && String(target.id || '').startsWith('area:')) {
    return { notice: { tone: 'info', text: 'The selected area is still being attached. Send /explain again in a moment.' }, keep: `/explain ${args}`.trimEnd() + ' ' };
  }
  if (image && !args.trim()) return { notice: { tone: 'question', text: 'What should the explanation show? The image is used as a layout reference.' }, keep: '/explain ' };
  // /explain v2 (EXP-T20 slice 1): a durable job whose card is placed at once and fills in when the job is ready. Where the
  // server has it off (startExplain answers null) the command runs as it always has. EXP-T15: the selected target's text and
  // the image (a region crop, an image card or the composer's attachment) go with the job; the job API reads the image's
  // bytes on the server under this canvas's authorization, as a layout reference only (explain-job.js explainRoute).
  if (name === 'explain' && canvas.startExplain && args.trim()) {
    // EXP-T21: the Tutor's chosen tool (internal) is the same job, recorded as its source; no intent call is made for it.
    const started = await canvas.startExplain(args, { context: target?.text ? String(target.text).slice(0, 8000) : null, image, promptUsed, ...(internal ? { source: 'tutor' } : {}) });
    if (started) return { notice: { tone: 'done', text: 'Making the explanation on the canvas.', ...(started.blockId ? { blockId: started.blockId } : {}) } };
  }
  const slot = mayConfirmPaid(name) ? null : hold();
  let result;
  try { result = await generateCommand(name, args, { app, selection, context: target?.text ? String(target.text).slice(0, 8000) : null, image, post }); }
  catch (error) { if (error.name === 'TimeoutError') return { notice: { tone: 'error', text: `/${name} took too long. Try again.` } }; throw error; }
  finally { if (slot && result?.result !== 'artifact') canvas.release?.(slot); }
  // The notice names the new card and can take the learner to it.
  if (result.result === 'artifact') { const blockId = canvas.insertBlock(withPrompt(result.block, promptUsed), { into: slot }); return { notice: { tone: 'done', text: `Added ${NAMES[result.primitive] || 'the artifact'}.`, ...(blockId ? { blockId } : {}) } }; }
  // Generate inserts the card already confirmed, so it starts once (useConfirmedStart). Confirming commits it:
  // its place is held at once (the camera glides there), and the card - which shows its own progress while the
  // paid job runs - takes that slot as soon as the skeleton has been drawn. Cancel holds nothing.
  // One proposal starts once (a second press, or a second confirmation, is the same one), and a job the canvas already shows -
  // the server would reuse it - is that card, revealed: never a second card for it (existingGeneration).
  if (result.result === 'paid_proposal') { let started = null; return { proposal: { primitive: result.primitive, message: result.message, generate: () => {
    if (started) return started;
    const existing = existingGeneration(canvas.blocks?.(), result.block);
    if (existing) { canvas.focusBlock?.(existing.id); return (started = { reused: existing.id }); }
    const held = hold();
    afterPaint(() => canvas.insertBlock(withPrompt({ ...result.block, confirmedStart: true }, promptUsed), { into: held }));
    return (started = { started: true });
  } } }; }
  if (result.result === 'clarification') return { notice: { tone: 'question', text: result.question }, keep: `/${name} ` };
  if (result.result === 'unsupported') return { notice: { tone: 'info', text: result.message } };
  // An interactive scene that failed its checks (and its one repair) is no card and never silently text: the line comes back
  // to try again, and a plain explanation is one click away (owner, 2026-10-21). PLAIN_WORDS narrows that line to text.
  if (result.result === 'validation_error' && result.primitive === 'animation') return { keep: `/${name} ${args}`, notice: { tone: 'error',
    text: 'The interactive explanation could not be made: it failed its checks, so nothing was added. Send the line again to retry.',
    detail: failedCheck(result.error), actions: [{ label: 'Make a plain explanation instead', line: `/${name} in plain text: ${args}` }] } };
  return { notice: { tone: 'error', text: result.error || 'That could not be made. Try again.' } };
}

// What failed, shown under the notice (owner, 2026-10-21): the validator's words, or the verifier's first finding without its
// numbering (learn-artifact.js sceneVerdict lists "1) ... 2) ...").
const failedCheck = error => (error ? String(error).replace(/^A check of the card found statements that are false: 1\) /, '').split(/ 2\) /)[0].slice(0, 400) : null);

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
