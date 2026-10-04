// The Motion Director stage (spec §4.5, M2) with a fake model: the request shape (Opus 5.5:
// tool_choice auto, adaptive thinking, explicit effort), the one schema-only re-ask, and the
// grounding rules that fail a brief instead of letting it through. No real model calls here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveLearnerTurn } from '../../control-plane/src/learner-intent.js';
import { groundTarget } from '../../control-plane/src/source-grounding.js';
import { fixtureSource } from './fixture-source.js';
import { validateBrief, leakErrors } from './contracts.js';
import { DIRECTOR_TOOL, runDirector } from './director.js';

const source = fixtureSource();
const softmaxTurn = () => resolveLearnerTurn({ message: '/motion 15s explain me softmax func', location: { concept: 'attention', canvas_id: 'cv-nanogpt' } });

// A brief the Director could write for the softmax turn, citing only the grounding's refs.
const goodBrief = () => ({
  title: 'How softmax turns attention scores into weights',
  objective: 'The learner can explain how softmax turns one row of attention scores into weights over the allowed positions, and knows nanoGPT\'s explicit mask-then-softmax code is the fallback path.',
  audience_context: 'NanoGPT attention lesson; the learner has seen attention scores but not their normalization.',
  scope_note: 'Leaves out the weighted sum of values and dropout to fit 15 seconds.',
  teaching_mode: 'mechanism_first',
  claims: [
    { id: 'C1', text: 'On the fallback path, F.softmax turns each row of scores into non-negative weights that sum to 1 over the positions left unmasked.', source_ref_ids: ['S4'], condition_ids: ['K1'], required: true },
    { id: 'C2', text: 'On the fallback path, masked_fill sets future positions to -inf before F.softmax, so they get zero weight.', source_ref_ids: ['S4', 'S2'], condition_ids: ['K1'], required: true },
    { id: 'C3', text: 'When self.flash is true, scaled_dot_product_attention with is_causal=True does the causal attention internally instead.', source_ref_ids: ['S3', 'S1'], condition_ids: ['K1'], required: true },
  ],
  must_show: ['one row of raw attention scores', 'future positions unavailable', 'normalized weights over the allowed positions', 'the weights summing to 1', 'which path runs: fallback vs scaled_dot_product_attention'],
  must_not_claim: ['nanoGPT always executes the explicit F.softmax path', 'masking happens after softmax', 'future tokens are removed from the sequence', 'softmax picks a single winner'],
  visual_direction: 'Clean technical motion: one row of scores, the future cells dimming to blocked, then bars resizing into weights that visibly add up to one; a side note shows the optimized path.',
  narration_policy: 'none',
});
const toolMessage = (input, extra = {}) => ({ id: 'msg_1', model: 'claude-opus-5-5', stop_reason: 'tool_use', usage: { input_tokens: 4000, output_tokens: 1500, cache_creation_input_tokens: 900, cache_read_input_tokens: 0 }, content: [{ type: 'thinking', thinking: '', signature: 'sig' }, { type: 'tool_use', id: 'tu_1', name: 'motion_brief', input }], ...extra });
// A fake ask.js anthropic(): records each request and replays the queued messages.
const fakeModel = (...replies) => {
  const requests = [];
  const call = async (env, body, model) => { requests.push({ body: structuredClone(body), model }); return Response.json(replies.shift()); };
  return { call, requests };
};
let ms = 0;
const clock = () => (ms += 1000);

test('the request: role-resolved Opus 5.5, tool_choice auto (never forced), adaptive thinking, explicit high effort, the brief tool, cached system prompt', async () => {
  const fake = fakeModel(toolMessage(goodBrief()));
  const g = groundTarget(softmaxTurn(), source);
  const r = await runDirector({ turn: softmaxTurn(), grounding: g, call: fake.call, clock });
  assert.equal(r.status, 'brief', JSON.stringify(r.errors));
  const [{ body, model }] = fake.requests;
  assert.equal(model, 'claude-opus-5-5');
  assert.deepEqual(body.tool_choice, { type: 'auto' });
  assert.deepEqual(body.thinking, { type: 'adaptive' });
  assert.deepEqual(body.output_config, { effort: 'high' });
  assert.deepEqual(body.tools.map(t => t.name), [DIRECTOR_TOOL.name]);
  assert.equal(body.system[0].cache_control.type, 'ephemeral');
  assert.equal(body.model, undefined); // the model is the call's argument, never part of the body or brief
  // The raw words reach the Director only as data inside the context, with the evidence pack.
  assert.match(body.messages[0].content, /"raw_user_message":"\/motion 15s explain me softmax func"/);
  assert.match(body.messages[0].content, /"id":"S4","role":"occurrence"/);
  // The call is recorded for provenance and cost; the role is configurable.
  assert.deepEqual(r.calls[0].usage, { input_tokens: 4000, output_tokens: 1500, cache_creation_input_tokens: 900, cache_read_input_tokens: 0 });
  assert.equal(r.calls[0].cost_usd, +((4000 * 4 + 1500 * 20 + 900 * 5) / 1e6).toFixed(4));
  const other = fakeModel(toolMessage(goodBrief()));
  await runDirector({ turn: softmaxTurn(), grounding: g, call: other.call, env: { MOTION_DIRECTOR_MODEL: 'claude-sonnet-5-5' }, clock });
  assert.equal(other.requests[0].model, 'claude-sonnet-5-5');
});

