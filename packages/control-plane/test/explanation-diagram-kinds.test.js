// S7-EXPAND: all 17 TutorDiagram kinds (19 library examples) go through the same gates as the flow: every rh-diagram fence passes parseTutorDiagram before
// delivery (an invalid one is repaired once, then dropped when another visual remains). EXP-13 (owner 2026-11-08): new cards have no More sections, and the
// budget counts prose only, so a diagram's drawn words (tutorDiagramVisibleText) are free.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { diagramProblem, explanationProblem, explanationProseChars, EXPLANATION_GUIDANCE, relationshipsAsGraphs } from '../src/learn-primitives.js';
// Owner C1.1 (2026-11-08): a relationship is delivered with the graph layout the server sets; every other example verbatim.
const delivered = body => relationshipsAsGraphs(body);
import { generateArtifact } from '../src/learn-artifact.js';
import { ARTIFACT_SYSTEM } from '../src/agents/learn-artifact.js';
import { generateRoadmapCard } from '../src/roadmap/roadmap-generate.js';
import { EXPLANATION_BUDGET, EXPLANATION_CAPS } from '../src/chat-depth.js';
import { parseTutorDiagram, tutorDiagramVisibleText } from '../../web/src/tutor-diagrams/spec.js';

const EXAMPLES = JSON.parse(readFileSync(new URL('../../web/src/tutor-diagrams/examples.json', import.meta.url), 'utf8'));
const KINDS = ['flow', 'comparison', 'timeline', 'sequence', 'matrix', 'layers', 'cycle', 'figure', 'tree', 'relationship', 'transformation', 'argument', 'number-line', 'coordinate-plot', 'bar-chart', 't-account', 'waterfall'];

const access = { org: 'o', actorUserId: 'u1', actorEmail: 'a@x.test', boardId: 'b1', boardOwnerEmail: 'a@x.test', role: 'owner', payerUserId: 'u1' };
const ref = { authorizationId: 'auth_00000001', resultId: 'res_00000001', resultVersion: 1 };
const record = (over = {}) => ({ cardId: 'card_0000001', stepId: 'step_0000001', proposalId: 'prop_0000001', proposalVersion: 1, format: 'explanation', stepTitle: 'T', stepGoal: 'Read it.', passageText: 'Some passage.', sourceRef: { v: 1, id: 'sref_abc' }, language: 'en', depth: 'balanced', retry: 0, ...over });
const scripted = (...replies) => { const seen = []; return { seen, callModel: async (env, body) => { seen.push(body); const [name, input] = replies[Math.min(seen.length, replies.length) - 1]; return Response.json({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: `c${seen.length}`, name, input }] }); } }; };
const viaRoadmap = (depth, block) => { const m = scripted(['make_explanation', block]); return generateRoadmapCard({}, access, ref, { loadAccepted: async () => record({ depth }), withProviderCall: (env, fields) => ({ ...env, fields }), callModel: m.callModel }).then(out => ({ out, m })); };
const viaDirect = (depth, block) => { const m = scripted(['make_explanation', block], ['make_explanation', block], ['make_explanation', block]); return generateArtifact({}, { command: 'explanation', args: 'x', depth }, { callModel: m.callModel }).then(out => ({ out, m })); };
const fence = spec => '```rh-diagram\n' + JSON.stringify(spec) + '\n```';
const points = s => Array.from(s).length;
const words = spec => tutorDiagramVisibleText(parseTutorDiagram(JSON.stringify(spec))).filter(Boolean);

test('the library ships a valid example for every one of the 17 kinds', () => {
  assert.deepEqual([...new Set(EXAMPLES.map(e => e.diagram.kind))].sort(), [...KINDS].sort());
  assert.equal(EXAMPLES.length, 22); // owner E2 2026-11-08: plus a binary tree, a highlighted search path and maths in labels
});

