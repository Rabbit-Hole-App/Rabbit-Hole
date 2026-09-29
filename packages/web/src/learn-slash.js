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
// A bare / shows the primary menu (LEARN, then CREATE); /more or a typed
// prefix searches every available Learn command.
export function pickerSections(text, { catalog = false } = {}) {
  const typed = text.match(/^\/([\w-]*)$/)?.[1];
  if (typed === undefined) return null;
  const learn = commandsFor('learn').filter(available);
  if (catalog || typed) {
    const items = learn.filter(command => command.name.startsWith(typed.toLowerCase())).map(row);
    return items.length ? [{ title: catalog && !typed ? 'All learning tools' : null, items }] : [];
  }
  const pick = names => names.map(name => learn.find(command => command.name === name)).filter(Boolean).map(row);
  return [{ title: 'Learn', items: pick(LEARN_MENU.learn) }, { title: 'Create', items: pick(LEARN_MENU.create) }];
}

export const parseSlash = text => {
  const match = text.trim().match(/^\/([\w-]+)(?:\s+([\s\S]*))?$/);
  return match ? { name: match[1].toLowerCase(), args: (match[2] || '').trim() } : null;
};

const known = id => { try { return arxivId(id); } catch { return null; } };
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
  if (request.action === 'open_sources') { canvas.openSources?.(); return { notice: canvas.openSources ? null : { tone: 'info', text: 'The Source inspector is not available here yet.' } }; }
  // /image finds a real picture: the card searches and the learner chooses.
  if (name === 'image') {
    canvas.insertBlock({ type: 'image', mode: 'search', title: args || 'Image', src: '', alt: '', caption: '', prompt: args, autoSearch: !!args });
    return { notice: { tone: 'done', text: args ? `Searching photos for "${args}".` : 'Added an image card; search for a picture.' } };
  }
  if (!request.allowedPrimitives) return request.prompt ? { prompt: request.prompt } : { notice: { tone: 'info', text: `Add what you want after /${name}.` } };
  const result = await post('/api/learn/artifact', { app, command: name, args, selection, context: target?.text ? String(target.text).slice(0, 8000) : null });
  if (result.result === 'artifact') { canvas.insertBlock(result.block); return { notice: { tone: 'done', text: `Added ${NAMES[result.primitive] || 'the artifact'}.` } }; }
  // Generate inserts the card already confirmed, so it starts once (useConfirmedStart).
  if (result.result === 'paid_proposal') return { proposal: { primitive: result.primitive, message: result.message, generate: () => canvas.insertBlock({ ...result.block, confirmedStart: true }) } };
  if (result.result === 'clarification') return { notice: { tone: 'question', text: result.question }, keep: `/${name} ` };
  if (result.result === 'unsupported') return { notice: { tone: 'info', text: result.message } };
  return { notice: { tone: 'error', text: result.error || 'That could not be made. Try again.' } };
}
