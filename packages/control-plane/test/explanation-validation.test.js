// CORE.09 as changed by EXP-13 (owner 2026-11-08): one budget for every Depth counting PROSE only (asked for 600, refused above 700; the title, tables, diagrams and
// illustrations are free), exactly at the limit and one code point over, every rh-diagram spec goes through
// parseTutorDiagram before delivery, and a NEW Mermaid fence is refused, through BOTH entry points: the standalone written command
// (generateArtifact) and roadmap generation (generateRoadmapCard).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { diagramProblem, explanationProblem, explanationProseChars, markdownVisuals, settleExplanationBody } from '../src/learn-primitives.js';
import { generateArtifact } from '../src/learn-artifact.js';
import { generateRoadmapCard } from '../src/roadmap/roadmap-generate.js';
import { EXPLANATION_BUDGET, EXPLANATION_CAPS } from '../src/chat-depth.js';
import { illustrationFence } from './explanation-layout-fixture.js';

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

// EXP-13 (owner 2026-11-08): the budget counts PROSE only (paragraph, heading and list text). Blocks whose prose is exactly n code points, computed here from
// what the card draws, each in the v2 layout (prose, visual, prose); the title, tables, diagrams and illustrations around it are free.
const AFTER = 'Go on.'; // the prose after the visual: 6 code points, joined to the prose before by one space
const lead = n => 'Go ' + 'é'.repeat(n - 'Go '.length - 1 - AFTER.length); // 'Go' is a diagram label, so the visual names its prose
const SHAPES = {
  prose: n => ({ title: 'T', body: lead(n) + '\n\n' + fence() + '\n\n' + AFTER }),
  'a long title is free': n => ({ title: 'T'.repeat(120), body: lead(n) + '\n\n' + fence() + '\n\n' + AFTER }),
  // The code span's displayed text is its content: emphasis, link and underscore markers inside it are drawn literally.
  'inline code': n => { const code = 'a**b**c [d](e) f__g__h'; return { title: 'T', body: 'Go `' + code + '` ' + 'é'.repeat(n - 'Go '.length - code.length - 1 - 1 - AFTER.length) + '\n\n' + fence() + '\n\n' + AFTER }; },
  'a list item and a heading count': n => ({ title: 'T', body: '## Go\n\n- ' + 'é'.repeat(n - 'Go '.length - 1 - AFTER.length) + '\n\n' + fence() + '\n\n' + AFTER }),
  'a long table is free': n => ({ title: 'T', body: lead(n) + '\n\n| h1 | h2 |\n| --- | --- |\n| ' + 'x'.repeat(900) + ' | y |\n\n' + fence() + '\n\n' + AFTER }),
  'a diagram caption is free': n => ({ title: 'T', body: lead(n) + '\n\n' + fence({ ...SPEC, diagram: { ...SPEC.diagram, caption: 'c'.repeat(140) } }) + '\n\n' + AFTER }),
  'an illustration prompt and caption are free': n => ({ title: 'T', body: lead(n) + '\n\n' + illustrationFence({ prompt: 'p'.repeat(600), caption: 'Go and see', alt: 'Go' }) + '\n\n' + AFTER }),
  'two visuals': n => { const mid = 'Go next.'; return { title: 'T', body: 'Go ' + 'é'.repeat(n - 'Go '.length - 1 - mid.length - 1 - AFTER.length) + '\n\n' + fence() + '\n\n' + mid + '\n\n' + fence(SPEC, 'RH-Diagram extra') + '\n\n' + AFTER }; },
};
const { target, hard } = EXPLANATION_BUDGET;

test('the harness builds blocks of exactly n prose code points', () => {
  for (const n of [hard, hard + 1]) for (const name of Object.keys(SHAPES)) assert.equal(explanationProseChars(SHAPES[name](n)), n, name);
});

