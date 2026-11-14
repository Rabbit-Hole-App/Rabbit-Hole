// The convention check (interact-convention.js): the frame ids a plan names, the build input that carries them, and the one precise line for an id the program did not draw with its helper.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { interactFixtures } from '../../web/src/interact-plan-fixtures.js';
import { frameIdsOf, conventionProblems } from '../src/interact-convention.js';
import { buildInput } from '../src/interact-build.js';
import { INTERACT_BUILD_SYSTEM } from '../src/agents/explain-author.js';
import { repairCauses } from '../src/interact-ledger.js';

const { referencePlans } = await interactFixtures();
const circle = (id, w = 28) => ({ id, kind: 'circle', x: 100, y: 100, w });
const box = id => ({ id, kind: 'box', x: 0, y: 0, w: 10, h: 10 }), text = id => ({ id, kind: 'text', x: 0, y: 0, text: 't' }), arrow = id => ({ id, kind: 'arrow', x: 0, y: 0, from: { x: 0, y: 0 }, to: { x: 0, y: 30 } });

// What a program that follows the conventions draws for the Standard plan.
const standard = () => ['toss', 'drop'].flatMap(lane => [box(`lane.${lane}`), text(`lane.${lane}.title`), text(`lane.${lane}.state`), circle(`ball.${lane}`), arrow(`vec.v.${lane}`), arrow(`vec.a.${lane}`), text(`vec.v.${lane}L`), box(`callout.${lane}.l0`), box(`callout.${lane}.l1`)]);

test('the ids a plan names are read off its own words: the Standard plan names its bodies, lanes, vectors and callouts', () => {
  const ids = frameIdsOf(referencePlans.tossStandard);
  for (const id of ['ball.toss', 'ball.drop', 'lane.toss', 'lane.drop', 'vec.v.toss', 'vec.a.drop', 'callout.toss', 'callout.drop']) assert.ok(ids.includes(id), id);
  assert.deepEqual(frameIdsOf({ story: 'a ball.' }), [], 'a family word with no name after the dot is not an id');
  assert.deepEqual(frameIdsOf(referencePlans.tossDeep).filter(id => id.startsWith('plot')), ['plot.vt']);
});

test('the build input passes the plan\'s frame ids; a plan that names none passes none; the prompt says to use them verbatim and states the six conventions', () => {
  const input = buildInput({ evidence: [] }, referencePlans.tossStandard, 'h');
  assert.deepEqual(input.frameIds, frameIdsOf(referencePlans.tossStandard));
  const unnamed = JSON.parse(JSON.stringify(referencePlans.tossStandard).replace(/(ball|lane|vec|callout|plot)\./g, '$1_'));
  const got = buildInput({ evidence: [] }, unnamed, 'h');
  assert.equal('frameIds' in got, false);
  for (const word of ['Lanes:', 'Bodies:', 'Vectors:', 'Numbers beside a body:', 'Plots:', 'Axes:', 'frameIds']) assert.ok(INTERACT_BUILD_SYSTEM.includes(word), word);
  assert.match(INTERACT_BUILD_SYSTEM, /a negative acceleration with `direction: "up"` points down/);
});

test('a program that draws every named id with its helper has no convention problem', () => {
  assert.deepEqual(conventionProblems(referencePlans.tossStandard, standard()), []);
  assert.deepEqual(conventionProblems(referencePlans.tossStandard, []), [], 'a capture seam with no objects says nothing');
});

