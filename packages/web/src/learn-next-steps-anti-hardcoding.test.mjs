// Professor Next Steps anti-hardcoding (owner correction 13): the same code on an ML owned canvas, an unrelated non-ML
// owned canvas, an unrelated shared canvas, and each again with renamed and reordered ids and different counts. No model.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { nextStepsController, nextStepsInput } from './learn-next-steps.js';
import { canvasDomain, journeyDomain } from './learn-journey-domain.js';
import { runTurn } from './learn-tutor.js';
import { emptyStore } from './learn-tutor-evidence.js';
import { NANOGPT, cardModule } from './learn-tutor-claims.js';
import { cardBlock } from './nanogpt/board.js';
import { AQUEDUCTS, TIDES, reordered } from './__fixtures__/journey-synthetic-domains.mjs';
import { planNextSteps } from '../../control-plane/src/learn-journey-planners.js';
import { fixtureModel } from '../../control-plane/src/learn-journey-fixtures.js';
import { NEXT_STEPS_LIMITS as L, mintSet, nextStepsInputProblem, nextStepsOutput, selectedStepProblem } from '../../control-plane/src/agents/learn-next-steps.js';
import { sharedInput, sharedStepIds, titleFingerprint } from '../../control-plane/src/learn-next-steps-routes.js';

const rename = (registry, prefix) => {
  const map = new Map(Object.keys(registry.concepts).map((id, i) => [id, `${prefix}-k${i}`]));
  const claims = Object.fromEntries(Object.entries(registry.claims).reverse().map(([id, c], i) => [`${map.get(c.concept)}/q${i}`, { ...c, concept: map.get(c.concept), prerequisites: (c.prerequisites || []).map(p => map.get(p)) }]));
  const concepts = Object.fromEntries([...map].reverse().map(([old, id]) => [id, { ...registry.concepts[old], prerequisites: (registry.concepts[old].prerequisites || []).map(p => map.get(p)) }]));
  return { concepts, claims };
};
const cut = (registry, n) => ({ concepts: registry.concepts, claims: Object.fromEntries(Object.entries(registry.claims).slice(0, n)) });
// A journey over any registry: a completed section on its last claim, the current one on its first `size` claims.
const journeyCase = (registry, size = 2) => {
  const ids = Object.keys(registry.claims);
  const journey = { id: 'lj_x', state: 'active', registry, evidence: { seq: 0, events: [] }, active_section_id: 'sB', request: { topic: 'x' }, intake: { slots: {} } };
  const path = { version: 1, goal: 'A goal', current_section_id: 'sB', sections: [{ id: 'sA', title: 'First', purpose: 'p', status: 'completed', expected_evidence: [{ claim: ids.at(-1), kind: 'explain' }] },
    { id: 'sB', title: 'Second', purpose: 'p', status: 'current', expected_evidence: ids.slice(0, size).map(claim => ({ claim, kind: 'explain' })) }] };
  return { domain: journeyDomain({ journey, path, blocks: [] }), journey: { journey, path, busy: false, trayProps: null }, source: 'journey' };
};
const ML_BLOCKS = NANOGPT.cards.slice(0, 2).map((id, i) => ({ ...cardBlock(cardModule(id)), id: `n${i}` }));
// What the page offers a turn from structural state (LearnTutor.jsx turnOffers): the same on every domain.
const MATERIALS = [{ command: 'flashcards', cards: ['flashcards'], paid: false }];
const OFFERS = ['create_material', 'suggest_research', 'suggest_journey'];

