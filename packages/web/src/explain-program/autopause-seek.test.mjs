import test from 'node:test';
import assert from 'node:assert/strict';
import { ProgramManifest } from './contract.js';
import { advanceClock, autopauseMarker, inputChange, resetsOnInput, seekTime } from './program-card.js';
import { CardCompositionSchema, nativeDeclaration } from '../interact-composition.js';
import { cardLayout, layoutProblems } from '../interact-card-layout.js';
import { normalizeComposition } from '../interact-composition-adapter.js';
import { compositionFromPlan } from '../interact-composition-fixtures.js';
import { interactFixtures } from '../interact-plan-fixtures.js';

// Sprint 2 card logic (pure): a number control's own onChange, autopause at a marker with pause, and the seek button (At top) in the controls row.
const { plans } = await interactFixtures();
const G = 9.8;
const manifest = ProgramManifest.parse({ title: 'T', summary: 'S', assumptions: [], description: 'D', duration: 2,
  inputs: [{ type: 'number', id: 'launchSpeed', label: 'Launch speed', unit: 'm/s', default: 3, min: 3, max: 5, step: 0.1 }], readouts: [], capabilities: ['time_playback', 'number_inputs'] });

// The Standard Experiment plan's composition, with the sprint 2 fields: the top marker pauses, plus an At top seek control and instructions.
const build = () => {
  const plan = structuredClone(plans.standardControls), top = plan.mode.timeline.markers.find(marker => marker.id === 'top');
  top.pause = true;
  plan.controls.push({ id: 'atTop', label: 'At top', type: 'seek', binding: { kind: 'marker', id: top.id }, effect: 'x', purpose: 'x', selectionReason: 'x', nativeControlId: 'program.seek', affects: [{ scope: 'main', kind: 'entity', id: plan.scene.entities[0].id }] });
  const composition = normalizeComposition({ ...compositionFromPlan(plan), instructions: 'Press Play, then At top.' }).value;
  return { plan, composition, top };
};
const { plan, composition, top } = build();
const topAt = u => u / G;

test('the composition record with a seek control, marker pause, onChange and instructions still parses', () => {
  const raw = { ...compositionFromPlan(plan), instructions: 'Press Play, then At top.' };
  raw.main.controls = raw.main.controls.map(({ purpose: _p, selectionReason: _s, effect: _e, ...control }) => ({ ...control, native: { in: 'timeline', declaration: null } })); // what compileCardComposition keeps
  raw.main.controls.find(c => c.type === 'number').onChange = 'recompute_still';
  const parsed = CardCompositionSchema.safeParse({ ...raw, envelopeHash: 'd'.repeat(64) });
  assert.equal(parsed.success, true, parsed.error?.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; '));
  assert.equal(parsed.data.main.timeline.markers.find(marker => marker.id === 'top').pause, true);
  assert.equal(parsed.data.instructions, 'Press Play, then At top.');
});

test('a seek control maps to the timeline on the program renderer and is refused on the spec renderer', () => {
  const control = plan.controls.find(c => c.type === 'seek');
  assert.deepEqual(nativeDeclaration(control, 'program'), { ok: true, native: { in: 'timeline', declaration: { part: 'seek', markerId: top.id } } });
  assert.equal(nativeDeclaration(control, 'spec').ok, false);
});

test('a number control onChange overrides the scene policy for that input only', () => {
  const mixed = structuredClone(composition);
  assert.equal(resetsOnInput(mixed, 'launchSpeed'), true, 'the scene policy (reset_pause) applies without an override');
  mixed.main.controls.find(c => c.type === 'number').onChange = 'recompute_still';
  assert.equal(resetsOnInput(mixed, 'launchSpeed'), false);
  assert.equal(resetsOnInput(mixed), true, 'without an input name it is the scene policy, as before');
  const block = { id: 'b', inputs: { launchSpeed: 5 } };
  assert.equal(inputChange(block, manifest, 'launchSpeed', 3, mixed, 0.4).time, 0.4, 'recompute_still keeps the moment');
  assert.equal(inputChange(block, manifest, 'launchSpeed', 3, composition, 0.4).time, 0, 'reset_pause returns to zero');
  assert.equal(inputChange(block, manifest, 'launchSpeed', 3, mixed, 0.4).playing, false, 'either way the card pauses');
});

test('autopause: playback stops on a marker marked pause, exactly once, and Play from it carries on', () => {
  const inputs = { launchSpeed: 3 }, t = topAt(3);
  assert.equal(autopauseMarker(composition, inputs, 0, t - 0.01), null, 'before the marker nothing stops');
  assert.equal(autopauseMarker(composition, inputs, t - 0.01, t + 0.2).time, t, 'passing it stops on it');
  assert.equal(autopauseMarker(composition, inputs, t - 0.01, t).time, t, 'reaching it exactly stops');
  assert.equal(autopauseMarker(composition, inputs, t, t + 0.2), null, 'starting from the marker does not stop on it again');
  assert.equal(autopauseMarker(composition, { launchSpeed: 5 }, 0.2, 0.6).time, topAt(5), 'the marker follows the launch speed');
  const two = structuredClone(composition);
  two.main.timeline.markers.push({ id: 'early', label: 'Early', time: { op: 'literal', value: 0.05 }, pause: true }, { id: 'quiet', label: 'Quiet', time: { op: 'literal', value: 0.06 } });
  assert.equal(autopauseMarker(two, inputs, 0, 1).id, 'early', 'the earliest pause marker wins; a marker without pause never stops');
  assert.equal(autopauseMarker(null, inputs, 0, 1), null, 'a legacy card has no autopause');
});

test('seek: the At top button jumps to its marker for the current inputs', () => {
  assert.equal(seekTime(composition, { launchSpeed: 3 }, top.id), topAt(3));
  assert.equal(seekTime(composition, { launchSpeed: 5 }, top.id), topAt(5));
  assert.equal(seekTime(composition, { launchSpeed: 3 }, 'nowhere'), null);
  assert.equal(seekTime(null, {}, top.id), null);
});

test('the controls row keeps the seek button before Reset, and the card layout is still valid', () => {
  const sections = cardLayout(composition), controls = sections.find(section => section.kind === 'controls');
  assert.deepEqual(controls.ids.slice(-2), ['atTop', 'reset']);
  assert.deepEqual(layoutProblems(sections), []);
});

test('Play from a pause carries on even when the first frame timestamp is earlier than the press: the clock never steps back onto the marker it started on', () => {
  const inputs = { launchSpeed: 3 }, t = topAt(3), rate = 0.2, origin = 1000 - t * 1000 / rate; // Play pressed at performance.now() 1000, paused at the marker
  const early = advanceClock(t, 996, origin, rate); // a rAF timestamp 4 ms before the press: (996 - origin) / 1000 * rate is below t
  assert.ok((996 - origin) / 1000 * rate < t, 'the raw clock would be behind the marker');
  assert.equal(early, t, 'the clock holds at the marker');
  assert.equal(autopauseMarker(composition, inputs, early, advanceClock(early, 1016, origin, rate)), null, 'the next frame does not stop on the marker again');
  assert.ok(advanceClock(t, 1500, origin, rate) > t, 'and it moves on');
});

