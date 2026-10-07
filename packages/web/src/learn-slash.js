// The Learn composer's / commands (docs/features/learn-artifact-generation.md).
// Definitions come from the shared contract (agent/slash.js, owned by
// smart-home); this file is the Learn side: which commands the picker offers
// here, and what running one does. Pure apart from the injected post/canvas,
// so it is tested without a browser.
import { LEARN_MENU, commandsFor, descFor, learnRequest } from './agent/slash.js';
import { PRIMITIVES, isReady } from '../../control-plane/src/learn-primitives.js';
import { arxivId } from '../../control-plane/src/arxiv.js';

// Offered only when something can satisfy it now: no family (chat or a direct
// action), or a family with a ready or direct primitive. A command typed by
// name still runs and says plainly what is not available yet.
export const available = command => !command.family || command.deterministic || command.family.some(id => isReady(id) || PRIMITIVES[id]?.direct);

const row = command => ({ name: command.name, desc: descFor(command, 'learn') });

// The picker's sections for what is typed, or null when it should be closed.
// A bare / shows the primary menu (LEARN, then CREATE) and a collapsible
// "More learning tools" section with every other available command - /more is
// a way to reach tools, not a tool, so it is never a row. A typed prefix (or
// a typed /more) searches every available Learn command.
export function pickerSections(text, { catalog = false } = {}) {
  const typed = text.match(/^\/([\w-]*)$/)?.[1];
  if (typed === undefined) return null;
  const learn = commandsFor('learn').filter(available);
  if (catalog || typed) {
    const items = learn.filter(command => command.name.startsWith(typed.toLowerCase())).map(row);
    return items.length ? [{ title: catalog && !typed ? 'All learning tools' : null, items }] : [];
  }
  const pick = names => names.map(name => learn.find(command => command.name === name)).filter(Boolean).map(row);
  const primary = [...LEARN_MENU.learn, ...LEARN_MENU.create];
  const rest = learn.filter(command => !primary.includes(command.name) && command.name !== 'more').map(row);
  return [
    { title: 'Learn', items: pick(LEARN_MENU.learn) },
    { title: 'Create', items: pick(LEARN_MENU.create.filter(name => name !== 'more')) },
    { title: 'More learning tools', collapsible: true, items: rest },
  ];
}

// One use per command for the View > Slash commands sheet. Each one asks for
// exactly the card or answer the sheet previews beside it, and works as typed.
export const EXAMPLES = {
  deeper: '/deeper into the maths', dive: '/dive softmax', simplify: '/simplify', example: '/example with real numbers',
  practice: '/practice explain it back', quiz: '/quiz the derivative of the sigmoid', compare: '/compare sigmoid vs tanh', research: '/research attention mechanisms',
  explain: '/explain why a token id is only an index', code: '/code build a character vocabulary', graph: '/graph sigmoid',
  diagram: '/diagram where a token goes in nanoGPT', animate: '/animate why the sigmoid saturates', flashcards: "/flashcards nanoGPT's embeddings and parameters",
  notebook: '/notebook', walkthrough: '/walkthrough a token through the model', whiteboard: '/whiteboard the sigmoid', paper: '/paper 1706.03762',
  image: '/image a sigmoid curve', video: '/video light through a prism', '3d': '/3d a camera frustum', source: '/source',
  ask: '/ask what does wte do?', teach: '/teach causal masking', do: '/do add a section on attention',
};
// The canvas card each primitive becomes: its + palette sample in
// LearningBlocks' BLOCK_TYPES (the notebook is its own card).
export const CARD_OF = {
  explanation: 'explanation', table: 'table', flashcards: 'flashcards', quiz: 'quiz', challenge: 'challenge', explain_back: 'explainBack',
  code_sample: 'snippet', flow_diagram: 'flow', mermaid_diagram: 'mermaid', walkthrough: 'walkthrough', interactive_graph: 'graph', data_plot: 'plot',
  video_generate: 'videoGenerate', maths_animation: 'mathAnimation', blender_scene: 'scene', notebook: 'notebook', whiteboard: 'whiteboard',
  paper: 'paper', image: 'image', video: 'video',
};
// The cards a command can put on the canvas today. Chat-only commands have none.
// A direct primitive counts only for a command that inserts it without the
// model (the deterministic ones, and /image's photo search): /video, say,
// can only propose a generated clip, never an existing one.
export const cardsFor = name => {
  const command = commandsFor('learn').find(entry => entry.name === name);
  return (command?.family || []).filter(id => CARD_OF[id] && (isReady(id) || (insertsWithoutModel(name) && PRIMITIVES[id]?.direct))).map(id => ({ primitive: id, card: CARD_OF[id] }));
};
// A command that inserts its card without the model: the deterministic ones, and /image's photo search (Task 11b fix B3: the
// Tutor's cost_tier for such a create_material is none).
export const insertsWithoutModel = name => !!commandsFor('learn').find(entry => entry.name === name)?.deterministic || name === 'image';

