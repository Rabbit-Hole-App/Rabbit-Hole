import { test } from 'node:test';
import assert from 'node:assert/strict';
import { screenText, enforcePart, modelAdjudicator, CATEGORIES } from '../src/roadmap/roadmap-safety.js';
import { checkRoadmapCard } from '../src/roadmap/roadmap-check.js';
import { ROADMAP_LIMITS } from '../src/roadmap/roadmap-policy.js';
import { SAFETY_QUESTIONS } from '../src/agents/roadmap-check.js';

const zero = Object.fromEntries(CATEGORIES.map(k => [k, 0.01]));
const cls = (scores = {}, over = {}) => ({ scores: { ...zero, ...scores }, uncertainty: 0.1, coverage: { complete: true, chars: 100, chunks: 1 }, ...over });
// A classifier double: answers the next scripted classification per call (an Error is thrown, a function is called with the part).
const classifier = (...replies) => { let n = 0; const calls = []; return { calls, classify: async part => { calls.push(part); const r = replies[Math.min(n++, replies.length - 1)]; if (r instanceof Error) throw r; return typeof r === 'function' ? r(part) : r; } }; };
const parts = [{ role: 'learner', text: 'explain this' }, { role: 'source', text: 'The human reproductive system consists of ...' }, { role: 'output', text: 'A card.' }];
const screen = (c, over = {}) => screenText(parts, { classify: c.classify, ...over });

test('questions are independent per category, not the exclusive safe/explicit/graphic choice', () => {
  assert.deepEqual(Object.keys(SAFETY_QUESTIONS), CATEGORIES);
  assert.ok(CATEGORIES.includes('sexual_minors') && CATEGORIES.includes('self_harm_personal') && CATEGORIES.length === 7);
});

test('educational anatomy is allowed: a sensitive subject alone does not block', async () => {
  const out = await screen(classifier(cls({ sexual_explicit: 0.04, violence: 0.01 })));
  assert.deepEqual([out.decision, out.publishable, out.action, out.counted_as_prohibited], ['allow', true, 'continue', false]);
  assert.equal(out.policy_version, 'roadmap-text-p1');
  assert.match(out.input_hash, /^[0-9a-f]{64}$/);
});

test('false-allowance guards: explicit content, sexualized minors and non-consensual intimate content block', async () => {
  for (const scores of [{ sexual_explicit: 0.9 }, { sexual_minors: 0.4 }, { nonconsensual_intimate: 0.6 }, { private_data: 0.9 }]) {
    const out = await screen(classifier(cls(scores)));
    assert.deepEqual([out.decision, out.publishable, out.action], ['block', false, 'refuse'], JSON.stringify(scores));
  }
  const out = await screen(classifier(cls({ violence: 0.7 })));
  assert.deepEqual([out.decision, out.publishable, out.action], ['restrain', true, 'limit']); // analysis of violence: allowed with a limitation
});

test('unknown is held: a timeout is not prohibited content and never permits publication; one retry then a bounded end', async () => {
  const c = classifier(new Error('timeout'));
  const out = await screen(c);
  assert.deepEqual([out.decision, out.publishable, out.counted_as_prohibited, out.retried, out.terminal, out.action], ['unknown', false, false, true, true, 'terminate']);
  assert.equal(c.calls.length, parts.length * 2, 'every part was screened, then once more');
});

test('unknown then bounded recovery: the retry can succeed; a second failure goes to one adjudication that can only resolve, never loop', async () => {
  // the first screen fails on all parts, the retry succeeds
  const ok = await screen(classifier(() => { throw new Error('x'); }, () => { throw new Error('x'); }, () => { throw new Error('x'); }, cls(), cls(), cls()));
  assert.equal(ok.decision, 'allow');
  assert.equal(ok.retried, true);
  // both screens unknown -> exactly one adjudication, which can allow
  let adjudications = 0;
  const adj = async () => { adjudications++; return { decision: 'allow', reason: 'educational anatomy' }; };
  const down = classifier(new Error('down'));
  const res = await screen(down, { adjudicate: adj });
  assert.deepEqual([res.decision, res.adjudicated, res.publishable, adjudications], ['allow', true, true, 1]);
  // an adjudication that is itself unsure ends the delivery
  const unsure = await screen(classifier(new Error('down')), { adjudicate: async () => ({ decision: 'unknown', reason: '?' }) });
  assert.deepEqual([unsure.decision, unsure.terminal, unsure.publishable], ['unknown', true, false]);
  const threw = await screen(classifier(new Error('down')), { adjudicate: async () => { throw new Error('opus down'); } });
  assert.equal(threw.terminal, true);
});

test('an adjudication cannot override a block', async () => {
  let called = false;
  const out = await screen(classifier(cls({ sexual_minors: 0.9 })), { adjudicate: async () => { called = true; return { decision: 'allow', reason: 'x' }; } });
  assert.deepEqual([out.decision, called], ['block', false]);
});

