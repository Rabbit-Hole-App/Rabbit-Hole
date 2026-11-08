// E1 (docs/features/explain.md section 5 "Required visual contract", EXP-12-C02/C03 offline half, EXP-06-C03, E-B1): explicit table and diagram requests are read on the
// server, bound to the author request, enforced on the final card at every Depth and saved with the card. Every reply goes through the production validator
// (generateArtifact / artifactFetch); no prebuilt success block stands in for the generator. Offline: no provider is called.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveVisualRequirements, requiredVisualProblem, requirementText, danglingFigureProblem } from '../src/explanation-visuals.js';
import { markdownVisuals, explanationChars } from '../src/learn-primitives.js';
import { artifactFetch, generateArtifact, prepareArtifactAuthorRequest } from '../src/learn-artifact.js';
import { generateRoadmapCard } from '../src/roadmap/roadmap-generate.js';
import { EXPLANATION_CAPS } from '../src/chat-depth.js';

const EX01 = 'Why does coffee cool faster at first? Include a small table comparing early and late cooling.';
const EX07 = 'Show a decision-tree diagram for this toy rule: if age is under 30, check whether income is over $50,000; yes means Approve and no means Deny. Otherwise, Check credit score. Trace a 25-year-old earning $60,000.';

const TABLE = '| Phase | Gap to the room | Cooling rate |\n| --- | --- | --- |\n| Early | Large | Fast |\n| Late | Small | Slow |';
const prose = 'A hot cup loses heat faster at first because the gap between the coffee and the room is largest then; the gap shrinks as it cools, so the rate falls.';
const withTable = { title: 'Why coffee cools fast at first', body: `${prose}\n\n${TABLE}` };
const proseOnly = { title: 'Why coffee cools fast at first', body: prose };
const diagram = spec => `\`\`\`rh-diagram\n${JSON.stringify({ version: 1, diagram: spec })}\n\`\`\``;
const flowSpec = { kind: 'flow', title: 'Toy approval rule', caption: 'A 25-year-old earning $60,000 takes Yes, then Yes, and is approved.', nodes: [
  { id: 'age', label: 'Age under 30?', role: 'decision' }, { id: 'inc', label: 'Income over $50k?', role: 'decision' }, { id: 'ok', label: 'Approve', role: 'outcome' }, { id: 'no', label: 'Deny', role: 'outcome' }, { id: 'cs', label: 'Check credit score', role: 'outcome' }],
  edges: [{ from: 'age', to: 'inc', label: 'Yes' }, { from: 'age', to: 'cs', label: 'No' }, { from: 'inc', to: 'ok', label: 'Yes' }, { from: 'inc', to: 'no', label: 'No' }],
  highlightPath: ['age', 'inc', 'ok'] }; // E3: the worked route the request asks to trace
const withFlow = { title: 'The approval rule', body: `The rule asks about age first, then income. The 25-year-old earning $60,000 answers Yes to both questions and is approved.\n\n${diagram(flowSpec)}` };

// A provider double: each call answers the next scripted explanation input and records the request body.
const scripted = (...inputs) => { const seen = []; return { seen, callModel: async (env, body) => { seen.push(body); return Response.json({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: `c${seen.length}`, name: 'make_explanation', input: inputs[Math.min(seen.length, inputs.length) - 1] }] }); } }; };
const generate = async (text, inputs, over = {}) => { const m = scripted(...inputs); const requirements = deriveVisualRequirements(text);
  const out = await generateArtifact({}, { command: 'explanation', args: text, ...(requirements.items?.length ? { visualRequirements: requirements } : {}), ...over }, { callModel: m.callModel }); return { out, m }; };
const quiet = async fn => { const log = console.log; console.log = () => {}; try { return await fn(); } finally { console.log = log; } };

