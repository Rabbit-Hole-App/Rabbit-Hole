import { SEARCH_ARXIV_TOOL, READ_ARXIV_TOOL, SHOW_PAPER_TOOL, searchArxiv, readArxivPaper, paperDocument, validateShowPaper } from './arxiv.js';
import { LEARN_TASKS, RESEARCH_STEPS, PAPERS_PER_ANSWER, notConfiguredMessage } from './learn-models.js';

import { LEARN_RESEARCH_SYSTEM, PAPER_SHOWN_NOTE } from './agents/learn-chat.js';
export { LEARN_RESEARCH_SYSTEM };

// A model HTTP failure as an Error, with the API's own reason when it gave one.
export async function modelFailure(response, label, suffix = '') {
  const unset = await notConfiguredMessage(response);
  if (unset) return new Error(unset); // no key on this deployment: that sentence alone, never an HTTP code
  const detail = (await response.json().catch(() => null))?.error?.message;
  return new Error(`${label} (model HTTP ${response.status}${detail ? `: ${String(detail).slice(0, 160)}` : ''})${suffix}`);
}

// Read-only research is separate from app-action proposals. Limit the loop to
// eight retrieval calls and two papers so a question cannot trigger endless
// research; eight, because a thorough answer can legitimately spend
// search+read+read+show on one source family and still consult another.
// onProgress(stage, card): card ('paper' | 'wiki' | 'video') once a show tool has validated, so the page
// can hold that card's place on the canvas (docs/features/canvas-skeleton-cards.md).
const SHOWN_CARD = { show_wikipedia: 'wiki', show_video: 'video' }; // learn-wiki.js, learn-youtube.js
export async function researchAnswer(env, turns, system, model, {
  callModel, onProgress = async () => {}, findPapers = searchArxiv, readPaper = readArxivPaper, initialPapers = [], tools = [], runTool,
}) {
  const messages = [...turns], papers = new Map(initialPapers.map(p => [p.id, p]));
  let shown = null; // a paper the agent asked to put in front of the learner
  for (let step = 0; step <= RESEARCH_STEPS; step++) {
    const response = await callModel(env, {
      max_tokens: LEARN_TASKS.chat.maxTokens, system: `${system}\n${LEARN_RESEARCH_SYSTEM}`,
      tools: [...tools, SEARCH_ARXIV_TOOL, READ_ARXIV_TOOL, ...(papers.size ? [SHOW_PAPER_TOOL] : [])],
      tool_choice: step < RESEARCH_STEPS ? { type: 'auto', disable_parallel_tool_use: true } : { type: 'none' },
      messages,
    }, model, null);
    if (!response.ok) throw await modelFailure(response, 'Learn answer unavailable');
    const result = await response.json();
    const calls = result.content?.filter(block => block.type === 'tool_use') || [];
    if (!calls.length) {
      if (result.stop_reason === 'max_tokens') throw new Error('The answer was cut short. Try a narrower question.');
      const answer = result.content?.filter(block => block.type === 'text').map(block => block.text).join('\n\n');
      if (!answer?.trim()) {
        // Adaptive thinking can end a turn with only a thinking block; replay it
        // (blocks must be preserved verbatim) and ask once for the text answer.
        if (step < RESEARCH_STEPS && result.content?.some(block => block.type === 'thinking')) {
          messages.push({ role: 'assistant', content: result.content }, { role: 'user', content: 'Continue with your final answer now, as plain text.' });
          await onProgress('Preparing answer...');
          continue;
        }
        throw new Error(`No Learn answer returned (${result.stop_reason || result.type || 'unknown'}; ${(result.content || []).map(b => b.type).join(',') || 'no content'})`);
      }
      return { answer, papers: [...papers.values()], shown };
    }
    if (step === RESEARCH_STEPS || calls.length !== 1) throw new Error('Learn research limit reached');
    const call = calls[0];
    let content, is_error = false;
    try {
      if (call.name === SEARCH_ARXIV_TOOL.name) {
        await onProgress('Finding papers...');
        content = [{ type: 'text', text: JSON.stringify(await findPapers(call.input.query)) }];
      } else if (call.name === READ_ARXIV_TOOL.name) {
        await onProgress('Reading paper...');
        if (papers.size >= PAPERS_PER_ANSWER && !papers.has(call.input.id)) throw new Error('Use the papers already read');
        const paper = await readPaper(call.input.id);
        papers.set(paper.id, paper);
        content = [{ type: 'text', text: JSON.stringify(paper) }, paperDocument(paper)];
      } else if (call.name === SHOW_PAPER_TOOL.name) {
        shown = validateShowPaper(call.input, [...papers.values()]);
        await onProgress(`Opening ${shown.title}...`, 'paper');
        content = [{ type: 'text', text: JSON.stringify({ opened: true, page: shown.page, note: PAPER_SHOWN_NOTE }) }];
      } else if (runTool && tools.some(tool => tool.name === call.name)) {
        // A show tool reports once it has validated: a refused one opens nothing.
        if (!SHOWN_CARD[call.name]) await onProgress(`${call.name.replaceAll('_', ' ')}...`);
        content = [{ type: 'text', text: JSON.stringify(await runTool(call.name, call.input)) }];
        if (SHOWN_CARD[call.name]) await onProgress(`${call.name.replaceAll('_', ' ')}...`, SHOWN_CARD[call.name]);
      } else throw new Error('Unknown Learn tool');
    } catch (error) { await onProgress(`Retrieval failed: ${error.message}`); is_error = true; content = [{ type: 'text', text: error.message }]; }
    messages.push({ role: 'assistant', content: result.content }, { role: 'user', content: [{ type: 'tool_result', tool_use_id: call.id, content, is_error }] });
    await onProgress('Preparing answer...');
  }
}
