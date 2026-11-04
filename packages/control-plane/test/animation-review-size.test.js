// FX-AN-042: the review request the comparison captures made too large. Acceptance attempt 4 (job aj_734f1e4e, candidate 89d9718bf):
// the repair 2 draft (13,917 B with its program) was refused as "too large for the independent review request" by about 95 bytes; the
// same draft fits the request of the tree before the comparison captures (5427f0db4, margin 4,165 micro-USD, 1,315 B of capture
// text), and the candidate's captions made the worst case 842 B longer (the explanation of the two review-level entry kinds, said again
// in the caption of every view, and the same state said again for the second view). No model call; the drafts are the job's own.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sealArtifact, validateStage } from '../src/animation-author.js';
import { ANIMATION_REVIEW_SYSTEM } from '../src/agents/animation-author.js';
import { REVIEW_ENTRIES, buildReviewContent } from '../src/animation-review.js';
import { worstReviewContent } from '../src/animation-repair.js';
import { ANIMATION_MODEL, animationRequest, roleBoundMicros } from '../src/animation-policy.js';
import { requestSpendBound } from '../src/learn-spend.js';
import { REVIEW_TOOL } from '../src/explain-review.js';
import { enabledCapabilities } from '../src/animation-brief.js';
import { validateAnimationArtifact } from '../../web/src/animation3d/contract.js';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/animation-aj_734f1e4.json', import.meta.url), 'utf8'));
const env = { ANTHROPIC_API_KEY: 'offline' };
const bytes = text => new TextEncoder().encode(text).length;
const jobOf = draft => ({ prompt: fixture.prompt, plan: fixture.plan, planHash: fixture.planHash, resultId: fixture.resultId, approval: { at: fixture.approvalAt }, draft, evidence: [], features: ['curve_radius', 'action_motion'], attempt: 1, repairs: 1, counts: { review: 0 },
  calls: [{ role: 'repair', status: 'settled', served: fixture.servedModel }] });
const sealedOf = async draft => {
  const sealed = await sealArtifact(draft, { artifactId: fixture.resultId, revision: 1, planHash: fixture.planHash, model: fixture.servedModel, createdAt: new Date(fixture.approvalAt).toISOString(), caps: enabledCapabilities() });
  const checked = validateAnimationArtifact(sealed, enabledCapabilities(), { draft: true });
  assert.ok(checked.ok, JSON.stringify(checked.issues?.slice(0, 3)));
  return checked.value;
};
// The price bound of the worst-case review request of a draft (the number fitProblems compares with the role's limit).
async function reviewBound(draft) {
  const content = worstReviewContent(await sealedOf(draft), jobOf(draft), draft);
  try { return Math.round(requestSpendBound(animationRequest(env, 'review', { system: ANIMATION_REVIEW_SYSTEM, tool: REVIEW_TOOL, content }), ANIMATION_MODEL, 'anthropic') * 1e6); } catch (error) { if (error?.code === 'input_too_large') return error.boundMicros; throw error; }
}
const margin = async draft => roleBoundMicros('review') - await reviewBound(draft);

// Measured on 5427f0db4 (the tree before the comparison captures) with these same drafts and this same check.
// FX-AN-112 (C10, owner order): the review request of an artifact with an arrow gained ARROW_NOTE (227 B; measured here as 555 micro-USD of margin and 111 B of the largest artifact), so those
// three floors carry that allowance and no more. The bound itself (the role's 40,000) is unchanged.
const ARROW_NOTE_ALLOWANCE = { micros: 600, artifactBytes: 120 };
const BEFORE = { authorMargin: 7090 - ARROW_NOTE_ALLOWANCE.micros, repair2Margin: 4165 - ARROW_NOTE_ALLOWANCE.micros, captionBytes: 1143, maxArtifactBytes: 14750 - ARROW_NOTE_ALLOWANCE.artifactBytes };

test('the repair 2 draft of aj_734f1e4e (13,917 B with its program) passes the size check, with at least the margin it had before the comparison captures', async () => {
  const out = await validateStage(jobOf(fixture.repair2Draft), { env });
  assert.deepEqual(out.problems ?? [], []);
  assert.match(out.artifactHash, /^[0-9a-f]{64}$/);
  assert.ok(await margin(fixture.repair2Draft) >= BEFORE.repair2Margin, `margin ${await margin(fixture.repair2Draft)} micro-USD, before the comparison captures ${BEFORE.repair2Margin}`);
});

test('the author draft keeps at least the margin it had before the comparison captures, and the 15,295 B repair 1 draft is still too large (the limit did not move)', async () => {
  assert.ok(await margin(fixture.authorDraft) >= BEFORE.authorMargin, `margin ${await margin(fixture.authorDraft)} micro-USD, before ${BEFORE.authorMargin}`);
  const out = await validateStage(jobOf(fixture.repair1Draft), { env });
  assert.equal(out.category, 'size_limit');
  assert.match(out.problems[0], /15295 bytes with its program\) is too large for the independent review request/);
  assert.ok(await margin(fixture.repair1Draft) < 0);
});

test('the largest reviewable artifact is at least what it was before the comparison captures (14,750 B with its program, measured on 5427f0db4)', async () => {
  const base = fixture.repair2Draft;
  const fits = async pad => !(await validateStage(jobOf({ ...base, program: { source: base.program.source + '//' + 'x'.repeat(pad) } }), { env })).problems?.length;
  let low = 0, high = 4000;
  while (high - low > 1) { const mid = (low + high) >> 1; if (await fits(mid)) low = mid; else high = mid; }
  const largest = 13917 + low + 2;
  assert.ok(largest >= BEFORE.maxArtifactBytes, `the largest artifact that fits is ${largest} B; before the comparison captures ${BEFORE.maxArtifactBytes}`);
});

