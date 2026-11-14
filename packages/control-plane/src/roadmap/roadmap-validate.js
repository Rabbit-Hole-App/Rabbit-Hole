// Deterministic validators for the roadmap planner (R4.04; contracts/planning.md 3, 5-8, 11). Pure: no env, no clock, no model.
// A model's plan is data until validatePlan says ok. Every failure carries a code the one repair turn can quote back to the model.
import { validateToolInput } from '../learn-validation.js';
import { PLAN_TOOL, SUBJECT_TOOL } from '../agents/roadmap-plan.js';
import { ROADMAP_LIMITS, ceilingFor } from './roadmap-policy.js';
import { ROADMAP_FORMATS } from './roadmap-tools.js';

const fold = s => String(s).toLowerCase().replace(/\s+/g, ' ').trim();
const tokens = s => new Set(fold(s).match(/[\p{L}\p{N}]{3,}/gu) || []);
const jaccard = (a, b) => { const x = tokens(a), y = tokens(b); const i = [...x].filter(t => y.has(t)).length; const u = x.size + y.size - i; return u ? i / u : 0; };
const overlap = (a, b) => Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start));
// The learner says they already know something / want it skipped (planning.md 5.3).
export const KNOWN_TOPIC = /\b(already know|i know|skip|don'?t need|no need|not interested|beyond|ya s[eé]|d[eé]j[aà] (connais|sais)|kenne ich schon)\b/i;
// Cheap price/credit guard: a plan never talks about money (v1.4 5.1, D24).
const MONEY = /\b(credits?|price[sd]?|costs?|free of charge)\b|[$€£]\s?\d/i;
const URL = /https?:\/\/[^\s)"']+/gi;

const err = (code, detail) => ({ code, detail });

// ctx = { depth, scope:{start,end}, instruction:{original, latest?}, language?, sourceText?, delivered?:[{title,passage}], limits }
// -> { ok, errors, questioning } ; questioning = a focused question and no steps (a roadmap in `questioning`, not a half plan).
export function validatePlan(plan, ctx = {}) {
  const L = ctx.limits || ROADMAP_LIMITS, errors = [];
  try { validateToolInput(plan, PLAN_TOOL.input_schema, 'submit_roadmap'); } catch (e) { return { ok: false, errors: [err('schema', e.message)], questioning: false }; }
  const delivered = ctx.delivered || [], scope = ctx.scope;
  if (plan.question) {
    if (plan.steps.length) errors.push(err('question_with_steps', 'a focused question comes with no steps'));
    if (plan.question.kind === 'focus' && plan.question.options.length < 1) errors.push(err('question_options', 'a focus question offers options'));
    return { ok: !errors.length, errors, questioning: !errors.length };
  }
  const ceiling = ceilingFor(ctx.depth, L);
  if (!plan.steps.length) errors.push(err('step_count', 'no steps and no question'));
  if (plan.steps.length > ceiling) errors.push(err('step_count', `${plan.steps.length} steps; the ${ctx.depth || 'balanced'} ceiling is ${ceiling}, a maximum, not a target`));
  plan.steps.forEach((s, i) => {
    if (!ROADMAP_FORMATS.includes(s.format)) errors.push(err('format', `step ${i + 1} format ${s.format} is not supported`));
    const { start, end } = s.passage;
    if (!(start < end)) errors.push(err('passage_range', `step ${i + 1} passage is empty`));
    else if (scope && (start < scope.start || end > scope.end)) errors.push(err('passage_outside_scope', `step ${i + 1} passage ${start}-${end} is outside the scope ${scope.start}-${scope.end}`));
    if (end - start > L.source.passageChars) errors.push(err('passage_too_long', `step ${i + 1} passage is ${end - start} characters; split it, the limit is ${L.source.passageChars}`));
    if (!s.claimsToCover.every(c => c.trim())) errors.push(err('claims', `step ${i + 1} has an empty claim`));
  });
  if (!plan.stoppingPoint.trim()) errors.push(err('stopping_point', 'a stopping point is required'));
  if (!plan.outcome.trim()) errors.push(err('outcome', 'an outcome is required'));
  // Redundancy: two steps that overlap the same text and teach the same thing.
  for (let i = 0; i < plan.steps.length; i++) for (let j = i + 1; j < plan.steps.length; j++) {
    const a = plan.steps[i], b = plan.steps[j], short = Math.min(a.passage.end - a.passage.start, b.passage.end - b.passage.start);
    if (short > 0 && overlap(a.passage, b.passage) / short > 0.5 && jaccard(`${a.title} ${a.goal}`, `${b.title} ${b.goal}`) > 0.6) errors.push(err('redundant_steps', `steps ${i + 1} and ${j + 1} teach the same thing`));
  }
  // Money, and links the source does not contain.
  const visible = [plan.outcome, plan.stoppingPoint, ...plan.assumptions, ...plan.steps.flatMap(s => [s.title, s.goal, ...s.claimsToCover])].join('\n');
  if (MONEY.test(visible)) errors.push(err('mentions_price', 'a roadmap never mentions price or credits'));
  const known = ctx.sourceText || '';
  for (const url of visible.match(URL) || []) if (!known.includes(url)) errors.push(err('invented_url', `${url} is not in the source`));
  // Coverage: every character of the scope is in a step passage or a declared uncovered range with a reason (planning.md 4).
  // A long Markdown plan (ctx.longScope) chooses what to teach from a document it cannot cover whole: the server reports what it left out, the plan does not declare it.
  if (scope && !ctx.longScope) errors.push(...coverageErrors(plan, scope));
  errors.push(...instructionErrors(plan, ctx.instruction));
  errors.push(...languageErrors(visible, ctx.language));
  if (ctx.revision) errors.push(...revisionErrors(plan, delivered));
  return { ok: !errors.length, errors, questioning: false };
}

// Gaps of at most this many characters (whitespace between sections) need no declaration. ponytail: a fixed slack, not a markdown-aware trim.
const GAP_SLACK = 40;
function coverageErrors(plan, scope) {
  const out = [], ranges = [...plan.steps.map(s => s.passage), ...plan.coverage.uncovered.map(u => ({ start: u.start, end: u.end }))].sort((a, b) => a.start - b.start);
  for (const u of plan.coverage.uncovered) {
    if (!(u.start < u.end) || u.start < scope.start || u.end > scope.end) out.push(err('uncovered_outside_scope', `uncovered range ${u.start}-${u.end} is outside the scope`));
    if (!u.reason.trim()) out.push(err('uncovered_reason', 'an uncovered range needs a reason'));
  }
  let at = scope.start;
  for (const r of ranges) { if (r.start - at > GAP_SLACK) out.push(err('coverage_gap', `characters ${at}-${r.start} are neither in a step nor declared uncovered`)); at = Math.max(at, r.end); }
  if (scope.end - at > GAP_SLACK) out.push(err('coverage_gap', `characters ${at}-${scope.end} are neither in a step nor declared uncovered`));
  return out;
}

// planning.md 5: the original instruction overrides the inferred topic. "I already know X, teach me Y" must not reteach X.
function instructionErrors(plan, instruction) {
  const out = [], original = instruction?.original || '';
  const skips = plan.instructionAck.skips;
  if (skips.some(s => !s.topic.trim())) out.push(err('skip_topic', 'a skipped topic is empty'));
  if (original && KNOWN_TOPIC.test(original) && !skips.length) out.push(err('instruction_not_honored', 'the instruction says the learner already knows something or wants it skipped, but nothing is skipped'));
  for (const skip of skips) {
    const topic = fold(skip.topic);
    const hit = plan.steps.find(s => topic && (fold(s.title) === topic || fold(s.title).includes(topic) || topic.includes(fold(s.title))));
    if (hit) out.push(err('step_reteaches_skip', `step "${hit.title}" teaches "${skip.topic}", which the learner asked to skip`));
  }
  return out;
}

// Delivered steps are immutable: first in order, same title and passage (planning.md 8).
function revisionErrors(plan, delivered) {
  const out = [];
  delivered.forEach((d, i) => { const s = plan.steps[i]; if (!s || s.title !== d.title || s.passage.start !== d.passage.start || s.passage.end !== d.passage.end) out.push(err('delivered_changed', `delivered step "${d.title}" must stay first and unchanged`)); });
  return out;
}

// --- language (D13) -------------------------------------------------------------------------------------------------------
// ponytail: stopword + script detection for six Latin-script languages and four other scripts; a real detector belongs to the quality
// check, not the deterministic guard. Anything undetected is `null`, never a guess.
const STOP = {
  en: /\b(the|and|of|to|is|are|with|that|this|for|how|what)\b/g, es: /\b(el|la|los|las|de|que|y|en|es|una|para|con|por)\b/g,
  fr: /\b(le|la|les|des|est|une|et|en|que|pour|dans|avec|qui)\b/g, de: /\b(der|die|das|und|ist|nicht|ein|eine|mit|von|zu|den)\b/g,
  pt: /\b(o|os|as|de|que|e|em|uma|para|com|não|é)\b/g, it: /\b(il|lo|gli|di|che|e|è|una|per|con|non|le)\b/g,
};
const SCRIPT = { ru: /[Ѐ-ӿ]/g, zh: /[一-鿿]/g, ja: /[぀-ヿ]/g, ko: /[가-힯]/g, ar: /[؀-ۿ]/g, hi: /[ऀ-ॿ]/g };
export function detectLanguage(text) {
  const s = String(text || '');
  if (s.replace(/\s/g, '').length < 12) return null;
  const letters = (s.match(/\p{L}/gu) || []).length || 1;
  for (const [code, re] of Object.entries(SCRIPT)) if ((s.match(re) || []).length / letters > 0.3) return code;
  const scores = Object.entries(STOP).map(([code, re]) => [code, (s.toLowerCase().match(re) || []).length]).sort((a, b) => b[1] - a[1]);
  return scores[0][1] >= 3 && scores[0][1] > (scores[1]?.[1] || 0) * 1.5 ? scores[0][0] : null;
}
const NAMES = { english: 'en', spanish: 'es', french: 'fr', german: 'de', portuguese: 'pt', italian: 'it', russian: 'ru', chinese: 'zh', japanese: 'ja', korean: 'ko', arabic: 'ar', hindi: 'hi' };
const REQUEST = new RegExp(`\\b(?:in|en|auf|em)\\s+(${Object.keys(NAMES).join('|')})\\b|\\b(?:answer|explain|teach|write)[^.]{0,30}\\b(${Object.keys(NAMES).join('|')})\\b`, 'i');
// D13: the learner's explicit request, else the language of their instruction, else the source's. An instruction and a source in
// different detected languages with no stated preference is one focused question when it is material.
export function decideLanguage({ instruction = '', sourceText = '' } = {}) {
  const m = REQUEST.exec(instruction);
  if (m) return { language: NAMES[(m[1] || m[2]).toLowerCase()], basis: 'requested', question: null };
  const asked = detectLanguage(instruction), source = detectLanguage(sourceText);
  if (asked && source && asked !== source) return { language: asked, basis: 'instruction', question: { kind: 'language', text: 'Your note is in a different language than your request. Which should the explanations use?', options: [{ label: asked }, { label: source }] } };
  if (asked) return { language: asked, basis: 'instruction', question: null };
  return source ? { language: source, basis: 'source', question: null } : { language: 'en', basis: 'default', question: null };
}
function languageErrors(visible, language) {
  if (!language) return [];
  const got = detectLanguage(visible);
  return got && got !== language && (SCRIPT[got] || SCRIPT[language]) ? [err('language', `the plan is written in ${got}; the learner's language is ${language}`)] : [];
}

// --- invitation (planning.md 3): deterministic, no model ---------------------------------------------------------------
export const INVITATION_CHOICES = Object.freeze(['Explain on canvas', 'Just keep it here']);
export function decideInvitation({ sourceSupported, autoSuggest, mode, unfinishedRoadmap, alreadyOffered, chatIdle = true } = {}) {
  const no = reason => ({ offer: false, reason });
  if (!sourceSupported) return no('unsupported_source');
  if (mode === 'ask') return no('ask_mode');
  if (!autoSuggest) return no('auto_suggest_off');
  if (unfinishedRoadmap) return no('unfinished_roadmap');
  if (alreadyOffered) return no('already_offered');
  return chatIdle ? { offer: true, choices: INVITATION_CHOICES } : { offer: false, reason: 'chat_busy', queued: true };
}

// --- subject (D5) ---------------------------------------------------------------------------------------------------------
export function validateSubject(value) {
  try { validateToolInput(value, SUBJECT_TOOL.input_schema, 'identify_subject'); } catch (e) { return { ok: false, errors: [err('schema', e.message)] }; }
  return value.subject.trim().split(/\s+/).length > 12 ? { ok: false, errors: [err('subject_long', 'at most 12 words')] } : { ok: true, errors: [] };
}

// --- rubric and deterministic scorer (planning.md 11) -----------------------------------------------------------------------
export const RUBRIC = Object.freeze({
  version: 'roadmap-rubric-1',
  threshold: { meanPerCriterion: 1.6, noZeroOn: ['instructionFidelity', 'supportedClaims'], criticalFailures: 0 }, // proposed; the owner records it before scoring
  criteria: ['instructionFidelity', 'scopeCoverage', 'nonredundancy', 'supportedClaims', 'usefulFormat', 'stoppingPoint', 'safety'],
  readerOnly: ['supportedClaims', 'usefulFormat', 'safety'], // judged by two blind readers, never by this scorer
});
// Scores what code can establish (0/1/2); the rest is null. Critical failures are named.
export function scorePlan(plan, ctx = {}) {
  const v = validatePlan(plan, ctx), codes = new Set(v.errors.map(e => e.code)), critical = [];
  const score = { instructionFidelity: codes.has('instruction_not_honored') || codes.has('step_reteaches_skip') ? 0 : 2,
    scopeCoverage: codes.has('coverage_gap') ? 0 : codes.has('passage_outside_scope') ? 0 : 2,
    nonredundancy: codes.has('redundant_steps') ? 0 : 2,
    stoppingPoint: codes.has('stopping_point') ? 0 : codes.has('step_count') ? 0 : 2,
    supportedClaims: null, usefulFormat: null, safety: null };
  if (score.instructionFidelity === 0) critical.push('reteaches_known_topic');
  if (codes.has('step_count') && plan.steps?.length > ceilingFor(ctx.depth, ctx.limits)) critical.push('expands_past_ceiling');
  if (codes.has('invented_url')) critical.push('invented_citation');
  return { score, critical, errors: v.errors, rubric: RUBRIC.version };
}
