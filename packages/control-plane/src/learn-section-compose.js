// Learn section composition: the medium per beat (docs/features/learn-sections/learn-section-compose-spec.md, spec B; DECISIONS D, F, H, N).
// The tools are exactly directTools(env, email, { sectionFlow: true }) (chat-tools.js): the model reads their definitions in the message and calls only
// submit_section_composition, whose items are checked HERE with checkToolCall's field, length and fit checks (never executed) and the B §4 rules.
//
//   validateComposition(input, { sectionId, brief, commands, check }) -> { value: { sectionId, items } } | { errors }
//     check(item) -> null | an error sentence (checkToolCall in the section flow)
//   runCompose(env, { actor, email }, body, deps) -> 200 { composition } | 200 { error: 'sectionComposeFailed', words } | 404 / 409 / 422 / 502 / 503
import { chatToolDefs, checkToolCall, directTools, toolNameOf } from './chat-tools.js';
import { composeTutorPrompt } from './tutor-prompt.js';
import { LEARN_TASKS, MODEL_NOT_CONFIGURED, loggedModel } from './learn-models.js';
import { anthropic } from './ask.js';
import { sectionTurn } from './learn-section-research.js';
import { learnPlanOf, readSection, saveProgress, updateSection, withStatus } from './learn-section-store.js';
import { CODE_TOKEN } from './learn-section-brief.js';

export const COMPOSE_CAP_USD = 0.10, MAX_ITEMS = 8;
// shortcut: B gives no words for a failed composition; this follows A §5's sentence. Replace when the copy table has one.
export const SECTION_COMPOSE_FAILED = 'I couldn\'t choose how to teach this section cleanly. Try again, or skip to the next section.';
// Found, not made (B §2: browser joins the set). The two commands whose request may carry paths and code names.
const FOUND = new Set(['youtube', 'arxiv', 'wikipedia', 'image', 'browser']);
const CODE_REQUESTS = new Set(['code', 'notebook']);
const PAIR_FROM = new Set(['arxiv', 'wikipedia', 'document', 'browser']); // D: an item made for the text of a paper, an article, a document or a web page
const AFTER_ON = new Set(['explanation', 'notebook']); // made after one: D, and Make §7c for a notebook (Reviewer 10:50)
const SOURCES = ['repository', 'example'], CONTENTS = ['source', 'authored', 'buildup'];
const isObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const str = v => (typeof v === 'string' ? v.trim() : '');

export const submitCompositionTool = commands => ({
  name: 'submit_section_composition',
  description: 'Return the whole composition of the section: for each beat, the item or items that deliver it, each naming one of the tools you were given and the request that tool would receive.',
  input_schema: {
    type: 'object', additionalProperties: false, required: ['items'],
    properties: {
      items: { type: 'array', minItems: 1, maxItems: MAX_ITEMS, items: { type: 'object', additionalProperties: false, required: ['id', 'beatId', 'command', 'request', 'why'], properties: {
        id: { type: 'string', description: 'i1, i2, ... in the order the reader meets them.' },
        beatId: { type: 'string', description: 'The id of the beat this item delivers.' },
        command: { type: 'string', enum: commands, description: 'The tool, by its command name (the tool name without run_).' },
        request: { type: 'string', maxLength: 2000, description: 'The request as the learner would have typed it to that command.' },
        requirements: { type: ['object', 'null'], additionalProperties: false, properties: { narration: { type: 'boolean' }, interactive: { type: 'boolean' } } },
        lookFor: { type: ['string', 'null'], description: 'For found material: which part and what to notice.' },
        why: { type: 'string', description: 'One sentence: why this medium for this beat.' },
        source: { type: ['string', 'null'], enum: [...SOURCES, null], description: 'Required on code: repository (the source\'s own lines) or example (a made example).' },
        content: { type: ['string', 'null'], enum: [...CONTENTS, null], description: 'Required on notebook: source, authored or buildup.' },
        after: { type: ['string', 'null'], description: 'The id of an earlier paper, Wikipedia, document or web page item whose text this explanation or notebook is made for; else null.' },
      } } },
    },
  },
});