for (const [name, build] of Object.entries(SHAPES)) {
  test(`${name}: exactly ${hard} prose code points pass and one over fails at every Depth, through the written command and roadmap generation`, async () => {
    for (const depth of Object.keys(EXPLANATION_CAPS)) {
      assert.equal(explanationProblem(build(hard), depth, 'x'), null, `${depth} at ${hard}`);
      assert.match(explanationProblem(build(hard + 1), depth, 'x') || '', new RegExp(`^explanation_over_budget: the card has ${hard + 1} characters of prose .*the limit is ${hard} [(]aim for ${target}[)]`), `${depth} at ${hard + 1}`);
      const direct = await viaDirect(depth, build(hard));
      assert.equal(direct.out.result, 'artifact', `direct ${depth} at ${hard}`);
      assert.match(JSON.stringify(direct.m.seen[0].tools), new RegExp(`at most ${target} characters of prose`), 'the request asks for the 600 target');
      // EXP-13 fix 1a (owner 2026-11-08): over the hard limit the server first trims whole sentences or list items (each prose part keeps one); only a card
      // that still does not fit goes to the repair (direct) or fails (roadmap). The 'list item and heading' shape trims; the others are one long sentence each.
      const trims = explanationProseChars({ body: settleExplanationBody(build(hard + 1).body) }) <= hard;
      const directOver = await viaDirect(depth, build(hard + 1));
      if (trims) assert.deepEqual([directOver.out.result, explanationProseChars(directOver.out.block) <= hard, directOver.m.seen.length], ['artifact', true, 1], `direct ${depth} over, trimmed`);
      else assert.deepEqual([directOver.out.result, /^explanation_over_budget:/.test(directOver.out.error)], ['validation_error', true], `direct ${depth} over`);
      const roadmap = await viaRoadmap(depth, build(hard));
      assert.equal(roadmap.out.outcome, 'ok', `roadmap ${depth} at ${hard}`);
      const roadmapOver = await viaRoadmap(depth, build(hard + 1));
      if (trims) assert.deepEqual([roadmapOver.out.outcome, roadmapOver.m.seen.length], ['ok', 1], `roadmap ${depth} over, trimmed`);
      else assert.deepEqual([roadmapOver.out.failure_class, roadmapOver.out.code, roadmapOver.m.seen.length], ['terminal_validation_failure', 'explanation_over_budget', 1], `roadmap ${depth} over`);
    }
  });
}

const BAD = {
  cycle: { ...SPEC, diagram: { ...SPEC.diagram, edges: [...SPEC.diagram.edges, { from: 'c', to: 'a' }] } },
  'unknown edge endpoint': { ...SPEC, diagram: { ...SPEC.diagram, edges: [...SPEC.diagram.edges, { from: 'b', to: 'zzz', label: 'Maybe' }] } },
  'process with two outgoing edges': { ...SPEC, diagram: { ...SPEC.diagram, edges: [{ from: 'a', to: 'b' }, { from: 'a', to: 'c' }, { from: 'b', to: 'd', label: 'x' }, { from: 'b', to: 'c', label: 'y' }] } },
  'unknown kind': { version: 1, diagram: { kind: 'venn', title: 'T' } },
  'not JSON': 'this is not json',
};

// Item 47 (owner 2026-11-08): these the server fixes itself before any check (learn-primitives.js correctDiagrams), so they are no longer repair cases.
const SERVER_FIXED = {
  one_branch_decision: { ...SPEC, diagram: { ...SPEC.diagram, edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'c', label: 'Yes' }], nodes: SPEC.diagram.nodes.slice(0, 3) } },
  label_trimmed: { ...SPEC, diagram: { ...SPEC.diagram, nodes: [{ id: 'a', label: 'Go and then go a little further along the road until this long label runs over', role: 'process' }, ...SPEC.diagram.nodes.slice(1)] } },
};
test('item 47: a one-branch decision and an over-long label are fixed by the server in the one call and counted on the card; no repair', async () => {
  for (const [kind, spec] of Object.entries(SERVER_FIXED)) {
    const body = GOOD + '\n\nGo on.\n\n' + fence(spec) + '\n\nGo end.';
    assert.match(diagramProblem(body) || '', /^explanation_bad_diagram/, `${kind}: invalid as written`);
    const d = await viaDirect('standard', { title: 'T', body });
    assert.deepEqual([d.out.result, d.m.seen.length, d.out.diagramsDropped, d.out.block.diagramCorrections], ['artifact', 1, undefined, { [kind]: 1 }], kind);
    assert.equal(diagramProblem(d.out.block.body), null, `${kind}: the delivered diagram is valid`);
  }
});

