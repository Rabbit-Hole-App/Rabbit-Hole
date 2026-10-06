// Anti-hardcoding regression, browser side (docs/features/adaptive-learning-path-v1-anti-hardcoding-audit.md). The same
// journey runtime, unchanged, on two synthetic domains (__fixtures__/journey-synthetic-domains.mjs) that no prompt
// example, fixture or corpus uses: other topics, ids in another naming style, other counts (4 or 2 probes, 5 or 3
// sections, 4 or 2 teaching steps), an optional first section, steps out of the usual role order - and each domain again
// with its maps and probe options reordered. Driven end to end: intent -> journeyStep through intake, the walker,
// the path and acceptance; the planners' validators; trayFor and pathEntries; materializeSection on a fake canvas; the
// Tutor's journeyDomain (scope, cards, cue selection, evaluation spec, planner context, validator, runTurn); and a Rabbit
// Hole's journeyDiveContext + diveRecord + enterHole. No model, no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { JOURNEY_LIMITS, journeyStep, nextProbe, pathEntries, slotsFromIntent, trayFor, validatePath, validateRegistry } from './learn-journey.js';
import { materializeSection } from './learn-journey-materialize.js';
import { journeyDomain } from './learn-journey-domain.js';
import { emptyStore, deriveClaimStates } from './learn-tutor-evidence.js';
import { buildTurn, enterHole, evaluationSpec, plannerContext, route, runTurn } from './learn-tutor.js';
import { validateActions } from './learn-tutor-validate.js';
import { selectClaims } from './learn-tutor-select.js';
import { NANOGPT } from './learn-tutor-claims.js';
import { diveRecord } from './dive.js';
import { resolveTarget } from './learn-target.js';
import { indexAfter } from './canvas-slots.js';
import { journeyIntent } from '../../control-plane/src/learner-intent-journey.js';
import { diagnosticOutput, pathOutput, sectionOutput } from '../../control-plane/src/agents/learn-journey.js';
import { AQUEDUCTS, TIDES, reordered } from './__fixtures__/journey-synthetic-domains.mjs';

// journeyDiveContext lives in LearnJourney.jsx: bundled as learn-journey-ui.test.mjs bundles it.
const dir = mkdtempSync(join(tmpdir(), 'journey-anti-hardcoding-'));
const outfile = join(dir, 'journey.cjs');
await esbuild.build({
  stdin: { contents: "export { journeyDiveContext } from './LearnJourney.jsx';", resolveDir: fileURLToPath(new URL('.', import.meta.url)), loader: 'jsx' },
  bundle: true, outfile, format: 'cjs', platform: 'node', jsx: 'automatic', logLevel: 'silent',
});
const { journeyDiveContext } = createRequire(import.meta.url)(outfile);
rmSync(dir, { recursive: true, force: true });

// A canvas that keeps a flow of blocks (learn-journey-materialize.test.mjs's, reduced): reserved slots are live at once.
function fakeCanvas(seed = []) {
  const flow = seed.map(block => ({ ...block }));
  let n = 0;
  return {
    flow, blocks: () => flow,
    reserve: () => 'slot', release: () => {}, showSection: () => {}, persist: async () => ({ ok: true }),
    insertBlock: (block, options = {}) => { const id = `blk-${++n}`; flow.splice(options.after ? indexAfter(flow, options.after) : flow.length, 0, { ...block, id }); return id; },
  };
}
const must = step => { assert.ok(!step.error, step.error); return step; };
const sorted = list => [...list].sort();

