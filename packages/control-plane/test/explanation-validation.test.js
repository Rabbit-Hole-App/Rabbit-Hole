// CORE.09 / owner item 3 + the TutorDiagram switch: the 600 / 1,000 / 1,500 caps count VISIBLE text (literal inline code, collapsed sections,
// table cells, a diagram's title, caption and labels) exactly at the cap and one code point over, every rh-diagram spec goes through
// parseTutorDiagram before delivery, and a NEW Mermaid fence is refused, through BOTH entry points: the standalone written command
// (generateArtifact) and roadmap generation (generateRoadmapCard).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { diagramProblem, explanationChars, explanationProblem } from '../src/learn-primitives.js';
import { generateArtifact } from '../src/learn-artifact.js';
import { generateRoadmapCard } from '../src/roadmap/roadmap-generate.js';
import { EXPLANATION_CAPS } from '../src/chat-depth.js';

const access = { org: 'o', actorUserId: 'u1', actorEmail: 'a@x.test', boardId: 'b1', boardOwnerEmail: 'a@x.test', role: 'owner', payerUserId: 'u1' };
const ref = { authorizationId: 'auth_00000001', resultId: 'res_00000001', resultVersion: 1 };
const record = (over = {}) => ({ cardId: 'card_0000001', stepId: 'step_0000001', proposalId: 'prop_0000001', proposalVersion: 1, format: 'explanation', stepTitle: 'T', stepGoal: 'Read it.', passageText: 'Some passage.', sourceRef: { v: 1, id: 'sref_abc' }, language: 'en', depth: 'standard', retry: 0, ...over });
const scripted = (...replies) => { const seen = []; return { seen, callModel: async (env, body) => { seen.push(body); const [name, input] = replies[Math.min(seen.length, replies.length) - 1]; return Response.json({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: `c${seen.length}`, name, input }] }); } }; };
const viaRoadmap = (depth, block) => { const m = scripted(['make_explanation', block]); return generateRoadmapCard({}, access, ref, { loadAccepted: async () => record({ depth }), withProviderCall: (env, fields) => ({ ...env, fields }), callModel: m.callModel }).then(out => ({ out, m })); };
const viaDirect = (depth, block) => { const m = scripted(['make_explanation', block], ['make_explanation', block], ['make_explanation', block]); return generateArtifact({}, { command: 'explanation', args: 'x', depth }, { callModel: m.callModel }).then(out => ({ out, m })); };

// A valid flow whose drawn words are exactly WORDS: title, node labels, edge labels (spec.js: one start, labelled branches, outcomes end).
const SPEC = { version: 1, diagram: { kind: 'flow', title: 'D', nodes: [{ id: 'a', label: 'Go', role: 'process' }, { id: 'b', label: 'Ok?', role: 'decision' }, { id: 'c', label: 'Yes end', role: 'outcome' }, { id: 'd', label: 'No end', role: 'outcome' }], edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'c', label: 'Yes' }, { from: 'b', to: 'd', label: 'No' }] } };
const WORDS = 'D Go Ok? Yes end No end Yes No';
const fence = (spec = SPEC, info = 'rh-diagram') => '```' + info + '\n' + (typeof spec === 'string' ? spec : JSON.stringify(spec)) + '\n```';
const padding = (n, base) => 'é'.repeat(n - base);

// Blocks whose visible text is exactly n code points, computed here from what the card DRAWS (not from the counter under test).
// Title 'T' is 1; every join is one space.
const SHAPES = {
  prose: n => ({ title: 'T', body: 'é'.repeat(n - 2) }),
  // The code span's displayed text is its content: emphasis, link and underscore markers inside it are drawn literally.
  'inline code': n => { const code = 'a**b**c [d](e) f__g__h'; return { title: 'T', body: '`' + code + '` ' + 'é'.repeat(n - 2 - code.length - 1) }; },
  // Two collapsed sections: 'T b' + ' L ' + s1 + ' L ' + s2.
  'collapsed section': n => { const rest = n - 'T b L  L '.length, first = Math.floor(rest / 2); return { title: 'T', body: 'b', more: [{ label: 'L', text: 'é'.repeat(first) }, { label: 'L', text: 'é'.repeat(rest - first) }] }; },
  table: n => ({ title: 'T', body: '| h1 | h2 |\n| --- | --- |\n| ' + 'é'.repeat(n - 'T h1 h2  x'.length) + ' | x |' }),
  // Prose first, then a diagram whose title and labels are the only counted diagram text.
  'diagram in the body': n => ({ title: 'T', body: padding(n, ['T', 'X', WORDS].join(' ').length - 1) + '\n\n' + fence() }),
  'diagram in a More section': n => ({ title: 'T', body: 'b', more: [{ label: 'L', text: padding(n, ['T', 'b', 'L', 'X', 'L', WORDS].join(' ').length - 1) }, { label: 'L', text: fence() }] }),
  'diagram with a caption': n => ({ title: 'T', body: padding(n, ['T', 'X', WORDS, 'cap'].join(' ').length - 1) + '\n\n' + fence({ ...SPEC, diagram: { ...SPEC.diagram, caption: 'cap' } }) }),
  'diagram, other info strings': n => ({ title: 'T', body: padding(n, ['T', 'X', WORDS].join(' ').length - 1) + '\n\n' + fence(SPEC, 'RH-Diagram extra') }),
};

