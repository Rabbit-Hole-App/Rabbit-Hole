// The storyboard stage (spec §4.6, §5.2; M3): the deterministic checks against the real M2
// softmax brief, and the stateless Director-role call with a fake model. No real model calls.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { leakErrors } from './contracts.js';
import { checkStoryboard } from './storyboard-check.js';
import { HARD_LIMITS, STORYBOARD_SYSTEM, STORYBOARD_TOOL, runStoryboard, storyboardContext, storyboardRequest } from './storyboard.js';

const read = f => JSON.parse(readFileSync(new URL(f, import.meta.url), 'utf8'));
const brief = () => read('./fixtures/m2/softmax-15s-attention.brief.json');
const good = () => read('./fixtures/m3/softmax-15s-attention.storyboard.json'); // hand-written reference, not an expected model output
const beat = (s, id) => s.beats.find(b => b.id === id);
const errorsOf = (s, b = brief()) => checkStoryboard(s, b).errors;
const rejects = (mutate, re, b = brief()) => {
  const s = good();
  mutate(s, b);
  const e = errorsOf(s, b);
  assert.ok(e.some(x => re.test(x)), `${re} in:\n${e.join('\n') || '(no errors)'}`);
};

test('the reference softmax storyboard is accepted, with deterministic coverage and claim maps', () => {
  const r = checkStoryboard(good(), brief());
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.coverage.must_show.map(m => m.beats), [['B1'], ['B2'], ['B3'], ['B4'], ['B4'], ['B5']]);
  assert.deepEqual(r.coverage.claims.map(c => [c.id, c.beats]), [['C1', ['B1', 'B3', 'B4']], ['C2', ['B2', 'B5']], ['C3', ['B3', 'B4']], ['C4', ['B6']]]);
  assert.deepEqual(r.coverage.objects.find(o => o.id === 'score_row').beats, ['B2', 'B3', 'B4', 'B5']); // one object, four beats
  assert.deepEqual(r.timeline.map(t => [t.id, t.start, t.end, t.frames]), [['B1', 0, 2.5, [0, 74]], ['B2', 2.5, 5.5, [75, 164]], ['B3', 5.5, 9, [165, 269]], ['B4', 9, 11.5, [270, 344]], ['B5', 11.5, 13.5, [345, 404]], ['B6', 13.5, 15, [405, 449]]]);
});

test('timing: exactly 0 to the brief duration on the 0.1 s grid, ordered, no gaps, no overlaps', () => {
  rejects(s => { beat(s, 'B6').end_time = 14.6; }, /must end at exactly 15s \(ends at 14\.6\)/);
  rejects(s => { beat(s, 'B6').end_time = 16; }, /must end at exactly 15s/);
  rejects(s => { beat(s, 'B3').start_time = 5.7; }, /gap or overlap/);
  rejects(s => { beat(s, 'B3').start_time = 5; }, /gap or overlap/);
  rejects(s => { beat(s, 'B2').end_time = 5.55; beat(s, 'B3').start_time = 5.55; }, /0\.1 s grid/);
  rejects(s => { beat(s, 'B6').start_time = 14; beat(s, 'B5').end_time = 14; }, /B6: 1s is shorter than 1\.5s/);
});

test('scope fits the duration: no more than floor(d / 2) beats, nothing the scope_note leaves out', () => {
  const b = brief();
  b.duration = { seconds: 5 };
  rejects(s => { s.beats = s.beats.slice(0, 3).map((x, i) => ({ ...x, start_time: [0, 1.5, 3.5][i], end_time: [1.5, 3.5, 5][i] })); }, /3 beats for 5s \(at most 2\)/, b);
  rejects(s => { beat(s, 'B5').on_screen_text = 'The same softmax also turns logits into sampling probabilities.'; }, /"logits" is a topic the scope_note leaves out/);
});

