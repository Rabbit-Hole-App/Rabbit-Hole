// Deterministic role and capture adapters for the /interact pipeline (INT-04, INT-05, INT-07B fixtures). Zero paid calls and no network by
// construction: a scripted adapter replaces the model transport behind callInteractRole (so admission, preflight, schema checks, size
// limits and call records are the real ones), and the capture seam runs the sealed programs in the pinned QuickJS engine, in this process.
// Fixture data, never product logic: nothing in the pipeline reads this file to decide what is correct. The fixture program text lives in
// packages/web/src/interact-build-fixtures.js; its expected numbers are computed there from the equations of section 7.
import { sha256Hex } from '../../web/src/explain-program/contract.js';
import { headlessCaptureCard } from './interact-checks.js';
import { depthOf } from './chat-depth.js';
import { deepOracle, fixtureDraft, overviewOracle, pendulumOracle, standardOracle } from '../../web/src/interact-build-fixtures.js';
import { interactFixtures } from '../../web/src/interact-plan-fixtures.js';
import { InteractModelError, schemaProblems } from './interact-model-adapters.js';
import { resolveInteractProfile } from './interact-models.js';

// toss-drop-overview-legacy is the old static Moment Overview (the plan overviewProgram), retired from the pin family on 2026-11-13 (interact-design-pin.js pins the Interact
// Overview, toss-overview, for brief); it keeps its scripted build and oracle under this id so its tests still run.
export const LEGACY_OVERVIEW = 'toss-drop-overview-legacy';
export const FIXTURE_IDS = Object.freeze(['toss-drop-standard', 'toss-drop-standard-controls', 'pendulum-period', LEGACY_OVERVIEW]);
// The canonical scene a Depth builds: the fixtures and scripts keep the scene names (overview, standard, deep); the Depth values are brief, balanced, detailed.
const SCENE_OF = Object.freeze({ brief: 'overview', balanced: 'standard', detailed: 'deep' });
const FIXTURE_DEPTHS = Object.freeze({ 'toss-drop-standard': ['balanced', 'detailed'], 'toss-drop-standard-controls': ['balanced'], 'pendulum-period': ['balanced'], [LEGACY_OVERVIEW]: ['brief'] });

// script: { <role>: ({ input, images, system, schema, config, n }) => output }, keyed by the logical role. The adapter validates every reply
// against the schema the role was asked for, exactly as a provider adapter does, and records each call (inputs included) in .log.
export function scriptedAdapter(script) {
  const log = [], count = {};
  return {
    name: 'anthropic', log,
    async call({ config, system, schema, input, images = [] }) {
      const reply = script[config.role];
      if (!reply) throw new InteractModelError('no_script', `The fixture has no scripted ${config.role} reply.`, { sent: false });
      count[config.role] = (count[config.role] ?? 0) + 1;
      log.push({ role: config.role, n: count[config.role], system, input, images: images.length });
      const output = structuredClone(await reply({ config, system, schema, input, images, n: count[config.role] }));
      const problems = schemaProblems(schema, output);
      if (problems.length) throw new InteractModelError('schema_mismatch', `The scripted ${config.role} reply does not match its schema: ${problems.slice(0, 3).join('; ')}`, { sent: true, problems });
      return { output, requested: { provider: config.provider, model: config.model }, served: { provider: config.provider, model: config.model }, usage: { quantities: {}, reasoningTokens: null, raw: null }, timing: { ms: 0 }, stopReason: 'complete', stopRaw: 'tool_use' };
    },
  };
}

// The scripted Scene Builder, Rendered Scene Reviewer and Scene Repairer for the canonical Standard (or Deep) build. The reviewer passes every
// capture it is shown, but only after checking it was shown real image blocks, one per capture id (a text-only review would fail here).
export function fixtureScript(name = 'standard', overrides = {}) {
  const ids = input => (String(input).match(/Captures to review: (.*)/)?.[1] ?? '').split(', ').filter(Boolean);
  return {
    build_author: () => ({ kind: 'scene', ...fixtureDraft(name) }),
    build_review: ({ input, images }) => {
      const shown = ids(input);
      if (!shown.length || images.length !== shown.length) throw new InteractModelError('bad_review_input', `the fixture reviewer was shown ${images.length} images for ${shown.length} captures`, { sent: true });
      return { captures: shown.map(id => ({ id, semantic: 'pass', visual: 'pass', findings: [] })) };
    },
    build_repair: () => ({ operation: 'none', reason: 'the fixture has nothing to repair' }),
    ...overrides,
  };
}