test('the harness builds blocks of exactly n visible code points', () => {
  for (const n of [600, 1000, 1500]) for (const name of Object.keys(SHAPES)) assert.equal(explanationChars(SHAPES[name](n)), n, name);
});

for (const [name, build] of Object.entries(SHAPES)) {
  test(`${name}: exactly at each Depth cap passes and one code point over fails, through the written command and roadmap generation`, async () => {
    for (const [depth, cap] of Object.entries(EXPLANATION_CAPS)) {
      assert.equal(explanationProblem(build(cap), depth), null, `${depth} at ${cap}`);
      assert.match(explanationProblem(build(cap + 1), depth) || '', /^explanation_over_budget:/, `${depth} at ${cap + 1}`);
      const direct = await viaDirect(depth, build(cap));
      assert.equal(direct.out.result, 'artifact', `direct ${depth} at ${cap}`);
      const directOver = await viaDirect(depth, build(cap + 1));
      assert.deepEqual([directOver.out.result, /^explanation_over_budget:/.test(directOver.out.error)], ['validation_error', true], `direct ${depth} over`);
      const roadmap = await viaRoadmap(depth, build(cap));
      assert.equal(roadmap.out.outcome, 'ok', `roadmap ${depth} at ${cap}`);
      const roadmapOver = await viaRoadmap(depth, build(cap + 1));
      assert.deepEqual([roadmapOver.out.failure_class, roadmapOver.out.code, roadmapOver.m.seen.length], ['terminal_validation_failure', 'explanation_over_budget', 1], `roadmap ${depth} over`);
    }
  });
}

const BAD = {
  cycle: { ...SPEC, diagram: { ...SPEC.diagram, edges: [...SPEC.diagram.edges, { from: 'c', to: 'a' }] } },
  'decision with one branch': { ...SPEC, diagram: { ...SPEC.diagram, edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'c', label: 'Yes' }], nodes: SPEC.diagram.nodes.slice(0, 3) } },
  'unknown edge endpoint': { ...SPEC, diagram: { ...SPEC.diagram, edges: [...SPEC.diagram.edges, { from: 'b', to: 'zzz', label: 'Maybe' }] } },
  'process with two outgoing edges': { ...SPEC, diagram: { ...SPEC.diagram, edges: [{ from: 'a', to: 'b' }, { from: 'a', to: 'c' }, { from: 'b', to: 'd', label: 'x' }, { from: 'b', to: 'c', label: 'y' }] } },
  'over-long node label': { ...SPEC, diagram: { ...SPEC.diagram, nodes: [{ id: 'a', label: 'x'.repeat(61), role: 'process' }, ...SPEC.diagram.nodes.slice(1)] } },
  'unknown kind': { version: 1, diagram: { kind: 'venn', title: 'T' } },
  'not JSON': 'this is not json',
};

