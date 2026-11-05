// W1.2: the /whiteboard planner's normalise and fit, the request it sends, and the 1.3 words. Offline, no model.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fitIssues, normalisePlan, planLines } from '../src/whiteboard-plan.js';
import { PLAN_TOOL, WHITEBOARD_PLAN_SYSTEM } from '../src/agents/whiteboard-plan.js';
import { whiteboardRequest } from '../src/whiteboard-policy.js';

const plan60 = JSON.parse(readFileSync(new URL('./fixtures/whiteboard/plan-60.json', import.meta.url), 'utf8'));
const reply = (seconds, extra = {}) => ({ kind: 'supported', title: 'Gradient descent', goal: plan60.goal, audience: plan60.audience, substitutions: [], limitations: [],
  scenes: seconds.map((s, i) => ({ seconds: s, learningPoint: `Point ${i + 1}.`, visualIntent: 'A curve.', narrationSummary: 'Says it.', facts: [{ text: 'slope', value: 6, provenance: 'computed' }] })), ...extra });
const at = durationSeconds => ({ planId: 'wj_test0001', revision: 1, durationSeconds });

test('normalise: the server owns frames, ids, duration, voice and quality; the model only its seconds and words', () => {
  const { plan, title } = normalisePlan(reply([15, 15, 15, 15], { durationSeconds: 120, voice: 'someone' }), at(60));
  assert.deepEqual(fitIssues(plan), []);
  assert.equal(title, 'Gradient descent');
  assert.deepEqual(plan.scenes.map(s => [s.id, s.startFrame, s.endFrame, s.illustration]), [['s1', 0, 450, false], ['s2', 450, 900, false], ['s3', 900, 1350, false], ['s4', 1350, 1800, false]]);
  assert.deepEqual([plan.durationSeconds, plan.voice, plan.quality, plan.language, plan.sourceRefs], [60, 'whiteboard-default-v1', 'whiteboard-1080p-v1', 'en', []]);
  assert.equal(planLines(plan), `${plan60.goal}\nScene 1 (15 s): Point 1.\nScene 2 (15 s): Point 2.\nScene 3 (15 s): Point 3.\nScene 4 (15 s): Point 4.\nNarrated by one voice; 4 scenes; 60 seconds.`);
});

test('fit refuses a plan over policy: scene count, windows that do not sum or are short, a fraction, and more than W1 serves', () => {
  const issues = (seconds, d = 60) => fitIssues(normalisePlan(reply(seconds), at(d)).plan);
  assert.match(issues([12, 12, 12, 12, 12]).join(' '), /at most 4 scenes/);
  assert.match(issues([15, 15, 15, 14]).join(' '), /must end at frame 1800/);
  assert.match(issues([4, 56]).join(' '), /at least 150/);
  assert.match(issues([15.5, 44.5]).join(' '), /finite number/);
  assert.deepEqual(issues([35, 35], 70).filter(i => !/serves/.test(i)), [], 'the contract accepts 70 s');
  assert.match(issues([35, 35], 70).join(' '), /serves at most 60 seconds/);
  const fact = normalisePlan(reply([60], {}), at(60)).plan;
  fact.scenes[0].facts = [{ text: 'x', provenance: 'guess' }];
  assert.match(fitIssues(fact).join(' '), /provenance/);
});

test('unsupported carries the two phrases; anything else that is not a plan is an issue', () => {
  assert.deepEqual(normalisePlan({ kind: 'unsupported', asked: ' be  played ', alternative: 'explain the rules with one example' }, at(60)), { unsupported: { asked: 'be played', alternative: 'explain the rules with one example' } });
  assert.ok(normalisePlan({ kind: 'unsupported' }, at(60)).issues);
  assert.ok(normalisePlan({ kind: 'clarify', question: 'Which?' }, at(60)).issues, 'clarify is W3');
});

test('the planner request: one cached system block, one tool on auto, medium effort, no model or thinking, within its bound', () => {
  const { body, boundMicros } = whiteboardRequest({}, 'plan', { system: WHITEBOARD_PLAN_SYSTEM, tool: PLAN_TOOL, content: '{}' });
  assert.deepEqual([body.max_tokens, body.output_config, body.tool_choice, body.tools.length, body.system[0].cache_control, 'model' in body, 'thinking' in body], [6000, { effort: 'medium' }, { type: 'auto' }, 1, { type: 'ephemeral' }, false, false]);
  assert.ok(boundMicros > 0 && boundMicros <= 240000);
  assert.deepEqual(PLAN_TOOL.input_schema.properties.kind.enum, ['supported', 'unsupported']);
  assert.throws(() => whiteboardRequest({}, 'plan', { system: 's', tool: PLAN_TOOL, content: 'x'.repeat(200000) }), { code: 'input_too_large' });
});