export function validateComposition(input, { sectionId, brief, commands, check }) {
  const errors = [], o = isObject(input) ? input : {}, items = Array.isArray(o.items) ? o.items : [];
  const beats = new Map((brief?.beats || []).map(b => [b.id, b]));
  if (!items.length || items.length > MAX_ITEMS) errors.push(`a section has 1 to ${MAX_ITEMS} items; this one has ${items.length}`);
  const out = [];
  items.forEach((raw, i) => {
    const it = isObject(raw) ? raw : {}, id = str(it.id) || `i${i + 1}`, command = str(it.command), request = typeof it.request === 'string' ? it.request.replace(/\s+/g, ' ').trim() : '';
    const requirements = isObject(it.requirements) ? it.requirements : null, lookFor = str(it.lookFor) || null, why = str(it.why), after = str(it.after) || null;
    if (!beats.has(str(it.beatId))) errors.push(`item ${id}: beatId ${str(it.beatId) || '(none)'} is not a beat of the brief`);
    if (!commands.includes(command)) { errors.push(`item ${id}: ${command || '(none)'} is not one of the tools you were given (${commands.join(', ')})`); out.push({ id }); return; }
    const problem = check({ command, request, requirements });
    if (problem) errors.push(`item ${id}: ${problem}`);
    if (!why) errors.push(`item ${id}: why is one sentence`);
    if (!CODE_REQUESTS.has(command) && CODE_TOKEN.test(request)) errors.push(`item ${id}: the request for ${command} must be plain words, with no path, file name, flag or code name`);
    if (command === 'code' && !SOURCES.includes(it.source)) errors.push(`item ${id}: a code item has source repository or example`);
    if (command === 'notebook' && !CONTENTS.includes(it.content)) errors.push(`item ${id}: a notebook item has content source, authored or buildup`);
    if (FOUND.has(command) && !lookFor) errors.push(`item ${id}: found material carries lookFor: which part and what to notice`);
    if (after) {
      const earlier = out.find(e => e.id === after);
      if (!earlier || !PAIR_FROM.has(earlier.command) || !AFTER_ON.has(command)) errors.push(`item ${id}: after names an earlier paper, Wikipedia, document or web page item, and only an explanation or a notebook is made after one`);
    }
    out.push({ id, beatId: str(it.beatId), command, request, requirements, lookFor, why, source: command === 'code' ? it.source : null, content: command === 'notebook' ? it.content : null, after });
  });
  if (new Set(out.map(x => x.id)).size !== out.length) errors.push('item ids must be distinct');
  for (const id of beats.keys()) if (!out.some(x => x.beatId === id)) errors.push(`beat ${id} has no item`);
  // F: the found-material cap counts beats that carry material; a Wikipedia card on a background beat is separate, at most 2.
  const found = out.filter(x => FOUND.has(x.command)), wikiBackground = found.filter(x => x.command === 'wikipedia' && beats.get(x.beatId)?.background && !beats.get(x.beatId)?.material);
  if (found.length - wikiBackground.length > 1) errors.push(`found material is at most 1 item in a section for now; this one has ${found.length - wikiBackground.length}`);
  if (wikiBackground.length > 2) errors.push(`at most 2 Wikipedia items on background beats; this section has ${wikiBackground.length}`);
  return errors.length ? { errors } : { value: { sectionId, items: out } };
}

const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const publicComposition = ({ sectionId, items }) => ({ sectionId, items });
const briefOf = ({ sectionId, from, beats, to }) => ({ sectionId, from, beats, to });
export async function runCompose(env, { actor, email }, body, { callModel = loggedModel('learn_section', anthropic), capUsd = COMPOSE_CAP_USD } = {}) {
  const plan = await learnPlanOf(env, actor);
  if (!plan) return json({ error: 'no_accepted_plan' }, 409);
  const section = plan.sections.find(s => s.id === body.sectionId);
  if (!section) return json({ error: 'unknown_section' }, 404);
  const stored = await readSection(env, actor, section.id);
  if (!stored?.brief) return json({ error: 'no_brief' }, 409);
  if (stored.composition && body.redo !== true) return json({ composition: publicComposition(stored.composition) });
  if (!env.ANTHROPIC_API_KEY && env.SUBSCRIPTION_ONLY !== 'true') return json({ error: MODEL_NOT_CONFIGURED }, 503);
  const offered = directTools(env, email, { sectionFlow: true }), commands = offered.map(t => t.command);
  const defs = chatToolDefs(env, email, { sectionFlow: true }).map((d, i) => `${offered[i].command}: ${d.description.split(' Calling this only')[0]}`); // the same order as directTools; the chat-only tail is left off
  const composed = composeTutorPrompt({ task: 'learn-section-compose', use: 'learn_concept' });
  const user = [
    `SECTION: ${section.id} ${section.title}   CHAPTER: ${section.chapter.n}. ${section.chapter.title}`,
    `FOCUS: ${plan.learn.focus || 'none'}`,
    `BRIEF\n${JSON.stringify(briefOf(stored.brief))}`,
    `TOOLS (command: what it is and its limits)\n${defs.join('\n')}`,
    `Return the composition by calling submit_section_composition once; each item's command is one of: ${commands.join(', ')}.`,
  ].join('\n\n');
  const check = ({ command, request, requirements }) => checkToolCall(env, email, { name: toolNameOf(command), input: { request, ...(requirements ? { requirements } : {}) } }, { sectionFlow: true }).error || null;
  const out = await sectionTurn(env, { composed, user, submit: submitCompositionTool(commands), research: [], ctx: { env }, capUsd, callModel,
    validate: input => validateComposition(input, { sectionId: section.id, brief: stored.brief, commands, check }) });
  const line = { event: 'learn_section_compose', section: section.id, calls: out.usage.calls, repairs: out.repairs ?? 0, usd: Number(out.usage.usd.toFixed(6)), cap_usd: capUsd, outcome: out.ok ? 'ok' : out.failed, ...(out.ok ? {} : { errors: (out.errors || []).slice(0, 8) }) };
  try { console.log(JSON.stringify(line)); } catch { /* a log line is never worth a failed answer */ }
  if (out.failed === 'unavailable') return json({ error: 'learn_section_unavailable' }, 502);
  if (out.failed === 'over_cap' && out.usage.calls === 0) return json({ error: 'learn_section_over_cap' }, 422);
  if (!out.ok) return json({ error: 'sectionComposeFailed', words: SECTION_COMPOSE_FAILED });
  const composition = { ...out.ok, toolsOffered: commands, model: LEARN_TASKS.learn_section.model, layers: composed.layers, usd: line.usd, calls: out.usage.calls, at: new Date().toISOString() };
  await updateSection(env, actor, section.id, () => ({ composition, made: [] }));
  const ids = plan.sections.map(s => s.id);
  await saveProgress(env, actor, learn => ({ currentSectionId: learn.currentSectionId || section.id, sections: withStatus(learn.sections, section.id, 'composed', ids) }));
  return json({ composition: publicComposition(composition) });
}