test('a valid rh-diagram is delivered unchanged; every invalid spec is checked by the validator, repaired once on the direct path and then DROPPED so the prose is delivered (never the invalid spec)', async () => {
  assert.equal(diagramProblem(fence()), null);
  const ok = { title: 'T', body: 'See:\n\n' + fence() };
  const direct = await viaDirect('standard', ok);
  assert.deepEqual([direct.out.result, direct.out.block.body, direct.out.diagramsDropped], ['artifact', ok.body, undefined], 'the spec text is delivered as written');
  assert.equal((await viaRoadmap('standard', ok)).out.outcome, 'ok');
  for (const [name, spec] of Object.entries(BAD)) {
    const body = 'See:\n\n' + fence(spec);
    assert.match(diagramProblem(body) || '', /^explanation_bad_diagram: the rh-diagram spec is not valid/, name);
    // direct path: one repair call, then the written explanation without the diagram
    const d = await viaDirect('standard', { title: 'T', body });
    assert.deepEqual([d.out.result, d.out.block?.body, d.out.diagramsDropped, d.m.seen.length], ['artifact', 'See:', 1, 2], 'direct ' + name);
    // roadmap path: one call, repairs 0, the same delivery
    const r = await viaRoadmap('standard', { title: 'T', body });
    assert.deepEqual([r.out.outcome, r.out.block?.body, r.out.diagramsDropped, r.m.seen.length], ['ok', 'See:', 1, 1], 'roadmap ' + name);
    const inMore = await viaRoadmap('standard', { title: 'T', body: 'b', more: [{ label: 'L', text: body }] });
    assert.deepEqual([inMore.out.outcome, inMore.out.block?.more?.[0]?.text, inMore.out.diagramsDropped], ['ok', 'See:', 1], 'section ' + name);
  }
  const unclosed = await viaRoadmap('standard', { title: 'T', body: 'See:\n\n```rh-diagram\n' + JSON.stringify(SPEC) });
  assert.deepEqual([unclosed.out.outcome, unclosed.out.block?.body, unclosed.out.diagramsDropped], ['ok', 'See:', 1], 'an unclosed fence is dropped');
  assert.match(diagramProblem('```rh-diagram\n' + JSON.stringify(SPEC)) || '', /not closed/, 'an unclosed fence');
});

test('the single repair: invalid then valid keeps the diagram; two bad fences drop independently; the prose still has to pass its own checks', async () => {
  const bad = { title: 'T', body: 'See:\n\n' + fence(BAD.cycle) }, good = { title: 'T', body: 'See:\n\n' + fence() };
  const m = scripted(['make_explanation', bad], ['make_explanation', good]);
  const repaired = await generateArtifact({}, { command: 'explanation', args: 'x', depth: 'standard' }, { callModel: m.callModel });
  assert.deepEqual([repaired.result, repaired.block.body, repaired.repaired, repaired.diagramsDropped, m.seen.length], ['artifact', good.body, true, undefined, 2], 'the repaired diagram is kept');
  // a body diagram that is bad and a More diagram that is good: only the bad one goes, the good one stays and still counts
  const mixed = { title: 'T', body: 'Intro.\n\n' + fence(BAD['not JSON']) + '\n\nOutro.', more: [{ label: 'L', text: fence() }, { label: 'M', text: 'p\n\n' + fence(BAD['unknown kind']) }] };
  const r = await viaRoadmap('standard', mixed);
  assert.equal(r.out.outcome, 'ok');
  assert.deepEqual([r.out.block.body, r.out.block.more[0].text, r.out.block.more[1].text, r.out.diagramsDropped], ['Intro.\n\nOutro.', fence(), 'p', 2]);
  // dropping the fence removes its words from the count, and the prose alone must still fit the cap
  const over = { title: 'T', body: 'é'.repeat(EXPLANATION_CAPS.overview) + '\n\n' + fence(BAD.cycle) };
  const failed = await viaRoadmap('overview', over);
  assert.deepEqual([failed.out.failure_class, failed.out.code], ['terminal_validation_failure', 'explanation_over_budget']);
  const fits = await viaRoadmap('overview', { title: 'T', body: 'é'.repeat(EXPLANATION_CAPS.overview - 2) + '\n\n' + fence(BAD.cycle) });
  assert.deepEqual([fits.out.outcome, fits.out.diagramsDropped], ['ok', 1], 'the invalid fence does not count once dropped');
});

