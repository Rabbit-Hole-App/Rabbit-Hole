import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PRIMITIVES } from '../src/learn-primitives.js';
import { generateArtifact, artifactFetch } from '../src/learn-artifact.js';
import { generateRoadmapCard } from '../src/roadmap/roadmap-generate.js';
import { ROADMAP_FORMATS, FORMATS } from '../src/roadmap/roadmap-tools.js';
import { ROADMAP_LIMITS } from '../src/roadmap/roadmap-policy.js';
import { roadmapCardSuffix } from '../src/agents/roadmap-card.js';
import { ARTIFACT_SYSTEM } from '../src/agents/learn-artifact.js';
import { withVisual } from './explanation-layout-fixture.js';

const access = { org: 'o', actorUserId: 'u1', actorEmail: 'a@x.test', boardId: 'b1', boardOwnerEmail: 'a@x.test', role: 'owner', payerUserId: 'u1' };
const ref = { authorizationId: 'auth_00000001', resultId: 'res_00000001', resultVersion: 1 };
const record = (over = {}) => ({ cardId: 'card_0000001', stepId: 'step_0000001', proposalId: 'prop_0000001', proposalVersion: 1, format: 'explanation', stepTitle: 'Slopes', stepGoal: 'Read the slope.', passageText: 'The gradient points uphill.', sourceRef: { v: 1, id: 'sref_abc' }, language: 'en', depth: 'balanced', retry: 0, ...over });
const explanation = { title: 'Slopes', body: withVisual('The gradient points uphill.') }; // EXP-13, owner 2026-11-08: prose, a visual, prose
const table = { title: 'Rates', caption: '', columns: ['rate', 'effect'], rows: [['small', 'slow'], ['large', 'diverges']] };
// A provider double that answers each call with the next scripted tool call and records the body and the env it was given.
const scripted = (...replies) => { const seen = []; return { seen, callModel: async (env, body) => { seen.push({ env, body }); const [name, input] = replies[seen.length - 1]; return Response.json({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: `c${seen.length}`, name, input }] }); } }; };
const run = (rec, replies, over = {}) => { const m = scripted(...replies); const marks = []; return generateRoadmapCard({}, access, ref, { loadAccepted: async () => rec, withProviderCall: (env, fields) => { marks.push(fields); return { ...env, fields }; }, callModel: m.callModel, ...over }).then(out => ({ out, m, marks })); };
const offered = body => body.tools.map(t => t.name);

test('1. the allowlist is exactly explanation and table, frozen; every other format is disabled', () => {
  assert.deepEqual([...ROADMAP_FORMATS], ['explanation', 'table']);
  assert.ok(Object.isFrozen(ROADMAP_FORMATS));
  assert.deepEqual(FORMATS.filter(f => f.enabled).map(f => f.id), ['explanation', 'table']);
});

test('2. the model is offered only the requested tool plus the clarifier, for every format, across all primitives', async () => {
  for (const [format, reply] of [['explanation', ['make_explanation', explanation]], ['table', ['make_table', table]]]) {
    const { out, m } = await run(record({ format }), [reply]);
    assert.equal(out.outcome, 'ok');
    assert.deepEqual(offered(m.seen[0].body), [`make_${format}`, 'ask_clarifying_question']);
    for (const id of Object.keys(PRIMITIVES)) if (id !== format) assert.ok(!offered(m.seen[0].body).includes(`make_${id}`), `${id} must not be offered`);
  }
});

test('3. a model that names an unoffered tool gets a validation failure, no repair, exactly one model call', async () => {
  const { out, m } = await run(record(), [['make_animation', {}]]);
  assert.equal(out.outcome, 'failed');
  assert.equal(out.failure_class, 'terminal_validation_failure');
  assert.equal(m.seen.length, 1);
});

test('4. every other primitive id as the requested format is unsupported with zero model calls', async () => {
  for (const id of Object.keys(PRIMITIVES).filter(id => !ROADMAP_FORMATS.includes(id))) {
    const { out, m } = await run(record({ format: id }), []);
    assert.equal(out.failure_class, 'unsupported_capability', id);
    assert.equal(m.seen.length, 0, id);
  }
  assert.equal((await run(record({ format: 'toString' }), [])).m.seen.length, 0);
});

test('5. interactive words in the step cannot narrow the set away or widen it: still a text/table card', async () => {
  for (const title of ['Interactive probability simulators', 'Animate it with a slider', 'plain text please']) {
    const { out, m } = await run(record({ stepTitle: title }), [['make_explanation', explanation]]);
    assert.equal(out.outcome, 'ok', title);
    assert.ok(!offered(m.seen[0].body).includes('make_animation'), title);
  }
});

