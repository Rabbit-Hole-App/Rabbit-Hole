// packages/control-plane/src/agents/learn-next-steps.js
// Professor Next Steps hook contract (docs/features/professor-next-steps.md §1.1, §2.2): the planner's tool, its limits,
// the server validator, minted HookSets and the check of an incoming selected_next_step. Pure: no model call, no storage.
import { LEARNING_GOAL_MAX, learningGoalProblem } from './learn-tutor.js';
import { LEARNER_LABELS } from './learn-journey.js';
import { STATES } from '../../../web/src/learn-tutor-evidence.js';

export const NEXT_STEPS_PLANNER_VERSION = 'next-steps-planner-1';
export const NEXT_STEPS_LIMITS = Object.freeze({
  options: 3, hook_words_min: 4, hook_words_max: 12, hook_chars: 90, goal: LEARNING_GOAL_MAX, reason: 200, ids: 3,
  scope_concepts: 12, scope_claims: 12, blocks: 20, block_title: 80, statement: 240, ideas: 4, idea: 120, drawn: 160,
  transitions: 6, modalities: 8, practice: 4, previous_hooks: 6, previous_goals: 3, question: 300, goal_text: 200,
  input_chars: 9000, input_refuse: 12000, basis: 400, debounce_ms: 1200, tab_cap: 60,
});
const LIMITS = NEXT_STEPS_LIMITS;

const IDS = { type: 'array', maxItems: LIMITS.ids, items: { type: 'string' } };
export const NEXT_STEPS_TOOL = Object.freeze({
  name: 'suggest_next_steps',
  description: 'Return exactly three curiosity hooks, each with its internal learning goal.',
  input_schema: { type: 'object', additionalProperties: false, required: ['options'], properties: {
    options: { type: 'array', minItems: LIMITS.options, maxItems: LIMITS.options, items: { type: 'object', additionalProperties: false,
      required: ['hook', 'learning_goal', 'concept_ids', 'claim_ids', 'reason_internal'],
      properties: { hook: { type: 'string', maxLength: LIMITS.hook_chars }, learning_goal: { type: 'string', maxLength: LIMITS.goal }, concept_ids: IDS, claim_ids: IDS, reason_internal: { type: 'string', maxLength: LIMITS.reason } } } },
    // contract §2.4: an ambiguous reading escalates once; not an option field.
    ambiguous: { type: 'boolean' },
  } },
});

