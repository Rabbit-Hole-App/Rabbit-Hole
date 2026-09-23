// Shared test helper for the nanogpt-deep-dive cards: every card is checked
// the same way, at every input state it teaches. Test-only (never imported by
// the app). Uses the existing gates - evaluateScene, the consistency checker,
// the layout lint, the activity validator - plus one check the layout lint
// does not make: single-line SVG text running past the scene's right edge
// (text never wraps; see scripts/probe-scene-capabilities.mjs "text-wrap").
import assert from 'node:assert/strict';
import { evaluateScene } from '../scene-evaluate.js';
import { checkSceneConsistency } from '../scene-consistency.js';
import { checkLayoutLint } from '../scene-layout-lint.js';
import { textStyle } from '../scene-style.js';

const CHAR_WIDTH_RATIO = 0.6; // scene-layout.js's estimate for the same fonts

export const evaluated = (scene, inputs = {}, time = scene.duration) => evaluateScene(structuredClone(scene), time, inputs);

// Estimated right edge of every text-bearing object vs the scene width.
export function textOverflow(state, width, margin = 8) {
  const out = [];
  for (const object of state.objects) {
    if (!object.visible || !object.label) continue;
    if (!['text', 'code'].includes(object.type)) continue;
    const fontSize = textStyle(object.type === 'code' ? 'code' : object.typography || 'body').fontSize;
    const right = object.x + object.label.length * fontSize * CHAR_WIDTH_RATIO;
    if (right > width - margin) out.push(`${object.id}: "${object.label.slice(0, 40)}..." ends near x=${Math.round(right)} > ${width - margin}`);
  }
  return out;
}

// Run every gate at every input snapshot; returns the evaluations so a test
// can make its own numeric assertions on the same states.
export function assertCardGates(scene, snapshots = [{}]) {
  return snapshots.map(inputs => {
    const result = evaluated(scene, inputs);
    const where = JSON.stringify(inputs);
    assert.ok(result.scene.objects.length <= 60, `${where}: ${result.scene.objects.length} objects (scene limit 60)`);
    assert.deepEqual(checkSceneConsistency(result.scene).issues, [], `consistency at ${where}`);
    assert.deepEqual(checkLayoutLint(result.scene).issues, [], `layout lint at ${where}`);
    assert.deepEqual(textOverflow(result.state, scene.width), [], `text overflow at ${where}`);
    return result;
  });
}

// Every card exports an evidence record with these fields filled.
export const EVIDENCE_FIELDS = ['card', 'title', 'learningQuestion', 'concept', 'sourceRevision', 'provenance', 'control',
  'consequence', 'interactionPurpose', 'task', 'capability'];
export function assertEvidence(evidence) {
  for (const field of EVIDENCE_FIELDS) {
    assert.ok(evidence?.[field] !== undefined && String(evidence[field]).trim(), `evidence.${field} is required`);
  }
}
