import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildProgramArtifact } from '../../../control-plane/src/explain-program.js';
import { parseGuestResult } from './contract.js';
import { normalizeFrame } from './frame.js';
import { loadEngine, runProgram as runWithDefaultLimits } from './runtime.js';
import { LIMITS } from './limits.js';
import { clampTime, snapToMarker, timeLabel } from './program-card.js';

// Legacy-pipeline Standard acceptance supporting I0 (NOT I1): the program the existing /interactive backend generated from the approved toss-and-drop design,
// replayed offline with no model call. It checks the playback contract and the physics the card states; it does not show the new scene-generation workflow.
const record = JSON.parse(readFileSync(new URL('./testdata/legacy-interact-toss-standard.json', import.meta.url), 'utf8'));
const engine = await loadEngine();
const run = (artifact, time) => {
  const reply = runWithDefaultLimits(engine, { source: artifact.source, sdkVersion: artifact.sdkVersion, operation: 'evaluate', request: { requestId: 'toss', inputs: {}, time, seed: 1, state: null } }, { ...LIMITS, interruptMs: 5000 });
  assert.equal(reply.ok, true, reply.detail);
  const parsed = parseGuestResult(reply.value, artifact.manifest);
  assert.equal(parsed.ok, true, parsed.issue);
  assert.equal(normalizeFrame(parsed.value.frame, artifact.manifest).ok, true);
  return parsed.value.frame;
};
const U = 3, G = 9.8, APEX = U / G, END = 2 * APEX;
const texts = frame => frame.objects.filter(object => typeof object.text === 'string').map(object => object.text);
const count = (frame, text) => texts(frame).filter(item => item === text).length;

test('the record names the legacy pipeline, both runs, their jobs, outcomes and costs, and keeps the failed first run', () => {
  assert.match(record.label, /legacy-pipeline Standard acceptance supporting I0 \(not I1\)/);
  assert.equal(record.runs.length, 2);
  assert.match(record.runs[0].jobId, /^ej_[0-9a-f]{32}$/); assert.match(record.runs[0].outcome, /^failed/);
  assert.match(record.runs[1].jobId, /^ej_[0-9a-f]{32}$/); assert.equal(record.runs[1].stage, 'ready'); assert.equal(record.runs[1].stopReason, 'accepted');
  assert.ok(Math.abs(record.runs[1].costUsd - record.runs[1].calls.reduce((sum, call) => sum + call.costUsd, 0)) < 0.0015);
});

test('the stored card is sealed exactly as the backend stored it and declares the Standard timeline: signed time from the top, pacing 0.1, markers at -0.10, 0 and +0.10 s', async () => {
  const sealed = await buildProgramArtifact({ manifest: record.artifact.manifest, source: record.artifact.source });
  assert.equal(sealed.bundleHash, record.artifact.bundleHash); assert.equal(sealed.sdkVersion, 'sdk-2');
  const { manifest } = sealed;
  assert.deepEqual(manifest.inputs, []);
  assert.ok(Math.abs(manifest.duration - END) < 1e-6, 'elapsed time runs 0 to 2u/g (about 0.612245 s)');
  assert.ok(Math.abs(manifest.timeline.displayOffset + APEX) < 1e-6, 'displayOffset is -u/g, so the scrubber reads about -0.306 to +0.306 s');
  assert.equal(manifest.timeline.playbackRate, 0.1); assert.equal(manifest.timeline.label, 'Time from the top');
  assert.deepEqual(manifest.timeline.markers.map(marker => marker.id), ['before', 'top', 'after']);
  [-0.1, 0, 0.1].forEach((offset, index) => assert.ok(Math.abs(manifest.timeline.markers[index].time - (APEX + offset)) < 1e-6));
  assert.equal(timeLabel(manifest, 0), '−0.31s'); assert.equal(timeLabel(manifest, manifest.timeline.markers[0].time), '−0.10s');
  assert.equal(timeLabel(manifest, manifest.timeline.markers[1].time), '0.00s'); assert.equal(timeLabel(manifest, manifest.duration), '+0.31s');
  assert.ok(manifest.cardDescription.length > 40 && manifest.cardDescription.length <= 500, 'the teaching copy is the description above the scene');
});

test('exact seeking and saved moments: a scrub or a reopened four-decimal time near a marker is the marker itself; the physics time is not altered elsewhere', async () => {
  const { manifest } = await buildProgramArtifact({ manifest: record.artifact.manifest, source: record.artifact.source });
  for (const marker of manifest.timeline.markers) {
    assert.equal(snapToMarker(manifest, Number(marker.time.toFixed(3))), marker.time);
    assert.equal(clampTime(manifest, Number(marker.time.toFixed(4))), marker.time);
  }
  assert.equal(clampTime(manifest, 0.1), 0.1); assert.equal(clampTime(manifest, 9), manifest.duration);
});

test('at the three key instants the card reads +0.98, 0 and -0.98 m/s with the downward 9.8 m/s2 acceleration, and the Drop ball matches the Toss ball from the apex', async () => {
  const artifact = await buildProgramArtifact({ manifest: record.artifact.manifest, source: record.artifact.source });
  const [before, top, after] = artifact.manifest.timeline.markers.map(marker => run(artifact, marker.time));
  // The strip always shows the three moments; the live lanes show the current one for the Toss ball and, from the apex, the Drop ball.
  assert.ok(count(before, 'v = +0.98 m/s') >= 2, 'strip tile and the live toss ball at -0.10 s');
  assert.ok(count(top, 'v = 0 m/s') >= 3, 'strip tile, the live toss ball and the released drop ball at the apex');
  assert.ok(count(after, 'v = −0.98 m/s') >= 3, 'strip tile and both live balls at +0.10 s');
  for (const frame of [before, top, after]) assert.ok(count(frame, 'a = 9.8 m/s² ↓') >= 3, 'the acceleration stays 9.8 m/s2 downward everywhere');
  // Launch and the end of the card (return to the launch height) also evaluate without a program error.
  run(artifact, 0); run(artifact, artifact.manifest.duration);
});