// Whether running this command can end in a paid generation (it always asks first).
export const mayConfirmPaid = name => learnRequest(name).paid.some(isReady);

// Professor Next Steps (contract §2.5): the commands a Tutor hook turn may run as create_material - those that can put a
// card on the canvas now (cardsFor) through the command path alone. Search, navigation and catalog actions need the learner.
const MAKES_ALONE = command => !command.action || command.action === 'insert_notebook' || command.action === 'insert_whiteboard';
export const materialCommands = () => commandsFor('learn').filter(command => available(command) && MAKES_ALONE(command) && cardsFor(command.name).length)
  .map(command => ({ command: command.name, cards: cardsFor(command.name).map(entry => entry.card), paid: mayConfirmPaid(command.name) }));

// Whether a word names a Learn command (the composer's command pill takes only these).
export const isLearnCommand = name => commandsFor('learn').some(command => command.name === name);

export const parseSlash = text => {
  const match = text.trim().match(/^\/([\w-]+)(?:\s+([\s\S]*))?$/);
  return match ? { name: match[1].toLowerCase(), args: (match[2] || '').trim() } : null;
};

const known = id => { try { return arxivId(id); } catch { return null; } };
// One or two model calls (learn-artifact.js); a request that never answers ends as an error, not a skeleton
// left waiting (learn-board-request.js waits as long for a board).
const ARTIFACT_TIMEOUT_MS = 120000;
// After the next paint: a slot reserved this tick is only in the canvas once it has rendered (outside a
// browser, at once).
const afterPaint = run => (globalThis.requestAnimationFrame ? requestAnimationFrame(() => requestAnimationFrame(run)) : run());
const NAMES = { explanation: 'an explanation', quiz: 'a quiz', challenge: 'a challenge', explain_back: 'an explain-back', flashcards: 'flashcards', table: 'a table', code_sample: 'a code sample', flow_diagram: 'a flow diagram', mermaid_diagram: 'a diagram', walkthrough: 'a walkthrough', interactive_graph: 'a graph', data_plot: 'a plot' };