// Drives one domain through the runtime and returns what it observed. Every assertion is relative to the domain's own
// data (its ids, counts and order), never to a value of another domain or of the shipped fixtures.
async function drive(D) {
  const seen = { states: [], effects: [], trays: [] };
  const look = (j, step, signals = {}) => {
    seen.states.push(j.state); seen.effects.push(...step.effects);
    const t = trayFor(j, j.path ?? null, signals);
    seen.trays.push(t && { mode: t.mode, options: sorted(t.options.map(o => o.id)), free_text: t.free_text });
    return t;
  };

  // The topic is read from the learner's words, never matched against a list.
  const intent = journeyIntent(D.text);
  assert.equal(intent.topic, D.topic);
  let j = { id: `jr-${D.topic.replace(/\W/g, '')}`, state: 'intake', revision: 1, request: { raw_user_message: D.text, topic: intent.topic, intent }, intake: slotsFromIntent(intent),
    grounding: { kind: 'topic' }, registry: { concepts: {}, claims: {} }, evidence: { seq: 0, events: [] }, diagnostic: null, constraints: [], pending_edits: [], path_version: 0,
    active_section_id: null, section_plan: null, pending: null, error: null };

  // Intake: the fixed bank, the topic in the prompts.
  let tray = look(j, { effects: [] });
  assert.ok(tray.prompt.includes(D.topic));
  for (const [slot, option_id] of D.intake) {
    assert.equal(trayFor(j, null).slot, slot);
    const step = must(journeyStep(j, { type: 'intake_answer', slot, answer: { option_id } }));
    j = step.journey;
    look(j, step);
  }
  assert.deepEqual([j.state, j.pending], ['diagnostic', 'diagnostic']);
  assert.equal(j.intake.slots.goal, D.intake[0][1]);

  // The diagnostic as the planner returns it: accepted by the validator, then walked.
  const diag = diagnosticOutput(D.diagnostic);
  assert.ok(diag.ok, JSON.stringify(diag.errors));
  assert.ok(validateRegistry(diag.value.registry).ok);
  j = must(journeyStep({ ...j, registry: diag.value.registry, diagnostic: { probes: diag.value.probes, asked: [], skipped: false } }, { type: 'diagnostic_ready' })).journey;
  const probes = diag.value.probes;
  for (const [id, , result] of D.walk) {
    const probe = nextProbe(j.diagnostic);
    assert.equal(probe.id, id);
    tray = look(j, { effects: [] }, { probe });
    assert.equal(tray.probe_id, id);
    assert.deepEqual(sorted(tray.options.map(o => o.id)), sorted([...(probe.options || []).map(o => o.id), 'skip']));
    const step = must(journeyStep(j, { type: 'probe_result', probe_id: id, result }));
    j = step.journey;
    if (j.state !== 'diagnostic') look(j, step);
  }
  // The first probe asked is the middle of this ladder; the walker stops within its cap, whatever the ladder's length.
  assert.equal(j.diagnostic.asked[0].probe_id, probes[Math.floor((probes.length - 1) / 2)].id);
  assert.ok(j.diagnostic.asked.length <= JOURNEY_LIMITS.asked);
  assert.equal(nextProbe(j.diagnostic), null);
  assert.deepEqual([j.state, j.pending], ['path_review', 'path']);

  // The draft through pathOutput (server-owned version and source), then journeyStep.
  const drafted = pathOutput(D.path, { registry: j.registry, source: 'draft' });
  assert.ok(drafted.ok, JSON.stringify(drafted.errors));
  const path = drafted.value.path;
  assert.equal(path.sections.length, D.path.path.sections.length);
  assert.ok(validatePath(path, null, j.registry).ok);
  let step = must(journeyStep(j, { type: 'path_drafted', version: 1, path }));
  j = { ...step.journey, path };
  tray = look(j, step);
  assert.equal(tray.mode, 'path_preview');

  // Accept: the first section that is not optional or skipped becomes current, and only it is planned.
  step = must(journeyStep(j, { type: 'accept', path }));
  j = step.journey;
  assert.equal(j.active_section_id, D.active);
  assert.deepEqual(step.effects, ['plan_section']);
  const current = { ...path, version: 2, current_section_id: D.active, sections: path.sections.map(s => (s.id === D.active ? { ...s, status: 'current' } : s)),
    change: { source: 'learner_edit', reason: 'accepted', evidence_refs: [], sections_changed: [] } };
  assert.ok(validatePath(current, path, j.registry).ok);
  j = { ...j, path: current };
  look(j, step);
  const section = current.sections.find(s => s.id === D.active);
  const plan = sectionOutput(D.plan, { path: current, section, registry: j.registry });
  assert.ok(plan.ok, JSON.stringify(plan.errors));
  j = { ...must(journeyStep({ ...j, section_plan: plan.value }, { type: 'section_planned' })).journey, path: current };

  // Materialize: only the current section, its steps in plan order, each stamped; a plan for any other section throws.
  const canvas = fakeCanvas([{ id: 'own-note', type: 'note', text: 'mine' }]), recorded = [];
  const out = await materializeSection({ canvas, journey: { id: j.id, active_section_id: D.active, path: current, materialized: async (...a) => { recorded.push(a); } }, sectionPlan: plan.value, post: async () => { throw new Error('no network'); } });
  assert.deepEqual(recorded, [[D.active, out.heading_block_id]]);
  const steps = out.block_ids.map(id => canvas.flow.find(b => b.id === id));
  assert.deepEqual(steps.map(b => b.journey.step_id), D.plan.teaching_sequence.map(s => s.step_id));
  assert.ok(steps.every(b => b.journey.journey_id === j.id && b.journey.section_id === D.active));
  assert.deepEqual(canvas.flow.filter(b => b.type === 'heading').map(b => [b.text, b.journey_section_id]), [[section.title, D.active]]);
  for (const other of current.sections.filter(s => s.id !== D.active)) {
    await assert.rejects(materializeSection({ canvas, journey: { id: j.id, active_section_id: D.active, path: current, materialized: async () => {} }, sectionPlan: { ...plan.value, section_id: other.id }, post: async () => ({}) }));
  }
  j = { ...must(journeyStep(j, { type: 'section_materialized', section_id: D.active, heading_block_id: out.heading_block_id })).journey, path: current };
  assert.equal(j.section_plan.generation_state, 'generated');
  assert.deepEqual(pathEntries(current, path).map(e => [e.id, e.n, e.changed]), current.sections.map((s, i) => [s.id, i + 1, null]));

  // The Tutor's domain over the canvas, plus a block another journey left behind and one of a later section.
  const later = current.sections.find(s => s.status === 'upcoming');
  const blocks = [...canvas.flow,
    { id: 'stale', type: 'explanation', title: 'Old', journey: { journey_id: 'another-journey', section_id: D.active, step_id: 'x', claims: [section.expected_evidence[0].claim] } },
    { id: 'later', type: 'explanation', title: 'Later', journey: { journey_id: j.id, section_id: later.id, step_id: 'y', claims: [later.expected_evidence[0].claim] } }];
  const domain = journeyDomain({ journey: j, path: current, blocks });
  assert.deepEqual(sorted(domain.cards), sorted(out.block_ids));
  assert.deepEqual(domain.defaultClaims(), section.expected_evidence.map(e => e.claim).slice(0, JOURNEY_LIMITS.expected_evidence));
  assert.deepEqual(domain.targetClaims({ block_id: steps[0].id }), D.plan.teaching_sequence[0].claims);
  assert.deepEqual(domain.targetClaims({ block_id: 'stale' }), []);
  const states = deriveClaimStates([], domain.claims);
  assert.deepEqual(sorted(Object.keys(states)), sorted(Object.keys(D.diagnostic.registry.claims)));
  const here = { app: 'canvas-anti', board: 'main' };
  const cue = buildTurn({ raw: D.cueMessage, canvas: here, block: null, store: emptyStore(), states, domain });
  assert.deepEqual(Object.keys(cue.selection.matched), [D.cueClaim], 'the registry cues select the claim');
  // nanoGPT cue words select nothing here: this domain has no cue map, and its claims are its own.
  const nano = buildTurn({ raw: 'the mask is applied before softmax so the weights add up to one', canvas: here, block: null, store: emptyStore(), states, domain });
  assert.equal(nano.selection.fallback, true);
  assert.ok(Object.keys(nano.selection.matched).every(id => domain.claims[id]) && !Object.keys(nano.selection.matched).some(id => NANOGPT.claims[id]));
  // The evaluation spec: claim content and prerequisite gaps from this registry.
  const target = D.cueClaim, spec = evaluationSpec({ answering: false }, [target], emptyStore(), domain);
  assert.deepEqual(spec.claims.map(c => [c.id, c.statement]), [[target, D.diagnostic.registry.claims[target].statement]]);
  assert.deepEqual(spec.gaps.map(g => g.concept), D.diagnostic.registry.claims[target].prerequisites);
  // The planner context and the action validator.
  const routed = route({ turn: cue.turn, claims: cue.selection.selected, states, evaluation: null, store: emptyStore() });
  const context = plannerContext({ turn: cue.turn, routed, block: null, states, claims: cue.selection.selected, store: emptyStore(), domain });
  assert.equal(context.journey_context.section.title, section.title);
  assert.deepEqual(context.journey_context.upcoming, current.sections.filter(s => s.status === 'upcoming').map(s => s.title).slice(0, 6));
  assert.deepEqual(sorted(context.relevant_authored_content.cards.map(c => c.card)), sorted(out.block_ids));
  const decide = action => validateActions({ actions: [action] }, routed, cue.turn, domain).decisions[0];
  assert.equal(decide({ type: 'show_authored_card', card: steps.at(-1).id }).accepted, true);
  assert.equal(decide({ type: 'show_authored_card', card: 'later' }).stage, 'resource');
  // runTurn: the evaluate body names this journey and these claim ids; the plan request carries this section.
  const sent = [];
  const post = async (where, body) => {
    sent.push({ where, body });
    if (where === '/api/learn/tutor/evaluate') return { status: 'settled', evaluator: 'jev', events: [], journey: { events: [], seq: 0 } };
    return { strategy: 'none', constraints_add: [], actions: [{ type: 'respond_text', text: 'Yes.' }] };
  };
  const turned = await runTurn({ raw: D.cueMessage, canvas: here, access: { app: here.app }, block: null, store: emptyStore(), post, domain });
  assert.deepEqual(sent.map(s => s.where), ['/api/learn/tutor/evaluate', '/api/learn/tutor/plan']);
  assert.equal(sent[0].body.journey_id, j.id);
  assert.ok(sent[0].body.claims.includes(D.cueClaim) && sent[0].body.claims.every(id => domain.claims[id]));
  assert.equal(sent[1].body.context.journey_context.section.title, section.title);
  assert.equal(turned.text, 'Yes.');

  // A Rabbit Hole from the last step block: the dive carries this journey's ids; the hole's concept is this registry's,
  // even when its title names a nanoGPT concept.
  const ctx = journeyDiveContext(j, current, steps.at(-1));
  assert.deepEqual(ctx, { journey_id: j.id, section_id: D.active, claim_ids: D.plan.teaching_sequence.at(-1).claims,
    concept_ids: [...new Set([...D.plan.teaching_sequence.at(-1).claims.map(id => D.diagnostic.registry.claims[id].concept), ...section.target_concepts])].slice(0, 4) });
  const record = diveRecord({ name: 'canvas-0f0f0f0f', title: D.hole.title, via: 'learner_slash', parent: here, target: resolveTarget(steps.at(-1)), block: steps.at(-1), level: 1, journey: ctx });
  assert.deepEqual(record.journey, ctx);
  const dive = journeyDomain({ journey: j, path: current, blocks: [], dive: ctx });
  assert.deepEqual(dive.defaultClaims(), ctx.claim_ids);
  assert.equal(dive.context.phase, 'dive');
  assert.equal(enterHole(emptyStore(), record, dive).dive.concept, D.hole.concept);
  assert.equal(enterHole(emptyStore(), record).dive.concept, D.hole.nanogpt, 'the nanoGPT default reads its own registry; a journey hole must not get it');

  return {
    states: seen.states, effects: seen.effects, trays: seen.trays, asked: j.diagnostic.asked.map(a => a.probe_id), active: j.active_section_id,
    steps: steps.map(b => [b.journey.step_id, sorted(b.journey.claims)]), cards: domain.cards.length, scope: sorted(domain.defaultClaims()),
    selected: Object.keys(cue.selection.matched), gaps: spec.gaps, dive: ctx, hole: enterHole(emptyStore(), record, dive).dive.concept,
  };
}

