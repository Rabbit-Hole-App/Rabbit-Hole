// R4.04 planners: subject, plan draft and plan revision over an INJECTED model transport (contracts/planning.md). No model is called
// here: callModel(role, body) -> the parsed Anthropic-style message ({ content: [...] }) is supplied by the caller (the Lead wires
// loggedModel(role) through withSystemUsage; tests and the keyless fixture pass a double). A thrown/failed transport is a typed
// `unavailable`, never a silent substitution. The learner's ORIGINAL instruction is passed through every call unchanged.
import { ROADMAP_PROMPTS, ROADMAP_PROMPT_VERSION } from '../agents/roadmap-plan.js';
import { promptVersion } from '../learn-models.js';
import { ROADMAP_LIMITS, ceilingFor } from './roadmap-policy.js';
import { sourceBlock, sha256 } from './roadmap-source.js';
import { decideLanguage, validatePlan, validateSubject } from './roadmap-validate.js';

export const promptFingerprints = async () => Object.fromEntries(await Promise.all(Object.entries(ROADMAP_PROMPTS).map(async ([role, p]) => [role, await promptVersion(p.system, p.tools)])));

// One tool call on `auto`, then at most limits.calls.repairsPerPlan repair turns quoting the validator's words.
async function run(role, userContent, check, { callModel, limits = ROADMAP_LIMITS, loop }) {
  const { system, tools } = ROADMAP_PROMPTS[role], tool = tools[0].name;
  const messages = [{ role: 'user', content: userContent }];
  let calls = 0, attempt = 0;
  for (;;) {
    // R7a long Markdown (loop set): before the last allowed turn the model may also call the loop's tools (bounded evidence reads). A turn made only of those
    // calls is answered with their results and does not use the repair. The last turn offers the plan tool alone.
    const reading = loop && calls < loop.turns - 1;
    let message;
    try { message = await callModel(role, { max_tokens: limits.maxTokens[role], system: loop ? `${system}\n${loop.system}` : system, tools: reading ? [...tools, ...loop.tools] : tools, tool_choice: { type: 'auto' }, messages }); calls++; } catch { return { outcome: 'unavailable', code: 'model_unavailable', calls }; }
    const used = (message?.content || []).filter(part => part.type === 'tool_use');
    if (reading && used.length && used.every(u => u.name !== tool)) {
      const results = [];
      for (const u of used) results.push({ type: 'tool_result', tool_use_id: u.id, ...(await loop.handle(u)) });
      messages.push({ role: 'assistant', content: message.content }, { role: 'user', content: results });
      continue;
    }
    let errors;
    if (used.length !== 1 || used[0].name !== tool) errors = [{ code: 'invalid_turn', detail: `call ${tool} exactly once` }];
    else { const verdict = check(used[0].input); if (verdict.ok) return { outcome: verdict.questioning ? 'question' : 'ok', value: used[0].input, calls }; errors = verdict.errors; }
    if (attempt++ >= limits.calls.repairsPerPlan) return { outcome: 'failed', code: 'invalid_output', errors, calls };
    const feedback = errors.map(e => `${e.code}: ${e.detail}`).join('; ');
    messages.push({ role: 'assistant', content: message?.content || [] });
    messages.push(used[0] ? { role: 'user', content: [{ type: 'tool_result', tool_use_id: used[0].id, is_error: true, content: `Rejected: ${feedback}. Return the complete corrected input with ${tool}. This is the only correction attempt.` }] }
      : { role: 'user', content: `You must call ${tool} exactly once. ${feedback}` });
  }
}

const request = (input, extra = {}) => JSON.stringify({ task: input.task, language: input.language, depth: input.depth, stepCeiling: ceilingFor(input.depth, input.limits),
  passageLimit: (input.limits || ROADMAP_LIMITS).source.passageChars, scope: { start: input.scope.start, end: input.scope.end }, instruction: input.instruction, ...extra });

// The source text follows the JSON as a quoted block, never inside the instruction.
const content = (json, source) => `${json}\n\n${sourceBlock(source)}`;

// input = { instruction:{original, latest?}, depth, source: readRoadmapSource() result with status 'ok', scope?:{start,end} }
export async function identifySubject({ source }, deps) {
  const head = source.text.slice(0, (deps.limits || ROADMAP_LIMITS).summary.subjectSourceChars);
  const r = await run('roadmap_subject', content(JSON.stringify({ task: 'subject' }), { ...source, text: head, coverage: { start: 0, end: head.length } }), v => validateSubject(v), deps);
  return r.outcome === 'ok' ? { outcome: 'ok', subject: r.value.subject.trim(), sourceLanguage: r.value.sourceLanguage } : r;
}

async function plan(role, input, deps, extra = {}) {
  const { source } = input, lang = decideLanguage({ instruction: input.instruction.latest || input.instruction.original, sourceText: source.text });
  const language = input.language || lang.language;
  // A language ambiguity that matters is one focused question before any paid planning call.
  if (!input.language && lang.question) return { outcome: 'question', question: lang.question, language, calls: 0 };
  const scope = input.scope || { start: source.coverage.start, end: source.coverage.end };
  const ctx = { depth: input.depth, scope, instruction: input.instruction, language, sourceText: source.text, limits: deps.limits, ...(input.long ? { longScope: true } : {}), ...extra.ctx };
  // R7a long Markdown (input.long = { outline, budget, loop }): the prompt carries the outline and the evidence loop, never the document; the full text stays server-side for the language and link checks.
  const json = request({ ...input, scope, language, task: role === 'roadmap_draft' ? 'draft' : 'revise' }, { ...extra.request, ...(input.long ? { document: input.long.budget } : {}) });
  const r = await run(role, input.long ? `${json}\n\n${input.long.outline}` : content(json, source), value => validatePlan(value, ctx), input.long ? { ...deps, loop: input.long.loop } : deps);
  if (r.outcome !== 'ok' && r.outcome !== 'question') return r;
  // The hash binds the plan to the instruction as the learner wrote it; the model never computes or edits it.
  const instructionAck = { ...r.value.instructionAck, originalHash: await sha256(input.instruction.original) };
  return { outcome: r.outcome, plan: { ...r.value, instructionAck, language }, question: r.value.question, calls: r.calls, promptVersion: input.long ? `${ROADMAP_PROMPT_VERSION}+long-1` : ROADMAP_PROMPT_VERSION };
}

export const draftRoadmap = (input, deps) => plan('roadmap_draft', input, deps);

// change = the learner's request; current = the plan being revised; delivered = steps that already exist as cards (immutable).
export const reviseRoadmap = (input, deps) => {
  const delivered = input.delivered || [];
  return plan('roadmap_revise', input, deps, { request: { change: input.change, currentPlan: input.current, delivered }, ctx: { revision: true, delivered } });
};
