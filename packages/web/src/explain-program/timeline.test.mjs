import test from 'node:test';
import assert from 'node:assert/strict';
import { ProgramManifest } from './contract.js';
import { playbackRate, savedTime, scrubStep, snapToMarker, timeLabel } from './program-card.js';

// The optional manifest.cardDescription and manifest.timeline (interact.md INT-01 mode.timeline). Standard toss-and-drop: launch 3.0 m/s, elapsed 0 to 2u/g,
// shown time = elapsed - u/g, so the scrubber reads about -0.306 to +0.306 s; markers at 0.10 s either side of the apex.
const U = 3, G = 9.8, APEX = U / G, END = 2 * U / G;
const base = { title: 'Toss and drop', summary: 'A ball tossed up and a ball dropped.', assumptions: ['No air resistance.'], description: 'Two balls near the top of a toss.', inputs: [], readouts: [], capabilities: [] };
const standard = { ...base, duration: END, cardDescription: 'At the top the tossed ball has zero velocity, yet gravity still changes it by 9.8 m/s every second.', timeline: { label: 'Time from the apex', displayOffset: -APEX, playbackRate: 0.1, markers: [{ id: 'before', label: '0.10 s before', time: APEX - 0.1 }, { id: 'apex', label: 'Apex', time: APEX }, { id: 'after', label: '0.10 s after', time: APEX + 0.1 }] } };

test('a manifest without the new fields is unchanged and plays as before', () => {
  const manifest = ProgramManifest.parse({ ...base, duration: 4 });
  assert.equal(manifest.timeline, undefined); assert.equal(manifest.cardDescription, undefined);
  assert.equal(playbackRate(manifest), 1); assert.equal(scrubStep(manifest), 0.05); assert.equal(savedTime(manifest, 1.23456), 1.23); assert.equal(timeLabel(manifest, 1.26), '1.3s');
  assert.equal(snapToMarker(manifest, 1.2), 1.2);
});

test('the Standard toss-and-drop timeline parses and its shown time runs from about -0.306 to +0.306 s', () => {
  const manifest = ProgramManifest.parse(standard);
  assert.equal(manifest.timeline.playbackRate, 0.1); assert.equal(playbackRate(manifest), 0.1);
  assert.equal(timeLabel(manifest, 0), '−0.31s'); assert.equal(timeLabel(manifest, APEX), '0.00s'); assert.equal(timeLabel(manifest, END), '+0.31s');
  assert.equal(timeLabel(manifest, APEX - 0.1), '−0.10s'); assert.equal(timeLabel(manifest, APEX + 0.1), '+0.10s');
  assert.ok(Math.abs(END - 0.612245) < 1e-6);
});

test('a scrub within half a step of a marker lands exactly on it; elsewhere it is left alone; saved time keeps four decimals', () => {
  const manifest = ProgramManifest.parse(standard);
  assert.equal(scrubStep(manifest), 0.001);
  for (const marker of manifest.timeline.markers) { assert.equal(snapToMarker(manifest, Number(marker.time.toFixed(3))), marker.time); assert.equal(snapToMarker(manifest, Number((marker.time + 0.001).toFixed(3))), Number((marker.time + 0.001).toFixed(3))); }
  assert.equal(savedTime(manifest, APEX), Number(APEX.toFixed(4)));
  assert.ok(Math.abs(savedTime(manifest, APEX - 0.1) - (APEX - 0.1)) < 1e-4, 'a reopened card still sits on the -0.10 s moment to four decimals');
});

test('the timeline is refused when it cannot work: no duration, a marker after the end, duplicate markers, unknown fields, a non-positive rate', () => {
  const bad = patch => ProgramManifest.safeParse({ ...standard, ...patch });
  assert.equal(ProgramManifest.safeParse({ ...base, timeline: { playbackRate: 1 } }).success, false);
  assert.equal(bad({ duration: 0.2 }).success, false);
  assert.equal(bad({ timeline: { ...standard.timeline, markers: [{ id: 'a', label: 'A', time: 0.1 }, { id: 'a', label: 'B', time: 0.2 }] } }).success, false);
  assert.equal(bad({ timeline: { ...standard.timeline, extra: 1 } }).success, false);
  assert.equal(bad({ timeline: { ...standard.timeline, playbackRate: 0 } }).success, false);
  assert.equal(bad({ cardDescription: '' }).success, false);
});
