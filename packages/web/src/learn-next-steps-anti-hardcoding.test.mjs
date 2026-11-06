// Professor Next Steps anti-hardcoding (owner correction 13): the same code on an ML owned canvas, an unrelated non-ML
// owned canvas, an unrelated shared canvas, and each again with renamed and reordered ids and different counts. No model.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { nextStepsController, nextStepsInput } from './learn-next-steps.js';
import { NANOGPT, cardModule } from './learn-tutor-claims.js';
import { cardBlock } from './nanogpt/board.js';
import { AQUEDUCTS, TIDES } from './__fixtures__/journey-synthetic-domains.mjs';
import { planNextSteps } from '../../control-plane/src/learn-next-steps-planner.js';
import { fixtureModel } from '../../control-plane/src/learn-journey-fixtures.js';
import { NEXT_STEPS_LIMITS as L, mintSet, nextStepsInputProblem, nextStepsOutput, selectedStepProblem } from '../../control-plane/src/agents/learn-next-steps.js';
import { sharedInput, sharedStepIds, titleFingerprint } from '../../control-plane/src/learn-next-steps-routes.js';

// Tutor cleanup P1: Next Steps plans from the canvas's own content alone (cards, native objects, the hole record), so the cases are
// canvases of different subjects, sizes and ids; none of them carries a registry, claims, a journey or a Tutor session.
const ml = ids => ids.map((id, i) => ({ id, type: i % 2 ? 'quiz' : 'explanation', title: ['Attention scores', 'Softmax over keys', 'Residual streams'][i % 3], question: 'Which tokens attend to each other?' }));
const loom = ids => ids.map((id, i) => ({ id, type: i % 2 ? 'quiz' : 'explanation', title: ['Warp tension', 'Heddle lift', 'Weft beat-up'][i % 3], question: 'Which thread stays fixed?' }));
const ML_BLOCKS = ml(['n0', 'n1']);

// input (nextStepsInput) -> the fixture planner (planNextSteps) -> mintSet -> controller select. Every id in the set and the step
// stays inside the case's own (empty) scope.
async function chain({ blocks = [], title = 'A canvas', record = null }) {
  const built = nextStepsInput({ blocks, record, title, lastTurn: null, previous: { hooks: [], goals: [] }, basis: 'b1' });
  assert.equal(built.problem, undefined, 'the case fits the input cap');
  const { input } = built;
  assert.equal(nextStepsInputProblem(input), null, 'the route accepts this input');
  assert.deepEqual(input.scope, { concepts: {}, claims: {} });
  const planned = await planNextSteps({}, input, { callModel: fixtureModel });
  assert.equal(nextStepsOutput({ options: planned.options }, input).ok, true);
  const set = mintSet(planned.options, input);
  for (const o of set.options) assert.deepEqual([o.selected_next_step.claim_ids, o.selected_next_step.concept_ids], [[], []]);
  const ctl = nextStepsController({ post: async () => set, setTimer: fn => { queueMicrotask(fn); return 1; }, clearTimer: () => {} });
  ctl.update({ basis: 'b1', stop: null, input: () => built });
  for (let i = 0; i < 10 && ctl.view().status !== 'ready'; i++) await new Promise(resolve => setImmediate(resolve));
  const picked = ctl.select(set.options[0].id);
  assert.equal(picked.ok, true);
  return { input, set };
}
const CASES = [
  ['ML canvas: two cards', () => ({ blocks: ML_BLOCKS, title: 'Language models' })],
  ['non-ML canvas: three cards, renamed ids', () => ({ blocks: loom(['z9', 'a2', 'q5']), title: 'Weaving' })],
  ['non-ML canvas: the same cards reordered, with one more', () => ({ blocks: loom(['q5', 'a2', 'z9', 'b7']), title: 'Weaving' })],
  ['plain blank canvas', () => ({ blocks: [], title: 'Untitled canvas' })],
  ['a hole with a learning goal', () => ({ blocks: loom(['h1']), title: 'Weaving', record: { dive_id: 'canvas-0000beef', title: 'Heddles', learning_goal: 'See why a heddle lifts alternate threads' } })],
];
for (const [name, make] of CASES) {
  test(`same code path: ${name}`, async () => {
    const { input, set } = await chain(make());
    assert.equal(set.options.length, L.options);
    assert.ok(JSON.stringify(input).length <= 9000);
  });
}