test('the authoring guidance teaches all 17 kinds, each with a when-to-use line; the one number rule lives in the system prompt (owner N1)', () => {
  for (const kind of KINDS) assert.ok(EXPLANATION_GUIDANCE.includes(kind), kind);
  assert.match(ARTIFACT_SYSTEM, /Never invent measurements, statistics or data about the real world/);
  assert.doesNotMatch(EXPLANATION_GUIDANCE, /Never invent numbers/);
});

test('a binary-tree question advertises and saves a top-down diagram with explicit child sides', async () => {
  const spec = { version: 1, diagram: { kind: 'tree', layout: 'binary', title: 'Binary tree', nodes: [
    { id: 'a', label: 'A' },
    { id: 'b', label: 'B', parent: 'a', side: 'left' },
    { id: 'c', label: 'C', parent: 'a', side: 'right' },
  ] } };
  const body = 'A binary tree gives each node up to two children.\n\n[[visual:1]]\n\nB is the left child of A, and C is its right child.';
  const m = scripted(['make_explanation', { title: 'Binary trees', body, visuals: [{ k: 'diagram', spec }] }]);
  const out = await generateArtifact({}, { command: 'explanation', args: 'How does a binary tree work?', depth: 'balanced' }, { callModel: m.callModel });
  const tool = m.seen[0].tools.find(item => item.name === 'make_explanation');
  assert.match(tool.description, /a binary tree use kind "tree" with layout "binary"/i);
  assert.equal(out.result, 'artifact');
  assert.equal(out.block.body, body.replace('[[visual:1]]', fence(spec)));
  assert.equal(m.seen.length, 1);
});

// EXP-13 (owner 2026-11-08): prose, visual, prose; the prose names the diagram's title, so the visual is related to the text around it.
const around = (example, extra = '') => `See ${example.diagram.title}.\n\n${fence(example)}\n\nThat is ${example.diagram.title}.${extra}`;

// A binary-layout tree is drawn binary only for a binary / heap / BST question (plainTreesUnlessBinary); these loops ask 'x', so those two are checked below.
const ORDINARY = EXAMPLES.filter(e => e.diagram.layout !== 'binary');
for (const [i, example] of ORDINARY.entries()) {
  const kind = example.diagram.kind, name = `${i + 1}. ${kind}`;
  test(`${name}: valid example is delivered verbatim in the body; an invalid second diagram is repaired once, then dropped, at both entry points`, async () => {
    assert.equal(diagramProblem(fence(example)), null);
    assert.ok(words(example).length > 0, 'a kind with no visible words could hide text');
    const body = { title: 'T', body: around(example) };
    const direct = await viaDirect('detailed', body);
    assert.deepEqual([direct.out.result, direct.out.block?.body, direct.out.diagramsDropped], ['artifact', delivered(body.body), undefined], 'direct');
    const road = await viaRoadmap('detailed', body);
    assert.deepEqual([road.out.outcome, road.out.block?.body, road.out.diagramsDropped], ['ok', delivered(body.body), undefined], 'roadmap');

    // invalid variant: the schema is strict, so an unknown key refuses every kind
    const bad = { ...example, diagram: { ...example.diagram, bogus: 1 } };
    assert.throws(() => parseTutorDiagram(JSON.stringify(bad)), undefined, 'parse refuses');
    assert.match(diagramProblem(fence(bad)) || '', /^explanation_bad_diagram:/);
    const badBlock = { title: 'T', body: around(example, `\n\n${fence(bad)}\n\nDone.`) };
    const d = await viaDirect('detailed', badBlock);
    assert.deepEqual([d.out.result, d.out.block?.body, d.out.diagramsDropped, d.m.seen.length], ['artifact', delivered(around(example, '\n\nDone.')), 1, 2], 'direct drop after one repair');
    const r = await viaRoadmap('detailed', badBlock);
    assert.deepEqual([r.out.outcome, r.out.block?.body, r.out.diagramsDropped, r.m.seen.length], ['ok', delivered(around(example, '\n\nDone.')), 1, 1], 'roadmap drop, one call');
  });
}

