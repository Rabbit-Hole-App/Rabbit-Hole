// AN-20 Gate 1 (C3', run gate1-sgd). Offline: no model, no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ARTIFACT_DRAFT, AUTHOR_TOOL, REPAIR_TOOL } from '../src/agents/animation-author.js';
import { BEHAVIORS, CONTROL_PROFILES, EXPERIENCES } from '../../web/src/animation3d/contract.js';

const slips = JSON.parse(readFileSync(new URL('./fixtures/animation-gate1-slips.json', import.meta.url), 'utf8')); // the two real slips of Gate 1, committed: no machine-local path

test('FX-AN-057: the draft schema constrains experience, behavior and controlProfile to the contract\'s own lists (Gate 1 r13 wrote prose in behavior)', () => {
  for (const tool of [AUTHOR_TOOL, REPAIR_TOOL]) {
    const props = (tool === AUTHOR_TOOL ? tool.input_schema.properties.artifact : tool.input_schema.properties.artifact).properties;
    assert.deepEqual(props.experience, { type: 'string', enum: EXPERIENCES });
    assert.deepEqual(props.behavior, { type: 'string', enum: BEHAVIORS });
    assert.deepEqual(props.controlProfile, { type: 'string', enum: CONTROL_PROFILES });
  }
  assert.equal(ARTIFACT_DRAFT.properties.behavior.enum, BEHAVIORS, 'the contract\'s array, not a copy');
  assert.equal(BEHAVIORS.includes(slips.r13.behavior), false, 'the real r13 behavior (a sentence) is what the enum is for');
  assert.equal(slips.r13.behavior.startsWith('Stepped rules'), true);
});