// Run one typed command. Returns what the composer shows next:
//   { prompt }   send this through the existing Learn ask (Auto commands)
//   { catalog }  open the full tool list
//   { notice }   a one-line result or reason ({ tone, text })
//   { proposal } a paid artifact waiting for Cancel / Generate
// Deterministic commands never reach the model.
export async function runLearnCommand(text, { app, target = null, canvas, openSearch, post }) {
  const parsed = parseSlash(text);
  const command = parsed && commandsFor('learn').find(entry => entry.name === parsed.name);
  if (!command) return { notice: { tone: 'error', text: `${parsed ? `/${parsed.name}` : 'That'} is not a Learn command. Type / to see them.` } };
  const { name, args } = parsed;
  const selection = target?.id ? { kind: 'card', id: target.id, title: String(target.title || '').slice(0, 200) } : null;
  const request = learnRequest(name, { args, selection });
  if (request.action === 'open_tool_catalog') return { catalog: true };
  if (request.action === 'insert_notebook') { canvas.insertNotebook(); return { notice: { tone: 'done', text: 'Added a notebook.' } }; }
  if (request.action === 'insert_whiteboard') { canvas.insertBlock({ type: 'whiteboard', title: args || 'Whiteboard', narration: '', snapshot: null }); return { notice: { tone: 'done', text: 'Added a whiteboard.' } }; }
  if (request.action === 'insert_paper') {
    // A known paper opens directly; a topic is researched first and the
    // learner picks the real paper. A paper is never invented.
    const id = known(args);
    if (id) { canvas.insertPaper({ id }); return { notice: { tone: 'done', text: `Opened arXiv ${id}.` } }; }
    openSearch({ source: 'arxiv', query: args });
    return { notice: args ? { tone: 'info', text: `Searching arXiv for "${args}"; pick the paper to open.` } : null };
  }
  // /dive: the page opens the hole from the selected card, or keeps the intent until one is selected.
  if (request.action === 'dive') return canvas.dive ? canvas.dive(args) : { notice: { tone: 'info', text: 'Rabbit Holes are not available here yet.' } };
  if (request.action === 'open_sources') { canvas.openSources?.(); return { notice: canvas.openSources ? null : { tone: 'info', text: 'The Source inspector is not available here yet.' } }; }
  // /image finds a real picture: the card searches and the learner chooses.
  if (name === 'image') {
    canvas.insertBlock({ type: 'image', mode: 'search', title: args || 'Image', src: '', alt: '', caption: '', prompt: args, autoSearch: !!args });
    return { notice: { tone: 'done', text: args ? `Searching photos for "${args}".` : 'Added an image card; search for a picture.' } };
  }
  if (!request.allowedPrimitives) return request.prompt ? { prompt: request.prompt } : { notice: { tone: 'info', text: `Add what you want after /${name}.` } };
  // The card's place is held from the moment the command is sent (docs/features/canvas-skeleton-cards.md),
  // sized as the command's first card; anything but a card (a question, a proposal, an error, a request
  // that never answers) gives it up. A skeleton means a card is committed: a command that can end in a paid
  // proposal holds no place until the learner confirms it (generate, below).
  const hold = () => canvas.reserve?.({ label: `Creating /${name}…`, card: cardsFor(name)[0]?.card ?? null });
  const slot = mayConfirmPaid(name) ? null : hold();
  let result;
  try { result = await post('/api/learn/artifact', { app, command: name, args, selection, context: target?.text ? String(target.text).slice(0, 8000) : null }, { signal: AbortSignal.timeout(ARTIFACT_TIMEOUT_MS) }); }
  catch (error) { if (error.name === 'TimeoutError') return { notice: { tone: 'error', text: `/${name} took too long. Try again.` } }; throw error; }
  finally { if (slot && result?.result !== 'artifact') canvas.release?.(slot); }
  // The notice names the new card and can take the learner to it.
  if (result.result === 'artifact') { const blockId = canvas.insertBlock(result.block, { into: slot }); return { notice: { tone: 'done', text: `Added ${NAMES[result.primitive] || 'the artifact'}.`, ...(blockId ? { blockId } : {}) } }; }
  // Generate inserts the card already confirmed, so it starts once (useConfirmedStart). Confirming commits it:
  // its place is held at once (the camera glides there), and the card - which shows its own progress while the
  // paid job runs - takes that slot as soon as the skeleton has been drawn. Cancel holds nothing.
  if (result.result === 'paid_proposal') return { proposal: { primitive: result.primitive, message: result.message, generate: () => {
    const held = hold();
    afterPaint(() => canvas.insertBlock({ ...result.block, confirmedStart: true }, { into: held }));
  } } };
  if (result.result === 'clarification') return { notice: { tone: 'question', text: result.question }, keep: `/${name} ` };
  if (result.result === 'unsupported') return { notice: { tone: 'info', text: result.message } };
  return { notice: { tone: 'error', text: result.error || 'That could not be made. Try again.' } };
}

// A Tutor hook turn's create_material actions (contract §2.5), in the plan's order, each run by runLearnCommand exactly as
// if typed: no second generator. A paid card answers with its Generate / Not now proposal; offer(proposal) shows it and
// resolves once the learner has answered, and the next proposal waits for that, so proposals come one at a time while
// free cards keep arriving. deps: runLearnCommand's { app, canvas, post, openSearch, target } (target: the turn's selected card, as
// a typed command's; null on a hook click). onNotice(notice) gets each command's
// notice as soon as it answers, never held behind a proposal. Resolves to each command's answer once every proposal is
// answered; a command that throws answers an error notice and the next one still runs.
// ponytail: one command at a time (each waits for its card); post them together with ordered inserts if latency matters.
export async function runMaterials(actions, { offer, onNotice = () => {}, ...deps }) {
  const results = [];
  let asked = Promise.resolve();
  for (const action of actions.filter(entry => entry.type === 'create_material')) {
    const result = await runLearnCommand(`/${action.command} ${action.request}`, { target: null, ...deps })
      .catch(() => ({ notice: { tone: 'error', text: `/${action.command} could not be made. Try again.` } }));
    results.push(result);
    if (result.notice) onNotice(result.notice);
    if (result.proposal) asked = asked.then(() => offer(result.proposal));
  }
  await asked;
  return results;
}
