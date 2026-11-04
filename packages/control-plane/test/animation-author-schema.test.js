// AN-20 Gate 1 (C3', run gate1-sgd). Offline: no model, no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ARTIFACT_DRAFT, AUTHOR_TOOL, REPAIR_TOOL } from '../src/agents/animation-author.js';
import { BEHAVIORS, CONTROL_PROFILES, EXPERIENCES } from '../../web/src/animation3d/contract.js';

const gate1 = new URL('file:///C:/s/spec/animation/author-samples/2026-11-04T02-45-12-172Z-gate1-sgd/');
const saved = run => { try { return JSON.parse(readFileSync(new URL(`sgd-loss-surface-${run}/draft.json`, gate1), 'utf8')); } catch { return null; } }; // the saved draft, when the run folder is on this machine

test('FX-AN-057: the draft schema constrains experience, behavior and controlProfile to the contract\'s own lists (Gate 1 r13 wrote prose in behavior)', () => {
  for (const tool of [AUTHOR_TOOL, REPAIR_TOOL]) {
    const props = (tool === AUTHOR_TOOL ? tool.input_schema.properties.artifact : tool.input_schema.properties.artifact).properties;
    assert.deepEqual(props.experience, { type: 'string', enum: EXPERIENCES });
    assert.deepEqual(props.behavior, { type: 'string', enum: BEHAVIORS });
    assert.deepEqual(props.controlProfile, { type: 'string', enum: CONTROL_PROFILES });
  }
  assert.equal(ARTIFACT_DRAFT.properties.behavior.enum, BEHAVIORS, 'the contract\'s array, not a copy');
  const r13 = saved('r13');
  if (r13) assert.equal(BEHAVIORS.includes(r13.behavior), false, 'the saved r13 draft is the shape the enum is for');
});
