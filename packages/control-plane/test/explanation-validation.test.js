// CORE.09 / owner item 3: the 600 / 1,000 / 1,500 caps count VISIBLE text (literal inline code, collapsed sections, table cells, Mermaid
// labels) exactly at the cap and one code point over, and every fence the renderer treats as Mermaid goes through the same validation,
// through BOTH entry points: the standalone written command (generateArtifact) and roadmap generation (generateRoadmapCard).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { explanationChars, explanationProblem, mermaidProblem } from '../src/learn-primitives.js';
import { generateArtifact } from '../src/learn-artifact.js';
import { generateRoadmapCard } from '../src/roadmap/roadmap-generate.js';
import { EXPLANATION_CAPS } from '../src/chat-depth.js';

const access = { org: 'o', actorUserId: 'u1', actorEmail: 'a@x.test', boardId: 'b1', boardOwnerEmail: 'a@x.test', role: 'owner', payerUserId: 'u1' };
const ref = { authorizationId: 'auth_00000001', resultId: 'res_00000001', resultVersion: 1 };
const record = (over = {}) => ({ cardId: 'card_0000001', stepId: 'step_0000001', proposalId: 'prop_0000001', proposalVersion: 1, format: 'explanation', stepTitle: 'T', stepGoal: 'Read it.', passageText: 'Some passage.', sourceRef: { v: 1, id: 'sref_abc' }, language: 'en', depth: 'standard', retry: 0, ...over });
const scripted = (...replies) => { const seen = []; return { seen, callModel: async (env, body) => { seen.push(body); const [name, input] = replies[Math.min(seen.length, replies.length) - 1]; return Response.json({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: `c${seen.length}`, name, input }] }); } }; };
const viaRoadmap = (depth, block) => { const m = scripted(['make_explanation', block]); return generateRoadmapCard({}, access, ref, { loadAccepted: async () => record({ depth }), withProviderCall: (env, fields) => ({ ...env, fields }), callModel: m.callModel }).then(out => ({ out, m })); };
const viaDirect = (depth, block) => { const m = scripted(['make_explanation', block], ['make_explanation', block], ['make_explanation', block]); return generateArtifact({}, { command: 'explanation', args: 'x', depth }, { callModel: m.callModel }).then(out => ({ out, m })); };

// Blocks whose visible text is exactly n code points, computed here from what the card DRAWS (not from the counter under test).
// Title 'T' is 1; every join is one space.
const SHAPES = {
  prose: n => ({ title: 'T', body: 'é'.repeat(n - 2) }),
  // The code span's displayed text is its content: emphasis, link and underscore markers inside it are drawn literally.
  'inline code': n => { const code = 'a**b**c [d](e) f__g__h'; return { title: 'T', body: '`' + code + '` ' + 'é'.repeat(n - 2 - code.length - 1) }; },
  // Two collapsed sections (the schema allows 800 characters each): 'T b' + ' L ' + s1 + ' L ' + s2.
  'collapsed section': n => { const rest = n - 'T b L  L '.length, first = Math.floor(rest / 2); return { title: 'T', body: 'b', more: [{ label: 'L', text: 'é'.repeat(first) }, { label: 'L', text: 'é'.repeat(rest - first) }] }; },
  table: n => ({ title: 'T', body: '| h1 | h2 |\n| --- | --- |\n| ' + 'é'.repeat(n - 'T h1 h2  x'.length) + ' | x |' }),
  // Prose first, then a supported flowchart whose labels are the only counted diagram text.
  'mermaid': n => mermaidShape(n, 'mermaid'),
  'mermaid extra': n => mermaidShape(n, 'mermaid extra'),
  'Mermaid': n => mermaidShape(n, 'Mermaid'),
  'mermaid, trailing spaces': n => mermaidShape(n, 'mermaid   '),
  'mermaid, spaced': n => mermaidShape(n, ' mermaid'),
};
function mermaidShape(n, info) {
  const diagram = '```' + info + '\nflowchart TD\n  A["Go"] --> B["Stop"]\n```';
  return { title: 'T', body: 'é'.repeat(n - 'T  Go Stop'.length) + '\n\n' + diagram };
}

test('the harness builds blocks of exactly n visible code points', () => {
  for (const n of [600, 1000, 1500]) {
    assert.equal(explanationChars(SHAPES.prose(n)), n);
    assert.equal(explanationChars(SHAPES['collapsed section'](n)), n);
    assert.equal(explanationChars(SHAPES.table(n)), n);
    assert.equal(explanationChars(SHAPES.mermaid(n)), n);
  }
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

test('every fence the renderer treats as Mermaid is validated: an unsupported diagram is refused under every info string, at both entry points', async () => {
  for (const info of ['mermaid', 'mermaid extra', 'Mermaid', 'MERMAID', 'mermaid   ', ' mermaid', 'mermaid {theme: dark}']) {
    const body = '```' + info + '\nflowchart TD\n  subgraph S\n```';
    assert.match(mermaidProblem(body) || '', /^explanation_bad_mermaid/, `[${info}]`);
    const direct = await viaDirect('standard', { title: 'T', body });
    assert.match(direct.out.error || '', /^explanation_bad_mermaid/, `direct [${info}]`);
    const roadmap = await viaRoadmap('standard', { title: 'T', body });
    assert.deepEqual([roadmap.out.code, roadmap.m.seen.length], ['explanation_bad_mermaid', 1], `roadmap [${info}]`);
    const inMore = await viaRoadmap('standard', { title: 'T', body: 'b', more: [{ label: 'L', text: body }] });
    assert.equal(inMore.out.code, 'explanation_bad_mermaid', `section [${info}]`);
  }
});

test('the server reads a fence the way the card does: the renderer\'s own open and close patterns', () => {
  const md = readFileSync(new URL('../../web/src/Md.jsx', import.meta.url), 'utf8');
  const prim = readFileSync(new URL('../src/learn-primitives.js', import.meta.url), 'utf8');
  assert.ok(md.includes("l.match(/^\\s*```\\s*([\\w+#.-]*)/)"), 'Md.jsx opening pattern');
  assert.ok(md.includes("if (/^\\s*```/.test(l)) { out.push(fenceOf("), 'Md.jsx closing pattern');
  assert.ok(md.includes('/^mermaid$/i.test(fence.lang)'), 'Md.jsx Mermaid test');
  assert.ok(prim.includes("const FENCE = /^\\s*```\\s*([\\w+#.-]*)/;"), 'the server opens a fence with the same pattern');
  assert.ok(prim.includes("/^\\s*```/.test(line)"), 'the server closes a fence with the same pattern');
});