test('the softmax brief: canonical, grounded, branch-aware, renderer-neutral, model-independent', async () => {
  const fake = fakeModel(toolMessage(goodBrief()));
  const r = await runDirector({ turn: softmaxTurn(), grounding: groundTarget(softmaxTurn(), source), call: fake.call, clock });
  const b = r.brief;
  assert.deepEqual(validateBrief(b), []);
  assert.equal(b.raw_user_request, '/motion 15s explain me softmax func');
  assert.equal(b.resolved_target.kind, 'code_span');
  assert.equal(b.resolved_target.resolution, 'context_disambiguated');
  assert.deepEqual(b.duration, { requested_text: '15s', requested_seconds: 15, seconds: 15 });
  assert.equal(r.decision_line, '✓ duration: 15s');
  assert.deepEqual(b.source_refs.map(s => `${s.path}:${s.start_line}-${s.end_line}`), ['model.py:44-45', 'model.py:48-50', 'model.py:62-64', 'model.py:65-71']);
  assert.equal(b.implementation_conditions[0].id, 'K1');
  assert.deepEqual(b.output_requirements, { stage_width: 1920, stage_height: 1080, fps: 30, preview_scale: 0.45, poster: true });
  assert.equal(b.qa_requirements.blocking_categories.length, 12);
  assert.equal(b.prompt_spec_version, 'motion-v1.0/director-1');
  assert.deepEqual(leakErrors(b, 'brief'), []); // no model id, no credential anywhere in the brief
  assert.ok(!/remotion|hyperframes/i.test(JSON.stringify(b)));
  assert.deepEqual(r.format_retries, []);
});

test('one schema-only re-ask: a malformed call is answered with its errors, appended (never edited), then accepted', async () => {
  const bad = goodBrief();
  delete bad.must_show;
  bad.teaching_mode = 'mechanism';
  const fake = fakeModel(toolMessage(bad), toolMessage(goodBrief()));
  const r = await runDirector({ turn: softmaxTurn(), grounding: groundTarget(softmaxTurn(), source), call: fake.call, clock });
  assert.equal(r.status, 'brief');
  assert.equal(r.calls.length, 2);
  assert.deepEqual(r.format_retries.map(f => [f.stage, f.round]), [['brief', 0]]);
  assert.match(r.format_retries[0].errors.join('\n'), /must_show: required/);
  const second = fake.requests[1].body.messages;
  assert.equal(second.length, 3);
  assert.deepEqual(second[1].content, toolMessage(bad).content); // the assistant turn, thinking included, unchanged
  assert.equal(second[2].content[0].type, 'tool_result');
  assert.equal(second[2].content[0].is_error, true);
  assert.match(second[2].content[0].content, /SAME intended brief.*Do not change the objective, scope, teaching mode, claims, sources or constraints/s);
});

test('a second malformed answer fails the stage; no tool call at all counts as malformed', async () => {
  const fake = fakeModel({ ...toolMessage({}), content: [{ type: 'text', text: 'Here is my plan...' }], stop_reason: 'end_turn' }, toolMessage({ title: 'x' }));
  const r = await runDirector({ turn: softmaxTurn(), grounding: groundTarget(softmaxTurn(), source), call: fake.call, clock });
  assert.equal(r.status, 'failed');
  assert.equal(r.error, 'malformed');
  assert.match(r.detail, /^brief: output was malformed again after its one format re-ask/);
  assert.equal(r.calls.length, 2);
  assert.equal(fake.requests[1].body.messages[2].content.includes('no motion_brief call'), true);
});

