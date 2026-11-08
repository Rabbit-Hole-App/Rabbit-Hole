// S7-EXPAND: all 17 TutorDiagram kinds (19 library examples) go through the same two gates as the flow: every rh-diagram fence in the body and in
// More sections passes parseTutorDiagram before delivery (an invalid one is repaired once, then dropped), and the visible-text caps count the
// words each kind DRAWS, from ONE source (tutorDiagramVisibleText), exactly at the cap and one code point over.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { diagramProblem, explanationChars, explanationProblem, EXPLANATION_GUIDANCE } from '../src/learn-primitives.js';
import { generateArtifact } from '../src/learn-artifact.js';
import { generateRoadmapCard } from '../src/roadmap/roadmap-generate.js';
import { EXPLANATION_CAPS } from '../src/chat-depth.js';
import { parseTutorDiagram, tutorDiagramVisibleText } from '../../web/src/tutor-diagrams/spec.js';

const EXAMPLES = JSON.parse(readFileSync(new URL('../../web/src/tutor-diagrams/examples.json', import.meta.url), 'utf8'));
const KINDS = ['flow', 'comparison', 'timeline', 'sequence', 'matrix', 'layers', 'cycle', 'figure', 'tree', 'relationship', 'transformation', 'argument', 'number-line', 'coordinate-plot', 'bar-chart', 't-account', 'waterfall'];

const access = { org: 'o', actorUserId: 'u1', actorEmail: 'a@x.test', boardId: 'b1', boardOwnerEmail: 'a@x.test', role: 'owner', payerUserId: 'u1' };
const ref = { authorizationId: 'auth_00000001', resultId: 'res_00000001', resultVersion: 1 };
const record = (over = {}) => ({ cardId: 'card_0000001', stepId: 'step_0000001', proposalId: 'prop_0000001', proposalVersion: 1, format: 'explanation', stepTitle: 'T', stepGoal: 'Read it.', passageText: 'Some passage.', sourceRef: { v: 1, id: 'sref_abc' }, language: 'en', depth: 'standard', retry: 0, ...over });
const scripted = (...replies) => { const seen = []; return { seen, callModel: async (env, body) => { seen.push(body); const [name, input] = replies[Math.min(seen.length, replies.length) - 1]; return Response.json({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: `c${seen.length}`, name, input }] }); } }; };
const viaRoadmap = (depth, block) => { const m = scripted(['make_explanation', block]); return generateRoadmapCard({}, access, ref, { loadAccepted: async () => record({ depth }), withProviderCall: (env, fields) => ({ ...env, fields }), callModel: m.callModel }).then(out => ({ out, m })); };
const viaDirect = (depth, block) => { const m = scripted(['make_explanation', block], ['make_explanation', block], ['make_explanation', block]); return generateArtifact({}, { command: 'explanation', args: 'x', depth }, { callModel: m.callModel }).then(out => ({ out, m })); };
const fence = spec => '```rh-diagram\n' + JSON.stringify(spec) + '\n```';
const points = s => Array.from(s).length;
const words = spec => tutorDiagramVisibleText(parseTutorDiagram(JSON.stringify(spec))).filter(Boolean);

test('the library ships a valid example for every one of the 17 kinds', () => {
  assert.deepEqual([...new Set(EXAMPLES.map(e => e.diagram.kind))].sort(), [...KINDS].sort());
  assert.equal(EXAMPLES.length, 19);
});

test('the authoring guidance teaches all 17 kinds, each with a when-to-use line, and the never-invent-numbers rule', () => {
  for (const kind of KINDS) assert.ok(EXPLANATION_GUIDANCE.includes(kind), kind);
  assert.match(EXPLANATION_GUIDANCE, /Never invent numbers/);
});

for (const [i, example] of EXAMPLES.entries()) {
  const kind = example.diagram.kind, name = `${i + 1}. ${kind}`;
  test(`${name}: valid example is delivered verbatim in the body and in a More section; an invalid variant is repaired once, then dropped, at both entry points`, async () => {
    assert.equal(diagramProblem(fence(example)), null);
    assert.ok(words(example).length > 0, 'a kind with no visible words could hide text');
    const body = { title: 'T', body: 'See:\n\n' + fence(example), more: [{ label: 'L', text: fence(example) }] };
    // the library cap is generous; the Depth caps here only matter for the counting tests below
    const depth = 'deep' in EXPLANATION_CAPS ? 'deep' : Object.keys(EXPLANATION_CAPS).at(-1);
    const direct = await viaDirect(depth, body);
    assert.deepEqual([direct.out.result, direct.out.block?.body, direct.out.block?.more?.[0]?.text, direct.out.diagramsDropped], ['artifact', body.body, body.more[0].text, undefined], 'direct');
    const road = await viaRoadmap(depth, body);
    assert.deepEqual([road.out.outcome, road.out.block?.body, road.out.diagramsDropped], ['ok', body.body, undefined], 'roadmap');

    // invalid variant: the schema is strict, so an unknown key refuses every kind
    const bad = { ...example, diagram: { ...example.diagram, bogus: 1 } };
    assert.throws(() => parseTutorDiagram(JSON.stringify(bad)), undefined, 'parse refuses');
    assert.match(diagramProblem(fence(bad)) || '', /^explanation_bad_diagram:/);
    const badBlock = { title: 'T', body: 'See:\n\n' + fence(bad), more: [{ label: 'L', text: 'p\n\n' + fence(bad) }] };
    const d = await viaDirect(depth, badBlock);
    assert.deepEqual([d.out.result, d.out.block?.body, d.out.block?.more?.[0]?.text, d.out.diagramsDropped, d.m.seen.length], ['artifact', 'See:', 'p', 2, 2], 'direct drop after one repair');
    const r = await viaRoadmap(depth, badBlock);
    assert.deepEqual([r.out.outcome, r.out.block?.body, r.out.block?.more?.[0]?.text, r.out.diagramsDropped, r.m.seen.length], ['ok', 'See:', 'p', 2, 1], 'roadmap drop, one call');
  });
}