// Generic lexicon, never topic words (ponytail: short lists; extend when a paid run slips one past).
// "Do ..." and "Does ..." open good questions, so do is not a command verb here.
const COMMAND = /^(?:let'?s\s+)?(?:learn|explain|study|review|revise|continue|proceed|generate|open|add|create|make|show|start|begin|read|watch|play|practi[cs]e|take|go|move on|next)\b/i;
const FORMAT = /\b(?:next (?:lesson|section|chapter|step|topic)|lessons?|chapters?|tutorials?|quiz(?:zes)?|flash ?cards?|worksheets?|animations?|videos?|clips?|avatars?|explain[- ]back|diagrams?|slides?|cards?)\b/gi;
const CLICKBAIT = /\b(?:you won'?t believe|mind[- ]?blowing|shocking|secrets?|one (?:weird )?trick|hacks?)\b/i;
// "Do you know why ...?" is a question to the learner, not a claim about them.
const MASTERY = /(?<!\b(?:do|did|can|could|would|will|should) )\byou(?:'ve| have)? (?:now )?(?:fully )?(?:got|mastered|understand|know)\b|\byou can now\b/i;
const CODE = /[`{}<>]|=>/;
const REPAIR = ['misconception', 'prerequisite_gap', 'uncertain'];
const SAME_GOAL = 0.6; // Jaccard overlap of content words at which two goals count as the same
const FORBIDDEN_KEYS = ['familiarity', 'background', 'intake', 'answer', 'key', 'expected', 'level', 'score', 'mastery'];

const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
const labelled = text => LEARNER_LABELS.some(re => re.test(text)) || MASTERY.test(text);
const copies = (text, source) => learningGoalProblem(String(text).slice(0, LEARNING_GOAL_MAX), source) === 'learner words';
const words = text => String(text).trim().split(/\s+/).filter(Boolean);
const norm = text => String(text).toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim();
const content = text => new Set(norm(text).split(' ').filter(w => w.length >= 4));
const jaccard = (a, b) => { const x = content(a), y = content(b); const inter = [...x].filter(w => y.has(w)).length; return inter / (new Set([...x, ...y]).size || 1); };

// The escape hatch for a format word: the lowercased goal, scope labels and visible block titles.
export const topicOf = input => [input?.goal, ...Object.values(input?.scope?.concepts || {}), ...(input?.canvas?.blocks || []).map(b => b?.title)]
  .filter(t => typeof t === 'string').join(' ').toLowerCase();

// topic: topicOf's string; texts: claim statements, ideas, drawn and the option's own goal (the deterministic
// answer-reveal gate); question: the learner's own last words. Returns the rule name (never the hook) or null.
export function hookProblem(hook, { topic = '', texts = [], question = '' } = {}) {
  if (typeof hook !== 'string' || !hook.trim()) return 'hook_words';
  const n = words(hook).length;
  if (n < LIMITS.hook_words_min || n > LIMITS.hook_words_max) return 'hook_words';
  if (hook.length > LIMITS.hook_chars) return 'hook_chars';
  if (/\n/.test(hook)) return 'hook_line';
  if (CODE.test(hook) || learningGoalProblem(hook) === 'identifier') return 'hook_code';
  if (COMMAND.test(hook.trim())) return 'command';
  // Whole words only: FORMAT yields letters, spaces and hyphens, so a match is safe to use as a pattern.
  if ((hook.match(FORMAT) || []).some(w => !new RegExp(`\\b${w}\\b`, 'i').test(topic))) return 'format_word';
  if (CLICKBAIT.test(hook)) return 'clickbait';
  if (labelled(hook)) return 'level_label';
  if (texts.some(text => copies(hook, text))) return 'answer_reveal';
  if (question && copies(hook, question)) return 'learner_words';
  return null;
}

// { ok: true, value: [3 x { hook, learning_goal, concept_ids, claim_ids, reason_internal }] } or { ok: false, errors }.
// An error is `option <n>: <rule>` or the bare rule of a set-level check, never the hook text.
export function nextStepsOutput(out, input) {
  const raw = out?.options;
  if (!Array.isArray(raw) || raw.length !== LIMITS.options || !raw.every(isObj)) return { ok: false, errors: ['shape'] };
  const concepts = input?.scope?.concepts || {}, claims = input?.scope?.claims || {}, question = input?.recent?.question || '', topic = topicOf(input);
  const completed = new Set((input?.path?.completed || []).flatMap(s => s?.claim_ids || [])), current = new Set(input?.path?.current?.claim_ids || []);
  const idsOk = (list, known) => Array.isArray(list) && list.length <= LIMITS.ids && new Set(list).size === list.length && list.every(id => typeof id === 'string' && Object.hasOwn(known, id));
  const errors = [], value = [];
  raw.forEach((o, i) => {
    const bad = rule => errors.push(`option ${i + 1}: ${rule}`);
    const hook = typeof o.hook === 'string' ? o.hook.trim() : o.hook, goal = typeof o.learning_goal === 'string' ? o.learning_goal.trim() : o.learning_goal;
    const conceptIds = idsOk(o.concept_ids, concepts), claimIds = idsOk(o.claim_ids, claims), own = claimIds ? o.claim_ids.map(id => claims[id]) : [];
    const texts = [...own.flatMap(c => [c?.statement, ...(Array.isArray(c?.ideas) ? c.ideas : []), c?.drawn]).filter(t => typeof t === 'string'), goal];
    const hookRule = hookProblem(hook, { topic, texts, question });
    if (hookRule) bad(hookRule);
    if (learningGoalProblem(goal, question) !== null || labelled(goal)) bad('goal');
    if (!conceptIds || !claimIds) bad('ids');
    else if ((Object.keys(claims).length || Object.keys(concepts).length) && !o.concept_ids.length && !o.claim_ids.length) bad('ungrounded');
    // Ruling F6: refused only when every claim is completed-only (a completed section, not the current one) and none needs repair.
    else if (o.claim_ids.length && o.claim_ids.every(id => completed.has(id) && !current.has(id)) && !own.some(c => REPAIR.includes(c?.state))) bad('completed_only');
    const reason = o.reason_internal;
    if (typeof reason !== 'string' || !reason.trim() || reason.length > LIMITS.reason || CODE.test(reason)) bad('reason_internal');
    value.push({ hook, learning_goal: goal, concept_ids: conceptIds ? [...o.concept_ids] : [], claim_ids: claimIds ? [...o.claim_ids] : [], reason_internal: reason });
  });
  const hooks = value.map(o => norm(o.hook)), before = (input?.previous?.hooks || []).map(norm), goals = input?.previous?.goals || [];
  if (new Set(hooks).size < hooks.length) errors.push('duplicate_hook');
  if (value.some((a, i) => value.some((b, j) => j > i && jaccard(a.learning_goal, b.learning_goal) >= SAME_GOAL))) errors.push('duplicate_goal');
  if (hooks.some(h => before.includes(h)) || value.some(o => goals.some(g => jaccard(o.learning_goal, g) >= SAME_GOAL))) errors.push('repeat');
  return errors.length ? { ok: false, errors } : { ok: true, value };
}

// Refuses a planner input that is the wrong shape, over a limit or carries what must never reach the model (§2.1).
// Returns a short reason or null.
export function nextStepsInputProblem(input) {
  if (!isObj(input)) return 'input must be an object';
  if (!['journey', 'dive', 'canvas'].includes(input.mode)) return 'mode must be journey, dive or canvas';
  if (typeof input.basis !== 'string' || !input.basis || input.basis.length > LIMITS.basis) return `basis must be 1-${LIMITS.basis} characters`;
  if (JSON.stringify(input).length > LIMITS.input_refuse) return `input over ${LIMITS.input_refuse} characters`;
  // A concept or claim id is data, not a field name: the id keys of scope.concepts and scope.claims are exempt (their
  // values are scanned), every other key at any depth, scope's own included, is not.
  const { concepts = {}, claims = {} } = isObj(input.scope) ? input.scope : {};
  const scan = v => {
    if (!v || typeof v !== 'object') return null;
    for (const [k, x] of Object.entries(v)) { if (FORBIDDEN_KEYS.includes(k)) return k; const inner = scan(x); if (inner) return inner; }
    return null;
  };
  const rest = { ...input, scope: isObj(input.scope) ? { ...input.scope, concepts: null, claims: null } : input.scope };
  const hit = scan(rest) || (isObj(concepts) && scan(Object.values(concepts))) || (isObj(claims) && scan(Object.values(claims)));
  if (hit) return `forbidden key ${hit}`;
  if (!isObj(concepts) || Object.keys(concepts).length > LIMITS.scope_concepts) return `scope.concepts must be an object of at most ${LIMITS.scope_concepts}`;
  if (!isObj(claims) || Object.keys(claims).length > LIMITS.scope_claims) return `scope.claims must be an object of at most ${LIMITS.scope_claims}`;
  for (const [id, c] of Object.entries(claims)) if (!STATES.includes(c?.state)) return `scope.claims.${id}.state must be one of ${STATES.join(', ')}`;
  const blocks = input.canvas?.blocks ?? [];
  if (!Array.isArray(blocks) || blocks.length > LIMITS.blocks) return `canvas.blocks must be a list of at most ${LIMITS.blocks}`;
  const question = input.recent?.question ?? '';
  if (typeof question !== 'string' || question.length > LIMITS.question) return `recent.question must be at most ${LIMITS.question} characters`;
  const { hooks = [], goals = [] } = input.previous || {};
  if (!Array.isArray(hooks) || hooks.length > LIMITS.previous_hooks) return `previous.hooks must be a list of at most ${LIMITS.previous_hooks}`;
  if (!Array.isArray(goals) || goals.length > LIMITS.previous_goals) return `previous.goals must be a list of at most ${LIMITS.previous_goals}`;
  return null;
}

const randomHex = () => [...crypto.getRandomValues(new Uint8Array(4))].map(b => b.toString(16).padStart(2, '0')).join('');
// §1.1: the shown HookSet. The server mints every id; reason_internal never leaves the planner. source ({ share_version,
// origin_block_id }) travels only in a shared canvas's steps.
export function mintSet(options, input, { source = null, now = () => new Date(), hex = randomHex } = {}) {
  const set_id = `ns_${hex()}`, scope = input.mode === 'shared' ? 'shared' : 'owned';
  return { set_id, generated_at: now().toISOString(), basis: input.basis, options: options.map((o, i) => {
    const id = `${set_id}.${i + 1}`;
    return { id, hook: o.hook, selected_next_step: { v: 1, set_id, suggestion_id: id, basis: input.basis, hook: o.hook, learning_goal: o.learning_goal,
      concept_ids: [...o.concept_ids], claim_ids: [...o.claim_ids], scope, ...(scope === 'shared' ? { source } : {}) } };
  }) };
}

// The server's check of an incoming shared selected_next_step: concepts and claims are Sets of the ids the shared board
// allows, topic is topicOf's string for that board (ruling F2: a hook valid at generation stays valid), version the board's
// current share_version and origin the card id or ':root'. null, or { error, status }; a stale version is 409 stale_hook.
const SET = /^(ns_[0-9a-f]{8})\.([1-9])$/;
export function selectedStepProblem(step, { concepts, claims, version, origin, topic = '' }) {
  const bad = error => ({ error, status: 400 });
  const suggestion = SET.exec(step?.suggestion_id);
  if (!isObj(step) || step.v !== 1 || !suggestion || suggestion[1] !== step.set_id || +suggestion[2] > LIMITS.options) return bad('selected_next_step is malformed');
  if (hookProblem(step.hook, { topic }) || learningGoalProblem(step.learning_goal) || labelled(step.learning_goal)) return bad('selected_next_step wording');
  const ids = (list, allowed) => Array.isArray(list) && list.length <= LIMITS.ids && list.every(id => typeof id === 'string' && allowed.has(id));
  if (!ids(step.concept_ids, concepts) || !ids(step.claim_ids, claims)) return bad('selected_next_step ids');
  if (step.scope !== 'shared' || !isObj(step.source)) return bad('selected_next_step scope');
  if (step.source.share_version !== version) return { error: 'stale_hook', status: 409 };
  if (step.source.origin_block_id !== origin) return bad('selected_next_step origin');
  return null;
}
