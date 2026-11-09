// E1 (docs/features/explain.md section 5 "Required visual contract", EXP-12-C02/C03 offline half, EXP-06-C03, E-B1): explicit table and diagram requests are read on the
// server, bound to the author request, enforced on the final card at every Depth and saved with the card. Every reply goes through the production validator
// (generateArtifact / artifactFetch); no prebuilt success block stands in for the generator. Offline: no provider is called.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveVisualRequirements, repeats, requiredMix, requiredVisualProblem, requirementText, danglingFigureProblem } from '../src/explanation-visuals.js';
import { EXPLANATION_GUIDANCE, chainsAsCycles, markdownVisuals, explanationProseChars, simplifiedDiagram } from '../src/learn-primitives.js';
import { artifactFetch, generateArtifact, prepareArtifactAuthorRequest } from '../src/learn-artifact.js';
import { generateRoadmapCard } from '../src/roadmap/roadmap-generate.js';
import { EXPLANATION_BUDGET } from '../src/chat-depth.js';
import { cycleSpec, diagramFence, illustrationFence } from './explanation-layout-fixture.js';
import { tutorDiagramJsonSchema } from '../../web/src/tutor-diagrams/spec.js';

const EX01 = 'Why does coffee cool faster at first? Include a small table comparing early and late cooling.';
const FLOW_REQUEST = 'Show a flowchart for this toy rule: if age is under 30, check whether income is over $50,000; yes means Approve and no means Deny. Otherwise, Check credit score. Trace a 25-year-old earning $60,000.';

const TABLE = '| Phase | Gap to the room | Cooling rate |\n| --- | --- | --- |\n| Early | Large | Fast |\n| Late | Small | Slow |';
const prose = 'A hot cup loses heat faster at first because the gap between the coffee and the room is largest then; the gap shrinks as it cools, so the rate falls.';
// EXP-13: every new card has a visual between prose; a table sits inside prose and is not one. COOLING is the visual these cards share.
const COOLING = diagramFence(cycleSpec('Why coffee cools'));
const AFTER = 'So the rate falls as the coffee nears room temperature.';
const withTable = { title: 'Why coffee cools fast at first', body: `${prose}\n\n${TABLE}\n\n${COOLING}\n\n${AFTER}` };
// The same card without the table the learner may ask for (its diagram is not a table).
const proseOnly = { title: 'Why coffee cools fast at first', body: `${prose}\n\n${COOLING}\n\n${AFTER}` };
const diagram = spec => `\`\`\`rh-diagram\n${JSON.stringify({ version: 1, diagram: spec })}\n\`\`\``;
const flowSpec = { kind: 'flow', title: 'Toy approval rule', caption: 'A 25-year-old earning $60,000 takes Yes, then Yes, and is approved.', nodes: [
  { id: 'age', label: 'Age under 30?', role: 'decision' }, { id: 'inc', label: 'Income over $50k?', role: 'decision' }, { id: 'ok', label: 'Approve', role: 'outcome' }, { id: 'no', label: 'Deny', role: 'outcome' }, { id: 'cs', label: 'Check credit score', role: 'outcome' }],
  edges: [{ from: 'age', to: 'inc', label: 'Yes' }, { from: 'age', to: 'cs', label: 'No' }, { from: 'inc', to: 'ok', label: 'Yes' }, { from: 'inc', to: 'no', label: 'No' }],
  highlightPath: ['age', 'inc', 'ok'] }; // E3: the worked route the request asks to trace
const withFlow = { title: 'The approval rule', body: `The rule asks about age first, then income. The 25-year-old earning $60,000 answers Yes to both questions and is approved.\n\n${diagram(flowSpec)}\n\nSo the rule ends at Approve.` };

// A provider double: each call answers the next scripted explanation input and records the request body.
const scripted = (...inputs) => { const seen = []; return { seen, callModel: async (env, body) => { seen.push(body); return Response.json({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: `c${seen.length}`, name: 'make_explanation', input: inputs[Math.min(seen.length, inputs.length) - 1] }] }); } }; };
const generate = async (text, inputs, over = {}) => { const m = scripted(...inputs); const requirements = deriveVisualRequirements(text);
  const out = await generateArtifact({}, { command: 'explanation', args: text, ...(requirements.items?.length ? { visualRequirements: requirements } : {}), ...over }, { callModel: m.callModel }); return { out, m }; };
const quiet = async fn => { const log = console.log; console.log = () => {}; try { return await fn(); } finally { console.log = log; } };