test('malformed, incomplete or uncertain classifications are unknown, never allow', () => {
  assert.equal(enforcePart('source', null).decision, 'unknown');
  assert.equal(enforcePart('source', { scores: { sexual_explicit: 0.01 }, uncertainty: 0.1, coverage: { complete: true } }).decision, 'unknown'); // missing categories
  assert.equal(enforcePart('source', cls({ sexual_explicit: 0.01 }, { coverage: { complete: false, chars: 24000 } })).why, 'incomplete_coverage');
  assert.equal(enforcePart('source', cls({}, { uncertainty: 0.9 })).why, 'uncertain');
  assert.equal(enforcePart('source', cls({ sexual_explicit: 2 })).decision, 'unknown');
  assert.equal(enforcePart('source', cls({ sexual_explicit: 0.5 })).decision, 'unknown'); // the middle band is not an allowance
});

test('personal imminent risk (the learner own words) pauses teaching; a quoted self-harm passage is analysis', async () => {
  const risky = await screen(classifier(part => cls(part.role === 'learner' ? { self_harm_personal: 0.9 } : {})));
  assert.deepEqual([risky.action, risky.publishable, risky.personalRisk], ['pause_support', false, true]);
  const quoted = await screen(classifier(part => cls(part.role === 'source' ? { self_harm_personal: 0.9 } : {})));
  assert.deepEqual([quoted.decision, quoted.publishable, quoted.personalRisk], ['allow', true, false]);
});

test('the overall checking deadline bounds retries and adjudication', async () => {
  let t = 0;
  const now = () => t;
  const slow = classifier(() => { t += ROADMAP_LIMITS.deadlineMs.checking; throw new Error('late'); });
  let adjudicated = false;
  const out = await screen(slow, { now, adjudicate: async () => { adjudicated = true; return { decision: 'allow', reason: 'x' }; } });
  assert.deepEqual([out.decision, out.terminal, adjudicated], ['unknown', true, false]);
  assert.equal(slow.calls.length, parts.length, 'no retry once the deadline is spent');
});

test('bad input and no classifier hold the work', async () => {
  assert.equal((await screenText([], { classify: async () => cls() })).terminal, true);
  assert.equal((await screenText([{ role: 'robot', text: 'x' }], { classify: async () => cls() })).decision, 'unknown');
  assert.equal((await screenText(parts, {})).decision, 'unknown');
});

test('the adjudicator is one Opus-role call through the injected transport and validates its reply', async () => {
  const seen = [];
  const adjudicate = modelAdjudicator({ callModel: async (role, body) => { seen.push({ role, body }); return { content: [{ type: 'tool_use', id: 'a', name: 'submit_adjudication', input: { decision: 'allow', reason: 'anatomy' } }] }; } });
  assert.deepEqual(await adjudicate({ parts, classification: { why: 'uncertain', categories: zero } }), { decision: 'allow', reason: 'anatomy' });
  assert.equal(seen[0].role, 'roadmap_safety_adjudicate');
  assert.equal(seen[0].body.max_tokens, ROADMAP_LIMITS.maxTokens.roadmap_safety_adjudicate);
  const bad = modelAdjudicator({ callModel: async () => ({ content: [] }) });
  assert.equal((await bad({ parts, classification: {} })).decision, 'unknown');
});

// --- the combined delivery-boundary verdict ------------------------------------------------------------------------------------
const REV = 'sha256:' + 'a'.repeat(64);
const passage = 'The gradient points in the direction of steepest increase.';
const block = { type: 'explanation', title: 'Gradients', body: 'The gradient points toward steepest increase.' };
const grounded = (verdict) => async () => ({ content: [{ type: 'tool_use', id: 'g', name: 'submit_verdicts', input: { verdicts: [verdict] } }] });
const supportsIt = { claim: 'c', verdict: 'supports', quote: 'direction of steepest increase' };

test('publication needs BOTH checks: grounding and safety each hold, block or pass the card', async () => {
  const run = (g, c, extra = {}) => checkRoadmapCard({ block, passage, rev: REV, instruction: 'teach me' }, { callModel: g, classify: c.classify, ...extra });
  const ok = await run(grounded(supportsIt), classifier(cls()));
  assert.deepEqual([ok.validation, ok.publishable, ok.terminal], ['passed', true, false]);
  const unsupported = await run(grounded({ claim: 'c', verdict: 'not_established' }), classifier(cls()));
  assert.deepEqual([unsupported.validation, unsupported.publishable, unsupported.terminal], ['held', false, false]); // repairable, not terminal
  const unsafe = await run(grounded(supportsIt), classifier(cls({ sexual_explicit: 0.95 })));
  assert.deepEqual([unsafe.validation, unsafe.publishable], ['blocked', false]);
  const unknown = await run(grounded(supportsIt), classifier(new Error('jev down')));
  assert.deepEqual([unknown.validation, unknown.publishable, unknown.terminal], ['held', false, true]);
  const limited = await run(grounded(supportsIt), classifier(cls({ hate_extremism: 0.7 })));
  assert.deepEqual([limited.validation, limited.limitation], ['passed', true]);
  const support = await run(grounded(supportsIt), classifier(part => cls(part.role === 'learner' ? { self_harm_personal: 0.95 } : {})));
  assert.deepEqual([support.publishable, support.pauseSupport], [false, true]);
});