test('the exact EX-01 and EX-07 requests produce their required records, with variations, and not-a-request wording produces none', () => {
  assert.deepEqual(deriveVisualRequirements(EX01).items.map(i => [i.id, i.kind]), [['vr-1', 'table']]);
  const ex07 = deriveVisualRequirements(EX07);
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
    assert.ok(explanationChars(ok.out.block) <= EXPLANATION_CAPS[depth], depth);
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
    const r = await quiet(() => generate(EX01, [{ title: 'T', body: `${prose}\n\n${bad}` }]));
    assert.equal(r.out.result, 'validation_error', bad);
    assert.match(r.out.error, /^required_visual_invalid:/, bad);
  }
  // A table in a collapsed section satisfies the requirement too (it is saved content), and counts toward the cap like all closed sections.
  const inSection = await generate(EX01, [{ title: 'T', body: prose, more: [{ label: 'Compare', text: TABLE }] }]);
  assert.equal(inSection.out.result, 'artifact');
  // Without a request for one, a prose-only card is a success at every Depth, and carries no record.
  for (const depth of ['overview', 'standard', 'deep']) { const r = await generate('Why does coffee cool faster at first?', [proseOnly], { depth }); assert.equal(r.out.result, 'artifact'); assert.equal('visualRequirements' in r.out.block, false); assert.doesNotMatch(r.m.seen[0].messages[0].content, /requiredVisuals/); }
});

test('over-cap output still fails exactly one code point over, with the table kept inside the budget at Overview', async () => {
  const fits = (n, text) => ({ title: 'T', body: `${text.repeat(1).slice(0, n)}\n\n${TABLE}` });
  const tableChars = explanationChars({ title: 'T', body: TABLE });
  const room = EXPLANATION_CAPS.overview - tableChars - 1; // explanationChars joins title, prose and table cells with single spaces
  const exact = await generate(EX01, [fits(room, 'x'.repeat(2000))], { depth: 'overview' });
  assert.equal(explanationChars(exact.out.block), EXPLANATION_CAPS.overview);
  assert.equal(exact.out.result, 'artifact');
  const over = await quiet(() => generate(EX01, [fits(room + 1, 'x'.repeat(2000))], { depth: 'overview' }));
  assert.equal(over.out.result, 'validation_error');
  assert.match(over.out.error, /explanation_over_budget/);
});

test('EX-07: a valid flow with Yes/No branches and outcomes is delivered and saved; omitted, invalid, wrong-kind or Yes/No-less diagrams fail', async () => {
  const ok = await generate(EX07, [withFlow]);
  assert.equal(ok.out.result, 'artifact');
  assert.deepEqual(ok.out.block.visualRequirements.items.map(i => [i.kind, i.diagramKind, i.satisfied]), [['diagram', 'flow', true]]);
  assert.deepEqual(JSON.parse(JSON.stringify(ok.out.block)), ok.out.block, 'the saved block survives a save/read round trip unchanged');
  const missing = await quiet(() => generate(EX07, [{ title: 'T', body: 'The 25-year-old is approved.' }]));
  assert.match(missing.out.error, /^required_visual_missing:/);
  const unclosed = await quiet(() => generate(EX07, [{ title: 'T', body: `Approved.\n\n\`\`\`rh-diagram\n${JSON.stringify({ version: 1, diagram: flowSpec })}` }]));
  assert.equal(unclosed.out.result, 'validation_error');
  assert.match(unclosed.out.error, /required_visual_invalid:/);
  const badTopology = await quiet(() => generate(EX07, [{ title: 'T', body: `Approved.\n\n${diagram({ ...flowSpec, edges: [{ from: 'age', to: 'nowhere', label: 'Yes' }] })}` }]));
  assert.equal(badTopology.out.result, 'validation_error');
  assert.match(badTopology.out.error, /required_visual_invalid:/, 'an invalid required diagram is never silently dropped');
  const wrongKind = await quiet(() => generate(EX07, [{ title: 'T', body: `Approved.\n\n${diagram({ kind: 'timeline', title: 'Steps', events: [{ time: 'Now', label: 'Check age' }, { time: 'Then', label: 'Check income' }] })}` }]));
  assert.match(wrongKind.out.error, /asked for a flow diagram.*is a timeline/);
  const noBranches = await quiet(() => generate(EX07, [{ title: 'T', body: `Approved.\n\n${diagram({ kind: 'flow', title: 'Steps', nodes: [{ id: 'a', label: 'Start', role: 'process' }, { id: 'b', label: 'Approve', role: 'outcome' }], edges: [{ from: 'a', to: 'b' }], highlightPath: ['a', 'b'] })}` }]));
  assert.match(noBranches.out.error, /Yes and No branches/);
  // E3: the request says "Trace ...", so a caption alone is not enough: the flow needs its validated highlightPath.
  const { highlightPath: _route, ...unmarked } = flowSpec;
  const noRoute = await quiet(() => generate(EX07, [{ title: 'T', body: `Approved.

${diagram(unmarked)}` }]));
  assert.equal(noRoute.out.result, 'validation_error');
  assert.match(noRoute.out.error, /^required_visual_invalid: .*highlightPath/);
  assert.deepEqual(deriveVisualRequirements(EX07).items[0].trace, true);
  assert.equal(deriveVisualRequirements('Show a flowchart of how a request is handled').items[0].trace, undefined, 'no trace wording, no route required');
  const badRoute = await quiet(() => generate(EX07, [{ title: 'T', body: `Approved.

${diagram({ ...flowSpec, highlightPath: ['age', 'ok'] })}` }]));
  assert.match(badRoute.out.error, /required_visual_invalid:/, 'a route that is not on existing edges is an invalid diagram');
  // Standard EX-07 with a Tutor-style zero repair is one call and the same refusal.
  const m = scripted({ title: 'T', body: 'Approved.' });
  const zero = await quiet(() => generateArtifact({}, { command: 'explanation', args: EX07, visualRequirements: deriveVisualRequirements(EX07) }, { callModel: m.callModel, repairs: 0 }));
  assert.deepEqual([zero.result, m.seen.length], ['validation_error', 1]);
});