test('stable semantic object ids', () => {
  rejects(s => { beat(s, 'B2').visible_objects[0].id = 'Score Row'; }, /stable snake_case id/);
  rejects(s => { beat(s, 'B2').visible_objects.push({ ...beat(s, 'B2').visible_objects[0] }); }, /duplicate id score_row/);
  rejects(s => { beat(s, 'B2').visible_objects[0].colour = 'red'; }, /colour: not a field/);
  rejects(s => { beat(s, 'B2').visible_objects[1].source.end_line = 75; }, /lines inside S4 \(model\.py:65-71\)/);
  rejects(s => { for (const o of beat(s, 'B4').visible_objects) delete o.change; }, /B4: nothing changes/);
});

test('claims: ids must exist, and learner text teaches nothing the brief does not claim, even if true', () => {
  rejects(s => { beat(s, 'B3').claim_ids = ['C9']; }, /unknown C9/);
  rejects(s => { beat(s, 'B3').on_screen_text = 'Softmax is invariant to adding one constant to every score.'; }, /"invariant" is not in the brief's claims, must_show or evidence/);
  rejects(s => { beat(s, 'B3').on_screen_text = 'Softmax is torch.exp(att) divided by its sum.'; }, /names "torch\.exp", which is not in the evidence of claims C1, C3/);
  rejects(s => { beat(s, 'B2').claim_ids = ['C1']; beat(s, 'B5').claim_ids = ['C1']; }, /required claim C2 is not taught/);
});

test('branch conditions: "nanoGPT always masks then calls F.softmax" is rejected', () => {
  rejects(s => { beat(s, 'B2').on_screen_text = 'nanoGPT always masks the scores, then calls F.softmax.'; }, /B2\.on_screen_text: "always" on branch-dependent content \(K1\)/);
  rejects(s => { beat(s, 'B2').on_screen_text = 'nanoGPT always masks the scores, then calls F.softmax.'; }, /echoes must_not_claim "That `F\.softmax` always runs/);
});

test('branch conditions: dropping the condition or the other branch is rejected', () => {
  // The fallback badge removed from the softmax beat: K1 is no longer visible there.
  rejects(s => { beat(s, 'B3').visible_objects = beat(s, 'B3').visible_objects.filter(o => o.id !== 'fallback_label'); beat(s, 'B3').on_screen_text = 'Softmax turns the scores into weights.'; }, /B3: teaches under K1 but nothing on screen says so/);
  // Code from one branch shown without naming its condition.
  rejects(s => { delete beat(s, 'B5').condition_ids; beat(s, 'B5').claim_ids = ['C3']; }, /B5: shows code or claims that run only under K1 but does not name K1/);
  // The SDPA (flash) side omitted entirely: the storyboard teaches only the fallback.
  rejects(s => { s.beats = s.beats.slice(0, 5); beat(s, 'B5').end_time = 15; }, /teaches one side of K1 but none of its other side \(C4\)/);
});

test('must_show: every item is visibly covered, verified rather than self-reported', () => {
  rejects(s => { beat(s, 'B3').must_show_covered = []; }, /must_show "That row turning into weights: .*" is not visibly covered/);
  // Declared on a beat that does not show it.
  rejects(s => { beat(s, 'B5').must_show_covered = []; beat(s, 'B1').must_show_covered.push(brief().must_show[5]); }, /must_show "The weights then flowing into `y = att @ v`" is not visibly covered \(declared by B1, which do not show enough of it\)/);
  rejects(s => { beat(s, 'B1').must_show_covered.push('a sparkle'); }, /not a brief must_show item/);
});

test('must_not_claim: labels, text, narration and the animated order', () => {
  rejects(s => { beat(s, 'B3').visible_objects[0].label = 'argmax'; }, /"argmax" echoes must_not_claim "That softmax picks only the single largest score/);
  rejects(s => { beat(s, 'B4').on_screen_text = 'Softmax normalizes down the columns.'; }, /"columns" echoes must_not_claim/);
  rejects(s => { beat(s, 'B3').narration_line = 'Softmax removes the masked tokens.'; }, /"removes" echoes must_not_claim "That softmax removes masked positions/);
  rejects(s => { beat(s, 'B6').on_screen_text = 'The flash path skips the causal masking.'; }, /"skips" echoes must_not_claim/);
  rejects(s => { beat(s, 'B2').on_screen_text = 'Softmax runs, then the masked_fill step.'; }, /puts softmax \(model\.py:69\) before masked_fill \(model\.py:68\)/);
  rejects(s => { beat(s, 'B2').on_screen_text = 'masked_fill runs after softmax.'; }, /puts softmax \(model\.py:69\) before masked_fill \(model\.py:68\)/);
  // Implied by the beats: softmax animated before the mask.
  rejects(s => { beat(s, 'B2').visible_objects[0].change = 'softmax turns the row into weights'; beat(s, 'B3').visible_objects[0].change = 'the future positions are masked to -inf'; }, /B2 animates softmax \(model\.py:69\) before B3 animates masked_fill \(model\.py:68\)/);
});

test('teaching mode is kept, never quietly switched', () => {
  rejects(s => { beat(s, 'B2').pedagogical_role = 'intuition'; }, /mechanism_first: an intuition or analogy beat comes before the mechanism/);
  rejects(s => { for (const x of s.beats) if (x.pedagogical_role === 'mechanism') x.pedagogical_role = 'implementation'; }, /mechanism_first: no mechanism beat/);
  rejects(s => { beat(s, 'B2').pedagogical_role = 'analogy'; }, /an analogy beat without an analogy_map/);
  const asIntuition = { ...brief(), teaching_mode: 'intuition_first', analogy_map: [{ analogy_element: 'votes', real_concept: 'weights', limit: 'votes are counts' }] };
  rejects(() => {}, /intuition_first: the intuition or analogy must come before any mechanism/, asIntuition);
  rejects(s => { beat(s, 'B3').visible_objects.forEach(o => delete o.source); }, /code_walkthrough: B3 walks through no source lines/, { ...brief(), teaching_mode: 'code_walkthrough' });
  rejects(s => { beat(s, 'B5').pedagogical_role = 'mechanism'; }, /code_walkthrough: no implementation beat/, { ...brief(), teaching_mode: 'code_walkthrough' });
  rejects(s => { s.beats.forEach(x => { x.visible_objects = x.visible_objects.slice(0, 1); }); }, /system_flow: nothing passes between components/, { ...brief(), teaching_mode: 'system_flow' });
});

test('concise text: labels, sentences, words per beat and reading pace', () => {
  rejects(s => { beat(s, 'B4').visible_objects[1].label = 'the sum of all of the weights in this row is exactly one'; }, /sum_marker\.label: .* \(at most 60 \/ 10\)/);
  rejects(s => { beat(s, 'B3').on_screen_text = 'Softmax turns scores into weights. Larger scores get larger weights. The -inf entries become 0.'; }, /on_screen_text: \d+ words \/ 3 sentences/);
  rejects(s => { beat(s, 'B6').on_screen_text = 'When self.flash is True, scaled_dot_product_attention runs instead, with is_causal=True, for each row of the scores, and the weights are used in y.'; }, /new words to read in 1\.5s/);
});

test('glyphs are not words: a step chain with arrows reads as its words', () => {
  const s = good();
  beat(s, 'B5').visible_objects[0].label = 'scores → masked_fill → softmax → attn_dropout → att @ v';
  beat(s, 'B5').on_screen_text = '';
  assert.deepEqual(errorsOf(s), []);
});

test('narration is planning only and fits its beat', () => {
  rejects(s => { beat(s, 'B4').narration_line = 'Each row sums to 1.'; }, /one_line allows one narration_line \(B3, B4 have one\)/);
  rejects(s => { beat(s, 'B3').narration_line = 'Softmax turns each row of the scores into weights that sum to 1 here.'; }, /words do not fit 3\.5s/);
  rejects(s => { beat(s, 'B3').narration_line = 'Softmax turns each row into weights.'; }, /narration_policy is none/, { ...brief(), narration_policy: 'none' });
});

test('renderer-neutral: no renderer, API, CSS or pixel detail anywhere', () => {
  rejects(s => { beat(s, 'B2').framing = 'a React component with the row in a flex box'; }, /B2\.framing: names an implementation detail \("React"\)/);
  rejects(s => { beat(s, 'B3').visible_objects[0].change = 'bars spring to height with interpolate over 24px'; }, /implementation detail/);
  rejects(s => { beat(s, 'B1').transition = 'fade in with cubic-bezier(0.2, 0, 0, 1)'; }, /implementation detail \("cubic-bezier"\)/);
  assert.deepEqual(leakErrors(good(), 'storyboard'), []);
});

// The stateless call, with a fake model.
const toolMessage = (input, extra = {}) => ({ id: 'msg_1', model: 'claude-opus-5-5', stop_reason: 'tool_use', usage: { input_tokens: 5000, output_tokens: 4000, cache_creation_input_tokens: 2500, cache_read_input_tokens: 0 }, content: [{ type: 'thinking', thinking: '', signature: 'sig' }, { type: 'tool_use', id: 'tu_1', name: 'motion_storyboard', input }], ...extra });
const fakeModel = (...replies) => {
  const requests = [];
  return { requests, call: async (env, body, model) => { requests.push({ body: structuredClone(body), model }); return Response.json(replies.shift()); } };
};
const beatsOf = s => ({ beats: s.beats });
let ms = 0;
const clock = () => (ms += 1000);

test('the call: Director role, tool_choice auto, adaptive thinking, high effort, the brief as the whole input', async () => {
  const fake = fakeModel(toolMessage(beatsOf(good())));
  const r = await runStoryboard({ brief: brief(), call: fake.call, clock });
  assert.equal(r.status, 'storyboard', r.check?.errors.join('\n'));
  const [{ body, model }] = fake.requests;
  assert.equal(model, 'claude-opus-5-5');
  assert.deepEqual([body.tool_choice, body.thinking, body.output_config], [{ type: 'auto' }, { type: 'adaptive' }, { effort: 'high' }]);
  assert.deepEqual(body.tools.map(t => t.name), [STORYBOARD_TOOL.name]);
  assert.equal(body.system[0].cache_control.type, 'ephemeral');
  assert.equal(body.messages.length, 1);
  const sent = JSON.parse(body.messages[0].content.replace(/^[\s\S]*?brief = /, ''));
  assert.deepEqual(sent, storyboardContext(brief()));
  assert.equal(sent.provenance, undefined);
  assert.equal(r.storyboard.brief_id, brief().id);
  assert.deepEqual(r.calls.map(c => [c.stage, c.role, c.resolved_model]), [['storyboard', 'MOTION_DIRECTOR_MODEL', 'claude-opus-5-5']]);
  assert.deepEqual(r.format_retries, []);
  assert.deepEqual(leakErrors(r.storyboard, 'storyboard'), []);
});

test('one schema-only re-ask: malformed, then the same storyboard well-formed', async () => {
  const bad = beatsOf(good());
  bad.beats[0].start_time = '0';
  delete bad.beats[1].framing;
  const fake = fakeModel(toolMessage(bad), toolMessage(beatsOf(good())));
  const r = await runStoryboard({ brief: brief(), call: fake.call, clock });
  assert.equal(r.status, 'storyboard');
  assert.deepEqual(r.format_retries.map(f => [f.stage, f.round]), [['storyboard', 0]]);
  assert.match(r.format_retries[0].errors.join('\n'), /beats\[0\]\.start_time: number/);
  const resent = fake.requests[1].body.messages;
  assert.equal(resent.length, 3);
  assert.equal(resent[2].content[0].is_error, true);
  assert.match(resent[2].content[0].content, /SAME intended storyboard/);
  // Twice malformed fails the stage.
  const twice = await runStoryboard({ brief: brief(), call: fakeModel(toolMessage(bad), toolMessage(bad)).call, clock });
  assert.deepEqual([twice.status, twice.error, twice.calls.length], ['failed', 'malformed', 2]);
});

test('semantic invalidity is surfaced as storyboard_invalid: no re-ask, no repair', async () => {
  const s = good();
  beat(s, 'B2').on_screen_text = 'nanoGPT always masks the scores, then calls F.softmax.';
  const fake = fakeModel(toolMessage(beatsOf(s)));
  const r = await runStoryboard({ brief: brief(), call: fake.call, clock });
  assert.equal(r.status, 'storyboard_invalid');
  assert.equal(fake.requests.length, 1);
  assert.deepEqual(r.format_retries, []);
  assert.ok(r.check.errors.some(e => /"always" on branch-dependent content/.test(e)));
  assert.ok(r.storyboard.beats.length);
});

// The mandatory softmax storyboard, written by a real Claude Opus 5.5 storyboard call on
// 2026-10-04 from the M2 brief and kept verbatim. Its first check failed only because glyphs
// (→ | @) were counted as words; it is the regression for that fix and for the semantic arc.
test('the recorded real softmax storyboard: valid, branch-aware, in the code order', () => {
  const s = read('./fixtures/m3/softmax-15s-attention.real.storyboard.json');
  const r = checkStoryboard(s, brief());
  assert.deepEqual(r.errors, []);
  assert.equal(s.beats.at(-1).end_time, 15);
  assert.ok(s.beats.length >= 4 && s.beats.length <= 6);
  assert.ok(s.beats.every(b => (b.condition_ids || []).includes('K1'))); // every beat keeps the fallback condition
  assert.ok(s.beats.every(b => b.visible_objects.some(o => o.id === 'branch_tag' && /self\.flash is false/.test(o.label)))); // and shows it
  assert.ok(r.coverage.must_show.every(m => m.beats.length));
  assert.ok(r.coverage.claims.filter(c => c.required).every(c => c.beats.length));
  assert.deepEqual(leakErrors(s, 'storyboard'), []);
});

test('the brief fixtures the harness storyboards from are valid briefs', async () => {
  const { validateBrief } = await import('./contracts.js');
  for (const f of ['softmax-15s-attention', 'explain-this-selection-62-71']) assert.deepEqual(validateBrief(read(`./fixtures/m2/${f}.brief.json`)), [], f);
});

// An if without else end to end, with fake models: Demo B's `if top_k is not None:` grounds as
// K1 with a no_op side, the brief keeps it structurally, and Director and storyboard enforce it.
test('if without else: K1 survives into the brief and binds the Director and the storyboard', async () => {
  const { resolveLearnerTurn } = await import('../../control-plane/src/learner-intent.js');
  const { groundTarget } = await import('../../control-plane/src/source-grounding.js');
  const { fixtureSource } = await import('./fixture-source.js');
  const { runDirector } = await import('./director.js');
  const { validateBrief } = await import('./contracts.js');
  const src = fixtureSource();
  const turn = resolveLearnerTurn({ message: '/motion 20s show what happens here', repository_context: { commit: src.commit, label: 'model.py:305-330', range: { path: 'model.py', start: 305, end: 330 } } });
  const g = groundTarget(turn, src);
  const output = {
    title: 'One pass of GPT.generate', objective: 'Follow one pass of the sampling loop.', audience_context: 'nanoGPT sampling code.',
    teaching_mode: 'code_walkthrough', narration_policy: 'none', visual_direction: 'The loop runs once, step by step.',
    claims: [
      { id: 'C1', text: 'generate runs `for _ in range(max_new_tokens)` and calls the model on idx_cond each pass.', source_ref_ids: ['S1'], condition_ids: [], required: true },
      { id: 'C2', text: 'Only when `top_k is not None`, `torch.topk` keeps the top_k largest logits and the rest become -Inf.', source_ref_ids: ['S2'], condition_ids: ['K1'], required: true },
      { id: 'C3', text: '`F.softmax(logits, dim=-1)` gives probabilities and `torch.multinomial` samples idx_next.', source_ref_ids: ['S3'], condition_ids: [], required: true },
    ],
    must_show: ['the loop over max_new_tokens', 'the top_k step, marked as optional', 'softmax then multinomial'],
    must_not_claim: ['top-k filtering always runs'],
  };
  const directorMessage = input => ({ ...toolMessage({}), content: [{ type: 'tool_use', id: 'tu_d', name: 'motion_brief', input }] });
  const brief = (await runDirector({ turn, grounding: g, call: fakeModel(directorMessage(output)).call, clock })).brief;
  assert.deepEqual(validateBrief(brief), []);
  assert.deepEqual(brief.implementation_conditions[0].branches.map(b => [b.source_ref_ids, b.no_op ?? false]), [[['S2'], false], [[], true]]);
  // The Director cannot drop the condition from the top-k claim.
  const unconditioned = structuredClone(output);
  unconditioned.claims[1].condition_ids = [];
  const r = await runDirector({ turn, grounding: g, call: fakeModel(directorMessage(unconditioned)).call, clock });
  assert.ok(r.errors.some(e => /C2: rests on branch-dependent code but does not name K1/.test(e)), r.errors?.join('\n'));
  // The storyboard: top-k code must name K1 and keep it visible.
  const sb = cond => ({ id: 'sb', brief_id: brief.id, version: 1, beats: [
    { id: 'B1', start_time: 0, end_time: 10, pedagogical_role: 'implementation', visible_objects: [{ id: 'loop_code', description: 'the loop line', source: { source_ref_id: 'S1', start_line: 312, end_line: 312 }, change: 'is highlighted' }], claim_ids: ['C1'], must_show_covered: [], transition: 'opens on the code', framing: 'the code centred', on_screen_text: '' },
    { id: 'B2', start_time: 10, end_time: 20, pedagogical_role: 'implementation', visible_objects: [{ id: 'mask_line', description: 'the line that sets the other logits to -Inf', source: { source_ref_id: 'S2', start_line: 322, end_line: 322 }, change: 'is highlighted', ...(cond.label ? { label: cond.label } : {}) }], claim_ids: ['C3'], ...(cond.k ? { condition_ids: ['K1'] } : {}), must_show_covered: [], transition: 'the highlight moves down', framing: 'the code centred', on_screen_text: '' },
  ] });
  const errs = cond => checkStoryboard(sb(cond), brief).errors;
  assert.ok(errs({}).some(e => /B2: shows code or claims that run only under K1 but does not name K1/.test(e)));
  assert.ok(errs({ k: true }).some(e => /B2: teaches under K1 but nothing on screen says so \(name top_k or the branch\)/.test(e)));
  assert.ok(!errs({ k: true, label: 'only if top_k is set' }).some(e => /K1/.test(e)));
});

test('brief contract: branch source_ref_ids belong to the condition, and no_op marks only an empty side', async () => {
  const { validateBrief } = await import('./contracts.js');
  const b = brief();
  b.implementation_conditions[0].branches[0].source_ref_ids = ['S3'];
  b.implementation_conditions[0].branches[1].source_ref_ids = ['S4'];
  assert.deepEqual(validateBrief(b), []);
  b.implementation_conditions[0].branches[1].no_op = true;
  assert.ok(validateBrief(b).some(e => /branches\[1\]\.no_op: true, only on a side that runs no code/.test(e)));
  delete b.implementation_conditions[0].branches[1].no_op;
  b.implementation_conditions[0].branches[0].source_ref_ids = ['S9'];
  assert.ok(validateBrief(b).some(e => /branches\[0\]\.source_ref_ids: refs of this condition/.test(e)));
});

// M4 found two M3 validator defects on the Demo B storyboard (2026-10-04).
test('sentences end at . ! ? before a space or the end: dotted code names are not sentence breaks', async () => {
  const { sentences } = await import('./storyboard-check.js');
  assert.equal(sentences('F.softmax gives probabilities; torch.multinomial draws one index.'), 1);
  assert.equal(sentences('torch.cat appends it; the loop repeats.'), 1);
  assert.equal(sentences('Softmax turns scores into weights. Larger scores get larger weights. The -inf entries become 0.'), 3);
  rejects(s => { beat(s, 'B3').narration_line = 'Softmax turns rows. Then weights.'; }, /narration_line: one sentence/);
});

test('a label carried unchanged from the previous beat is not re-checked against the next beat\'s claims; a new one is', () => {
  // The fallback badge names self.flash in every beat; B2 and B5 cite only C2, yet the badge is
  // continuity, not new teaching. A label that changes is checked again.
  const s = good();
  for (const b of s.beats) for (const o of b.visible_objects) if (o.id === 'fallback_label') o.label = 'self.flash is False: torch.exp path';
  const e = errorsOf(s);
  assert.deepEqual(e.filter(x => /fallback_label\.label: names "torch\.exp"/.test(x)).map(x => x.split('.')[0]), ['B1'], e.join('\n')); // only where it first appears
  rejects(s2 => { beat(s2, 'B3').visible_objects.find(o => o.id === 'fallback_label').label = 'Fallback: math.log(att)'; }, /B3\.fallback_label\.label: names "math\.log"/);
});

// M7A: the first storyboards of the automatic /motion runs, each of which spent the job's one repair
// round on a Director revision (motion/fixtures/m7a; run 1's was not kept). The checks are unchanged;
// the prompt now states each limit with the number the checker applies.
test('M7A regression: the recurring first-pass storyboard failures stay caught, and the prompt states each as a hard limit', () => {
  const run = n => [read(`./fixtures/m7a/${n}.brief.json`), read(`./fixtures/m7a/${n}.storyboard.round-0.json`).storyboard];
  const [brief2, board2] = run('run2');
  assert.deepEqual(checkStoryboard(board2, brief2).errors, ['storyboard: teaches one side of K1 but none of its other side (C4)']);
  const [brief3, board3] = run('run3');
  assert.deepEqual(checkStoryboard(board3, brief3).errors, [
    'B2.on_screen_text: "hold" is not in the brief\'s claims, must_show or evidence (a new claim?)',
    'B4: 16 new words to read in 2s (at most 14)',
    'storyboard: must_show "A visible check that the highlighted row sums to 1 after softmax" is not visibly covered (declared by B4, which do not show enough of it)',
  ]);
  assert.match(STORYBOARD_SYSTEM, /HARD LIMITS\. The harness checks each of these mechanically/);
  assert.match(HARD_LIMITS, /1\. Vocabulary: .*Never substitute a synonym .*"hold"/);
  assert.match(HARD_LIMITS, /2\. Reading rate: .*2 s -> 14,/, 'the number the checker reported for run 3 B4');
  assert.match(HARD_LIMITS, /3\. must_show: .*at least 40% of the item's own content words/);
  assert.match(HARD_LIMITS, /4\. Both sides of a condition: .*cites at least one claim from the other side/);
  assert.ok(storyboardRequest(brief2).system[0].text.includes(HARD_LIMITS));
  assert.deepEqual(checkStoryboard(read('./fixtures/m3/softmax-15s-attention.real.storyboard.json'), read('./fixtures/m2/softmax-15s-attention.brief.json')).errors, [], 'the accepted M3 storyboard still passes');
});