test('a NEW Mermaid fence is the superseded format: refused under every info string, at both entry points (the card still draws saved ones)', async () => {
  for (const info of ['mermaid', 'mermaid extra', 'Mermaid', 'MERMAID', 'mermaid   ', ' mermaid', 'mermaid {theme: dark}']) {
    const body = '```' + info + '\nflowchart TD\n  A["Go"] --> B["Stop"]\n```';
    assert.match(diagramProblem(body) || '', /^explanation_bad_diagram: a mermaid fence is not accepted/, `[${info}]`);
    const direct = await viaDirect('standard', { title: 'T', body });
    assert.match(direct.out.error || '', /^explanation_bad_diagram/, `direct [${info}]`);
    const roadmap = await viaRoadmap('standard', { title: 'T', body });
    assert.deepEqual([roadmap.out.code, roadmap.m.seen.length], ['explanation_bad_diagram', 1], `roadmap [${info}]`);
    const inMore = await viaRoadmap('standard', { title: 'T', body: 'b', more: [{ label: 'L', text: body }] });
    assert.equal(inMore.out.code, 'explanation_bad_diagram', `section [${info}]`);
  }
});

test('the server reads a fence the way the card does: the renderer\'s own open and close patterns', () => {
  const md = readFileSync(new URL('../../web/src/Md.jsx', import.meta.url), 'utf8');
  const prim = readFileSync(new URL('../src/learn-primitives.js', import.meta.url), 'utf8');
  assert.ok(md.includes("l.match(/^\\s*```\\s*([\\w+#.-]*)/)"), 'Md.jsx opening pattern');
  assert.ok(md.includes("if (/^\\s*```/.test(l)) { out.push(fenceOf("), 'Md.jsx closing pattern');
  assert.ok(md.includes('DIAGRAM_FENCE.test(fence.lang)') && readFileSync(new URL('../../web/src/diagram-fence.js', import.meta.url), 'utf8').includes('/^rh-diagram$/i'), 'Md.jsx draws an rh-diagram fence with TutorDiagram');
  assert.ok(md.includes('/^mermaid$/i.test(fence.lang)'), 'Md.jsx keeps its legacy Mermaid reader');
  assert.ok(prim.includes("const FENCE = /^\\s*```\\s*([\\w+#.-]*)/;"), 'the server opens a fence with the same pattern');
  assert.ok(prim.includes("/^\\s*```/.test(line)"), 'the server closes a fence with the same pattern');
  assert.ok(prim.includes("const DIAGRAM = 'rh-diagram'"), 'the server and the card name the same fence language');
});

test('one card over its text budget AND with an invalid diagram: both problems reach the single repair request, with the measured length, the limit and the diagram errors', async () => {
  const bad = BAD['decision with one branch'];
  const block = { title: 'T', body: 'é'.repeat(1100) + '\n\n' + fence(bad) };
  const used = explanationChars(block);
  assert.ok(used > EXPLANATION_CAPS.standard, 'the card is over budget');
  assert.match(diagramProblem(block.body) || '', /^explanation_bad_diagram:/, 'and its diagram is invalid');
  const fixed = { title: 'T', body: 'é'.repeat(300) + '\n\n' + fence() };
  const m = scripted(['make_explanation', block], ['make_explanation', fixed]);
  const out = await generateArtifact({}, { command: 'explanation', args: 'x', depth: 'standard' }, { callModel: m.callModel });
  assert.equal(m.seen.length, 2, 'one call and one repair, no more');
  const feedback = m.seen[1].messages.at(-1).content[0];
  assert.equal(feedback.is_error, true);
  assert.match(feedback.content, new RegExp(`explanation_over_budget: the card has ${used} characters, the standard budget is ${EXPLANATION_CAPS.standard}`), 'the measured length and the limit');
  assert.match(feedback.content, /explanation_bad_diagram: the rh-diagram spec is not valid \(.*decision/i, 'and the specific diagram error, in the same message');
  assert.match(feedback.content, /fixing the diagram also changes this length/, 'the length counts the unparsed diagram text, and the message says so');
  assert.deepEqual([out.result, out.repaired, out.block.body.includes('rh-diagram')], ['artifact', true, true], 'the repaired card keeps its now-valid diagram');
  // Still one retry and the text fallback: when the repair keeps the bad diagram but fits the budget, the diagram is dropped and the text is delivered.
  const stillBad = { title: 'T', body: 'é'.repeat(300) + '\n\n' + fence(bad) };
  const m2 = scripted(['make_explanation', block], ['make_explanation', stillBad]);
  const dropped = await generateArtifact({}, { command: 'explanation', args: 'x', depth: 'standard' }, { callModel: m2.callModel });
  assert.deepEqual([m2.seen.length, dropped.result, dropped.diagramsDropped, dropped.block.body.includes('rh-diagram')], [2, 'artifact', 1, false]);
});