// EXP-13: a card needs a visual, so a bad diagram is dropped when another valid visual remains (prose, good, prose, bad, prose); as the only visual it is simplified or, failing that, dropped with the card marked (owner 2026-11-08).
const GOOD = 'Go first.\n\n' + fence();
test('a valid rh-diagram is delivered unchanged; every invalid spec is checked by the validator, repaired once on the direct path and then DROPPED when another visual remains (never the invalid spec)', async () => {
  assert.equal(diagramProblem(fence()), null);
  const ok = { title: 'T', body: GOOD + '\n\nGo on.' };
  const direct = await viaDirect('standard', ok);
  assert.deepEqual([direct.out.result, direct.out.block.body, direct.out.diagramsDropped], ['artifact', ok.body, undefined], 'the spec text is delivered as written');
  assert.equal((await viaRoadmap('standard', ok)).out.outcome, 'ok');
  for (const [name, spec] of Object.entries(BAD)) {
    const body = GOOD + '\n\nGo on.\n\n' + fence(spec) + '\n\nGo end.';
    assert.match(diagramProblem(body) || '', /^explanation_bad_diagram: the rh-diagram spec is not valid/, name);
    // direct path: one repair call, then the card without the bad diagram
    const d = await viaDirect('standard', { title: 'T', body });
    assert.deepEqual([d.out.result, d.out.block?.body, d.out.diagramsDropped, d.m.seen.length], ['artifact', GOOD + '\n\nGo on.\n\nGo end.', 1, 2], 'direct ' + name);
    // roadmap path: one call, repairs 0, the same delivery
    const r = await viaRoadmap('standard', { title: 'T', body });
    assert.deepEqual([r.out.outcome, r.out.block?.body, r.out.diagramsDropped, r.m.seen.length], ['ok', GOOD + '\n\nGo on.\n\nGo end.', 1, 1], 'roadmap ' + name);
    // the only visual is bad (owner 2026-11-08, a card should not fail; replaces "the card fails truthfully"): it becomes a straight flow of its own labels
    // when it has two or more, else the prose card is delivered without it
    const only = await viaRoadmap('standard', { title: 'T', body: 'Go first.\n\n' + fence(spec) + '\n\nGo on.' });
    const fallback = ['unknown kind', 'not JSON'].includes(name) ? 'dropped' : 'simplified';
    assert.deepEqual([only.out.outcome, only.out.block?.visualFallback, markdownVisuals(only.out.block?.body).diagrams.map(v => v.ok)], ['ok', fallback, fallback === 'simplified' ? [true] : []], 'only visual ' + name);
  }
  const unclosed = await viaRoadmap('standard', { title: 'T', body: GOOD + '\n\nGo on.\n\n```rh-diagram\n' + JSON.stringify(SPEC) });
  assert.deepEqual([unclosed.out.outcome, unclosed.out.block?.body, unclosed.out.diagramsDropped], ['ok', GOOD + '\n\nGo on.', 1], 'an unclosed fence is dropped');
  assert.match(diagramProblem('```rh-diagram\n' + JSON.stringify(SPEC)) || '', /not closed/, 'an unclosed fence');
});