// A shared canvas has no registry of its own: the same sharedInput, planner and mint on any blocks. Block ids are renamed,
// reordered and counted differently across the cases.
async function sharedChain(state, { origin = { root: true }, title = 'A shared board' } = {}) {
  const options = { origin, key: 'k', version: 3, title };
  const built = sharedInput(state, options);
  assert.equal(built.problem, undefined, 'the board fits the input cap');
  const { input } = built;
  assert.equal(input.mode, 'shared');
  assert.equal(nextStepsInputProblem({ ...input, mode: 'canvas' }), null, 'the route accepts this input');
  const planned = await planNextSteps({}, input, { callModel: fixtureModel });
  assert.equal(nextStepsOutput({ options: planned.options }, input).ok, true);
  const fingerprint = await titleFingerprint(title);
  const set = mintSet(planned.options, input, { source: { share_version: 3, origin_block_id: ':root', title_fingerprint: fingerprint } });
  assert.equal(set.options.length, L.options);
  for (const { selected_next_step: step } of set.options) {
    assert.equal(step.scope, 'shared');
    // Start Rabbit Hole: the server's check of the returned step, on the same board, is as free of any domain as the mint.
    assert.equal(selectedStepProblem(step, { ...sharedStepIds(state, options), fingerprint, version: 3 }), null, 'the click path accepts this step');
    for (const id of step.claim_ids) assert.ok(Object.hasOwn(input.scope.claims, id), `${id} is outside the shared scope`);
    for (const id of step.concept_ids) assert.ok(Object.hasOwn(input.scope.concepts, id), `${id} is outside the shared scope`);
  }
  return { input, set };
}
const SHARED = [
  ['ML: two cards as the shared blocks', { blocks: ML_BLOCKS, exchanges: [] }, 'none'],
  ['unrelated: two blocks', { blocks: [{ id: 'm1', type: 'explanation', title: 'Mapping star charts' }, { id: 'm2', type: 'quiz', question: 'Which star stays fixed?' }], exchanges: [] }, 'none'],
  ['unrelated: three blocks, renamed ids', { blocks: loom(['z9', 'a2', 'q5']), exchanges: [] }, 'none'],
  ['unrelated: the same three, reordered, with one more', { blocks: loom(['q5', 'a2', 'z9', 'b7']), exchanges: [] }, 'none'],
];
for (const [name, state, scope] of SHARED) {
  test(`same code path: shared ${name}`, async () => {
    const { input } = await sharedChain(state);
    assert.equal(input.canvas.blocks.length, state.blocks.length);
    assert.equal(Object.keys(input.scope.claims).length > 0, scope === 'claims');
  });
}
test('same code path: an unrelated shared canvas with no registry claims gives grounded hooks with empty ids', async () => {
  const { input, set } = await sharedChain(SHARED[1][1]);
  assert.deepEqual([input.mode, Object.keys(input.scope.claims).length, input.canvas.blocks.length], ['shared', 0, 2]);
  assert.ok(set.options.every(o => o.selected_next_step.claim_ids.length === 0));
});

test('the cases differ in their card counts and none carries a claim', async () => {
  const cards = [];
  for (const [, make] of CASES) { const { input } = await chain(make()); cards.push(input.canvas.blocks.length); assert.equal(Object.keys(input.scope.claims).length, 0); }
  for (const [, state] of SHARED) { const { input } = await sharedChain(state); cards.push(input.canvas.blocks.length); assert.equal(Object.keys(input.scope.claims).length, 0); }
  assert.ok(new Set(cards).size >= 3, cards.join(','));
});

