// Deterministic role and capture adapters for the /interact pipeline (INT-04, INT-05, INT-07B fixtures). Zero paid calls and no network by
// construction: a scripted adapter replaces the model transport behind callInteractRole (so admission, preflight, schema checks, size
// limits and call records are the real ones), and the capture seam runs the sealed programs in the pinned QuickJS engine, in this process.
// Fixture data, never product logic: nothing in the pipeline reads this file to decide what is correct. The fixture program text lives in
// packages/web/src/interact-build-fixtures.js; its expected numbers are computed there from the equations of section 7.
import { evaluateRequestFor } from '../../web/src/explain-program/program-card.js';
import { canonicalJson, parseGuestResult, resolveInputs, sha256Hex } from '../../web/src/explain-program/contract.js';
import { createSnapshotResolver } from '../../web/src/interact-composition.js';
import { deepOracle, fixtureDraft, overviewOracle, pendulumOracle, standardOracle } from '../../web/src/interact-build-fixtures.js';
import { interactFixtures } from '../../web/src/interact-plan-fixtures.js';
import { InteractModelError, schemaProblems } from './interact-model-adapters.js';
import { resolveInteractProfile } from './interact-models.js';

export const FIXTURE_IDS = Object.freeze(['toss-drop-standard', 'pendulum-period']);
const FIXTURE_DEPTHS = Object.freeze({ 'toss-drop-standard': ['overview', 'standard', 'deep'], 'pendulum-period': ['standard'] });

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
let engine = null;

// The capture seam, in-process: evaluates the main program at each case and each support panel's read-only snapshot (one at a time, through the
// same snapshot resolver the player uses) and returns what the render entry would: complete-card captures bound to the composition hash, each
// with a runtime trace. The card request is the card's own builder (evaluateRequestFor with the composition), so the clock is the card's clock.
export function fixtureCaptureCard({ limits } = {}) {
  return async ({ composition, artifacts, cases }) => {
    const [{ loadEngine, runProgram }, { LIMITS }] = await Promise.all([import('../../web/src/explain-program/runtime.js'), import('../../web/src/explain-program/limits.js')]);
    engine ??= await loadEngine();
    const relaxed = limits ?? { ...LIMITS, interruptMs: LIMITS.watchdogMs }; // timing is not under test here; the outcome is
    const run = async (artifact, inputs, time) => {
      const program = artifact.program, request = { requestId: '1', inputs, time, seed: 0, state: null };
      const out = runProgram(engine, { source: program.source, request, sdkVersion: program.sdkVersion }, relaxed);
      if (!out.ok) return { error: { code: out.code, diagnostic: out.detail } };
      const parsed = parseGuestResult(out.value, program.manifest, program.sdkVersion);
      if (!parsed.ok) return { error: { code: parsed.error.code, diagnostic: parsed.issue } };
      const { frame, quantities } = parsed.value;
      return { quantities, readouts: Object.fromEntries(frame.readouts.map(r => [r.id, r.value])), texts: frame.objects.filter(o => o.kind === 'text' && o.text).map(o => o.text), frameHash: await sha256Hex(canonicalJson(frame.objects)), inputs, time };
    };
    const supportOf = id => artifacts.supporting.find(s => s.id === id).artifact;
    const resolver = createSnapshotResolver({ evaluate: ({ panelId, inputs, time }) => run(supportOf(panelId), resolveInputs(supportOf(panelId).program.manifest, inputs), time) });
    const captures = [];
    for (const c of cases) {
      const manifest = artifacts.main.program.manifest;
      const request = evaluateRequestFor(manifest, { inputs: c.inputs }, c.time, 1, null, composition);
      const trace = await run(artifacts.main, request.inputs, request.time);
      const snapshots = await resolver.resolve(composition, c.inputs);
      const supports = Object.fromEntries(snapshots.snapshots.map(s => [s.id, { bundleHash: supportOf(s.id).program.bundleHash, trace: s.frame }]));
      captures.push({ caseId: c.id, png: PNG, sha256: await sha256Hex(PNG), compositionHash: composition.envelopeHash, completeCard: true, synthetic: true,
        bundleHash: artifacts.main.program.bundleHash, trace: trace.error ? { error: trace.error } : trace, supports });
    }
    return captures;
  };
}

// The design stage's seam, filled with the canonical plan: the real design stage (interact-design.js, another lane) plugs in here with the same
// signature. design({ jobId, request, capabilities, profile }, ctx) -> { plan, reviews, revisions, calls }.
export function fixtureDesignRoles(fixtureId) {
  return {
    async design({ request }) {
      if (!FIXTURE_DEPTHS[fixtureId]?.includes(request.depth)) throw new Error(`fixture ${fixtureId} has depths ${FIXTURE_DEPTHS[fixtureId]?.join(', ')} only`);
      const { plans } = await interactFixtures();
      return { plan: fixtureId === 'pendulum-period' ? plans.pendulum : request.depth === 'overview' ? plans.overviewProgram : plans[request.depth], reviews: [{ source: 'fixture', verdict: 'pass', note: 'canonical plan; no design model was called' }], revisions: [], calls: [] };
    },
  };
}

// Everything a fixture run needs, by fixture id: the runner ctx fields that are not the profile.
export async function fixtureRun(fixtureId, depth = 'standard') {
  if (!FIXTURE_IDS.includes(fixtureId)) throw new Error(`unknown fixture "${fixtureId}"; available: ${FIXTURE_IDS.join(', ')}`);
  const { capabilities } = await interactFixtures();
  const adapter = scriptedAdapter(fixtureScript(fixtureId === 'pendulum-period' ? 'pendulum' : ['overview', 'deep'].includes(depth) ? depth : 'standard'));
  return { capabilities, designRoles: fixtureDesignRoles(fixtureId), captureCard: fixtureCaptureCard(), oracle: (fixtureId === 'pendulum-period' ? pendulumOracle : { standard: standardOracle, deep: deepOracle, overview: overviewOracle }[depth])?.() ?? null, adapters: { anthropic: adapter }, adapter, fixture: true, env: {} };
}