// A role context for callInteractRole in fixture mode: no credential, no transport but the scripted adapter.
export function fixtureContext({ script = fixtureScript(), adapter = scriptedAdapter(script), profile = resolveInteractProfile('opus-baseline'), ...rest } = {}) {
  return { fixture: true, env: {}, profile, adapters: { anthropic: adapter }, adapter, ...rest };
}

// A 1 x 1 PNG: the pixels of a fixture capture are not a rendering, and the capture says so (synthetic: true).
const PNG = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));
// The capture seam, in-process: interact-checks.js's headlessCaptureCard (the sealed programs in the pinned QuickJS engine, the card's own request builder and the player's
// snapshot resolver), here as the complete card with the one synthetic pixel a scripted reviewer needs. Timing is not under test, so the watchdog's interrupt is relaxed.
export function fixtureCaptureCard({ limits } = {}) {
  return async args => {
    const { LIMITS } = await import('../../web/src/explain-program/limits.js');
    const captures = await headlessCaptureCard({}, { limits: limits ?? { ...LIMITS, interruptMs: LIMITS.watchdogMs } })(args);
    return Promise.all(captures.map(async c => ({ ...c, png: PNG, sha256: await sha256Hex(PNG), completeCard: true })));
  };
}

// The design stage's seam, filled with the canonical plan: the real design stage (interact-design.js, another lane) plugs in here with the same
// signature. design({ jobId, request, capabilities, profile }, ctx) -> { plan, reviews, revisions, calls }.
export function fixtureDesignRoles(fixtureId) {
  return {
    async design({ request }) {
      if (!FIXTURE_DEPTHS[fixtureId]?.includes(depthOf(request.depth))) throw new Error(`fixture ${fixtureId} has depths ${FIXTURE_DEPTHS[fixtureId]?.join(', ')} only`);
      const { plans } = await interactFixtures();
      return { plan: fixtureId === 'toss-drop-standard-controls' ? plans.standardControls : fixtureId === 'pendulum-period' ? plans.pendulum : fixtureId === LEGACY_OVERVIEW ? plans.overviewProgram : plans[SCENE_OF[depthOf(request.depth)]], reviews: [{ source: 'fixture', verdict: 'pass', note: 'canonical plan; no design model was called' }], revisions: [], calls: [] };
    },
  };
}

// Everything a fixture run needs, by fixture id: the runner ctx fields that are not the profile.
export async function fixtureRun(fixtureId, depth = fixtureId === LEGACY_OVERVIEW ? 'brief' : 'balanced') {
  depth = depthOf(depth);
  if (!FIXTURE_IDS.includes(fixtureId)) throw new Error(`unknown fixture "${fixtureId}"; available: ${FIXTURE_IDS.join(', ')}`);
  if (fixtureId === 'toss-drop-standard-controls') throw new Error('fixture toss-drop-standard-controls is a design-pin plan only (INTERACT_DESIGN_FIXTURE): it has no scripted build, the real builder builds it');
  const { capabilities } = await interactFixtures();
  const adapter = scriptedAdapter(fixtureScript(fixtureId === 'pendulum-period' ? 'pendulum' : ['brief', 'detailed'].includes(depth) ? SCENE_OF[depth] : 'standard'));
  return { capabilities, designRoles: fixtureDesignRoles(fixtureId), captureCard: fixtureCaptureCard(), oracle: (fixtureId === 'pendulum-period' ? pendulumOracle : { balanced: standardOracle, detailed: deepOracle, brief: overviewOracle }[depth])?.() ?? null, adapters: { anthropic: adapter }, adapter, fixture: true, env: {} };
}