// ---------- Scans over product source (read only) ----------
const source = file => readFileSync(new URL(file, import.meta.url), 'utf8');
// Comments only; a // inside a quoted string is code.
const strip = text => text.replace(/('(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`)|(?<!\S)\/\/.*$/gm, (match, quoted) => quoted ?? '');
// The identifiers of a piece of code, string literals blanked. An allowlist over these catches an indirection through any new name.
const idents = code => code.replace(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g, "''").match(/[A-Za-z_$][\w$]*/g) || [];
const outside = (code, allowed) => [...new Set(idents(code).filter(id => !allowed.has(id)))];
const functionOf = (file, head) => strip(source(file)).match(new RegExp(`${head}[\\s\\S]*?\\n\\}`))[0];
// The buildTurn({ ... }) calls in a module (the signature excluded): where each starts and ends, and the text between the braces.
const handovers = code => [...code.matchAll(/(?<!function )\bbuildTurn\(\{/g)].map(({ index }) => {
  const open = index + 'buildTurn('.length;
  let depth = 0, end = open;
  for (; end < code.length; end++) { if ('{(['.includes(code[end])) depth++; else if ('})]'.includes(code[end]) && --depth === 0) break; }
  return { start: index, end: end + 2, text: code.slice(open + 1, end) }; // end + 2: past the closing brace and the closing parenthesis
});
const withoutHandovers = code => handovers(code).reduceRight((rest, { start, end }) => `${rest.slice(0, start)}buildTurn(HANDOVER)${rest.slice(end)}`, code);
// The top-level, comma separated parts of an object literal's text.
const entries = text => {
  const parts = [];
  let depth = 0, from = 0;
  for (let i = 0; i < text.length; i++) {
    if ('{(['.includes(text[i])) depth++; else if ('})]'.includes(text[i])) depth--; else if (text[i] === ',' && depth === 0) { parts.push(text.slice(from, i).trim()); from = i + 1; }
  }
  return [...parts, text.slice(from).trim()].filter(Boolean);
};

// What a registry-free product module may never name. Card ids and titles come from the card registry helpers, claim ids from all
// three registries (whole slug and the slug after the slash). The 4 character floor stays: nothing here is ever shortened.
const REGISTRIES = [NANOGPT, AQUEDUCTS.diagnostic.registry, TIDES.diagnostic.registry];
const VOCAB = [...new Set([
  ...REGISTRIES.flatMap(r => Object.entries(r.concepts).flatMap(([id, c]) => [id, c.label, ...(c.names || [])])),
  ...REGISTRIES.flatMap(r => Object.keys(r.claims).flatMap(id => [id, id.split('/').at(-1)])),
  ...NANOGPT.cards, ...NANOGPT.cards.map(id => cardBlock(cardModule(id)).title),
  ...[AQUEDUCTS, TIDES].flatMap(d => d.topic.split(' ')), 'aqueduct',
  'softmax', 'logistic regression', 'photosynthesis', 'binary search', 'french revolution', 'nanogpt', 'kitchen chemistry', 'bridge loads', 'karpathy', '-foundations', '-core/', '-practice/', 'c11-', 'depth-attention',
].filter(word => String(word).length >= 4))];
const named = (code, word) => new RegExp(`(^|[^a-z0-9])${String(word).toLowerCase().replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}([^a-z0-9]|$)`).test(code);

// Registered-course references that are legitimate in an otherwise registry-free module. A strip is [pattern, reason, count]: exact,
// reasoned, and pinned to the number of matches it has today. A new match (a runtime use of the course, another course import) fails,
// and so does a strip nothing needs any more (delete it), so none of them can grow into a blind spot.
const escaped = text => text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
// The registered course board and registry imports, each pinned as its exact full line: a new name, an alias or another line fails.
const courseImports = (...lines) => [new RegExp(`^(?:${lines.map(escaped).join('|')})$`, 'gm'), `the registered course imports (${lines.map(line => line.match(/from '([^']*)'/)[1]).join(', ')})`, lines.length];
// The default domain parameter only (in a parameter list or a destructuring), never a runtime assignment.
const courseDefault = count => [/(?<=[({,]\s*)domain = NANOGPT(?=\s*[,})])/g, 'the default domain parameter is the registered course', count];
// Scanned: the modules Professor Next Steps and the Auto Tutor added or changed. Not scanned, on purpose: the course registry files
// where a course is legitimately registered and named (learn-tutor-domains.js, learn-tutor-claims.js, nanogpt/*), learn-slash.js
// (command placeholder copy) and learn-journey-fixtures.js (test-only fixture topics).
const SCANNED = [
  ['../../control-plane/src/agents/learn-next-steps.js'], ['../../control-plane/src/learn-next-steps-routes.js'], ['./learn-next-steps.js'], ['./LearnNextSteps.jsx'], ['../../control-plane/src/learn-next-steps-planner.js'],
  ['../../control-plane/src/learn-tutor-handoff.js'], ['./learn-tutor-actions.js'], ['../../control-plane/src/agents/learn-labels.js'],
  ['../../control-plane/src/learn-journey-planners.js'], ['../../control-plane/src/learn-tutor-routes.js'], ['./learn-journey-domain.js'],
  ['../../control-plane/src/learn-boards.js'], ['../../control-plane/src/learn-shared-ask.js'], ['./voice-session.js'], ['./LearnVoice.jsx'], ['../../control-plane/src/learn-models.js'],
  ['./learn-tutor-evidence.js', courseImports("import { CLAIMS, NANOGPT, claimsOfConceptIn } from './learn-tutor-claims.js';"), courseDefault(1)],
  ['../../control-plane/src/agents/learn-tutor.js',
    [/^\s*'You are the Tutor on a Rabbit Hole learning canvas about nanoGPT attention\. You compose ONE turn\.',$/gm, 'LINES[0], the registered course subject line; the journey and canvas prompts leave it out', 1],
    [/(?<=[(,]\s*)kind = 'nanogpt'(?=\s*[,)])/g, 'the default prompt kind parameter is the registered course', 1],
    [/: 'nanogpt'\)/g, 'the prompt kind a registered course turn is selected with', 1]],
];
// A comparison of a hook, claim, concept, block or id list length with 2 to 4 (a word length filter is not one of them).
const COUNT = /\b(?:options|hooks|claims|concepts|blocks|goals|ids)\.length\s*(?:[!=]=?=|[<>]=?)\s*[2-4]\b|\blength\s*===\s*3\b/;
test('no registry labels, card ids or titles, claim ids, topic words, fixture ids or modality sequences in the product modules', () => {
  for (const [file, ...strips] of SCANNED) {
    let code = strip(source(file));
    for (const [pattern, reason, count] of strips) {
      const found = (code.match(pattern) || []).length;
      assert.equal(found, count, `${file}: the strip for ${reason} matches ${found} time(s), pinned at ${count} (more: a new use of the course; fewer: an exact line changed, so a new name or alias; either way review it; 0: delete the strip)`);
      code = code.replace(pattern, '');
    }
    code = code.toLowerCase();
    for (const word of VOCAB) assert.equal(named(code, word), false, `${file} names ${word}`);
  }
  // Modality history is read in exactly these places, and the router never reads it.
  for (const file of ['./learn-next-steps.js']) assert.equal(/\bmodalities\b[^\n]*(?:===|includes|\[\d\])/.test(source(file)), false, `${file} branches on modality history`);
  // No literal count of hooks, claims or concepts other than the contract constant, in any Next Steps module.
  for (const file of ['../../control-plane/src/agents/learn-next-steps.js', '../../control-plane/src/learn-next-steps-routes.js', './learn-next-steps.js', './LearnNextSteps.jsx'])
    assert.equal(COUNT.test(strip(source(file))), false, `${file}: use NEXT_STEPS_LIMITS.options`);
});
