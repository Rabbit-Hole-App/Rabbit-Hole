// Prompt clean-up (owner 2026-11-08): the author prompt is sectioned with Markdown headings; the planner's result is stated as fact under "# Visuals for this card" and the
// type / kind / count rules are appended only when there is no plan; "# Depth" carries the owner's depth paragraph; one function decides the card's visuals (the learner's
// named kinds, else the plan); the word heuristics run only without a plan; the planned kind steers references and the last-resort simplified diagram. Offline.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepareArtifactAuthorRequest, generateArtifact } from '../src/learn-artifact.js';
import { assembledSystem } from '../src/explanation-fast-chain.js';
import { planFromAnswers, cardVisuals, visualKinds, visualsStatement } from '../src/explanation-planner.js';
import { selectDiagramReferences } from '../src/explanation-references.js';
import { EXPLANATION_GUIDANCE, EXPLANATION_VISUAL_RULES } from '../src/learn-primitives.js';
import { EXPLANATION_DEPTH_LINES } from '../src/chat-depth.js';
import { deriveVisualRequirements } from '../src/explanation-visuals.js';
import { diagramFence } from './explanation-layout-fixture.js';

const FAST = { SMALL_ENV: 'test', EXPLANATION_MODEL_PROFILE: 'google-low', GEMINI_API_KEY: 'x', FIREWORKS_API_KEY: 'x', EXPLANATION_INTERACTIONS: 'true' };
const answers = (over = {}) => ({
  visualType: { choice: 'diagram', confidence: 0.95, probabilities: { diagram: 0.95, picture: 0.03, both: 0.02 } },
  kind: { choice: 'sequence', confidence: 0.8, probabilities: { sequence: 0.8, flow: 0.15, cycle: 0.05 } },
  depthTreatment: { choice: 'mechanism', confidence: 0.8, probabilities: {} },
  needsPlot: { noul: 0.05 }, isPhysical: { noul: 0.02 }, needsWorkedExample: { noul: 0.1 }, ...over,
});
const plan = (kind = 'sequence', over = {}) => ({ ...planFromAnswers(answers({ kind: { choice: kind, confidence: 0.9, probabilities: { [kind]: 0.9 } }, ...over })), ms: 150 });
const description = prepared => prepared.body.tools.find(t => t.name === 'make_explanation').description;
const quiet = async fn => { const log = console.log; const lines = []; console.log = line => lines.push(line); try { return { value: await fn(), lines }; } finally { console.log = log; } };
const model = card => async () => Response.json({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'c', name: 'make_explanation', input: card }] });
const chain = (title, labels) => diagramFence({ version: 1, diagram: { kind: 'flow', title, caption: `${labels[0]} comes first.`, nodes: labels.map((label, i) => ({ id: `n${i}`, label, role: i === labels.length - 1 ? 'outcome' : 'process' })), edges: labels.slice(1).map((_, i) => ({ from: `n${i}`, to: `n${i + 1}` })) } });
const drawn = body => JSON.parse(body.match(/```rh-diagram\n(.*)\n```/)[1]).diagram;
const HEADINGS = ['# Card layout', '# Numbers and maths', '# Diagram kinds and their fields', '# Depth', '# Visuals for this card', '# Examples', '# Output format'];