test('a named id that is missing, or drawn without its helper, is one problem naming the exact id and helper', () => {
  const objects = standard();
  const missing = conventionProblems(referencePlans.tossStandard, objects.filter(o => o.id !== 'vec.a.drop' && o.id !== 'vec.a.dropL'));
  assert.equal(missing.length, 1);
  assert.equal(missing[0].id, 'vec.a.drop');
  assert.match(missing[0].message, /"vec\.a\.drop".*sdk\.vector\('vec\.a\.drop'/);
  const named = conventionProblems(referencePlans.tossStandard, objects.map(o => (o.id === 'ball.drop' ? { ...o, id: 'dropBall' } : o)));
  assert.deepEqual(named.map(p => p.id), ['ball.drop']);
  assert.match(named[0].message, /sdk\.circle\('ball\.drop'/);
  const small = conventionProblems(referencePlans.tossStandard, objects.map(o => (o.id === 'ball.toss' ? { ...o, w: 8 } : o)));
  assert.deepEqual(small.map(p => p.id), ['ball.toss'], 'a circle under the body size is a mark, not a body');
  const noPanel = conventionProblems(referencePlans.tossStandard, objects.filter(o => o.id !== 'lane.toss.title'));
  assert.deepEqual(noPanel.map(p => p.id), ['lane.toss']);
  assert.match(noPanel[0].message, /sdk\.panel\(\{ id: 'lane\.toss'/);
  const noCallout = conventionProblems(referencePlans.tossStandard, objects.filter(o => !o.id.startsWith('callout.drop')));
  assert.deepEqual(noCallout.map(p => p.id), ['callout.drop']);
  assert.match(noCallout[0].message, /sdk\.callout\(x, y, lines, \{ id: 'callout\.drop' \}\)/);
});

test('a family name (vec.v beside vec.v.toss) is satisfied by any drawn id under it; the plot note is a text', () => {
  const plan = { named: 'vec.v and vec.v.toss and plot.vt and plot.vt.note' };
  const drawn = [arrow('vec.v.toss'), { id: 'plot.vt', kind: 'plot' }, text('plot.vt.note')];
  assert.deepEqual(conventionProblems(plan, drawn), []);
  assert.deepEqual(conventionProblems(plan, drawn.filter(o => o.id !== 'plot.vt.note')).map(p => p.id), ['plot.vt.note']);
  assert.deepEqual(conventionProblems(plan, drawn.filter(o => o.kind !== 'plot')).map(p => p.id), ['plot.vt']);
});

test('the ledger reads a convention problem as convention:<id>', () => {
  assert.equal(repairCauses([{ round: 0, stage: 'rendering', problems: ['[convention] "vec.a.drop" is a frame object the plan names, and no capture draws it as it must be: draw it with sdk.vector(\'vec.a.drop\', from, { value, direction }, { label })'] }]), 'convention:vec.a.drop');
});

// The wiring: the real check stage over the real D1 program, once as written (no convention problem) and once with a body named "dropBall" instead of the plan's ball.drop.
test('the check stage reports a plan-named body the program did not name as the plan does: one convention problem, the exact id, and nothing else', async () => {
  const { planHash } = await import('../../web/src/interact-plan.js');
  const { tossDraft } = await import('../../web/src/interact-toss-programs.js');
  const { validateBuildOutput } = await import('../src/interact-build.js');
  const { buildPlanCaptureCases, checkSceneAgainstPlan, headlessCaptureCard } = await import('../src/interact-checks.js');
  const { fixtureContext } = await import('../src/interact-fixtures.js');
  const { interactOracle } = await import('../src/interact-oracle.js');
  const { referenceCapabilities } = await interactFixtures();
  const run = async rename => {
    const plan = structuredClone(referencePlans.tossStandard), draft = tossDraft('tossStandard');
    if (rename) draft.main.program.source = draft.main.program.source.split('ball.drop').join('dropBall');
    const built = await validateBuildOutput({ id: 'j', plan, planHash: await planHash(referencePlans.tossStandard), capabilities: referenceCapabilities }, draft, fixtureContext());
    assert.ok(built.artifacts, JSON.stringify(built.details));
    const { cases, probes } = buildPlanCaptureCases(plan, built.composition, built.artifacts);
    const captures = await headlessCaptureCard({})({ composition: built.composition, artifacts: built.artifacts, cases: [...cases, ...probes] });
    return checkSceneAgainstPlan({ plan, composition: built.composition, artifacts: built.artifacts, captures, cases, probes, oracle: interactOracle(plan), allowPartialCard: true }).problems;
  };
  assert.deepEqual((await run(false)).filter(p => p.code === 'convention'), []);
  const renamed = (await run(true)).filter(p => p.code === 'convention');
  assert.deepEqual(renamed.map(p => p.path), ['ball.drop']);
  assert.match(renamed[0].message, /sdk\.circle\('ball\.drop'/);
});
