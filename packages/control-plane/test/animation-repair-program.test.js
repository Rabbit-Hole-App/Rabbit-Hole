// FX-AN-043: a repair that was shown a program and returns a complete artifact without one. Run 5 (aj_77ff45ba, candidate caf7ee9bc), repair 1:
// tool input keys [operation, artifact], no artifact.program, stop_reason tool_use, 6,053 of 12,000 output tokens (not cut off); the schema
// required the program and the request showed it (a non-strict tool schema is not enforced). validateStage reported missing_program, which spent
// the build's second repair on a program written again from the scene alone. No model call: the drafts are aj_734f1e4e's retained ones.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PROGRAM_CORRECTION, repairContent, repairStage } from '../src/animation-repair.js';
import { validateStage } from '../src/animation-author.js';
import { TASKS } from './animation-fixture.js';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/animation-aj_734f1e4.json', import.meta.url), 'utf8'));
const env = { ANTHROPIC_API_KEY: 'offline' };
const finding = { category: 'spec', severity: 'major', target: { capture: 'v0-s0', object: 'ball' }, message: 'cap the drawn height at the rim' };
const jobOf = (draft, plan = fixture.plan) => ({ prompt: fixture.prompt, plan, planHash: fixture.planHash, resultId: fixture.resultId, approval: { at: fixture.approvalAt }, draft, evidence: [], features: ['curve_radius', 'action_motion'], captures: [],
  calls: [{ role: 'repair', status: 'settled', served: fixture.servedModel }], findings: [{ repairs: 0, stage: 'reviewing', accepted: false, findings: [finding] }] });
const whole = fixture.repair1Draft, { program: _dropped, ...noProgram } = whole;
const reply = artifact => ({ input: { operation: 'artifact', artifact } });
const stub = replies => { const calls = []; return { calls, ctx: { env, tasks: TASKS, call: async (_role, spec) => { calls.push(spec.content); const r = replies[calls.length - 1]; if (r instanceof Error) throw r; return r; } } }; };

test('a reply with no program, when the request showed one, is asked again once and the second reply is used (fails on the old code: one call, no program)', async () => {
  const { calls, ctx } = stub([reply(noProgram), reply(whole)]);
  const out = await repairStage(jobOf(fixture.authorDraft), ctx);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].at(-1).text, PROGRAM_CORRECTION, 'the correction is the last block');
  assert.deepEqual(calls[1].slice(0, -1), calls[0], 'the same request otherwise');
  assert.equal(out.draft.program.source, whole.program.source);
  assert.equal(out.programRetried, true);
});

test('two replies without a program are not asked a third time: validateStage then reports missing_program as before', async () => {
  const { calls, ctx } = stub([reply(noProgram), reply(noProgram)]);
  const out = await repairStage(jobOf(fixture.authorDraft), ctx);
  assert.equal(calls.length, 2);
  assert.equal(out.draft.program, undefined);
  const checked = await validateStage(jobOf(out.draft), { env, tasks: TASKS });
  assert.deepEqual(checked.problems, ['program: this scene needs a behavior program (missing_program)']);
});

test('no second ask when the reply has its program inside the artifact, beside it (FX-AN-005) or as a bare source string', async () => {
  for (const input of [{ operation: 'artifact', artifact: whole }, { operation: 'artifact', artifact: noProgram, program: whole.program }, { operation: 'artifact', artifact: noProgram, program: whole.program.source }]) {
    const { calls, ctx } = stub([{ input }]);
    const out = await repairStage(jobOf(fixture.authorDraft), ctx);
    assert.equal(calls.length, 1);
    assert.equal(out.draft.program.source, whole.program.source);
    assert.equal(out.programRetried, undefined);
  }
});

test('a failed second ask keeps the first reply; a stopped job still aborts', async () => {
  const kept = await repairStage(jobOf(fixture.authorDraft), stub([reply(noProgram), Object.assign(new Error('This animation reached its repair limit.'), { stopReason: 'budget' })]).ctx);
  assert.equal(kept.progress, true);
  assert.equal(kept.draft.program, undefined);
  await assert.rejects(repairStage(jobOf(fixture.authorDraft), stub([reply(noProgram), Object.assign(new Error('changed'), { abandoned: true })]).ctx), /changed/);
});

test('a scene that needs no program is never asked for one', async () => {
  const inspect = { ...fixture.plan, experience: 'inspect', parameters: [] }, { calls, ctx } = stub([reply({ ...noProgram, title: 'Fixed' })]);
  await repairStage(jobOf(noProgram, inspect), ctx);
  assert.equal(calls.length, 1);
});

test('the request announces a program block only when there is one (repair 2 of run 5 was told of a block that did not exist)', () => {
  const failure = { problems: ['program: this scene needs a behavior program (missing_program)'] };
  const lead = content => content[1].text.split('\n')[0];
  assert.match(lead(repairContent(jobOf(noProgram), failure, noProgram)), /it has NO program: write the whole program as artifact\.program\.source/);
  assert.doesNotMatch(lead(repairContent(jobOf(noProgram), failure, noProgram)), /next block/);
  assert.match(lead(repairContent(jobOf(whole), failure, whole)), /its program is shown in the next block/);
});

test('the raw reply of every program-less answer is kept with the candidate (blocks, text, tool input), none when the program came', async () => {
  const raw = n => ({ blocks: [{ type: 'text', chars: 4, text: `why${n}` }, { type: 'tool_use', name: 'animation_repair', chars: 10 }], partialTool: `{"operation":"artifact","n":${n}}`, stopReason: 'tool_use', usage: { output_tokens: 6053 } });
  const twice = await repairStage(jobOf(fixture.authorDraft), stub([{ ...reply(noProgram), reply: raw(1) }, { ...reply(noProgram), reply: raw(2) }]).ctx);
  assert.deepEqual(twice.rawReplies, [raw(1), raw(2)]);
  const healed = await repairStage(jobOf(fixture.authorDraft), stub([{ ...reply(noProgram), reply: raw(1) }, { ...reply(whole), reply: raw(2) }]).ctx);
  assert.deepEqual(healed.rawReplies, [raw(1)], 'only the reply that lacked the program');
  const fine = await repairStage(jobOf(fixture.authorDraft), stub([{ ...reply(whole), reply: raw(1) }]).ctx);
  assert.equal(fine.rawReplies, undefined);
});
