// Shared test helper for the nanogpt-deep-dive cards: every card is checked
// the same way, at every input state it teaches. Test-only (never imported by
// the app). Uses the existing gates - evaluateScene, the consistency checker,
// the layout lint, the activity validator - plus one check the layout lint
// does not make: single-line SVG text running past the scene's right edge
// (text never wraps; see scripts/probe-scene-capabilities.mjs "text-wrap").
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { evaluateScene } from '../scene-evaluate.js';
import { checkSceneConsistency } from '../scene-consistency.js';
import { checkLayoutLint } from '../scene-layout-lint.js';
import { cellLegibilityIssues } from '../scene-layout.js';
import { textStyle } from '../scene-style.js';
import { sourceProblems } from '../card-sources.js';
import fx from './fixtures/nanogpt-fixtures.generated.js';

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

// The teaching surface carries the concept and a short status label, never
// the audit trail: no code listings, file names, line references, revisions or
// generator notes - those are the card's sources, shown under it collapsed.
const CITATION = [/\.py\b/, /generate_fixtures/, /@[0-9a-f]{7}/, /(?:^|[\s(])(?:lines? )?:\d+/, /\blines? \d+/i];
export function citationsOnSurface(state) {
  return state.objects.filter(object => object.visible && ['text', 'code'].includes(object.type) && object.label)
    .filter(object => object.type === 'code' || CITATION.some(pattern => pattern.test(object.label)))
    .map(object => `${object.id} (${object.type}): "${object.label.slice(0, 60)}"`);
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
    assert.deepEqual(citationsOnSurface(result.state), [], `citations on the teaching surface at ${where}`);
    assert.deepEqual(cellLegibilityIssues(result.state), [], `cell numbers below the 12px floor at ${where}`);
    return result;
  });
}

// Every card declares its sources: well-formed, code pinned to the connected
// revision, and every status the sources name also labelled on the card (so a
// learner sees the kind of evidence without opening the list).
export function assertSources(sources, scene) {
  assert.ok(Array.isArray(sources) && sources.length > 0, 'card exports sources');
  sources.forEach((source, i) => assert.deepEqual(sourceProblems(source), [], `sources[${i}]`));
  for (const source of sources.filter(entry => entry.kind === 'code')) {
    assert.equal(source.repo, fx.provenance.nanogpt.repo, `${source.path}: repo`);
    assert.equal(source.revision, fx.provenance.nanogpt.commit, `${source.path}: revision`);
  }
  const { state } = evaluated(scene, Object.fromEntries((scene.inputs || []).map(d => [d.name, d.default])));
  const shown = state.objects.filter(object => object.visible && object.label).map(object => object.label.toLowerCase()).join('\n');
  for (const status of new Set(sources.filter(entry => entry.kind === 'calculation').map(entry => entry.status))) {
    assert.ok(shown.includes(status.toLowerCase()), `status "${status}" is named in sources but not labelled on the card`);
  }
}

// A cited NanoGPT file as lines, read from the sha256-pinned cache that
// generate_fixtures.py fills (every file in fx.provenance.nanogpt.files). Null
// where the cache is absent, so a line check skips rather than fails there.
export function pinnedFile(path) {
  const sha = fx.provenance.nanogpt.files[path];
  assert.ok(sha, `${path} is not pinned in generate_fixtures.py NANOGPT_FILES`);
  const file = join(tmpdir(), 'nanogpt-fixture-cache', sha);
  if (!existsSync(file)) return null;
  const bytes = readFileSync(file);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), sha, `${path}: cached copy is not the pinned file`);
  return bytes.toString('utf8').replace(/\r\n/g, '\n').split('\n');
}

// Every card exports an evidence record with these fields filled.
export const EVIDENCE_FIELDS = ['card', 'title', 'learningQuestion', 'concept', 'sourceRevision', 'provenance', 'control',
  'consequence', 'interactionPurpose', 'task', 'capability'];
export function assertEvidence(evidence) {
  for (const field of EVIDENCE_FIELDS) {
    assert.ok(evidence?.[field] !== undefined && String(evidence[field]).trim(), `evidence.${field} is required`);
  }
}
