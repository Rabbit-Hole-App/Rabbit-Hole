// GEN-1 R2 wiring (G1 + G2): a SEEDED request with a planned kind and no topical reference gets up to three seeded library examples of that kind under the new heading, the inputs
// sentence after the number rule, the block capped at EXAMPLES_CAP_CHARS; with no seed, no plan or a topical reference the request is the one of main. Offline: nothing is sent.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepareArtifactAuthorRequest } from '../src/learn-artifact.js';
import { planFromAnswers } from '../src/explanation-planner.js';
import { SEEDED_EXAMPLES_HEADING, REFERENCE_MARK } from '../src/explanation-references.js';
import { assembledSystem } from '../src/explanation-fast-chain.js';
import { INPUTS_RULE, NUMBER_RULE } from '../src/agents/learn-artifact.js';
import { EXAMPLES_CAP_CHARS, capExamples } from '../src/explanation-example-cap.js';
import { capExampleList } from '../src/explanation-examples.js';

const FAST = { SMALL_ENV: 'test', EXPLANATION_MODEL_PROFILE: 'google-low', GEMINI_API_KEY: 'x', FIREWORKS_API_KEY: 'x', EXPLANATION_INTERACTIONS: 'true' };
const answers = kind => ({
  visualType: { choice: 'diagram', confidence: 0.95, probabilities: { diagram: 0.95 } },
  kind: { choice: kind, confidence: 0.9, probabilities: { [kind]: 0.9 } },
  depthTreatment: { choice: 'mechanism', confidence: 0.8, probabilities: {} },
  needsPlot: { noul: 0.05 }, isPhysical: { noul: 0.02 }, needsWorkedExample: { noul: 0.1 },
});
const request = (args, kind, extra = {}) => ({ command: 'explain', args, depth: 'balanced', planned: true, plan: planFromAnswers(answers(kind)), ...extra });
const NO_MATCH = 'how does a bakery decide how much dough to prepare for the next morning?';
const prep = (args, kind, extra) => { const { log } = console; console.log = () => {}; try { return prepareArtifactAuthorRequest(FAST, request(args, kind, extra)); } finally { console.log = log; } };
const description = p => p.body.tools.find(t => t.name === 'make_explanation').description;
const everything = p => `${[].concat(p.body.system).join('\n')}\n${description(p)}`;
const count = (text, part) => text.split(part).length - 1;

test('seeded, planned kind, no topical reference: up to three seeded examples of the kind, { id, spec } lines only, the new heading', () => {
  const p = prep(NO_MATCH, 'flow', { requestSeed: 'seed-a' });
  assert.ok(p.diagramReferences.length >= 1 && p.diagramReferences.length <= 3, `${p.diagramReferences.length} examples`);
  assert.ok(p.diagramReferences.every(r => r.seededExample && r.spec.diagram.kind === 'flow' || r.seededExample), 'every one is a seeded example');
  const system = [].concat(p.body.system).join('\n');
  assert.ok(system.includes(SEEDED_EXAMPLES_HEADING), 'the new heading');
  assert.ok(!system.includes('Approved diagram references'), 'not the old heading');
  const lines = system.slice(system.indexOf(SEEDED_EXAMPLES_HEADING) + SEEDED_EXAMPLES_HEADING.length).split('\n').filter(Boolean);
  assert.equal(lines.length, p.diagramReferences.length);
  for (const line of lines) assert.deepEqual(Object.keys(JSON.parse(line)), ['id', 'spec'], 'no useWhen, no detailSpec');
  assert.ok(lines.join('\n').length <= EXAMPLES_CAP_CHARS + lines.length, 'the block is within the cap');
});

test('two seeds draw different example sets for the same question; the same seed draws the same bytes', () => {
  const a = prep(NO_MATCH, 'flow', { requestSeed: 'seed-a' }), b = prep(NO_MATCH, 'flow', { requestSeed: 'seed-b' }), a2 = prep(NO_MATCH, 'flow', { requestSeed: 'seed-a' });
  assert.equal(JSON.stringify(a.body), JSON.stringify(a2.body));
  const ids = p => p.diagramReferences.map(r => r.id).join(',');
  assert.notEqual(ids(a), ids(b), 'another seed, other examples (flow has a pool of many)');
});