// EXP-13 budget: a diagram's drawn words never count, whatever the kind; only the prose around it does (exactly at the hard limit passes, one over fails).
for (const kind of ['figure', 'tree', 'argument', 'bar-chart', 'waterfall']) {
  test(`${kind}: its drawn words are free; the prose around it is counted exactly at the limit and one over fails`, async () => {
    const example = EXAMPLES.find(e => e.diagram.kind === kind), title = example.diagram.title;
    const build = n => { const before = `See ${title}. `, after = 'Done.'; return { title: 'T', body: before + 'é'.repeat(n - points(before) - 1 - points(after)) + '\n\n' + fence(example) + '\n\n' + after }; };
    const { hard } = EXPLANATION_BUDGET;
    assert.equal(explanationProseChars(build(hard)), hard, 'the counter sees the prose only');
    for (const depth of Object.keys(EXPLANATION_CAPS)) {
      assert.equal(explanationProblem(build(hard), depth, 'x'), null, `${depth} at ${hard}`);
      assert.match(explanationProblem(build(hard + 1), depth, 'x') || '', /^explanation_over_budget:/, `${depth} at ${hard + 1}`);
      assert.equal((await viaDirect(depth, build(hard))).out.result, 'artifact', `direct ${depth} at the limit`);
      const roadOver = await viaRoadmap(depth, build(hard + 1));
      assert.deepEqual([roadOver.out.failure_class, roadOver.out.code], ['terminal_validation_failure', 'explanation_over_budget'], `roadmap ${depth} over`);
    }
  });
}

test('unseen text cannot hide: an unparseable fence is refused, a parseable one adds no prose', () => {
  const hidden = '```rh-diagram\n' + 'x'.repeat(700) + '\n```';
  assert.match(explanationProblem({ title: 'T', body: 'See x.\n\n' + hidden + '\n\nDone.' }, 'brief') || '', /explanation_bad_diagram:/);
  const ids = { ...EXAMPLES.find(e => e.diagram.kind === 'tree') };
  assert.equal(explanationProseChars({ title: 'T', body: fence(ids) }), 0, 'ids, roles, numbers and labels are not prose');
});

test('the binary-tree examples are delivered verbatim for a BST question', async () => {
  for (const example of EXAMPLES.filter(e => e.diagram.layout === 'binary')) {
    const block = { title: 'T', body: around(example) };
    const m = scripted(['make_explanation', block]);
    const out = await generateArtifact({}, { command: 'explanation', args: 'Show me inserting 7 into a BST.', depth: 'detailed' }, { callModel: m.callModel });
    assert.deepEqual([out.result, out.block?.body], ['artifact', block.body], example.diagram.title);
  }
});

test('single-call roadmap path: an authored rh-diagram fence (every example but the two binary trees) is delivered verbatim from ONE author call with no repair, and survives a board JSON round trip', async () => {
  for (const [i, example] of ORDINARY.entries()) {
    const block = { title: 'T', body: around(example) };
    const { out, m } = await viaRoadmap('detailed', block);
    assert.equal(out.outcome, 'ok', `${i + 1}. ${example.diagram.kind}`);
    assert.equal(m.seen.length, 1, 'one author call, repairs 0');
    assert.equal(out.repaired, false);
    assert.equal(out.diagramsDropped, undefined);
    assert.equal(out.block.body, delivered(block.body), 'the fence is delivered verbatim (a relationship with its graph layout)');
    assert.deepEqual(JSON.parse(JSON.stringify(out.block)), out.block, 'board JSON round trip');
  }
});

test('a saved legacy Mermaid card is not touched by delivery checks on the way back out (only NEW Mermaid is refused)', () => {
  const legacy = { title: 'Old', body: 'Old card.\n\n```mermaid\nflowchart TD\n  A["Go"] --> B["Stop"]\n```' };
  assert.match(diagramProblem(legacy.body) || '', /mermaid|rh-diagram/i, 'new content with Mermaid is refused');
  assert.deepEqual(JSON.parse(JSON.stringify(legacy)), legacy, 'a saved card reloads unchanged; the card renders it through the legacy reader (web explanation-diagram.test.mjs)');
});