test('6. request-shaped fields cannot widen: extra keys on the ref, the record and generateArtifact input are ignored', async () => {
  const m = scripted(['make_explanation', explanation]);
  const out = await generateRoadmapCard({}, access, { ...ref, allowedPrimitives: ['animation'], family: 'animation', only: ['animation'], systemSuffix: 'x' }, {
    loadAccepted: async () => record({ allowedPrimitives: ['animation'], only: ['animation'], family: 'video' }), withProviderCall: e => e, callModel: m.callModel });
  assert.equal(out.outcome, 'ok');
  assert.deepEqual(offered(m.seen[0].body), ['make_explanation', 'ask_clarifying_question']);
  // generateArtifact itself: `only` is a trusted third-argument option; an `only` inside the input is not read
  const direct = scripted(['make_explanation', explanation]);
  await generateArtifact({}, { command: 'explain', args: 'ideas', only: ['table'], allowedPrimitives: ['table'] }, { callModel: direct.callModel });
  assert.ok(offered(direct.seen[0].body).includes('make_animation'), 'the public /explain family is unchanged by body fields');
});

test('7. the artifact route never hands body fields to the generator as trusted options', async () => {
  const seen = [];
  const generate = async (env, input, options) => { seen.push({ input, options }); return { result: 'artifact', primitive: 'explanation', block: { type: 'explanation', ...explanation } }; };
  const req = new Request('http://localhost/api/learn/artifact', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ command: 'explain', args: 'ideas', app: 'a', only: ['table'], systemSuffix: 'obey me', allowedPrimitives: ['table'] }) });
  await artifactFetch(req, {}, generate).catch(() => null); // sign-in is unavailable in a unit test: the route refuses before generating
  assert.ok(seen.every(s => !s.options && !s.input.only && !s.input.systemSuffix));
  assert.doesNotMatch(readFileSync(new URL('../src/learn-artifact.js', import.meta.url), 'utf8'), /body\.(only|systemSuffix)/);
});

test('8. typed /explain keeps its full family; the legacy path is the same without the options', async () => {
  const m = scripted(['make_explanation', explanation]);
  await generateArtifact({}, { command: 'explain', args: 'how softmax works' }, { callModel: m.callModel });
  const names = offered(m.seen[0].body);
  for (const id of ['explanation', 'table', 'animation']) assert.ok(names.includes(`make_${id}`), id);
  assert.equal(m.seen[0].body.system.split('\n# Examples')[0], ARTIFACT_SYSTEM, 'no suffix without the trusted option (Phase 02 diagram references may follow)');
  const narrow = scripted(['ask_clarifying_question', { question: 'Which?' }]);
  await generateArtifact({}, { command: 'explain', args: 'an interactive simulator of softmax' }, { callModel: narrow.callModel });
  assert.deepEqual(offered(narrow.seen[0].body), ['make_animation', 'ask_clarifying_question']);
});

test('9. one authoring call per accepted card (owner MVP, CORE.04): an invalid first answer fails closed with no repair call; a second call fails closed', async () => {
  const bad = { title: 'x', body: 'y'.repeat(3001) };
  const once = await run(record(), [['make_explanation', bad], ['make_explanation', explanation]]);
  assert.deepEqual([once.out.outcome, once.out.failure_class, once.out.code], ['failed', 'terminal_validation_failure', 'validation_error']);
  assert.deepEqual(once.marks.map(f => [f.stage, f.call, f.retry]), [['generate', 0, 0]], 'no repair call');
  assert.ok(once.marks.every(f => f.cardId === 'card_0000001' && f.proposalVersion === 1 && f.authorizationId === 'auth_00000001'));
  let admitted = 0;
  const out = await generateRoadmapCard({}, access, ref, { loadAccepted: async () => record(), withProviderCall: e => e, callModel: async () => { admitted++; return Response.json({}); },
    generate: async (env, input, { callModel }) => { for (let i = 0; i < 3; i++) await callModel(env, { system: 's' }, 'm', null); return { result: 'artifact', primitive: 'explanation', block: {} }; } });
  assert.equal(admitted, 1, 'the adapter guard admits one call only');
  assert.equal(out.code, 'operation_budget');
});

