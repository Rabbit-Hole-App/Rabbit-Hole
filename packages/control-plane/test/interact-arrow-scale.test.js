// Brief 19 item 1: the toss acceleration arrow scales with the plan's smallest gravity (templates/shared.js arrowScale), so a Moon-gravity plan builds, and the four pinned plans are unchanged.
// The pinned hashes were computed from the code BEFORE the change (commit 5e7c381d8): sha256 (first 16 hex) of every headless capture (frames, composition hash, bundle hash) of each pinned plan.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { interactFixtures } from '../../web/src/interact-plan-fixtures.js';
import { planHash } from '../../web/src/interact-plan.js';
import { arrowScale } from '../../web/src/interact-templates/shared.js';
import { buildTemplate, templatePrecheck } from '../src/interact-template.js';
import { buildPlanCaptureCases, headlessCaptureCard } from '../src/interact-checks.js';
import { designCapabilities } from '../src/interact-design.js';
import { fixtureContext } from '../src/interact-fixtures.js';
import { clone } from './interact-design-fixture.js';

const fixtures = await interactFixtures(), capabilities = fixtures.referenceCapabilities, noModels = { ...fixtureContext(), adapters: {}, adapter: undefined };
const BUILD = { INTERACT_BUILD_KIND: 'template', INTERACT_SEEK: 'on', EXPLAIN_PROGRAM_ENABLED: 'true', EXPLAIN_PROGRAM_STATEFUL: 'true' };
const BEFORE = { tossOverview: '2410fc76df9832fc cases=8', tossStandard: '3aa5f5e5b59c3cbd cases=10', tossDeep: '7f5d2fd497e2c00b cases=12', ledgeTossMoon: '17c77b7915c929ae cases=8' };

const frameHash = async (name, plan) => {
  const built = await buildTemplate({ id: name, plan, planHash: await planHash(plan), capabilities }, noModels);
  assert.ok(built.artifacts, JSON.stringify(built.problems ?? built.details));
  const { cases, probes } = buildPlanCaptureCases(plan, built.composition, built.artifacts);
  const captures = await headlessCaptureCard({})({ ...built, cases: [...cases, ...probes] });
  return { built, hash: createHash('sha256').update(JSON.stringify(captures)).digest('hex').slice(0, 16) + ' cases=' + (cases.length + probes.length) };
};

test('arrowScale: 3.4 unless the smallest acceleration would draw under 12 px', () => {
  assert.equal(arrowScale({}), 3.4); assert.equal(arrowScale({ minAccel: 9.8 }), 3.4); assert.equal(arrowScale({ minAccel: 6 }), 3.4);
  assert.equal(arrowScale({ minAccel: 1.62 }), 7.716049); assert.equal(arrowScale({ minAccel: 1 }), 12.5);
});

test('the four pinned plans: every capture (frames, composition hash, bundle hash) is identical to the code before the change', async () => {
  for (const [name, plan] of Object.entries(fixtures.referencePlans)) assert.equal((await frameHash(name, plan)).hash, BEFORE[name], name);
});

test('a Moon-gravity plan (1.62 to 12, default 1.62) builds with zero model calls, passes the headless run and the oracle, and draws its arrow at the larger scale', async () => {
  const moon = clone(fixtures.referencePlans.tossStandard);
  Object.assign(moon.controls.find(c => c.binding.id === 'gravity'), { min: 1.62, default: 1.62 });
  const { built, hash } = await frameHash('moon', moon);
  assert.match(hash, /cases=10/);
  assert.ok(JSON.stringify(built.artifacts).includes('scale: 7.716049'), 'the lanes draw the arrow at 12.5 / 1.62');
  assert.deepEqual(await templatePrecheck(moon, { env: BUILD, capabilities: await designCapabilities(BUILD, { evidence: [{ id: 'kinematics_note' }] }) }), []);
  const pinned = await frameHash('standard', fixtures.referencePlans.tossStandard);
  assert.ok(JSON.stringify(pinned.built.artifacts).includes('scale: 3.4'), 'the pinned Standard keeps 3.4');
});