// input (nextStepsInput) -> the fixture planner (planNextSteps) -> mintSet -> controller select -> a next_step runTurn.
// Every id in the set, the step and the turn stays inside this case's own domain; no evaluate call.
async function chain({ domain, journey = null, source = 'registry', blocks = [] }) {
  const built = nextStepsInput({ context: { domain, source }, store: emptyStore(), journey, blocks, record: null, parent: null, title: 'A canvas', lastTurn: null, previous: { hooks: [], goals: [] }, basis: 'b1' });
  assert.equal(built.problem, undefined, 'the case fits the input cap');
  const { input } = built;
  assert.equal(nextStepsInputProblem(input), null, 'the route accepts this input');
  const planned = await planNextSteps({}, input, { callModel: fixtureModel });
  const set = mintSet(planned.options, input);
  const known = new Set([...Object.keys(domain.claims), ...Object.keys(domain.concepts)]);
  for (const o of set.options) for (const id of [...o.selected_next_step.claim_ids, ...o.selected_next_step.concept_ids]) assert.ok(known.has(id), `${id} is outside this domain`);
  const ctl = nextStepsController({ post: async () => set, setTimer: fn => { queueMicrotask(fn); return 1; }, clearTimer: () => {} });
  ctl.update({ basis: 'b1', stop: null, input: () => built });
  for (let i = 0; i < 10 && ctl.view().status !== 'ready'; i++) await new Promise(resolve => setImmediate(resolve));
  const picked = ctl.select(set.options[0].id);
  assert.equal(picked.ok, true);
  const sent = [];
  const post = async path => { sent.push(path); return { strategy: 'none', constraints_add: [], actions: [{ type: 'respond_text', text: 'ok' }] }; };
  const r = await runTurn({ raw: '', nextStep: picked.selected_next_step, materials: MATERIALS, research: true, journeyOffer: true, canvas: { app: 'c', board: 'main' }, access: { app: 'c' }, block: null, store: emptyStore(), post, domain });
  assert.deepEqual(sent, ['/api/learn/tutor/plan'], 'no evaluate call');
  for (const id of r.bench.claims) assert.ok(domain.claims[id], `${id} in the turn is outside this domain`);
  for (const offer of OFFERS) assert.ok(r.routed.allowed.includes(offer), `${offer} is offered on row ${r.routed.row}`);
  return { input, set };
}
// Ceiling: renamed ids run through the journey branch only. The registered-course branch (card blocks, targetClaims) and the shared
// course path run on the original course ids; the vocabulary scan below backs that side. Section sizes 3, 4, 1 and 2 differ on purpose.
const CASES = [
  ['ML owned: the registered course domain, its cards on the canvas', () => ({ domain: NANOGPT, blocks: ML_BLOCKS })],
  ['ML owned: the same registry renamed, reordered and cut to 5 claims, as a journey', () => journeyCase(rename(cut({ concepts: NANOGPT.concepts, claims: NANOGPT.claims }, 5), 'mlx'), 3)],
  ['non-ML owned: the aqueducts journey', () => journeyCase(AQUEDUCTS.diagnostic.registry, 4)],
  ['non-ML owned: the tides journey, reordered', () => journeyCase(reordered(TIDES).diagnostic.registry, 1)],
  ['non-ML owned: renamed with 2 claims', () => journeyCase(rename(cut(TIDES.diagnostic.registry, 2), 'tz'))],
  ['plain canvas, no registry', () => {
    const blocks = [{ id: 'w1', type: 'explanation', title: 'Warp tension' }];
    return { domain: canvasDomain({ goal: 'Weaving on a backstrap loom', blocks }), source: 'canvas', blocks };
  }],
];
for (const [name, make] of CASES) {
  test(`same code path: ${name}`, async () => {
    const { input, set } = await chain(make());
    assert.equal(set.options.length, L.options);
    assert.ok(JSON.stringify(input).length <= 9000);
  });
}
test('a renamed registry reaches the input under its new ids only', async () => {
  const { input } = await chain(CASES[1][1]());
  const text = JSON.stringify(input);
  assert.ok(Object.keys(input.scope.claims).every(id => id.startsWith('mlx-k')), 'every claim id is a renamed one');
  for (const id of [...Object.keys(NANOGPT.claims), ...Object.keys(NANOGPT.concepts)]) assert.equal(text.includes(`"${id}"`), false, `the original id ${id} reached the input`);
});

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
const loom = ids => ids.map((id, i) => ({ id, type: i % 2 ? 'quiz' : 'explanation', title: ['Warp tension', 'Heddle lift', 'Weft beat-up'][i % 3], question: 'Which thread stays fixed?' }));
const SHARED = [
  ['ML: the course cards as the shared blocks', { blocks: ML_BLOCKS, exchanges: [] }, 'claims'],
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

test('the cases differ in their scope counts', async () => {
  const counts = [];
  for (const [, make] of CASES) counts.push(Object.keys((await chain(make())).input.scope.claims).length);
  for (const [, state] of SHARED) counts.push(Object.keys((await sharedChain(state)).input.scope.claims).length);
  assert.ok(new Set(counts).size >= 3, counts.join(','));
  // The four journey cases (ML renamed, aqueducts, tides, tides renamed) plan on sections of 3, 4, 1 and 2 claims.
  assert.ok(new Set(counts.slice(1, 5)).size >= 3, `journey scope counts: ${counts.slice(1, 5).join(',')}`);
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
  ['../../control-plane/src/agents/learn-next-steps.js'], ['../../control-plane/src/learn-next-steps-routes.js'], ['./learn-next-steps.js'], ['./LearnNextSteps.jsx'], ['./learn-tutor-trace.js'],
  ['../../control-plane/src/learn-tutor-handoff.js'], ['./learn-tutor-actions.js'], ['../../control-plane/src/agents/learn-labels.js'],
  ['./LearnTutor.jsx'], ['../../control-plane/src/learn-journey-planners.js'], ['../../control-plane/src/learn-tutor-routes.js'], ['./learn-journey-domain.js'],
  ['../../control-plane/src/learn-boards.js'], ['../../control-plane/src/learn-shared-ask.js'], ['./voice-session.js'], ['./LearnVoice.jsx'], ['../../control-plane/src/learn-models.js'],
  ['./learn-tutor.js', courseImports("import { cardBlock } from './nanogpt/board.js';", "import { partIndex } from './nanogpt/depth/board.js';",
    "import { NANOGPT, cardModule, claimsOfConceptIn, holeConcept, partLabels } from './learn-tutor-claims.js';"), courseDefault(10)],
  ['./learn-tutor-validate.js', courseImports("import { NANOGPT } from './learn-tutor-claims.js';", "import { partIndex } from './nanogpt/depth/board.js';"), courseDefault(2)],
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
  assert.equal(/modalit/i.test(functionOf('./learn-tutor.js', 'export function route\\(')), false);
  for (const file of ['./learn-tutor-validate.js', './learn-next-steps.js']) assert.equal(/\bmodalities\b[^\n]*(?:===|includes|\[\d\])/.test(source(file)), false, `${file} branches on modality history`);
  // No literal count of hooks, claims or concepts other than the contract constant, in any Next Steps module.
  for (const file of ['../../control-plane/src/agents/learn-next-steps.js', '../../control-plane/src/learn-next-steps-routes.js', './learn-next-steps.js', './LearnNextSteps.jsx'])
    assert.equal(COUNT.test(strip(source(file))), false, `${file}: use NEXT_STEPS_LIMITS.options`);
});

// No module decides an offer or an action from the learner words. Allowlists, not word lists: an offer line may read only the
// structural identifiers below, so a variable derived from the words, however it is named, fails here.
// Extending an allowlist: add a structural identifier (page state, the row, a structural flag such as the handoff offer) after
// review. A reader of the learner words, of the constraints (statedConstraints feeds them) or of learner_intent never belongs in one.
// ponytail: line-based, and a string built by concatenation ('suggest_' + x) would escape; the page's offer function is checked whole.
test('no product module decides an offer or an action from the learner words', () => {
  // The words: the raw message, and the readers of it that decide an intent, a skeleton or constraints.
  const WORDS = /raw_user_message|\braw\b|learnerIntent|learner_intent|wantsCard|selectClaims|statedConstraints/;
  const linesOf = (code, pattern) => code.split('\n').filter(line => pattern.test(line));
  const reassigned = (code, names) => code.split('\n').slice(1).filter(line => new RegExp(`\\b(?:${names})\\s*(?:=(?!=)|\\|\\|=|\\?\\?=|&&=)`).test(line));

  // buildTurn: the turn's four offer fields read only what the page offered (its parameters), and those are never reassigned.
  // repository (Task 11c-B) is the structural handoff flag: the page's canvasRepository state (checked below), never the words.
  const build = functionOf('./learn-tutor.js', 'export function buildTurn\\(');
  const buildLines = linesOf(build, /available_materials|research_offer|journey_offer|handoff_offer/);
  assert.ok(buildLines.length >= 4, 'buildTurn sets all four offer fields');
  const BUILD_OK = new Set(['nextStep', 'materials', 'research', 'journeyOffer', 'repository', 'length', 'available_materials', 'research_offer', 'journey_offer', 'handoff_offer', 'true']);
  for (const line of buildLines) assert.deepEqual(outside(line, BUILD_OK), [], `an offer line in buildTurn reads more than the page offered: ${line.trim()}`);
  // The signatures take the four offer parameters with literal defaults, and neither function reassigns them.
  for (const [name, body] of [['buildTurn', build], ['runTurn', functionOf('./learn-tutor.js', 'export async function runTurn\\(')]]) {
    assert.ok(/\bmaterials = \[\]/.test(body) && /\bresearch = false\b/.test(body) && /\bjourneyOffer = false\b/.test(body) && /\brepository = false\b/.test(body), `${name} defaults the offer parameters to literals`);
    assert.deepEqual(reassigned(body, 'nextStep|materials|research|journeyOffer|repository'), [], `${name} reassigns or shadows an offer parameter`);
  }
  // runTurn hands the offers to buildTurn at exactly two calls, and every argument of both is on this list (no spread, no computed
  // value, no key: value besides the two renames).
  const HANDOVER_OK = new Set(['raw', 'slash', 'opening', 'canvas', 'block', 'store: current', 'states', 'inputModality', 'turnId: id', 'domain', 'nextStep', 'materials', 'research', 'journeyOffer', 'repository']);
  const calls = handovers(strip(source('./learn-tutor.js')));
  assert.equal(calls.length, 2, 'buildTurn is called twice in the Tutor, both from runTurn');
  for (const { text } of calls) {
    const given = entries(text).map(entry => entry.replace(/\s+/g, ' '));
    for (const entry of given) assert.ok(HANDOVER_OK.has(entry), `runTurn hands buildTurn an argument that is not on the allowlist: ${entry}`);
    for (const name of ['nextStep', 'materials', 'research', 'journeyOffer', 'repository']) assert.ok(given.includes(name), `runTurn hands buildTurn ${name} unchanged`);
  }

  // route(): every line that names an offer action or flag, or assigns the allowed list, reads only the row, the list and the turn's
  // four offer fields (HANDOFF_ACTION is the imported name of the handoff action type, a constant like the quoted names of the others).
  // Never the words, the constraints (statedConstraints feeds them) or the learner intent.
  const route = functionOf('./learn-tutor.js', 'export function route\\(');
  assert.equal(WORDS.test(route), false, 'route() reads the learner words');
  const OFFER_OK = new Set(['if', 'turn', 'available_materials', 'length', 'MATERIAL_FIXED', 'includes', 'row', 'list', 'research_offer', 'journey_offer', 'handoff_offer', 'HANDOFF_ACTION']);
  const offerLines = linesOf(route, /create_material|suggest_research|suggest_journey|available_materials|research_offer|journey_offer|handoff/i);
  assert.ok(offerLines.length >= 4, 'route() adds all four offers');
  for (const line of offerLines) assert.deepEqual(outside(line, OFFER_OK), [], `an offer line in route() reads more than the row and the turn's offer fields: ${line.trim()}`);
  // The list is otherwise built from the strategy row alone; noQuiz only removes ask_question there.
  const LIST_OK = new Set([...OFFER_OK, 'let', 'some', 'type', 'inHole', 'noQuiz', 'allowed', 'filter']);
  for (const line of linesOf(route, /\blist\s*=(?!=)/)) assert.deepEqual(outside(line, LIST_OK), [], `route() builds the allowed list from more than the row: ${line.trim()}`);

  // The page: turnOffers reads page state only, runTurn's call takes its offers from it alone, and no other code names an offer field.
  // Unscanned boundary (R8): LearnPage.jsx, Parallel's file, is where useTutor's repository and openResearch props are passed in. It
  // is neither scanned nor edited here, so this scan holds from those props onward; what the page hands them is Parallel's to review.
  const page = strip(source('./LearnTutor.jsx')), offers = functionOf('./LearnTutor.jsx', 'export function turnOffers\\(');
  const PAGE_OK = new Set(['export', 'function', 'turnOffers', 'journey', 'null', 'record', 'opening', 'false', 'nextStep', 'openResearch', 'const', 'setup', 'inJourneySetup', 'materials', 'materialCommands', 'research', 'journeyOffer', 'repository', 'start', 'return']);
  assert.deepEqual(outside(offers, PAGE_OK), [], 'turnOffers reads more than the page state');
  // The handoff flag's source: reads (the page's repository prop, else canvasRepository(app)) and canvasRepository read the app's data only.
  const reads = page.match(/const reads = [^\n]*;/)[0], repositoryOf = page.match(/export const canvasRepository = [^\n]*/)[0];
  assert.deepEqual(outside(reads, new Set(['const', 'reads', 'repository', 'canvasRepository', 'app'])), [], 'the handoff flag reads more than the app data');
  assert.deepEqual(outside(repositoryOf, new Set(['export', 'const', 'canvasRepository', 'app', 'typeof', 'name', 'startsWith', 'project'])), [], 'canvasRepository reads more than the app data');
  const call = page.match(/result = await runTurn\(\{[\s\S]*?\n\s*\}\);/)[0], at = call.match(/\.\.\.turnOffers\(\{[^\n]*\}\)/)[0];
  assert.deepEqual([...call.matchAll(/\.\.\.\s*([A-Za-z_$][\w$]*)/g)].map(m => m[1]).filter(name => !['common', 'turnOffers'].includes(name)), [], 'the runTurn call spreads something besides common and turnOffers');
  assert.deepEqual(outside(at, new Set(['turnOffers', 'journey', 'journeyRef', 'current', 'record', 'opening', 'nextStep', 'openResearch', 'repository', 'reads'])), [], 'the turnOffers call reads more than the page state');
  // An offer field is never a key anywhere on the page outside turnOffers, nor named in the runTurn call or in common (shorthand).
  const rest = page.replace(offers, '').replace(at, ''), common = page.match(/const common = \{[^;]*\};/)[0];
  assert.equal(/(?<=[{,]\s*)(?:journeyOffer|materials|research|repository)\s*:/.test(rest), false, 'an offer field is a key outside turnOffers');
  assert.deepEqual(idents(call.replace(at, '') + common).filter(id => ['journeyOffer', 'materials', 'research', 'repository'].includes(id)), [], 'an offer field is named in the runTurn call or in common');

  // Anywhere else the offers, the actions or the handoff are named, the same line never reads the words. On the worker side raw is
  // the HTTP body, so only the turn's own field names the learner's message there.
  const FOUR = /suggest_journey|suggest_research|create_material|handoff|journey_offer|research_offer|available_materials|journeyOffer|openResearch|\bresearch\s*:|\bmaterials\s*:/i;
  // Exempt: the two signatures, by exact name (their defaults are literals, asserted above), and learn-tutor.js's two buildTurn calls,
  // whose arguments are on the allowlist above (the rest of their lines is scanned). Nothing else: no other file may call buildTurn.
  const SIGNATURE = /^export function buildTurn\(\{|^export async function runTurn\(\{/;
  const scanned = [['./learn-tutor.js', WORDS], ['./learn-tutor-validate.js', WORDS], ['./learn-tutor-actions.js', WORDS], ['./LearnTutor.jsx', WORDS],
    ...['agents/learn-tutor.js', 'learn-tutor-routes.js', 'learn-tutor-handoff.js'].map(file => [`../../control-plane/src/${file}`, /raw_user_message/])];
  for (const [file, words] of scanned) {
    const code = strip(source(file));
    if (file !== './learn-tutor.js') assert.equal(/(?<!function )\bbuildTurn\(/.test(code), false, `${file} calls buildTurn; only runTurn may hand it the offers`);
    for (const line of linesOf(file === './learn-tutor.js' ? withoutHandovers(code) : code, FOUR).filter(line => !SIGNATURE.test(line))) assert.equal(words.test(line), false, `${file}: ${line.trim()}`);
  }
});