// What the captions and the one note on review-level events add to the request, in bytes (the note rides in the first block).
const captionBytes = content => content.filter(b => b.type === 'text' && /^Capture v/.test(b.text)).reduce((t, b) => t + bytes(b.text), 0) + (content[0].text.includes(REVIEW_ENTRIES) ? bytes(REVIEW_ENTRIES) : 0);

test('the capture text of the worst-case request is no longer than before the comparison captures, plus a small stated allowance', async () => {
  const content = worstReviewContent(await sealedOf(fixture.repair2Draft), jobOf(fixture.repair2Draft), fixture.repair2Draft);
  assert.ok(captionBytes(content) <= BEFORE.captionBytes + 60, `${captionBytes(content)} B of capture text; before the comparison captures ${BEFORE.captionBytes} B (candidate 89d9718bf: 1,987 B)`);
});

// The information the shorter text must keep.
const entry = (id, view, over = {}) => ({ id, artifactHash: 'h', data: 'AAAA', view, time: 0, inputs: { a: 1 }, events: [], ticks: 0, ...over });
const reviewOf = captures => buildReviewContent({ request: 'r', plan: fixture.plan, artifact: { program: undefined, scene: { nodes: [] } }, artifactHash: 'h', captures }).content;
const captionOf = (content, id) => content.find(b => b.type === 'text' && b.text.startsWith(`Capture ${id} (`))?.text;
const mentions = content => content.filter(b => b.type === 'text' && b.text.includes(REVIEW_ENTRIES));

test('the explanation of the two review-level entries is said once, ahead of every caption, and only when a capture has such an entry', () => {
  const events = [{ type: 'action', action: 'go' }, { type: 'advance', ticks: 48 }, { type: 'resume', action: 'go', probe: 12 }];
  const content = reviewOf([entry('v0-s0', 'default', { events, ticks: 30 }), entry('v1-s0', 'side', { events, ticks: 30 })]);
  assert.equal(mentions(content).length, 1, 'once, not once per view');
  assert.equal(mentions(content)[0], content[0], 'in the first block, which lists the captures, ahead of every caption');
  assert.match(REVIEW_ENTRIES, /advance/); assert.match(REVIEW_ENTRIES, /resume/);
  assert.match(REVIEW_ENTRIES, /did not move in any of them/, 'the stopped-or-moving rule of the resume entry');
  assert.match(REVIEW_ENTRIES, /whatever the period of its motion/);
  assert.equal(mentions(reviewOf([entry('v0-s0', 'default', { events: [{ type: 'action', action: 'go' }], ticks: 30 })])).length, 0, 'no such entry, no note');
});

test('every caption keeps the events in order, the inputs, the time and the host steps', () => {
  const events = [{ type: 'action', action: 'go' }, { type: 'advance', ticks: 48 }, { type: 'action', action: 'save' }, { type: 'resume', action: 'go', probe: 12 }];
  const text = captionOf(reviewOf([entry('v0-s1', 'default', { time: 1.5, inputs: { a: 0.5 }, events, ticks: 30 })]), 'v0-s1');
  assert.ok(text.includes(JSON.stringify(events)), 'the whole events list, advance and resume entries included');
  assert.ok(text.includes('"a":0.5') && text.includes('time 1.5s') && text.includes('30 host steps') && text.includes('view default'));
});

test('a second view of the same state refers to the first caption; a different state, or a different view alone, is written out', () => {
  const events = [{ type: 'action', action: 'go' }, { type: 'advance', ticks: 48 }];
  const content = reviewOf([entry('v0-s1', 'default', { events, ticks: 30 }), entry('v1-s1', 'side', { events, ticks: 30 }), entry('v1-s2', 'side', { events, ticks: 30, time: 2 }), entry('v0-s0', 'default'), entry('v1-s0', 'side')]);
  assert.match(captionOf(content, 'v1-s1'), /^Capture v1-s1 \(view side, same state as v0-s1\):$/);
  assert.match(captionOf(content, 'v1-s2'), /time 2s/, 'another time is another state');
  assert.match(captionOf(content, 'v1-s0'), /same state as v0-s0/);
  assert.ok(bytes(captionOf(content, 'v1-s1')) < bytes(captionOf(content, 'v0-s1')) / 2);
  const single = reviewOf([entry('v0-s0', 'default', { time: 1, events: [] })]);
  assert.equal(captionOf(single, 'v0-s0'), 'Capture v0-s0 (view default, time 1s, inputs {"a":1}, the initial state):', 'a plain capture keeps its caption exactly');
});

// AN-19 (owner decision 11): a capture whose trace reports a clamp says so in the review request, as the host's drawing; others add nothing.
test('the review request names a clamped marker as the host\'s clamp, with its true and drawn y, and adds nothing for a capture without one', async () => {
  const { clampNotes } = await import('../src/animation-review.js');
  const captures = [{ id: 'a', trace: { readouts: {}, clamped: [{ node: 'ball', trueY: 5.6, y: 2 }] } }, { id: 'b', trace: { readouts: {} } }, { id: 'c' }];
  const notes = clampNotes(captures);
  assert.equal(notes.length, 1);
  assert.equal(notes[0].text, 'Capture a: ball is clamped at the surface top (true y 5.6, drawn at 2); its readouts keep the true value. The host draws this clamp, not the scene.');
  assert.deepEqual(clampNotes([]), []);
});
