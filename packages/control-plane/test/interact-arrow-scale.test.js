// Brief 19 item 1: the toss acceleration arrow scales with the plan's smallest gravity (templates/shared.js arrowScale), so a Moon-gravity plan builds, and the four pinned plans are unchanged.
// The pinned hashes were computed from the code BEFORE the change (commit 5e7c381d8): sha256 (first 16 hex) of every headless capture (frames, composition hash, bundle hash) of each pinned plan.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { interactFixtures } from '../../web/src/interact-plan-fixtures.js';
import { planHash } from '../../web/src/interact-plan.js';
import { arrowScale, velocityDraw } from '../../web/src/interact-templates/shared.js';
import { extractBrief, expandBrief } from '../../web/src/interact-family-vertical-throw.js';
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

test('velocityDraw: 12 px per m/s and an arrow from 3 px, unless the smallest nonzero speed would draw under 3 px', () => {
  assert.deepEqual(velocityDraw({}), { vScale: 12, vMin: 3 }); assert.deepEqual(velocityDraw({ minSpeed: 0.6 }), { vScale: 12, vMin: 3 }); assert.deepEqual(velocityDraw({ minSpeed: 0.25 }), { vScale: 12, vMin: 3 });
  assert.deepEqual(velocityDraw({ minSpeed: 0.162 }), { vScale: 12, vMin: 1 }); assert.deepEqual(velocityDraw({ minSpeed: 0.05 }), { vScale: 30, vMin: 1 });
});

test('arrowScale: 3.4 unless the smallest acceleration would draw under 12 px', () => {
  assert.equal(arrowScale({}), 3.4); assert.equal(arrowScale({ minAccel: 9.8 }), 3.4); assert.equal(arrowScale({ minAccel: 6 }), 3.4);
  assert.equal(arrowScale({ minAccel: 1.62 }), 7.716049); assert.equal(arrowScale({ minAccel: 1 }), 12.5);
});

test('the four pinned plans: every capture (frames, composition hash, bundle hash) is identical to the code before the change', async () => {
  for (const [name, plan] of Object.entries(fixtures.referencePlans)) assert.equal((await frameHash(name, plan)).hash, BEFORE[name], name);
});

// A model-written plan (the brief expander, not a pinned plan) is checked by the family arrow oracle; the pinned plans are not. On the code before brief 19 every Moon variant below failed that oracle:
// the acceleration arrow (3.4 px per m/s^2) and the velocity arrow at 0.10 s before the top (0.1 x gravity m/s, 12 px per m/s) were plain lines under 3 px, not arrows.
const MOON = { min: 1.62, max: 12.12, default: 1.62, step: 0.1 };
const moonVariants = {
  'Balanced, gravity 1.62 to 12.12': { source: 'tossStandard', depth: 'balanced', edit: b => { b.gravity = MOON; } },
  'Balanced, gravity 1.5 to 1.7': { source: 'tossStandard', depth: 'balanced', edit: b => { b.gravity = { min: 1.5, max: 1.7, default: 1.6, step: 0.1 }; } },
  'Balanced, gravity 1.62 and the smallest launch speed in range (2 m/s)': { source: 'tossStandard', depth: 'balanced', edit: b => { b.gravity = MOON; b.launchSpeed = { ...b.launchSpeed, min: 2, default: 2 }; } },
  'Detailed, gravity 1.62 to 12.12': { source: 'tossDeep', depth: 'detailed', edit: b => { b.gravity = MOON; } },
  'Overview, gravity fixed at 1.62': { source: 'tossOverview', depth: 'brief', edit: b => { b.gravity = { fixed: 1.62 }; } },
};
for (const [label, v] of Object.entries(moonVariants)) test('a model-written plan builds with zero model calls and passes the headless run and the arrow oracle: ' + label, async () => {
  const withNote = await designCapabilities(BUILD, { evidence: [{ id: 'kinematics_note' }] });
  const brief = clone(extractBrief(fixtures.referencePlans[v.source])); v.edit(brief);
  const plan = expandBrief(brief, v.depth, { catalogueHash: withNote.catalogueHash });
  assert.deepEqual(await templatePrecheck(plan, { env: BUILD, capabilities: withNote }), []);
  const { built, hash } = await frameHash('moon', plan);
  assert.match(hash, /cases=\d+/);
  if (v.depth !== 'brief') assert.ok(JSON.stringify(built.artifacts).includes('scale: 7.716049') || label.includes('1.5 to 1.7'), 'the acceleration arrow follows the smallest gravity');
});

test('the pinned Standard keeps its arrow scales (3.4 and 12 px per unit, an arrow from 3 px)', async () => {
  const pinned = await frameHash('standard', fixtures.referencePlans.tossStandard);
  const source = JSON.stringify(pinned.built.artifacts);
  assert.ok(source.includes('scale: 3.4') && source.includes('scale: 12, minLength: 3'), 'the pinned Standard keeps its arrow scales');
});