for (const D of [AQUEDUCTS, TIDES]) {
  test(`anti-hardcoding: ${D.topic} runs the same journey runtime with no source change`, async () => {
    const run = await drive(D);
    // Same kinds of states and effects as any journey: intake x3, diagnostic, path review, active.
    assert.deepEqual([...new Set(run.states)], ['intake', 'diagnostic', 'path_review', 'active']);
    assert.deepEqual(run.effects, ['plan_diagnostic', 'plan_path', 'plan_section']);
    assert.deepEqual(run.asked, D.walk.map(([id]) => id));
  });

  test(`anti-hardcoding: ${D.topic} reordered (map keys, probe options) gives the same journey`, async () => {
    assert.deepEqual(await drive(reordered(D)), await drive(D));
  });
}

test('anti-hardcoding: claim selection reads the domain data (cue map, registry cues), never its kind label', () => {
  const MESSAGES = ['Why is the mask applied before softmax?', 'the weights add up to one', 'it looks back at earlier characters', 'a smaller multiplier gives flatter weights'];
  const candidates = Object.keys(NANOGPT.claims);
  const pick = (raw, domain) => { const { ms, ...rest } = selectClaims(raw, { candidates }, domain); return rest; };
  // The nanoGPT data under another kind label selects exactly as the nanoGPT domain.
  for (const raw of MESSAGES) assert.deepEqual(pick(raw, { ...NANOGPT, kind: 'renamed-course' }), pick(raw, NANOGPT), raw);
  // A journey-shaped domain that brings a cue map is read through it, like any domain.
  const domain = journeyDomain({ journey: { id: 'j', state: 'active', registry: AQUEDUCTS.diagnostic.registry, intake: { slots: {} } }, path: null });
  const id = 'inverted-siphon/exit-lower', withMap = { ...domain, cues: { [id]: ['outflow'] } };
  assert.deepEqual(selectClaims('the outflow is below', { candidates: [id] }, withMap).matched, { [id]: ['outflow'] });
  assert.deepEqual(selectClaims('the outflow is below', { candidates: [id] }, domain).matched, {});
});