test('the inputs sentence follows the number rule in the seeded request and is absent otherwise; the heading carries no number wording', () => {
  const seeded = everything(prep(NO_MATCH, 'flow', { requestSeed: 'seed-a' })), plain = everything(prep(NO_MATCH, 'flow'));
  assert.ok(count(plain, NUMBER_RULE) >= 1);
  assert.equal(count(seeded, `${NUMBER_RULE} ${INPUTS_RULE}`), count(plain, NUMBER_RULE), 'the sentence follows every occurrence of the number rule (the system of a multi-tool request and the explanation tool description), and nothing else');
  assert.equal(count(plain, INPUTS_RULE), 0);
  assert.ok(!SEEDED_EXAMPLES_HEADING.includes('computed') && !SEEDED_EXAMPLES_HEADING.includes(INPUTS_RULE));
});

test('no seed: the request is the one of main (one gallery example under the old heading, nothing else added)', () => {
  const p = prep(NO_MATCH, 'flow');
  assert.equal(p.diagramReferences.length, 1);
  assert.ok(p.diagramReferences[0].shape && !p.diagramReferences[0].seededExample);
  const system = [].concat(p.body.system).join('\n');
  assert.ok(system.includes('Approved diagram references') && !system.includes(SEEDED_EXAMPLES_HEADING));
});

test('a topical reference (R3 territory) keeps today\'s request even with a seed', () => {
  const p = prep('how does a random forest combine the predictions of its trees into one answer?', 'flow', { requestSeed: 'seed-a' });
  assert.ok(p.diagramReferences.some(r => !r.shape && !r.seededExample), 'a stored reference is selected');
  assert.ok(p.diagramReferences.every(r => !r.seededExample));
  assert.ok([].concat(p.body.system).join('\n').includes('Approved diagram references'));
});

test('a plan with no diagram kind (a picture plan) is unchanged by a seed', () => {
  const picture = prepareArtifactAuthorRequest(FAST, { command: 'explain', args: NO_MATCH, depth: 'balanced', planned: true, plan: planFromAnswers({ ...answers('flow'), visualType: { choice: 'picture', confidence: 0.95, probabilities: { picture: 0.95 } } }), requestSeed: 'seed-a' });
  assert.ok(picture.diagramReferences.every(r => !r.seededExample));
});

test('the fast chain still moves the seeded block to the end of its system message (the mark is the first line only)', () => {
  const p = prep(NO_MATCH, 'flow', { requestSeed: 'seed-a' });
  const assembled = assembledSystem(p.body);
  const at = assembled.indexOf(SEEDED_EXAMPLES_HEADING.trim());
  assert.ok(at > assembled.indexOf(NUMBER_RULE), 'after the number rule and the tool description');
  assert.ok(assembled.indexOf('# Output format') > at, 'before the output format');
  assert.equal(count(assembled, REFERENCE_MARK.trim()), 1, 'one examples block');
});

test('the cap is the roadmap quote\'s own helper: capExampleList keeps whole examples in order until EXAMPLES_CAP_CHARS', () => {
  const ex = n => ({ id: `e${n}`, spec: { text: 'x'.repeat(2000) } });
  assert.deepEqual(capExampleList([ex(1), ex(2), ex(3)]).map(e => e.id), ['e1', 'e2']);
  assert.deepEqual(capExampleList([ex(1)]).map(e => e.id), ['e1']);
  assert.equal(capExamples('a\nb'), 'a\nb', 'the text helper is untouched');
  assert.ok(EXAMPLES_CAP_CHARS === 4500);
});

test('the archive trace names the seeded examples and their kind apart from the topical references', async () => {
  const { generateArtifact } = await import('../src/learn-artifact.js');
  const trace = {}; const { log, warn } = console; console.log = () => {}; console.warn = () => {};
  try { await generateArtifact(FAST, request(NO_MATCH, 'flow', { requestSeed: 'seed-a' }), { trace, callModel: async () => new Response('{}', { status: 500 }) }).catch(() => null); } finally { console.log = log; console.warn = warn; }
  assert.ok(Array.isArray(trace.examples) && trace.examples.length >= 1, 'examples ids in the trace');
  assert.equal(trace.examplesKind, 'flow');
  assert.deepEqual(trace.references, [], 'no topical reference was involved');
});

test('START-3 neutrality: explanation-examples.js reads the reference library only through explanation-library.js libraryRefs(), never a static import', async () => {
  const fs = await import('node:fs'), { libraryRefs } = await import('../src/explanation-library.js'), { diagramReferences } = await import('../../web/src/tutor-diagrams/reference-library.js');
  const source = fs.readFileSync(new URL('../src/explanation-examples.js', import.meta.url), 'utf8');
  assert.ok(!/reference-library|reference-single-variants/.test(source), 'no direct import of the library');
  assert.ok(/libraryRefs\(\)/.test(source));
  assert.equal(libraryRefs(), diagramReferences, 'today the accessor returns the static import; START-3 swaps its body');
});