test('optional diagram degradation: a valid required diagram beside an invalid optional one delivers the required one and records the drop; a dangling pointer fails', async () => {
  const optionalBad = `\`\`\`rh-diagram\n${JSON.stringify({ version: 1, diagram: { kind: 'flow', title: 'Extra', nodes: [{ id: 'a', label: 'A', role: 'process' }], edges: [{ from: 'a', to: 'zz' }] } })}\n\`\`\``;
  const both = { title: 'T', body: `The 25-year-old is approved.\n\n${diagram(flowSpec)}`, more: [{ label: 'Extra', text: `A second view of the rule.\n\n${optionalBad}` }] };
  const r = await quiet(() => generate(EX07, [both, both]));
  assert.equal(r.out.result, 'artifact');
  assert.equal(r.out.diagramsDropped, 1, 'the degradation is recorded in the result');
  assert.equal(markdownVisuals(r.out.block.more[0].text).diagrams.length, 0);
  assert.equal(markdownVisuals(r.out.block.body).diagrams[0].ok, true);
  // No requirement at all: an invalid optional diagram is dropped at the last attempt only when nothing points at it.
  const optionalOnly = { title: 'T', body: `Softmax turns scores into probabilities.\n\n${optionalBad}` };
  const fine = await quiet(() => generate('Explain softmax', [optionalOnly, optionalOnly]));
  assert.deepEqual([fine.out.result, fine.out.diagramsDropped], ['artifact', 1]);
  const pointing = { title: 'T', body: `Softmax turns scores into probabilities, as the diagram below shows.\n\n${optionalBad}` };
  const dangling = await quiet(() => generate('Explain softmax', [pointing, pointing]));
  assert.equal(dangling.out.result, 'validation_error');
  assert.match(dangling.out.error, /still points at it/);
  assert.equal(danglingFigureProblem({ body: 'Softmax is a function.' }), null);
  // The invalid REQUIRED diagram with a separate valid optional one is not "fixed" by dropping the required one.
  const reqBad = { title: 'T', body: `Approved.\n\n${optionalBad}`, more: [{ label: 'Extra', text: diagram(flowSpec) }] };
  const wrongOne = await quiet(() => generate(EX07, [reqBad, reqBad]));
  assert.equal(wrongOne.out.result, 'artifact', 'a valid diagram remains for the one requirement, so the invalid extra is the optional one');
  assert.equal(wrongOne.out.diagramsDropped, 1);
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
  const ok = await run(record(), [{ title: 'A different model title', body: `${prose}\n\n${TABLE}` }]);
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
  assert.equal(deriveVisualRequirements('Draw a decision tree diagram for loan approval').items[0].diagramKind, 'flow');
  assert.equal(deriveVisualRequirements('Show a timeline diagram of the French Revolution').items[0].diagramKind, 'timeline');
});