// The search, kept as a check: the journey-only runtime modules name no example topic, fixture title or fixture id in
// code (comments may cite examples), and the shared Tutor modules never dispatch on a domain's name or identity.
test('anti-hardcoding: no example topic or fixture id in journey runtime code, no domain-name dispatch in the Tutor', () => {
  const code = file => readFileSync(new URL(file, import.meta.url), 'utf8').replace(/(^|\s)\/\/.*$/gm, '$1');
  const JOURNEY_ONLY = ['./learn-journey.js', './learn-journey-domain.js', './learn-journey-materialize.js', './LearnJourney.jsx', '../../control-plane/src/learner-intent-journey.js',
    '../../control-plane/src/learn-journey.js', '../../control-plane/src/learn-journey-planners.js', '../../control-plane/src/learn-journey-store.js'];
  const EXAMPLES = /\b(?:logistic|sigmoid|softmax|nanogpt|transformers?|attention|photosynthesis|chlorophyll|bastille|eigen\w*|aqueducts?|tidal|classification vs regression)\b|-foundations\b|-core\/|-practice\//i;
  for (const file of JOURNEY_ONLY) assert.equal(code(file).match(EXAMPLES)?.[0] ?? null, null, file);
  const TUTOR = ['./learn-tutor.js', './learn-tutor-select.js', './learn-tutor-validate.js', './learn-tutor-evidence.js', './LearnTutor.jsx', './ask.jsx', './LearnPage.jsx'];
  const DISPATCH = /\bkind\s*[!=]==\s*'(?:nanogpt|journey)'|[!=]==\s*NANOGPT\b|\bNANOGPT\s*[!=]==/;
  for (const file of TUTOR) assert.equal(code(file).match(DISPATCH)?.[0] ?? null, null, file);
});