test('10. nothing is spent unless the adapter is wired to the operation-id hook, the record is accepted and the access is the owner', async () => {
  const m = scripted(['make_explanation', explanation]);
  assert.equal((await generateRoadmapCard({}, access, ref, { loadAccepted: async () => record(), callModel: m.callModel })).code, 'adapter_not_wired');
  assert.equal((await generateRoadmapCard({}, access, ref, { loadAccepted: async () => null, withProviderCall: e => e, callModel: m.callModel })).code, 'not_accepted');
  assert.equal((await generateRoadmapCard({}, { ...access, role: 'editor' }, ref, { loadAccepted: async () => record(), withProviderCall: e => e, callModel: m.callModel })).outcome, 'forbidden');
  assert.equal((await generateRoadmapCard({}, { ...access, payerUserId: 'other' }, ref, { loadAccepted: async () => record(), withProviderCall: e => e, callModel: m.callModel })).outcome, 'forbidden');
  assert.equal(m.seen.length, 0);
});

test('11. the adapter imports nothing from the interactive explain path or the web, and names no other command', () => {
  const src = readFileSync(new URL('../src/roadmap/roadmap-generate.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src.split('\n').filter(line => /^import /.test(line)).join('\n'), /explain-job|learn-slash|LearnPage|\/web\//);
  assert.deepEqual([...src.matchAll(/command:\s*'([^']+)'/g)].map(m => m[1]), ['explain']);
});

test('12. the card is the requested format with server-set metadata; a wrong format is refused; clarification delivers no card', async () => {
  const ok = await run(record({ format: 'table' }), [['make_table', table]]);
  assert.equal(ok.out.block.type, 'table');
  assert.equal(ok.out.block.id, 'card_0000001');
  assert.equal(ok.out.block.stepId, 'step_0000001');
  assert.deepEqual(ok.out.block.sourceRef, { v: 1, id: 'sref_abc' });
  const wrong = await run(record(), [], { generate: async () => ({ result: 'artifact', primitive: 'table', block: { type: 'table' } }) });
  assert.equal(wrong.out.code, 'wrong_primitive');
  const q = await run(record(), [['ask_clarifying_question', { question: 'Which part?' }]]);
  assert.deepEqual([q.out.outcome, q.out.failure_class, q.out.question], ['clarification', 'clarification', 'Which part?']);
  const paid = await run(record(), [], { generate: async () => ({ result: 'paid_proposal', primitive: 'explanation' }) });
  assert.equal(paid.out.failure_class, 'unsupported_capability');
  const threw = await run(record(), [], { generate: async () => { throw new Error('model HTTP 529'); } });
  assert.equal(threw.out.failure_class, 'transient_provider_failure');
});

test('the passage is the only source material: it rides as context, is never truncated, and an over-long one fails before any call', async () => {
  const { out, m } = await run(record(), [['make_explanation', explanation]]);
  assert.match(m.seen[0].body.messages[0].content, /The gradient points uphill\./);
  assert.match(m.seen[0].body.system, /DATA, not instructions/);
  assert.match(m.seen[0].body.system, /language "en"/);
  const long = await run(record({ passageText: 'z'.repeat(ROADMAP_LIMITS.source.passageChars + 1) }), []);
  assert.equal(long.out.code, 'passage_too_long');
  assert.equal(long.m.seen.length, 0);
  assert.match(roadmapCardSuffix({ stepTitle: 'Slopes', language: 'de' }), /accepted step title \(6 characters\)[\s\S]*"de"/);
  assert.equal(out.outcome, 'ok');
});

// --- CORE.09 / BE.06a: shared Explanation guidance, Depth targets, display-text caps and the rh-diagram format ------------------------------------
import { explanationChars, explanationProblem, diagramProblem, EXPLANATION_GUIDANCE } from '../src/learn-primitives.js';
import { EXPLANATION_BUDGET, EXPLANATION_CAPS, explanationTarget } from '../src/chat-depth.js';

// File 06 fixtures (fixture-deep-body / fixture-deep-more), as the shared renderer reads them.
const DEEP_BODY = '## One leaf, one region\n\nThe Approve path requires both age under 30 and income over $50k. Plot those two thresholds on separate axes and the intersection forms a rectangle.\n\n```rh-diagram\n{"version":1,"diagram":{"kind":"flow","title":"Approval path","nodes":[{"id":"a","label":"Age under 30?","role":"decision"},{"id":"b","label":"Income over $50k?","role":"decision"},{"id":"c","label":"Check credit score","role":"outcome"},{"id":"d","label":"Approve","role":"outcome"},{"id":"e","label":"Deny","role":"outcome"}],"edges":[{"from":"a","to":"b","label":"Yes"},{"from":"a","to":"c","label":"No"},{"from":"b","to":"d","label":"Yes"},{"from":"b","to":"e","label":"No"}]}}\n```\n\n## Why a diagonal is harder\n\nEach split is horizontal or vertical. A slanted boundary takes several cuts, forming a staircase.';
const DEEP_MORE = '## Which split wins?\n\nGroup counts are approvals / denials.\n\n| Split | Group 1 | Group 2 | Gini after |\n| --- | --- | --- | --- |\n| A | 3 / 1 | 1 / 3 | 0.375 |\n| B | 2 / 2 | 2 / 2 | 0.5 |\n\nFor A, each group has Gini 1 − (¾)² − (¼)² = 0.375.';
// A block of exactly n visible code points (explanationChars, still the saved-card counter): a title plus Unicode body text (é and 😀 are one code point each).
const visible = (n, title = 'T') => ({ title, body: 'é'.repeat(n - 2) });
// EXP-13, owner 2026-11-08: a v2 block whose PROSE is exactly n code points (the title and the diagram do not count).
const AFTER = 'Slope done.';
const sized = (n, title = 'T') => ({ title, body: withVisual(`Slope ${'é'.repeat(n - 'Slope '.length - 1 - AFTER.length)}`, { after: AFTER }) });

test('CORE.09: the counter counts code points of the visible text: title, prose, table cells, diagram labels and collapsed sections; markup is free', () => {
  for (const n of [600, 1000, 1500]) assert.equal(explanationChars(visible(n)), n);
  assert.equal(explanationChars({ title: '😀', body: 'é😀' }), 4, 'an astral character is one code point');
  assert.equal(explanationChars({ title: 'T', body: '  a \n\n   b  ' }), 5, 'whitespace runs collapse to one space');
  assert.equal(explanationChars({ title: 'T', body: '## **Bold** and `code` [link](https://x.test)' }), 'T Bold and code link'.length);
  assert.equal(explanationChars({ title: 'T', body: '| a | b |\n| --- | --- |\n| c | d |' }), 'T a b c d'.length, 'the separator row and the pipes are not counted');
  assert.equal(explanationChars({ title: 'T', body: '```rh-diagram\n{"version":1,"diagram":{"kind":"flow","title":"T2","nodes":[{"id":"a","label":"Go","role":"process"},{"id":"b","label":"Stop","role":"outcome"}],"edges":[{"from":"a","to":"b","label":"now"}]}}\n```' }), 'T T2 Go Stop now'.length, 'ids, roles and the JSON are not counted; the title and the labels are');
  assert.equal(explanationChars({ title: 'T', body: 'b', more: [{ label: 'More', text: 'hidden words' }] }), 'T b More hidden words'.length, 'a collapsed section counts');
  assert.equal(explanationChars({ title: 'T', body: 'b', more: [] }), 3);
  // The file 06 fixtures were sized for the earlier 600 target; the target is 450 since the gpt-oss benchmark (owner 2026-11-08) and saved cards are not re-checked.
  assert.ok(explanationChars({ title: 'Decision trees', body: DEEP_BODY, more: [{ label: 'Worked example', text: DEEP_MORE }] }) <= 600);
});

// EXP-13, owner 2026-11-08: one prose budget for every Depth, asked for at 600 and refused only above the 700 hard limit.
test('CORE.09: each Depth passes exactly at the hard limit and fails one code point over; an invalid diagram is refused', () => {
  const cap = EXPLANATION_BUDGET.hard;
  for (const depth of Object.keys(EXPLANATION_CAPS)) {
    assert.equal(explanationProblem(sized(cap), depth), null, `${depth} at ${cap}`);
    assert.match(explanationProblem(sized(cap + 1), depth), /^explanation_over_budget:.*limit is 700/, `${depth} at ${cap + 1}`);
  }
  assert.equal(explanationProblem(sized(cap)), null, 'an omitted Depth is Standard');
  assert.match(explanationProblem(sized(cap + 1)), /^explanation_over_budget:/, 'Standard has the one budget too');
  assert.equal(diagramProblem(DEEP_BODY), null, 'the file 06 diagram, written as an rh-diagram spec, is valid');
  for (const bad of ['```mermaid\nflowchart TD\n  A["x"] --> B', '```mermaid\nsequenceDiagram\n  A->>B: hi\n```', '```mermaid\nflowchart TD\n  click A "https://x.test"\n```', '```mermaid\nflowchart TD\n  style A fill:#f00\n```', '```mermaid\n%%{init: {}}%%\nflowchart TD\n```', '```mermaid\nflowchart TD\n  A["<b>x</b>"]\n```'])
    assert.match(diagramProblem(bad), /^explanation_bad_diagram:/, bad);
  assert.match(explanationProblem({ title: 'T', body: 'b', more: [{ label: 'L', text: '```rh-diagram\n{"version":1}\n```' }] }), /^explanation_bad_diagram/, 'a section diagram is checked too');
});

const scriptedArtifact = (...replies) => { const seen = []; return { seen, callModel: async (env, body) => { seen.push(body); const [name, input] = replies[seen.length - 1]; return Response.json({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: `c${seen.length}`, name, input }] }); } }; };

test('CORE.09: a direct question and a roadmap step get the same Explanation guidance, Depth objective and budget; the roadmap keeps its accepted title', async () => {
  for (const [depth, cap] of Object.entries(EXPLANATION_CAPS)) {
    const direct = scriptedArtifact(['make_explanation', { title: 'Why trees split', body: withVisual('Prose with a table.\n\n| a | b |\n| --- | --- |\n| 1 | 2 |') }]);
    const out = await generateArtifact({}, { command: 'explain', args: 'Why do decision trees split on one feature?', ...(depth === 'balanced' ? {} : { depth }) }, { callModel: direct.callModel });
    assert.equal(out.result, 'artifact', depth);
    const desc = direct.seen[0].tools.find(t => t.name === 'make_explanation').description;
    assert.ok(desc.includes(EXPLANATION_GUIDANCE) && desc.includes(explanationTarget(depth)) && desc.includes(`at most ${cap.toLocaleString('en-US')} characters`), depth);
    assert.ok(JSON.parse(direct.seen[0].messages[0].content).learnerText.includes('Why do decision trees split'), 'the question rides in the request');
    const roadmap = await run(record({ depth, stepTitle: 'Splits' }), [['make_explanation', { title: 'A different model title', body: withVisual('Splits divide the data.') }]]);
    assert.equal(roadmap.out.outcome, 'ok', depth);
    assert.equal(roadmap.out.block.title, 'Splits', 'the accepted title wins over the model title');
    assert.equal(roadmap.m.seen[0].body.tools.find(t => t.name === 'make_explanation').description, desc, `${depth}: identical teaching target on both paths`);
  }
  // Non-Explanation artifacts are untouched: a table step gets no Explanation guidance.
  const table = await run(record({ format: 'table' }), [['make_table', { title: 'Rates', caption: '', columns: ['a', 'b'], rows: [['1', '2']] }]]);
  assert.ok(!table.m.seen[0].body.tools[0].description.includes('make_explanation, the main body'));
});

test('CORE.09: over budget or an invalid diagram is a terminal roadmap validation failure after one call; the direct path keeps its one repair', async () => {
  const cap = EXPLANATION_BUDGET.hard; // EXP-13, owner 2026-11-08
  for (const depth of Object.keys(EXPLANATION_CAPS)) {
    const at = await run(record({ depth, stepTitle: 'T' }), [['make_explanation', sized(cap, 'model title')]]);
    assert.equal(at.out.outcome, 'ok', `${depth} exactly at the cap with the accepted title`);
    const over = await run(record({ depth, stepTitle: 'T' }), [['make_explanation', sized(cap + 1)], ['make_explanation', explanation]]);
    assert.deepEqual([over.out.failure_class, over.out.code, over.m.seen.length], ['terminal_validation_failure', 'explanation_over_budget', 1], depth);
  }
  const mermaid = await run(record(), [['make_explanation', { title: 'T', body: '```mermaid\nflowchart TD\n  A["x"] --> B["y"]\n```' }]]);
  assert.deepEqual([mermaid.out.code, mermaid.m.seen.length], ['explanation_bad_diagram', 1]);
  const direct = scriptedArtifact(['make_explanation', sized(cap + 1)], ['make_explanation', explanation]);
  const out = await generateArtifact({}, { command: 'explain', args: 'ideas' }, { callModel: direct.callModel });
  assert.deepEqual([out.result, direct.seen.length], ['artifact', 2], 'the direct lifecycle: one repair quoting the budget');
  assert.match(JSON.stringify(direct.seen[1].messages.at(-1)), /explanation_over_budget/);
});
