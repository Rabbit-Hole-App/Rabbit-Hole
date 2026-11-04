// AN-20 Gate 1 (C3', run gate1-sgd). Offline: no model, no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ARTIFACT_DRAFT, AUTHOR_TOOL } from '../src/agents/animation-author.js';
import { animationToolInput } from '../src/animation-policy.js';
import { draftOf } from '../src/animation-repair.js';
import { normalizeToolInput } from '../src/tool-input.js';

const golden = JSON.parse(readFileSync(new URL('../../web/src/animation3d/testdata/sgd-golden.json', import.meta.url), 'utf8'));
const gate1 = new URL('file:///C:/s/spec/animation/author-samples/2026-11-04T02-45-12-172Z-gate1-sgd/');
const saved = run => { try { return JSON.parse(readFileSync(new URL(`sgd-loss-surface-${run}/draft.json`, gate1), 'utf8')); } catch { return null; } }; // the saved draft, when the run folder is on this machine

test('FX-AN-058: a null on an optional field is dropped before validation, only where asked and only where the schema does not allow null (Gate 1 r16: timeline null)', () => {
  const schema = ARTIFACT_DRAFT;
  const r16 = saved('r16') ?? { ...draft, timeline: null };
  assert.equal(r16.timeline, null, 'the saved r16 draft carries timeline null');
  const out = normalizeToolInput(schema, r16, { dropNull: true });
  assert.equal('timeline' in out, false);
  assert.equal(out.scene, r16.scene, 'unchanged values keep their reference');
  // Off by default: every other caller (/explain, the Tutor, the journey planners) sees what it always saw.
  assert.equal(normalizeToolInput(schema, r16).timeline, null);
  // A property whose schema allows null keeps it (a node's parent is a node id or null); a required property is never dropped.
  const node = { id: 'a', parent: null };
  assert.deepEqual(normalizeToolInput(ARTIFACT_DRAFT.properties.scene.properties.nodes.items, node, { dropNull: true }), node);
  const required = normalizeToolInput({ type: 'object', required: ['x'], properties: { x: { type: 'string' }, y: { type: 'string' } } }, { x: null, y: null }, { dropNull: true });
  assert.deepEqual(required, { x: null }, 'x is required: left for the validator to refuse; y is optional: dropped');
  // Nested optional objects and arrays are walked.
  const nested = normalizeToolInput({ type: 'object', properties: { list: { type: 'array', items: { type: 'object', properties: { a: { type: 'number' } } } } } }, { list: [{ a: null }, { a: 1 }] }, { dropNull: true });
  assert.deepEqual(nested, { list: [{}, { a: 1 }] });
});

test('FX-AN-058: the author and repair replies are read with optional nulls dropped, the review and others as they came', () => {
  const reply = input => ({ content: [{ type: 'tool_use', name: AUTHOR_TOOL.name, input }] });
  const withNull = { kind: 'artifact', artifact: { ...draftOf(golden.artifact), timeline: null } };
  assert.equal('timeline' in animationToolInput('author', reply(withNull), AUTHOR_TOOL).artifact, false);
  assert.equal(animationToolInput('review', reply(withNull), AUTHOR_TOOL).artifact.timeline, null, 'only author and repair opt in');
  const d = draftOf(golden.artifact), rooted = { ...d, scene: { ...d.scene, nodes: [{ ...d.scene.nodes[0], parent: null }, ...d.scene.nodes.slice(1)] } };
  assert.equal(animationToolInput('author', reply({ kind: 'artifact', artifact: rooted }), AUTHOR_TOOL).artifact.scene.nodes[0].parent, null, 'a node parent null is a value');
});