// Cap counting, exactly at the cap and one over, for kinds whose drawn words are not the flow's: figure, tree, argument, bar-chart, waterfall.
// The expected length is computed here from tutorDiagramVisibleText (what the card draws), not from explanationChars.
for (const kind of ['figure', 'tree', 'argument', 'bar-chart', 'waterfall']) {
  for (const place of ['body', 'More section']) {
    test(`${kind} in the ${place}: visible text is counted exactly at each Depth cap and one over fails`, async () => {
      const example = EXAMPLES.find(e => e.diagram.kind === kind), drawn = words(example), drawnLen = drawn.reduce((n, w) => n + 1 + points(w), 0);
      const build = n => {
        if (place === 'body') { // 'T' + ' ' + pad + words
          const pad = n - 1 - 1 - drawnLen; return { pad, block: { title: 'T', body: 'é'.repeat(pad) + '\n\n' + fence(example) } };
        }
        const pad = n - 'T b L'.length - 1 - ' L'.length - drawnLen; // 'T b L' + ' ' + pad + ' L' + words
        return { pad, block: { title: 'T', body: 'b', more: [{ label: 'L', text: 'é'.repeat(pad) }, { label: 'L', text: fence(example) }] } };
      };
      let tested = 0;
      for (const [depth, cap] of Object.entries(EXPLANATION_CAPS)) {
        const at = build(cap), over = build(cap + 1);
        if (at.pad < 1) continue; // this example alone is longer than the shallow caps; the deeper ones still prove the rule
        tested++;
        assert.equal(explanationChars(at.block), cap, `${depth}: counter equals the drawn words`);
        assert.equal(explanationProblem(at.block, depth), null, `${depth} at ${cap}`);
        assert.match(explanationProblem(over.block, depth) || '', /^explanation_over_budget:/, `${depth} at ${cap + 1}`);
        assert.equal((await viaDirect(depth, at.block)).out.result, 'artifact', `direct ${depth} at cap`);
        const directOver = await viaDirect(depth, over.block);
        assert.deepEqual([directOver.out.result, /^explanation_over_budget:/.test(directOver.out.error)], ['validation_error', true], `direct ${depth} over`);
        assert.equal((await viaRoadmap(depth, at.block)).out.outcome, 'ok', `roadmap ${depth} at cap`);
        const roadOver = await viaRoadmap(depth, over.block);
        assert.deepEqual([roadOver.out.failure_class, roadOver.out.code], ['terminal_validation_failure', 'explanation_over_budget'], `roadmap ${depth} over`);
      }
      assert.ok(tested >= 1, 'at least one Depth cap fits this example');
    });
  }
}

test('unseen text cannot hide: an unparseable fence counts as its literal lines, a parseable one counts only what it draws', () => {
  const hidden = '```rh-diagram\n' + 'x'.repeat(700) + '\n```';
  assert.match(explanationProblem({ title: 'T', body: hidden }, 'overview') || '', /^explanation_over_budget:/);
  const ids = { ...EXAMPLES.find(e => e.diagram.kind === 'tree') };
  assert.ok(explanationChars({ title: 'T', body: fence(ids) }) < JSON.stringify(ids).length, 'ids, roles and numbers are not counted');
});

test('single-call roadmap path: an authored rh-diagram fence (every one of the 19 examples) is delivered verbatim from ONE author call with no repair, and survives a board JSON round trip', async () => {
  for (const [i, example] of EXAMPLES.entries()) {
    const block = { title: 'T', body: 'Read this.\n\n' + fence(example), more: [{ label: 'L', text: 'Why.\n\n' + fence(example) }] };
    const { out, m } = await viaRoadmap('deep', block);
    assert.equal(out.outcome, 'ok', `${i + 1}. ${example.diagram.kind}`);
    assert.equal(m.seen.length, 1, 'one author call, repairs 0');
    assert.equal(out.repaired, false);
    assert.equal(out.diagramsDropped, undefined);
    assert.equal(out.block.body, block.body, 'the fence is delivered verbatim');
    assert.equal(out.block.more[0].text, block.more[0].text);
    assert.deepEqual(JSON.parse(JSON.stringify(out.block)), out.block, 'board JSON round trip');
  }
});

test('a saved legacy Mermaid card is not touched by delivery checks on the way back out (only NEW Mermaid is refused)', () => {
  const legacy = { title: 'Old', body: 'Old card.\n\n```mermaid\nflowchart TD\n  A["Go"] --> B["Stop"]\n```' };
  assert.match(diagramProblem(legacy.body) || '', /mermaid|rh-diagram/i, 'new content with Mermaid is refused');
  assert.deepEqual(JSON.parse(JSON.stringify(legacy)), legacy, 'a saved card reloads unchanged; the card renders it through the legacy reader (web explanation-diagram.test.mjs)');
});