test('EX-01 and the explicit flowchart variant produce their required records, with variations, and not-a-request wording produces none', () => {
  assert.deepEqual(deriveVisualRequirements(EX01).items.map(i => [i.id, i.kind]), [['vr-1', 'table']]);
  const ex07 = deriveVisualRequirements(FLOW_REQUEST);
  assert.deepEqual(ex07.items.map(i => [i.kind, i.diagramKind]), [['diagram', 'flow']]);
  assert.equal(ex07.version, 1);
  for (const q of ['Compare bubble sort and merge sort in a table', 'Put the planets in a table form, please', 'Give me a truth table for XOR and explain it', 'Explain gradient descent and tabulate the learning rates']) assert.equal(deriveVisualRequirements(q).items[0]?.kind, 'table', q);
  for (const q of ['Draw a flowchart of how a request reaches a server', 'Explain TCP with a sequence diagram', 'Show the water cycle as a cycle diagram', 'Explain budgeting with a bar chart of three costs']) assert.equal(deriveVisualRequirements(q).items[0]?.kind, 'diagram', q);
  assert.equal(deriveVisualRequirements('Explain TCP with a sequence diagram').items[0].diagramKind, 'sequence');
  assert.equal(deriveVisualRequirements('Explain TCP with a diagram').items[0].diagramKind, undefined, 'a plain "diagram" asks for any supported kind');
  assert.deepEqual(deriveVisualRequirements('Explain recursion, with a table and a flowchart').items.map(i => i.kind), ['table', 'diagram']);
  for (const q of ['Why is the sky blue?', 'Explain the periodic table', 'Explain this without a table', 'No diagram please, just prose', 'How do restaurants assign each table?', 'Explain what a hash table does']) assert.deepEqual(deriveVisualRequirements(q).items, [], q);
  assert.match(deriveVisualRequirements('Explain voting with a pie chart').unsupported, /pie chart/);
  assert.match(deriveVisualRequirements('Show a venn diagram of cats and dogs').unsupported, /venn diagram/);
  assert.equal(deriveVisualRequirements('Explain it, no venn diagram').unsupported, undefined);
  assert.equal(requirementText({ args: 'a', original: 'b', revisions: [{ text: 'c' }, 'd'] }), 'a\nb\nc\nd');
});