test('grounding failures are not re-asked: an unsupported claim, an invented ref, a missing condition, an unconditional branch claim', async () => {
  const cases = [
    [b => { b.claims[0].text = 'On the fallback path, F.softmax uses torch.exp with a temperature of 0.7.'; }, /names "torch\.exp", which is not in its cited evidence/],
    [b => { b.claims[1].source_ref_ids = ['S4', 'S9']; }, /cites S9, which the grounding never produced/],
    [b => { b.claims[0].condition_ids = []; }, /rests on branch-dependent code but does not name K1/],
    [b => { b.claims[0].text = 'nanoGPT always masks the scores and then calls F.softmax.'; }, /describes branch-dependent behavior as unconditional \("always"\)/],
    [b => { b.visual_direction = 'Animate the row with React and SVG transitions.'; }, /keep the brief renderer-neutral/],
    // A branch claim may name its condition's flag and the other branch (first real Opus brief, 2026-10-04).
    [b => { b.claims[0].text = 'When `self.flash` is false, F.softmax runs here; when it is true, scaled_dot_product_attention runs instead.'; }, null],
    [b => { b.teaching_mode = 'intuition_first'; b.analogy_map = [{ analogy_element: 'a', real_concept: 'b', limit: 'c' }]; }, null],
  ];
  for (const [edit, re] of cases) {
    const b = goodBrief();
    edit(b);
    const fake = fakeModel(toolMessage(b));
    const r = await runDirector({ turn: softmaxTurn(), grounding: groundTarget(softmaxTurn(), source), call: fake.call, clock });
    if (!re) { assert.equal(r.status, 'brief'); continue; }
    assert.equal(r.status, 'failed', String(re));
    assert.equal(r.error, 'invalid_brief');
    assert.ok(r.errors.some(x => re.test(x)), `${re} in:\n${r.errors.join('\n')}`);
    assert.equal(r.calls.length, 1, 'no re-ask for grounding');
  }
});

test('the learner\'s requested teaching mode binds the Director; narration fits the duration', async () => {
  const t2 = softmaxTurn();
  t2.structured_interpretation.requested_mode = 'intuition_first';
  const fake = fakeModel(toolMessage(goodBrief()));
  const r = await runDirector({ turn: t2, grounding: groundTarget(t2, source), call: fake.call, clock });
  assert.ok(r.errors.some(e => /teaching_mode: the learner asked for intuition_first/.test(e)));
  const short = resolveLearnerTurn({ message: '/motion 3s explain me softmax func', location: { concept: 'attention' } });
  const b = { ...goodBrief(), narration_policy: 'one_line' };
  const r5 = await runDirector({ turn: short, grounding: groundTarget(short, source), call: fakeModel(toolMessage(b)).call, clock });
  assert.ok(r5.errors.some(e => /narration_policy: one_line does not fit 5s/.test(e)));
  assert.equal(r5.brief.duration.normalization, '✓ duration: 5s (asked 3s; Motion V1 min is 5s)');
});

test('clarification and missing sources never call the model and never fabricate a brief', async () => {
  for (const turn of [
    resolveLearnerTurn({ message: '/motion explain me softmax func' }),
    resolveLearnerTurn({ message: '/motion 10s explain gradient descent', location: { concept: 'attention' } }),
    resolveLearnerTurn({ message: '/motion explain this' }),
  ]) {
    const fake = fakeModel();
    const r = await runDirector({ turn, grounding: groundTarget(turn, source), call: fake.call, clock });
    assert.equal(r.status, 'needs_clarification');
    assert.equal(r.brief, undefined);
    assert.equal(fake.requests.length, 0);
    assert.ok(r.clarification.question.length > 10);
  }
});

// The mandatory nanoGPT softmax brief (spec §27), written by a real Claude Opus 5.5 Director call
// on 2026-10-04 (`/motion 15s explain me softmax func`, concept attention) and kept verbatim.
test('the recorded real softmax brief: valid, grounded, and branch-correct about F.softmax and SDPA', async () => {
  const { readFileSync } = await import('node:fs');
  const b = JSON.parse(readFileSync(new URL('./fixtures/m2/softmax-15s-attention.brief.json', import.meta.url), 'utf8'));
  const turn = softmaxTurn();
  const g = groundTarget(turn, source);
  const { groundingErrors } = await import('./director.js');
  assert.deepEqual(validateBrief(b), []);
  assert.deepEqual(groundingErrors(b, g, turn), []);
  assert.deepEqual(leakErrors(b, 'brief'), []);
  assert.deepEqual(b.source_refs, g.source_refs.map(({ role, condition_ids, ...r }) => r)); // the harness's refs, not the model's
  assert.equal(b.raw_user_request, '/motion 15s explain me softmax func');
  assert.equal(b.duration.seconds, 15);
  assert.match(b.scope_note, /GPT\.generate \(model\.py:324\)/); // the other softmax is named, not merged
  const claims = b.claim_registry;
  const about = re => claims.filter(c => re.test(c.text));
  for (const c of about(/F\.softmax|masked_fill/)) assert.deepEqual(c.condition_ids, ['K1'], c.id); // the explicit path is the fallback branch
  assert.ok(about(/masked_fill[\s\S]*F\.softmax/).length, 'the fallback masks before F.softmax');
  assert.ok(about(/scaled_dot_product_attention[\s\S]*is_causal=True/).some(c => c.condition_ids.includes('K1')), 'SDPA handles causal attention on the flash branch');
  assert.ok(claims.every(c => !/\balways\b/i.test(c.text)));
  const never = b.must_not_claim.join('\n');
  assert.match(never, /F\.softmax` always runs/);
  assert.match(never, /masking happens after softmax/);
  assert.match(never, /removes masked positions/);
});