test('the single repair: invalid then valid keeps the diagram; two bad fences drop independently; the prose still has to pass its own checks', async () => {
  const bad = { title: 'T', body: 'Go first.\n\n' + fence(BAD.cycle) + '\n\nGo on.' }, good = { title: 'T', body: GOOD + '\n\nGo on.' };
  const m = scripted(['make_explanation', bad], ['make_explanation', good]);
  const repaired = await generateArtifact({}, { command: 'explanation', args: 'x', depth: 'standard' }, { callModel: m.callModel });
  assert.deepEqual([repaired.result, repaired.block.body, repaired.repaired, repaired.diagramsDropped, m.seen.length], ['artifact', good.body, true, undefined, 2], 'the repaired diagram is kept');
  // dropping the fence leaves the prose, which must still fit the limit
  const over = { title: 'T', body: GOOD + '\n\n' + 'é'.repeat(EXPLANATION_BUDGET.hard) + '\n\n' + fence(BAD.cycle) + '\n\nGo end.' };
  const failed = await viaRoadmap('overview', over);
  assert.deepEqual([failed.out.failure_class, failed.out.code], ['terminal_validation_failure', 'explanation_over_budget']);
  const fits = await viaRoadmap('overview', { title: 'T', body: GOOD + '\n\nGo on.\n\n' + fence(BAD.cycle) + '\n\nGo end.' });
  assert.deepEqual([fits.out.outcome, fits.out.diagramsDropped], ['ok', 1]);
});

test('a NEW Mermaid fence is the superseded format: refused under every info string, at both entry points (the card still draws saved ones)', async () => {
  for (const info of ['mermaid', 'mermaid extra', 'Mermaid', 'MERMAID', 'mermaid   ', ' mermaid', 'mermaid {theme: dark}']) {
    const body = '```' + info + '\nflowchart TD\n  A["Go"] --> B["Stop"]\n```';
    assert.match(diagramProblem(body) || '', /^explanation_bad_diagram: a mermaid fence is not accepted/, `[${info}]`);
    const direct = await viaDirect('standard', { title: 'T', body });
    assert.match(direct.out.error || '', /^explanation_bad_diagram/, `direct [${info}]`);
    const roadmap = await viaRoadmap('standard', { title: 'T', body });
    assert.deepEqual([roadmap.out.code, roadmap.m.seen.length], ['explanation_bad_diagram', 1], `roadmap [${info}]`);
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

test('one card over its prose budget AND with an invalid diagram: both problems reach the single repair request, with the measured length, the limit and the diagram errors', async () => {
  const bad = BAD['unknown edge endpoint'];
  const block = { title: 'T', body: 'Go ' + 'é'.repeat(1100) + '\n\n' + fence(bad) + '\n\nGo on.' };
  const used = explanationProseChars(block);
  assert.ok(used > EXPLANATION_BUDGET.hard, 'the card is over budget');
  assert.match(diagramProblem(block.body) || '', /^explanation_bad_diagram:/, 'and its diagram is invalid');
  const fixed = { title: 'T', body: 'Go ' + 'é'.repeat(300) + '\n\n' + fence() + '\n\nGo on.' };
  const m = scripted(['make_explanation', block], ['make_explanation', fixed]);
  const out = await generateArtifact({}, { command: 'explanation', args: 'x', depth: 'standard' }, { callModel: m.callModel });
  assert.equal(m.seen.length, 2, 'one call and one repair, no more');
  const feedback = m.seen[1].messages.at(-1).content[0];
  assert.equal(feedback.is_error, true);
  assert.match(feedback.content, new RegExp(`explanation_over_budget: the card has ${used} characters of prose .*the limit is ${EXPLANATION_BUDGET.hard}`), 'the measured length and the limit');
  assert.match(feedback.content, /explanation_bad_diagram: the rh-diagram spec is not valid \(.*unknown node/i, 'and the specific diagram error, in the same message');
  assert.deepEqual([out.result, out.repaired, out.block.body.includes('rh-diagram')], ['artifact', true, true], 'the repaired card keeps its now-valid diagram');
});