test('anti-hardcoding: the two domains differ in every count the shipped fixture fixes, and both stay inside the contract caps', () => {
  const counts = D => [Object.keys(D.diagnostic.registry.concepts).length, Object.keys(D.diagnostic.registry.claims).length, D.diagnostic.probes.length, D.path.path.sections.length, D.plan.teaching_sequence.length];
  // The keyless fixture (learn-journey-fixtures.js): 3 concepts, 6 claims, 3 probes, 8 sections, 3 steps.
  for (const D of [AQUEDUCTS, TIDES]) counts(D).forEach((n, i) => assert.notEqual(n, [3, 6, 3, 8, 3][i], `${D.topic} count ${i}`));
  assert.notDeepEqual(counts(AQUEDUCTS), counts(TIDES));
  for (const D of [AQUEDUCTS, TIDES]) {
    const [concepts, claims, probes, sections, steps] = counts(D);
    assert.ok(concepts <= JOURNEY_LIMITS.concepts && claims <= JOURNEY_LIMITS.claims && sections <= JOURNEY_LIMITS.sections);
    assert.ok(probes >= JOURNEY_LIMITS.probes_min && probes <= JOURNEY_LIMITS.probes_max && steps >= JOURNEY_LIMITS.steps_min && steps <= JOURNEY_LIMITS.steps_max);
  }
});