test('EX-01 at every Depth: the early/late table is required, present succeeds inside the cap, omitted or malformed fails with a stable reason', async () => {
  for (const depth of ['overview', 'standard', 'deep']) {
    const ok = await generate(EX01, [withTable], { depth });
    assert.equal(ok.out.result, 'artifact', depth);
    assert.equal(ok.out.block.visualRequirements.items[0].satisfied, true);
    assert.ok(explanationProseChars(ok.out.block) <= EXPLANATION_BUDGET.hard, depth);
    assert.equal(markdownVisuals(ok.out.block.body).tables.length, 1);
    assert.equal(ok.m.seen.length, 1, 'a card that has its table needs no repair');
    // The author reads the server-derived requirement in the same request that is dispatched, and the guidance no longer says "optional at every Depth".
    assert.match(ok.m.seen[0].messages[0].content, /"requiredVisuals":\[\{"id":"vr-1","kind":"table"/);
    assert.match(ok.m.seen[0].tools[0].description, /Fulfill every entry of requiredVisuals in the request at every Depth, including Overview/);
    // Omitted: the one direct repair is spent, then a truthful validation error. Never a prose-only success.
    const omitted = await quiet(() => generate(EX01, [proseOnly], { depth }));
    assert.equal(omitted.out.result, 'validation_error', depth);
    assert.match(omitted.out.error, /^required_visual_missing:/);
    assert.equal(omitted.m.seen.length, 2, 'author plus the one repair');
    // The repair message carries the reason, so a fixed second answer is delivered.
    const fixed = await quiet(() => generate(EX01, [proseOnly, withTable], { depth }));
    assert.deepEqual([fixed.out.result, fixed.out.repaired], ['artifact', true]);
  }
  // A malformed table (no separator row, ragged rows, empty body) is invalid, not missing.
  for (const bad of ['| Phase | Rate |\n| Early | Fast |', '| Phase | Rate |\n| --- | --- |', '| Phase | Rate |\n| --- | --- |\n| Early |', '| | Rate |\n| --- | --- |\n| Early | Fast |']) {
    const r = await quiet(() => generate(EX01, [{ title: 'T', body: `${prose}\n\n${bad}\n\n${COOLING}\n\n${AFTER}` }]));
    assert.equal(r.out.result, 'validation_error', bad);
    assert.match(r.out.error, /^required_visual_invalid:/, bad);
  }
  // A table in a SAVED card's collapsed section still satisfies the requirement (saved content keeps reading); a new card has no sections (EXP-13, decision C1).
  assert.equal(requiredVisualProblem({ title: 'T', body: prose, more: [{ label: 'Compare', text: TABLE }] }, deriveVisualRequirements(EX01)), null);
  const inSection = await quiet(() => generate(EX01, [{ ...proseOnly, more: [{ label: 'Compare', text: TABLE }] }]));
  assert.equal(inSection.out.result, 'validation_error', 'a new card with a folded section is refused');
  // Without a request for one, a card without a table is a success at every Depth, and carries no record.
  for (const depth of ['overview', 'standard', 'deep']) { const r = await generate('Why does coffee cool faster at first?', [proseOnly], { depth }); assert.equal(r.out.result, 'artifact'); assert.equal('visualRequirements' in r.out.block, false); assert.doesNotMatch(r.m.seen[0].messages[0].content, /requiredVisuals/); }
});

test('over-budget output fails exactly one code point over the 700 hard limit; the table and the diagram do not count (EXP-13)', async () => {
  const fits = n => ({ title: 'T', body: `${'x'.repeat(n)}\n\n${TABLE}\n\n${COOLING}\n\n${AFTER}` });
  const room = EXPLANATION_BUDGET.hard - AFTER.length - 1; // the two prose parts join with one space
  const exact = await generate(EX01, [fits(room)], { depth: 'overview' });
  assert.equal(explanationProseChars(exact.out.block), EXPLANATION_BUDGET.hard);
  assert.equal(exact.out.result, 'artifact');
  assert.match(exact.m.seen[0].tools[0].description, new RegExp(`at most ${EXPLANATION_BUDGET.target} characters of prose`), 'the author is asked for the 600 target');
  const over = await quiet(() => generate(EX01, [fits(room + 1)], { depth: 'overview' }));
  assert.equal(over.out.result, 'validation_error');
  assert.match(over.out.error, /explanation_over_budget/);
});

test('EX-07 explicit flowchart variant: a valid flow with Yes/No branches and outcomes is delivered and saved; omitted, invalid, wrong-kind or Yes/No-less diagrams fail', async () => {
  const ok = await generate(FLOW_REQUEST, [withFlow]);
  assert.equal(ok.out.result, 'artifact');
  assert.deepEqual(ok.out.block.visualRequirements.items.map(i => [i.kind, i.diagramKind, i.satisfied]), [['diagram', 'flow', true]]);
  assert.deepEqual(JSON.parse(JSON.stringify(ok.out.block)), ok.out.block, 'the saved block survives a save/read round trip unchanged');
  // An illustration is a visual but not a diagram: the card has its visual, the learner's diagram is still missing.
  const missing = await quiet(() => generate(FLOW_REQUEST, [{ title: 'T', body: `The 25-year-old is approved.\n\n${illustrationFence({ caption: 'The 25-year-old approved', alt: 'An approved applicant' })}\n\nThat is the result.` }]));
  assert.match(missing.out.error, /required_visual_missing:/); // the picture is not the asked mix, so the server drops it (owner review 2026-11-08)
  const unclosed = await quiet(() => generate(FLOW_REQUEST, [{ title: 'T', body: `Approved.\n\n\`\`\`rh-diagram\n${JSON.stringify({ version: 1, diagram: flowSpec })}` }]));
  assert.equal(unclosed.out.result, 'validation_error');
  assert.match(unclosed.out.error, /required_visual_invalid:/);
  const badTopology = await quiet(() => generate(FLOW_REQUEST, [{ title: 'T', body: `Approved.\n\n${diagram({ ...flowSpec, edges: [{ from: 'age', to: 'nowhere', label: 'Yes' }] })}` }]));
  assert.equal(badTopology.out.result, 'validation_error');
  assert.match(badTopology.out.error, /required_visual_invalid:/, 'an invalid required diagram is never silently dropped');
  const wrongKind = await quiet(() => generate(FLOW_REQUEST, [{ title: 'T', body: `Approved.\n\n${diagram({ kind: 'timeline', title: 'Steps', events: [{ time: 'Now', label: 'Check age' }, { time: 'Then', label: 'Check income' }] })}` }]));
  assert.match(wrongKind.out.error, /asked for a flow diagram.*is a timeline/);
  const noBranches = await quiet(() => generate(FLOW_REQUEST, [{ title: 'T', body: `Approved.\n\n${diagram({ kind: 'flow', title: 'Steps', nodes: [{ id: 'a', label: 'Start', role: 'process' }, { id: 'b', label: 'Approve', role: 'outcome' }], edges: [{ from: 'a', to: 'b' }], highlightPath: ['a', 'b'] })}` }]));
  assert.match(noBranches.out.error, /Yes and No branches/);
  // E3: the request says "Trace ...", so a caption alone is not enough: the flow needs its validated highlightPath.
  const { highlightPath: _route, ...unmarked } = flowSpec;
  const noRoute = await quiet(() => generate(FLOW_REQUEST, [{ title: 'T', body: `Approved.

${diagram(unmarked)}

So the rule approves.` }]));
  assert.equal(noRoute.out.result, 'validation_error');
  assert.match(noRoute.out.error, /^required_visual_invalid: .*highlightPath/);
  assert.deepEqual(deriveVisualRequirements(FLOW_REQUEST).items[0].trace, true);
  assert.equal(deriveVisualRequirements('Show a flowchart of how a request is handled').items[0].trace, undefined, 'no trace wording, no route required');
  const badRoute = await quiet(() => generate(FLOW_REQUEST, [{ title: 'T', body: `Approved.

${diagram({ ...flowSpec, highlightPath: ['age', 'ok'] })}

So the rule approves.` }]));
  assert.match(badRoute.out.error, /required_visual_invalid:/, 'a route that is not on existing edges is an invalid diagram');
  // Standard EX-07 with a Tutor-style zero repair is one call and the same refusal.
  const m = scripted({ title: 'T', body: 'Approved.' });
  const zero = await quiet(() => generateArtifact({}, { command: 'explanation', args: FLOW_REQUEST, visualRequirements: deriveVisualRequirements(FLOW_REQUEST) }, { callModel: m.callModel, repairs: 0 }));
  assert.deepEqual([zero.result, m.seen.length], ['validation_error', 1]);
});

test('tree-diagram wording of the EX-07 rule requires an actual tree with labelled branches and its traced route', async () => {
  const request = FLOW_REQUEST.replace('flowchart', 'tree diagram');
  const spec = { kind: 'tree', layout: 'binary', title: flowSpec.title, caption: flowSpec.caption,
    nodes: [
      { id: 'age', label: 'Age under 30?' },
      { id: 'inc', label: 'Income over $50k?', parent: 'age', side: 'left', edgeLabel: 'Yes' },
      { id: 'cs', label: 'Check credit score', parent: 'age', side: 'right', edgeLabel: 'No' },
      { id: 'ok', label: 'Approve', parent: 'inc', side: 'left', edgeLabel: 'Yes' },
      { id: 'no', label: 'Deny', parent: 'inc', side: 'right', edgeLabel: 'No' },
    ], highlightPath: ['age', 'inc', 'ok'] };
  const card = value => ({ ...withFlow, body: withFlow.body.replace(diagram(flowSpec), diagram(value)) });
  const requirement = deriveVisualRequirements(request);
  assert.equal(requirement.items[0].diagramKind, 'tree');
  assert.equal(requirement.items[0].trace, true);
  const accepted = await generate(request, [card(spec)]);
  assert.equal(accepted.out.result, 'artifact');
  assert.equal(accepted.out.block.visualRequirements.items[0].satisfied, true);
  assert.equal(markdownVisuals(accepted.out.block.body).diagrams[0].kind, 'tree');
  assert.match(requiredVisualProblem(withFlow, requirement), /asked for a tree diagram.*is a flow/);
  const { highlightPath: _, ...untraced } = spec;
  assert.match(requiredVisualProblem(card(untraced), requirement), /highlightPath/);
  const unlabelled = { ...spec, nodes: spec.nodes.map(({ edgeLabel, ...node }) => node) };
  assert.match(requiredVisualProblem(card(unlabelled), requirement), /Yes and No branches/);
  const broken = { ...spec, highlightPath: ['age', 'ok'] };
  assert.match(requiredVisualProblem(card(broken), requirement), /required_visual_invalid/);
});

test('optional diagram degradation: a valid required diagram beside an invalid optional one delivers the required one and records the drop; a dangling pointer fails', async () => {
  const optionalBad = `\`\`\`rh-diagram\n${JSON.stringify({ version: 1, diagram: { kind: 'flow', title: 'Extra', nodes: [{ id: 'a', label: 'A', role: 'process' }], edges: [{ from: 'a', to: 'zz' }] } })}\n\`\`\``;
  const both = { title: 'T', body: `The 25-year-old is approved.\n\n${diagram(flowSpec)}\n\nA second view of the rule.\n\n${optionalBad}\n\nThat is the rule.` };
  const r = await quiet(() => generate(FLOW_REQUEST, [both, both]));
  assert.equal(r.out.result, 'artifact');
  assert.equal(r.out.diagramsDropped, 1, 'the degradation is recorded in the result');
  assert.deepEqual(markdownVisuals(r.out.block.body).diagrams.map(d => d.ok), [true], 'only the required diagram is left');
  // No requirement at all: an invalid optional diagram beside a valid one is dropped at the last attempt only when nothing points at it.
  const SOFTMAX = diagramFence(cycleSpec('Softmax scores'));
  const optionalOnly = { title: 'T', body: `Softmax turns scores into probabilities.\n\n${SOFTMAX}\n\nThe largest score gets the largest share.\n\n${optionalBad}\n\nThe shares add up to one.` };
  const fine = await quiet(() => generate('Explain softmax', [optionalOnly, optionalOnly]));
  assert.deepEqual([fine.out.result, fine.out.diagramsDropped], ['artifact', 1]);
  // Owner 2026-11-08 (a card should not fail; replaces EXP-13's "the card fails truthfully"): the card's only diagram is invalid after the repair and has one
  // label, too few to simplify, so the prose card is delivered without a visual, recorded on the card and not as an error.
  const onlyBad = { title: 'T', body: `Softmax turns scores into probabilities.\n\n${optionalBad}\n\nThe shares add up to one.` };
  const lost = await quiet(() => generate('Explain softmax', [onlyBad, onlyBad]));
  assert.deepEqual([lost.out.result, lost.out.block.visualFallback, lost.out.diagramsDropped, lost.out.block.body], ['artifact', 'dropped', 1, 'Softmax turns scores into probabilities.\n\nThe shares add up to one.']);
  assert.equal(lost.m.seen.length, 2, 'the one repair was tried first');
  const pointing = { title: 'T', body: `Softmax turns scores into probabilities, as the diagram below shows.\n\n${SOFTMAX}\n\nThe largest score gets the largest share.\n\n${optionalBad}\n\nThe shares add up to one.` };
  const dangling = await quiet(() => generate('Explain softmax', [pointing, pointing]));
  assert.equal(dangling.out.result, 'validation_error');
  assert.match(dangling.out.error, /still points at it/);
  assert.equal(danglingFigureProblem({ body: 'Softmax is a function.' }), null);
  // The invalid REQUIRED diagram with a separate valid optional one is not "fixed" by dropping the required one.
  const reqBad = { title: 'T', body: `Approved.\n\n${optionalBad}\n\nThe rule checks age first.\n\n${diagram(flowSpec)}\n\nSo the rule approves.` };
  const wrongOne = await quiet(() => generate(FLOW_REQUEST, [reqBad, reqBad]));
  assert.equal(wrongOne.out.result, 'artifact', 'a valid diagram remains for the one requirement, so the invalid extra is the optional one');
  assert.equal(wrongOne.out.diagramsDropped, 1);
});

test('owner 2026-11-08, a card should not fail: the only diagram still invalid after the repair becomes a straight flow of its own labels, no model call', async () => {
  // The heart's loop drawn as a flow has no start node, which a flow refuses ("A flow needs exactly one root"). With 8 steps it is over the cycle's 7, so
  // the server cannot turn it into a cycle (item 47); a loop of up to 7 is, below.
  const labels = ['Right atrium', 'Right ventricle', 'Lungs', 'Left atrium', 'Left ventricle', 'Aorta', 'Body', 'Veins'];
  const loop = { kind: 'flow', title: 'Blood through the heart', caption: 'Blood loops through the heart twice.', nodes: labels.map((label, i) => ({ id: `s${i}`, label, role: 'process' })),
    edges: labels.map((_, i) => ({ from: `s${i}`, to: `s${(i + 1) % labels.length}` })) };
  const card = { title: 'How the heart pumps', body: `The heart is two pumps side by side, moving blood from the body to the lungs and back.\n\n${diagram(loop)}\n\nEach beat squeezes the atria first, then the ventricles.` };
  const { out, m } = await quiet(() => generate('How does the human heart pump blood?', [card, card]));
  assert.deepEqual([out.result, out.block.visualFallback, out.diagramsSimplified, out.diagramsDropped, m.seen.length], ['artifact', 'simplified', 1, undefined, 2]);
  const [drawn] = markdownVisuals(out.block.body).diagrams;
  assert.deepEqual([drawn.ok, drawn.kind], [true, 'flow']);
  const spec = JSON.parse(out.block.body.match(/```rh-diagram\n(.*)\n```/)[1]).diagram;
  assert.deepEqual([spec.title, spec.caption, spec.nodes.map(n => n.label), spec.nodes.map(n => n.role).at(-1), spec.edges.length], [loop.title, loop.caption, labels, 'outcome', 7]);
  assert.deepEqual(out.block.diagramCorrections, { simplified_flow: 1 }, 'counted on the card (item 47)');
  assert.ok(out.block.body.startsWith('The heart is two pumps') && out.block.body.endsWith('then the ventricles.'), 'the prose around it is kept');
  // With a repair left, nothing is simplified: the validator's words go to the model first.
  assert.match(m.seen[1].messages.at(-1).content[0].content, /exactly one root/);
  // (A diagram beside another valid visual is still dropped, not simplified: the optional-degradation test above.)
  assert.equal(simplifiedDiagram(['not json']), null);
  assert.equal(simplifiedDiagram([JSON.stringify({ version: 1, diagram: { kind: 'cycle', title: 'One', steps: ['only'] } })]), null, 'fewer than two labels');
  assert.deepEqual(simplifiedDiagram([JSON.stringify({ version: 1, diagram: { kind: 'cycle', title: 'Water cycle', steps: ['Evaporation', 'Condensation', 'Rain', 'Runoff', 'Soak', 'Flow', 'Melt', 'Freeze'] } })]).diagram.nodes.length, 8, 'a cycle over its 7 steps keeps its labels as a flow');
});

test('the route reads the requirement from the learner\'s own args on the server, ignores context words, and answers an unsupported picture before any call', async () => {
  const post = body => new Request('https://dev.example/api/learn/artifact', { method: 'POST', headers: { cookie: 's' }, body: JSON.stringify(body) });
  const env = { CONTROL_PLANE: { fetch: async () => Response.json({ name: 'demo' }) } };
  const seen = [];
  const route = async (body) => artifactFetch(post({ app: 'demo', command: 'explanation', ...body }), env, async (_, input) => { seen.push(input); return { result: 'artifact', block: { type: 'explanation', title: 't', body: 'b' } }; });
  assert.equal((await route({ args: EX01 })).status, 200);
  assert.deepEqual(seen[0].visualRequirements.items.map(i => i.kind), ['table']);
  // A model-claimed or browser-claimed record is never read: only the args decide.
  await route({ args: 'Why is the sky blue?', visualRequirements: { version: 1, items: [] }, requiredVisuals: ['table'] });
  assert.equal('visualRequirements' in seen[1], false);
  await route({ args: 'Why is the sky blue?', context: 'Draw a diagram table of everything.' });
  assert.equal('visualRequirements' in seen[2], false, 'source material is data, not the learner\'s request');
  const refused = await route({ args: 'Explain voting with a pie chart' });
  const body = await refused.json();
  assert.deepEqual([refused.status, body.result], [200, 'unsupported']);
  assert.match(body.message, /nothing was made or charged/);
  assert.equal(seen.length, 3, 'the unsupported picture reached no generator');
  // The playable /interactive command is a different engine and takes no such record.
  await artifactFetch(post({ app: 'demo', command: 'explain', args: 'a heap with a table' }), env, async (_, input) => { seen.push(input); return { result: 'artifact' }; });
  assert.equal('visualRequirements' in seen[3], false);
});

test('the Tutor roadmap path: the accepted learner instruction carries the requirement, one call, zero repairs, a stable terminal reason, and the accepted title wins', async () => {
  const access = { org: 'o', actorUserId: 'u1', actorEmail: 'a@x.test', boardId: 'b1', boardOwnerEmail: 'a@x.test', role: 'owner', payerUserId: 'u1' };
  const ref = { authorizationId: 'auth_00000001', resultId: 'res_00000001', resultVersion: 1 };
  const record = over => ({ cardId: 'card_0000001', stepId: 'step_0000001', proposalId: 'prop_0000001', proposalVersion: 1, format: 'explanation', stepTitle: 'Why coffee cools', stepGoal: 'Explain the gap.', passageText: 'Coffee cools.', language: 'en', depth: 'standard', retry: 0,
    learnerInstruction: { original: 'Include a small table comparing early and late cooling.', revisions: [] }, ...over });
  const run = async (rec, inputs) => { const m = scripted(...inputs); const out = await generateRoadmapCard({}, access, ref, { loadAccepted: async () => rec, withProviderCall: async e => e, callModel: m.callModel }); return { out, m }; };
  const ok = await run(record(), [{ ...withTable, title: 'A different model title' }]);
  assert.equal(ok.out.outcome, 'ok');
  assert.equal(ok.out.block.title, 'Why coffee cools');
  assert.equal(ok.out.block.visualRequirements.items[0].kind, 'table');
  assert.match(ok.m.seen[0].messages[0].content, /"requiredVisuals"/);
  const missing = await quiet(() => run(record(), [proseOnly]));
  assert.deepEqual([missing.out.outcome, missing.out.failure_class, missing.out.code, missing.m.seen.length], ['failed', 'terminal_validation_failure', 'required_visual_missing', 1]);
  const none = await run(record({ learnerInstruction: { original: 'Explain it simply.', revisions: [] } }), [proseOnly]);
  assert.equal(none.out.outcome, 'ok', 'no explicit request, no requirement: prose is fine');
  // A revision the learner accepted counts; an unsupported picture stops with zero author calls.
  const revised = await quiet(() => run(record({ learnerInstruction: { original: 'Explain it simply.', revisions: [{ text: 'Add a table of early versus late cooling.' }] } }), [proseOnly]));
  assert.equal(revised.out.code, 'required_visual_missing');
  const pie = await run(record({ learnerInstruction: { original: 'Show it as a pie chart.', revisions: [] } }), [withTable]);
  assert.deepEqual([pie.out.outcome, pie.out.code, pie.m.seen.length], ['failed', 'required_visual_unsupported', 0]);
  // A server-held record on the accepted step (kept through revisions and retries) wins over re-deriving it.
  const held = await quiet(() => run(record({ learnerInstruction: null, visualRequirements: deriveVisualRequirements('with a table') }), [proseOnly]));
  assert.equal(held.out.code, 'required_visual_missing');
  // Quote and dispatch share one request: the requirement is in the request that prepareArtifactAuthorRequest builds.
  const prepared = prepareArtifactAuthorRequest({}, { command: 'explain', args: 'x', visualRequirements: deriveVisualRequirements('with a table') }, { only: ['explanation'] });
  assert.match(prepared.messages[0].content, /requiredVisuals/);
});

test('requiredVisualProblem is null without a requirement, and counts one table per table requirement', () => {
  assert.equal(requiredVisualProblem(proseOnly, null), null);
  assert.equal(requiredVisualProblem(proseOnly, { items: [] }), null);
  const two = deriveVisualRequirements('Explain it with a table and a table of costs');
  assert.ok(requiredVisualProblem(withTable, { items: [{ id: 'vr-1', kind: 'table', purpose: 'p' }, { id: 'vr-2', kind: 'table', purpose: 'p' }] }));
  assert.equal(requiredVisualProblem({ ...withTable, more: [{ label: 'x', text: TABLE }] }, { items: [{ id: 'vr-1', kind: 'table', purpose: 'p' }, { id: 'vr-2', kind: 'table', purpose: 'p' }] }), null);
  assert.ok(two.items.length >= 1);
});

test('a topic word alone is not a request for a picture: a decision tree, a timeline or a t-account question stays prose-only', () => {
  for (const q of ['Explain how a decision tree works', 'What is the timeline of the French Revolution?', 'How does a t-account record a sale?', 'Explain the number line']) assert.deepEqual(deriveVisualRequirements(q).items, [], q);
  assert.equal(deriveVisualRequirements('Draw a decision tree diagram for loan approval').items[0].diagramKind, 'flow', 'a decision tree stays a flow (EX-07 and the frozen benchmark corpus)');
  assert.equal(deriveVisualRequirements('Show a timeline diagram of the French Revolution').items[0].diagramKind, 'timeline');
});

// EXP-13 visual choice (owner 2026-11-08, study C:/s/spec/benchmarks/explain-visual-choice-2026-11-08): fixes 1-4 ride in the author guidance.
test('the guidance leads its visual choice with the firm type rule, then the kind by the shape of the answer, the cannot-draw rules and the count', () => {
  const g = EXPLANATION_GUIDANCE, at = s => { const i = g.indexOf(s); assert.ok(i >= 0, s); return i; };
  const order = ['objects, 3D shapes, anatomy, places, living things and how something looks always get a picture first, then a process diagram second only if the thing also does something; a diagram alone is wrong for them',
    'processes, relationships, comparisons, hierarchies, quantities, algorithms and data structures get diagrams', 'never use a picture for a data structure, an algorithm or numbers',
    'cycle when the last step feeds the first', 'sequence whenever two or more named parties send things to each other (client and server, sender and receiver, a protocol, request and response)', 'timeline for dates or eras', 'transformation for inputs becoming outputs',
    'tree for splits, sub-parts or sub-calls', 'relationship for causes', 'layers only for a real ordered stack', 'flow otherwise, a straight chain included',
    'Layers, matrix, comparison, flow, tree and figure cannot draw a shape, object, place or appearance', 'figure is only for a cell, a free-body diagram or a layered cross-section',
    'comparison is for 2-4 separate items, never the parts of one thing',
    'two visuals when the question names two things (X and Y, X vs Y) or asks both how something looks and how it works; otherwise one'].map(at);
  assert.deepEqual(order, [...order].sort((a, b) => a - b), 'in the owner\'s order');
  assert.ok(at('Choose visuals in this order') < at('Kinds: flow'), 'the choice comes before the kind catalogue');
  assert.equal(g.includes('a diagram cannot draw'), false, 'the old negative rule is gone');
});

// Owner 2026-11-08 (study evidence: TCP handshake drawn as a flow 3 of 3; tree operations drawn as a step flow with no tree; volcano, eclipse and engine
// questions got only a flow): three guidance sentences, nothing new in the diagram schema.
test('the guidance carries the parties-send-things sequence rule, the structure-first rule for tree operations and the picture for how a physical thing works', () => {
  const g = EXPLANATION_GUIDANCE, at = s => { const i = g.indexOf(s); assert.ok(i >= 0, s); return i; };
  at('sequence whenever two or more named parties send things to each other (client and server, sender and receiver, a protocol, request and response);');
  assert.ok(at('For an operation on a binary tree or BST (traversal, insertion, search, deletion) the first visual is the tree itself, showing the operation in its node labels (the visit order, as 1st, 2nd, or the new key marked as 7 (new)) or as two tree visuals, before and after; a flow with a highlightPath for the steps may follow it but never replaces it; a tree highlightPath is only a root-to-descendant route along parent-to-child edges, such as the search path an insertion or search follows, never a visit order.') > at('For binary trees use kind "tree" with layout "binary".'));
  at('Three visuals are a maximum, not a target.');
  at('a "how does X work" or "how does X happen" question about a physical object, place or natural event (a volcano erupting, an eclipse, an engine) gets a picture of it and the process diagram;');
  // Owner 2026-11-08: the catalogue's sequence entry says the same as the choice rule (wording only; the order of kinds is unchanged).
  assert.ok(at('sequence for two or more named parties that send things to each other (client and server, sender and receiver, a protocol, request and response; actors [{id,label}] 2-4, messages [{from,to,label}] between different actors)') > at('Kinds: flow'), 'the catalogue says the same as the choice rule');
  assert.equal(g.includes('messages between actors'), false, 'the old catalogue wording is gone');
  // Supported means only (Phase 02): a tree's one route field is highlightPath; no node field holds a visit order, so inorder order stays in the node labels.
  const tree = (tutorDiagramJsonSchema.properties.diagram.anyOf ?? tutorDiagramJsonSchema.properties.diagram.oneOf).find(s => s.properties.kind.const === 'tree');
  assert.ok(tree.properties.highlightPath, 'a tree takes a root-to-descendant highlightPath');
  assert.deepEqual(Object.keys(tree.properties.nodes.items.properties).filter(k => /order|visit|step|rank/i.test(k)), [], 'no traversal-order field on a tree node');
});

// Owner 2026-11-08: digital, abstract or procedural subjects get no picture, a separate line; the positive picture rule (51 of 54 in the study) is unchanged.
test('the guidance keeps digital, abstract and procedural subjects to diagrams, beside the unchanged positive picture rule', () => {
  const g = EXPLANATION_GUIDANCE;
  assert.ok(g.includes('Digital, abstract or procedural subjects — email, DNS, network protocols, algorithms, software, data structures, mathematics — never get a picture. They get a diagram only.'));
  assert.ok(g.includes('1) Type: objects, 3D shapes, anatomy, places, living things and how something looks always get a picture first, then a process diagram second only if the thing also does something; a diagram alone is wrong for them; a "how does X work" or "how does X happen" question about a physical object, place or natural event (a volcano erupting, an eclipse, an engine) gets a picture of it and the process diagram; processes, relationships, comparisons, hierarchies, quantities, algorithms and data structures get diagrams; never use a picture for a data structure, an algorithm or numbers; a 3D object or a repeating structure — a molecule, a crystal lattice, a gear train, a mesh — is a picture, never a tree, figure or layers.'));
});

const meshPicture = illustrationFence({ id: 'pic-1', prompt: 'A 3D mesh of a teapot drawn as small triangles', alt: 'A teapot mesh made of triangles', caption: 'A 3D mesh is many small triangles' });
const meshDiagram = diagramFence({ version: 1, diagram: { kind: 'tree', title: 'Parts of a 3D mesh', nodes: [{ id: 'm', label: 'Mesh' }, { id: 'v', label: 'Vertices', parent: 'm' }, { id: 'f', label: 'Faces', parent: 'm' }] } });
const meshCard = visuals => ({ title: 'What a 3D mesh looks like', body: `A 3D mesh is a surface built from many flat triangles that share corners.\n\n${visuals}\n\nMore triangles make the mesh look smoother.` });
const meshBoth = `${meshPicture}\n\nIts corners are vertices and its triangles are faces of the mesh.\n\n${meshDiagram}`;
test('fix 6b: "look like", "3D" or "anatomy" with no diagram asked needs a picture on the card (the one repair), never "shape", and the mix stays free', async () => {
  for (const q of ['What does a 3D mesh look like?', 'What does a neuron look like?', 'explain the anatomy of the eye', 'what a coral reef looks like']) assert.deepEqual(deriveVisualRequirements(q).items.map(i => [i.kind, i.implied]), [['illustration', true]], q);
  for (const q of ['What is the shape of the curve?', 'Draw a diagram of what a 3D mesh looks like', 'Show a picture of what a cell looks like', 'How does a request reach the database?']) assert.equal(deriveVisualRequirements(q).items.some(i => i.implied), false, q);
  assert.equal(deriveVisualRequirements('Show a picture of what a cell looks like').items.length, 1, 'an asked picture is the only one');
  assert.equal(requiredMix(deriveVisualRequirements('What does a 3D mesh look like?')), null, 'an implied picture does not fix the mix');
  // A diagram alone goes to the one repair; the author is not told the picture is the whole mix.
  const { out, m } = await quiet(() => generate('What does a 3D mesh look like?', [meshCard(meshDiagram), meshCard(meshBoth)]));
  assert.deepEqual([out.result, m.seen.length], ['artifact', 2]);
  assert.match(m.seen[1].messages.at(-1).content[0].content, /required_visual_missing: the learner asked for an illustration/);
  assert.equal(JSON.parse(m.seen[0].messages[0].content).requiredVisuals, undefined);
  // A picture beside a diagram is kept as it is, first time.
  const both = await quiet(() => generate('What does a 3D mesh look like?', [meshCard(meshBoth)]));
  assert.deepEqual([both.out.result, both.m.seen.length, markdownVisuals(both.out.block.body).diagrams.length], ['artifact', 1, 1]);
  // "the shape of the curve" asks for no picture: a diagram alone passes.
  const curve = await quiet(() => generate('What is the shape of the curve?', [{ title: 'The shape of the curve', body: `The curve rises fast, then levels off.\n\n${diagramFence({ version: 1, diagram: { kind: 'cycle', title: 'The curve rises then levels', steps: ['Rises', 'Levels off'] } })}\n\nSo the curve flattens.` }]));
  assert.deepEqual([curve.out.result, curve.m.seen.length], ['artifact', 1]);
});

const chain = (title, labels) => diagramFence({ version: 1, diagram: { kind: 'flow', title, caption: `${labels[0]} comes first.`, nodes: labels.map((label, i) => ({ id: `n${i}`, label, role: i === labels.length - 1 ? 'outcome' : 'process' })), edges: labels.slice(1).map((_, i) => ({ from: `n${i}`, to: `n${i + 1}` })) } });
const drawnSpec = body => JSON.parse(body.match(/```rh-diagram\n(.*)\n```/)[1]).diagram;
test('fix 6a: a branchless flow becomes a cycle of the same steps in order when the question repeats; otherwise, or with a decision, it stays a flow', async () => {
  const water = ['Evaporation', 'Condensation', 'Precipitation', 'Collection'];
  const waterCard = { title: 'How the water cycle works', body: `The sun heats water so it rises as vapour, then falls again as rain.\n\n${chain('The water cycle', water)}\n\nThe collected water evaporates once more.` };
  const cycled = await quiet(() => generate('How does the water cycle work?', [waterCard]));
  assert.deepEqual([cycled.out.result, cycled.m.seen.length], ['artifact', 1]);
  assert.deepEqual(drawnSpec(cycled.out.block.body), { kind: 'cycle', title: 'The water cycle', caption: 'Evaporation comes first.', steps: water });
  assert.ok(cycled.out.block.body.startsWith('The sun heats water') && cycled.out.block.body.endsWith('evaporates once more.'), 'the prose around it is kept');
  const request = ['Request', 'Auth', 'Handler', 'Database'];
  const requestCard = { title: 'How a request reaches the database', body: `A request passes several checks before it reaches the database.\n\n${chain('How a request reaches the database', request)}\n\nThe database answers the handler.` };
  const flowed = await quiet(() => generate('How does a request reach the database?', [requestCard]));
  assert.deepEqual([flowed.out.result, drawnSpec(flowed.out.block.body).kind], ['artifact', 'flow']);
  assert.equal(flowed.out.block.body, requestCard.body, 'left exactly as it is');
  // A flow with a decision is not a chain, whatever the words; a chain over the cycle's 7 steps stays a flow.
  const branched = `Water.\n\n${diagramFence({ version: 1, diagram: { kind: 'flow', title: 'The water cycle check', nodes: [{ id: 'a', label: 'Is it warm?', role: 'decision' }, { id: 'b', label: 'Evaporation', role: 'outcome' }, { id: 'c', label: 'Freezing', role: 'outcome' }], edges: [{ from: 'a', to: 'b', label: 'Yes' }, { from: 'a', to: 'c', label: 'No' }] } })}\n\nMore.`;
  assert.equal(chainsAsCycles(branched), branched);
  const long = `Water.\n\n${chain('Too long', ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'])}\n\nMore.`;
  assert.equal(chainsAsCycles(long), long);
  for (const q of ['How do the phases of the Moon repeat?', 'why does it loop again', 'recurring seasons', 'one round of the game', 'the cell cycle']) assert.ok(repeats(q), q);
  for (const q of ['How does a request reach the database?', 'explain bicycle gears', 'what goes around the sun']) assert.equal(repeats(q), false, q);
});

test('rule 1 makes a 3D object or a repeating structure a picture (owner G3, 2026-11-08: crystal lattice drew a tree on Gemini)', () => {
  assert.match(EXPLANATION_GUIDANCE, /a 3D object or a repeating structure — a molecule, a crystal lattice, a gear train, a mesh — is a picture, never a tree, figure or layers/);
});