test('the author prompt is sectioned with the owner\'s headings, once each, in the cached-prefix order (static sections first, then the per-card ones, the references, the output format)', () => {
  for (const planned of [true, false]) {
    const prepared = prepareArtifactAuthorRequest(FAST, { command: 'explanation', args: 'What is the difference between underfitting and overfitting?', planned: true, ...(planned ? { plan: plan('comparison') } : {}) });
    const text = assembledSystem(prepared.body);
    assert.deepEqual(text.match(/^# .*$/gm), HEADINGS, planned ? 'planned' : 'unplanned');
    assert.ok(text.indexOf('You make exactly one learning artifact') < text.indexOf('# Card layout'), 'the system head comes first');
  }
});

test('a planned card has its visuals stated as fact and no type / kind / count rules; no plan, or planner "rules", puts the rules block under the same heading', () => {
  const args = 'How does the TCP handshake work?';
  const planned = description(prepareArtifactAuthorRequest(FAST, { command: 'explanation', args, planned: true, plan: plan() }));
  assert.ok(planned.includes("# Visuals for this card\nThis card's visuals: 1) a sequence diagram. Depth treatment: mechanism."));
  assert.ok(!planned.includes('Choose visuals in this order') && !planned.includes('3) Count:'));
  const both = description(prepareArtifactAuthorRequest(FAST, { command: 'explanation', args, planned: true, plan: plan('flow', { visualType: { choice: 'both' } }) }));
  assert.ok(both.includes("This card's visuals: 1) a picture; 2) a flow diagram."));
  for (const input of [{ planned: true }, { planned: true, plan: { ...plan(), planner: 'rules' } }, {}]) {
    const rules = description(prepareArtifactAuthorRequest(FAST, { command: 'explanation', args, ...input }));
    assert.ok(rules.includes('# Visuals for this card\nChoose visuals in this order. 1) Type:') && rules.includes('3) Count:'), JSON.stringify(Object.keys(input)));
    assert.ok(!rules.includes("This card's visuals"));
  }
  assert.ok(!JSON.stringify(prepareArtifactAuthorRequest(FAST, { command: 'explanation', args, planned: true, plan: plan() }).messages).includes('cardPlan'), 'the plan is no longer in the user message');
});

test('# Depth: the shared line, this Depth\'s paragraph and the precision hint, the 450 budget, and neither of the other two paragraphs; the old objective sentences are gone', () => {
  const L = EXPLANATION_DEPTH_LINES;
  for (const depth of ['brief', 'balanced', 'detailed']) {
    const text = description(prepareArtifactAuthorRequest(FAST, { command: 'explanation', args: 'What is Gini impurity?', planned: true, plan: plan('coordinate-plot'), ...(depth === 'balanced' ? {} : { depth }) }));
    const section = text.slice(text.indexOf('# Depth\n'), text.indexOf('# Visuals for this card'));
    assert.ok(section.includes(L.shared) && section.includes(L[depth]) && section.includes(L.hint), depth);
    for (const other of ['brief', 'balanced', 'detailed'].filter(d => d !== depth)) assert.ok(!text.includes(L[other]), `${depth}: not the ${other} paragraph`);
    assert.ok(section.includes('at most 450 characters of prose'), 'the budget is as before');
    assert.ok(!/Depth: (Brief|Balanced|Detailed)\./.test(text), 'the old objective sentence is gone');
  }
  assert.ok(EXPLANATION_DEPTH_LINES.brief.startsWith('**Brief** — Written for someone meeting the subject for the first time.'));
  assert.ok(EXPLANATION_DEPTH_LINES.detailed.includes('Add the one or two properties, limits or failure modes that matter in practice.'));
});

test('the arm-E Depth-precedence sentence is gone from the guidance and from the rules block', () => {
  for (const text of [EXPLANATION_GUIDANCE, EXPLANATION_VISUAL_RULES]) assert.doesNotMatch(text, /follows the depth|plain depth treatment/);
  assert.match(EXPLANATION_VISUAL_RULES, /flow otherwise, a straight chain included/, 'the rest of the kind rule is kept');
});

test('# Numbers and maths holds the one number rule (with its computed-from-a-formula clause) and the maths lines, once, and nothing duplicates them in the system head', () => {
  const text = assembledSystem(prepareArtifactAuthorRequest(FAST, { command: 'explanation', args: 'What is Gini impurity?', planned: true, plan: plan('coordinate-plot') }).body);
  const section = text.slice(text.indexOf('# Numbers and maths'), text.indexOf('# Diagram kinds'));
  assert.ok(section.includes('values you compute exactly from a formula the prose states, labelled \'worked example\'') && section.includes('Write every mathematical expression as LaTeX') && section.includes('Maths in any label, heading or item'));
  assert.equal(text.split('Never invent measurements, statistics or data').length - 1, 1);
  assert.equal(text.split('Write every mathematical expression as LaTeX').length - 1, 1);
});

test('one source of truth for the visuals: the learner\'s named kinds override the plan, else the plan, else the rules', () => {
  const sequence = plan('sequence');
  assert.deepEqual(cardVisuals(sequence, []), { source: 'plan', visuals: sequence.visuals });
  assert.deepEqual(cardVisuals(null, []), { source: 'rules', visuals: [] });
  assert.deepEqual(cardVisuals({ ...sequence, planner: 'rules' }, []).source, 'rules');
  const timeline = deriveVisualRequirements('Show a timeline diagram of the Roman Empire').items;
  assert.deepEqual(cardVisuals(sequence, timeline), { source: 'required', visuals: [{ type: 'diagram', kind: 'timeline' }] });
  assert.deepEqual(visualKinds(cardVisuals(sequence, timeline)), ['timeline']);
  const unnamed = deriveVisualRequirements('Show a diagram of the handshake').items;
  assert.deepEqual(cardVisuals(sequence, unnamed).visuals, [{ type: 'diagram', kind: 'sequence' }], 'a diagram with no named kind takes the plan\'s kind');
  assert.deepEqual(cardVisuals(sequence, deriveVisualRequirements('Show a picture of a volcano').items).visuals, [{ type: 'picture' }]);
  assert.deepEqual(visualKinds(cardVisuals(plan('flow', { kind: { choice: 'flow', confidence: 0.4, probabilities: { flow: 0.4, relationship: 0.35 } } }), [])), ['flow', 'relationship']);
  assert.equal(visualsStatement(sequence, cardVisuals(null, [])), null);
  const prepared = prepareArtifactAuthorRequest(FAST, { command: 'explanation', args: 'Show a timeline diagram of the Roman Empire', planned: true, plan: sequence, visualRequirements: deriveVisualRequirements('Show a timeline diagram of the Roman Empire') });
  assert.ok(description(prepared).includes('1) a timeline diagram') && !description(prepared).includes('a sequence diagram'), 'the request states the learner\'s kind');
  assert.ok(prepared.body.system.includes('Shape example for a timeline diagram'), 'and the shape example follows it');
});

test('one log line per card says which source decided the visuals', async () => {
  const env = { SMALL_ENV: 'test', EXPLANATION_PLANNER: 'jev', TYPESAFE_API_KEY: 'k' }, realFetch = globalThis.fetch;
  const card = { title: 'T', visuals: [], body: 'x' };
  const winners = async (args, extra = {}) => (await quiet(() => generateArtifact(env, { command: 'explanation', args, ...extra }, { callModel: model(card), repairs: 1 }))).lines
    .map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(l => l?.event === 'explanation_visuals_source');
  try {
    globalThis.fetch = async () => Response.json({ answers: answers() });
    assert.deepEqual((await winners('How does the TCP handshake work?')).map(l => [l.winner, l.kinds, l.heuristics]), [['plan', ['sequence'], 'off']], 'one line however many author calls');
    const requirements = deriveVisualRequirements('Show a timeline diagram of the Roman Empire');
    assert.deepEqual((await winners('Show a timeline diagram of the Roman Empire', { visualRequirements: requirements })).map(l => [l.winner, l.kinds]), [['required', ['timeline']]]);
    globalThis.fetch = async () => new Response('x', { status: 500 });
    assert.deepEqual((await winners('How does the TCP handshake work?')).map(l => [l.winner, l.kinds, l.heuristics]), [['rules', [], 'on']]);
  } finally { globalThis.fetch = realFetch; }
});

test('the 6a / 6b word heuristics run only without a plan: repeat words keep a planned flow a flow, and an implied picture is not required of a planned card', async () => {
  const water = { title: 'How the water cycle works', body: `The sun heats water so it rises as vapour, then falls again as rain.\n\n${chain('The water cycle', ['Evaporation', 'Condensation', 'Precipitation', 'Collection'])}\n\nThe collected water evaporates once more.` };
  const flowPlan = { ...plan('flow'), visuals: [{ type: 'diagram', kind: 'flow' }], kind: 'flow' };
  const ask = (args, card, input) => quiet(() => generateArtifact({}, { command: 'explanation', args, ...input }, { callModel: model(card), repairs: 0 })).then(r => r.value);
  assert.equal(drawn((await ask('How does the water cycle work?', water, { planned: true })).block.body).kind, 'cycle', 'no plan: 6a re-routes the chain');
  assert.equal(drawn((await ask('How does the water cycle work?', water, { planned: true, plan: flowPlan })).block.body).kind, 'flow', 'planned: left as drawn');
  const question = 'What does a neuron look like?', requirements = deriveVisualRequirements(question);
  assert.equal(requirements.items[0].implied, true);
  assert.notEqual((await ask(question, water, { planned: true, visualRequirements: requirements })).result, 'artifact', 'no plan: 6b asks for the picture');
  assert.equal((await ask(question, water, { planned: true, plan: flowPlan, visualRequirements: requirements })).result, 'artifact', 'planned: the planner decides the pictures');
});

test('the last-resort simplified diagram takes the planned kind (flow, cycle or sequence; any other kind a flow), the words only without a plan', async () => {
  const broken = { kind: 'flow', title: 'Water on the move', nodes: [{ id: 'e', label: 'Evaporation', role: 'process' }, { id: 'c', label: 'Condensation', role: 'process' }, { id: 'r', label: 'Rain', role: 'process' }], edges: [{ from: 'e', to: 'nowhere' }] };
  const card = { title: 'Water on the move', body: `Water evaporates, condenses and falls as rain.\n\n${diagramFence({ version: 1, diagram: broken })}\n\nThen the water gathers again.` };
  const ask = async (args, input) => { const out = (await quiet(() => generateArtifact({}, { command: 'explanation', args, ...input }, { callModel: model(card) }))).value; assert.equal(out.block?.visualFallback, 'simplified', JSON.stringify(out).slice(0, 200)); return drawn(out.block.body).kind; };
  const planOf = kind => ({ ...plan(kind), visuals: [{ type: 'diagram', kind }], kind });
  assert.equal(await ask('How does water move?', { planned: true }), 'flow', 'no plan, no repeat words: a flow');
  assert.equal(await ask('Why does the water cycle repeat?', { planned: true }), 'cycle', 'no plan: the words say cycle');
  assert.equal(await ask('Why does the water cycle repeat?', { planned: true, plan: planOf('flow') }), 'flow', 'planned flow beats the repeat words');
  assert.equal(await ask('How does water move?', { planned: true, plan: planOf('cycle') }), 'cycle', 'planned cycle without any repeat word');
  assert.equal(await ask('How does water move?', { planned: true, plan: planOf('tree') }), 'flow', 'a planned kind the simplifier cannot draw: a flow');
});

test('reference selection filters to the planned kinds before any keyword scoring', () => {
  // the Codex fit-quality reference now answers 'underfitting and overfitting' alone, so the prompt names both the fit and the tree
  const prompt = 'What is overfitting and how does pruning a tree fix it?', all = selectDiagramReferences({ prompt });
  assert.ok(all.length > 1 && new Set(all.map(r => r.spec.diagram.kind)).size > 1, 'unfiltered, more than one kind is offered');
  const trees = selectDiagramReferences({ prompt, plannedKinds: ['tree'] });
  assert.ok(trees.length && trees.every(r => r.spec.diagram.kind === 'tree'));
  assert.deepEqual(selectDiagramReferences({ prompt, plannedKinds: ['sequence'] }), [], 'nothing of the planned kind matches the topic');
  const two = selectDiagramReferences({ prompt, plannedKinds: all.map(r => r.spec.diagram.kind) });
  assert.deepEqual(two.map(r => r.id), all.map(r => r.id), 'every offered kind kept: the same picks');
});

test('owner 2026-11-08 decisions: "Be factual: leave out exact numbers..." is gone, its never-invent half is its own line under "# Numbers and maths", and the per-card part starts with the transition line', () => {
  assert.ok(!EXPLANATION_GUIDANCE.includes('Be factual') && !EXPLANATION_GUIDANCE.includes('leave out exact numbers'));
  const numbers = EXPLANATION_GUIDANCE.slice(EXPLANATION_GUIDANCE.indexOf('# Numbers and maths'), EXPLANATION_GUIDANCE.indexOf('# Diagram kinds and their fields'));
  assert.ok(numbers.includes('Never invent the name of an object, tool, part, person or source; state only what you are certain is standard knowledge or what the request supplies.'));
  const d = description(prepareArtifactAuthorRequest(FAST, { command: 'explain', args: 'how does the TCP handshake work?', depth: 'balanced', plan: plan() }));
  const transition = 'Based on the rules above, this card:';
  assert.equal(d.split(transition).length, 2, 'once');
  assert.ok(d.indexOf('# Numbers and maths') < d.indexOf(transition) && d.indexOf(transition) < d.indexOf('# Depth') && d.indexOf('# Depth') < d.indexOf('# Visuals for this card'));
});
