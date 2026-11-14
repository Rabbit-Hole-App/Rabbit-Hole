import test from 'node:test';
import assert from 'node:assert/strict';
import { parseScenePlan } from './interact-plan.js';
import { interactFixtures } from './interact-plan-fixtures.js';
import { interactCapabilities } from './interact-control-catalogue.js';

// Sprint 2 schema additions: per-control onChange, marker pause, the seek control, plan instructions, and the correlated-interval check.
const { capabilities, plans } = await interactFixtures();
const clone = value => structuredClone(value);
const G = 9.8;
const codes = result => (result.ok ? [] : result.problems.map(p => `${p.code}@${p.path}`));
const options = { renderers: ['spec', 'program'], stateful: true, componentControls: ['choice', 'bool', 'index', 'indices'], evidenceIds: ['kinematics_note'] };
const seekCaps = await interactCapabilities({ ...options, seek: true });
const parse = plan => parseScenePlan(plan, seekCaps);
const refuses = (plan, code, pathPart = '', caps = seekCaps) => {
  const result = parseScenePlan(plan, caps);
  assert.equal(result.ok, false, `expected a refusal with ${code}`);
  assert.ok(result.problems.some(p => p.code === code && p.path.includes(pathPart)), `expected ${code} at ${pathPart}; got ${codes(result).join(', ')}`);
};
const withSeek = () => {
  const p = clone(plans.standardControls);
  p.scene.runtime.catalogueHash = seekCaps.catalogueHash;
  p.supportingVisuals.forEach(s => { s.runtime.catalogueHash = seekCaps.catalogueHash; });
  p.mode.timeline.markers[0].pause = true;
  p.instructions = 'Press Play, then At top to jump to the top of the throw.';
  p.controls.push({
    id: 'atTop', label: 'At top', type: 'seek', binding: { kind: 'marker', id: p.mode.timeline.markers[0].id }, effect: 'Moves the timeline to the top of the throw.',
    purpose: 'Reach the top of the throw in one press.', selectionReason: 'A button names the moment better than a scrub.', nativeControlId: 'program.seek', affects: [{ scope: 'main', kind: 'entity', id: p.scene.entities[0].id }],
  });
  return p;
};

test('seek control, marker pause, instructions and per-control onChange parse whole; a plan without them is unchanged', () => {
  const plan = withSeek();
  const result = parse(plan);
  assert.equal(result.ok, true, codes(result).join(', '));
  assert.deepEqual(result.value, plan, 'nothing is stripped');
  assert.equal(parseScenePlan(plans.standardControls, capabilities).ok, true);
  const turned = clone(plan), speed = turned.controls.find(c => c.type === 'number');
  speed.onChange = 'recompute_still'; assert.equal(parse(turned).ok, true);
  speed.onChange = 'bounce'; assert.equal(parse(turned).ok, false);
});

test('a seek control needs the enabled catalogue, a timeline and an existing marker', async () => {
  const plan = withSeek();
  refuses(plan, 'unsupported_control', 'controls', capabilities); // the default catalogue offers no seek, and its hash is unchanged
  const missing = clone(plan); missing.controls.find(c => c.type === 'seek').binding.id = 'nowhere';
  refuses(missing, 'dangling_reference', 'binding.id');
  const twice = clone(plan); twice.controls.push({ ...clone(twice.controls.find(c => c.type === 'seek')), id: 'atTopAgain' });
  refuses(twice, 'duplicate_binding', 'controls');
  assert.equal(seekCaps.catalogue.filter(d => d.semanticType === 'seek').length, 1);
  assert.equal((await interactCapabilities({ ...options, seek: false })).catalogueHash, capabilities.catalogueHash, 'seek off is the same hash as before');
});

test('instructions are plain text of at most 300 characters', () => {
  const plan = withSeek();
  plan.instructions = 'x'.repeat(301); assert.equal(parse(plan).ok, false);
  plan.instructions = '<b>Press</b> Play'; assert.equal(parse(plan).ok, false);
  plan.instructions = 'x'.repeat(300); assert.equal(parse(plan).ok, true);
});

test('playbackRate 0.2 is allowed and a marker correlated with the end is inside it (u/g and u/g + 0.1 against 2u/g over the range)', () => {
  const plan = withSeek();
  plan.mode.timeline.playbackRate = 0.2;
  const top = { op: 'divide', left: { op: 'input', id: 'launchSpeed' }, right: { op: 'literal', value: G } };
  plan.mode.timeline.markers.push({ id: 'justAfter', label: 'Just after the top', time: { op: 'add', left: top, right: { op: 'literal', value: 0.1 } }, pause: true });
  const result = parse(plan);
  assert.equal(result.ok, true, codes(result).join(', '));
  plan.mode.timeline.markers.push({ id: 'late', label: 'Late', time: { op: 'add', left: plan.mode.timeline.end, right: { op: 'literal', value: 0.1 } } });
  refuses(plan, 'out_of_domain', 'markers');
});
