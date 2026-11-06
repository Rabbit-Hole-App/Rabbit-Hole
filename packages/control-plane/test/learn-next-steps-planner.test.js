// packages/control-plane/test/learn-next-steps-planner.test.js
// The model-call helpers the hook planner shares with the journey planners (learn-next-steps-planner.js); planNextSteps itself is
// covered by learn-next-steps-route.test.js. No real model call.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PlannerInvalid, journeyCallModel, journeyLogged } from '../src/learn-next-steps-planner.js';
import { fixtureModel } from '../src/learn-next-steps-fixtures.js';

const env = {};

test('PlannerInvalid names the role and carries its errors; only three reach the message', () => {
  const error = new PlannerInvalid('journey_path', ['a', 'b', 'c', 'd']);
  assert.deepEqual([error.name, error.role, error.errors.length], ['PlannerInvalid', 'journey_path', 4]);
  assert.equal(error.message, 'The journey_path planner returned an invalid plan: a; b; c');
});

test('journeyCallModel: the fixture model only when SMALL_ENV is test and JOURNEY_MODEL_STUB is fixtures', () => {
  assert.notEqual(journeyCallModel({}), fixtureModel);
  assert.equal(journeyCallModel({ SMALL_ENV: 'test', JOURNEY_MODEL_STUB: 'fixtures' }), fixtureModel);
  assert.notEqual(journeyCallModel({ JOURNEY_MODEL_STUB: 'fixtures' }), fixtureModel);
  assert.notEqual(journeyCallModel({ SMALL_ENV: 'dev', JOURNEY_MODEL_STUB: 'fixtures' }), fixtureModel);
});

test('journeyLogged writes one sanitized line per call: task, requested and served model, never the message', async () => {
  const lines = [], log = console.log;
  const stub = async () => new Response(JSON.stringify({ model: 'claude-sonnet-5-5-20261001', stop_reason: 'tool_use', content: [] }), { status: 200 });
  console.log = line => lines.push(line);
  try {
    await journeyLogged(stub)(env, { system: 'S', tools: [{ name: 'journey_section' }], messages: [{ role: 'user', content: 'input = {"text":"my private answer"}' }] }, 'claude-sonnet-5-5', null);
  } finally { console.log = log; }
  assert.equal(lines.length, 1);
  const line = JSON.parse(lines[0]);
  assert.deepEqual([line.event, line.task, line.requested, line.source, line.served], ['learn_model', 'journey_section', 'claude-sonnet-5-5', 'task', 'claude-sonnet-5-5-20261001']);
  assert.equal(lines[0].includes('private'), false);
});
