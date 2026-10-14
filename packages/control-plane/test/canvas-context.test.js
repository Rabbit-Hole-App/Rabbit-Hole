// Whole-canvas context, server side (agent-coordination/tasks/2026-10-14-whole-canvas-context-OWNER.md, contract v1.1): the
// canvas_context validator, honest coverage (truncated content is never "full"), the prompt block and rules, and the Tutor
// planner route. The Ask, Auto and Tutor chat modes on /api/learn/ask are in chat-modes.test.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CANVAS_BUDGET, CANVAS_CONTEXT_RULES, canvasContextText, validateCanvasContext } from '../src/canvas-context.js';
import { tutorRoute } from '../src/learn-tutor-routes.js';
import { CANVAS_SYSTEM } from '../src/agents/learn-tutor.js';
import { canvasPackage } from './canvas-context-fixture.js';

test('a v1.1 package is rebuilt from known keys only; malformed fields name themselves', () => {
  const pkg = validateCanvasContext({ ...canvasPackage(), extra: 'dropped', inventory: { ...canvasPackage().inventory, secret: 1 } });
  assert.equal('extra' in pkg || 'secret' in pkg.inventory, false);
  assert.equal(pkg.inventory.items.length, 8);
  const bad = [
    [{ version: 2 }, /version/],
    [{ includes_unsaved: 'yes' }, /includes_unsaved/],
    [{ inventory: { ...canvasPackage().inventory, items: [{ id: 'x', type: 'Card!', label: '' }] } }, /inventory\.items\[0\]\.type/],
    [{ excerpts: [{ id: 'n1', type: 'text', text: 'x', reason: 'relevant', inclusion: 'some', omitted_chars: 0 }] }, /excerpts\[0\]\.inclusion/],
    [{ relations: { explicit: [], inferred: [{ from: 'a', to: 'b', kind: 'causes', basis: 'x' }] } }, /relations\.inferred\[0\]\.kind/],
    [{ coverage: { ...canvasPackage().coverage, items: [{ id: 'n1', type: 'text', status: 'read' }] } }, /coverage\.items\[0\]\.status/],
    [{ coverage: { ...canvasPackage().coverage, budget_chars: 50000 } }, /coverage\.budget_chars/],
    [{ excerpts: [{ id: 'n1', type: 'text', text: 'x', reason: 'relevant', inclusion: 'partial', omitted_chars: 9, passages: [{ start: 40, end: 50 }, { start: 10, end: 20 }] }] }, /excerpts\[0\]\.passages\[1\]/],
  ];
  for (const [over, error] of bad) assert.throws(() => validateCanvasContext(canvasPackage(over)), error);
  // The budget: labels plus excerpt content past 16,000 characters is refused, not silently cut.
  const big = 'x'.repeat(8000);
  assert.throws(() => validateCanvasContext(canvasPackage({ excerpts: [0, 1, 2].map(i => ({ id: `b${i}`, type: 'text', text: big, reason: 'relevant', inclusion: 'full', omitted_chars: 0 })) })), new RegExp(`at most ${CANVAS_BUDGET}`));
});

test('truncated content is never counted as full: excerpts, statuses and counts are clamped to what was sent', () => {
  const pkg = validateCanvasContext(canvasPackage({
    excerpts: [
      { id: 'n1', type: 'text', text: 'Cut short.', reason: 'relevant', inclusion: 'full', omitted_chars: 900 },
      { id: 'c1', type: 'card', text: 'Whole.', reason: 'relevant', inclusion: 'full', omitted_chars: 0 },
    ],
    coverage: { ...canvasPackage().coverage, included_full: 9, included_partial: 0, items: [
      { id: 'n1', type: 'text', status: 'full' },
      { id: 'c1', type: 'card', status: 'full', omitted_chars: 40 },
      { id: 'e1', type: 'equation', status: 'full' },
      { id: 't2', type: 'text', status: 'partial' },
    ] },
  }));
  assert.equal(pkg.excerpts[0].inclusion, 'partial', 'omitted_chars > 0 makes an excerpt partial');
  assert.deepEqual(pkg.coverage.items.map(s => [s.id, s.status, s.omitted_chars ?? 0]), [['n1', 'partial', 900], ['c1', 'partial', 40], ['e1', 'listed', 0], ['t2', 'listed', 0]]);
  assert.deepEqual([pkg.coverage.included_full, pkg.coverage.included_partial, pkg.coverage.listed], [0, 2, 8], 'the client\'s 9 in full is recounted from the content actually sent');
  // Counts the server cannot check (coverage.items may not name every object on a big board) stand as sent.
  assert.deepEqual([pkg.coverage.media_inspected, pkg.coverage.unavailable_or_omitted], [0, 1]);
});

test('the prompt block states coverage as included in full / partially / not included, never read, and keeps relations apart', () => {
  const block = canvasContextText(validateCanvasContext(canvasPackage()));
  assert.match(block, /^CANVAS CONTEXT \(built from the live board at 2026-10-14T16:40:00Z, including unsaved edits\)/);
  assert.match(block, /Title \(a weak hint; may be stale\): "Stale title"/);
  assert.match(block, /Coverage: all 8 objects on the board listed in the inventory; content of 2 included in full and 1 partially; 0 images or media inspected; 1 unavailable or not included\. Partial and not-included content is unseen, not absent\./);
  assert.match(block, /Not included: n1 text \(partial: 5200 characters not included\); i1 image \(not included: media\)/);
  assert.match(block, /- c1 card\/definition "Older card" region bottom-right \[included in full\]/, 'the older object far from the selection is listed with its status');
  assert.ok(block.includes('- n1 text (partial; 5200 characters not included; passages at characters 0-35, 4000-4025): First part of a long selected note.\n…\nA relevant later passage.'));
  assert.match(block, /Explicit connections \(links stored on the canvas\):\n- n1 -> c1 "leads to"/);
  assert.ok(block.includes('Inferred relations (from geometry; may be wrong):\n- g1 contains s1 (shape inside the group frame)\n- t2 near e1 (drawn arrow "calls" (ends matched by position, confidence 0.75))'), 'a drawn arrow is inferred, not explicit');
  assert.doesNotMatch(`${block}\n${CANVAS_CONTEXT_RULES}`, /\bread in full\b|\bwas read\b/);
  // The rules every mode gets (owner brief items 4-7, refinements 1 and 4).
  assert.match(CANVAS_CONTEXT_RULES, /canvas title is a weak hint that may be stale: never let it override what the content or the request says/);
  assert.match(CANVAS_CONTEXT_RULES, /partial or not included is unseen, not absent\. Never report something as missing/);
  assert.match(CANVAS_CONTEXT_RULES, /whole-board answer .* accounts for the objects the inventory lists/);
  assert.match(CANVAS_CONTEXT_RULES, /explicit connections are links stored on the canvas.*Inferred relations come from geometry .* and may be wrong/s);
  assert.match(CANVAS_CONTEXT_RULES, /When that purpose is unclear, state the assumption you made, or ask one focused question/);
});

test('an inventory past its cap says only part of the board was listed, never the whole canvas', () => {
  const pkg = canvasPackage();
  const block = canvasContextText(validateCanvasContext({ ...pkg, inventory: { ...pkg.inventory, omitted_items: 404 }, coverage: { ...pkg.coverage, objects_total: 412 } }));
  assert.match(block, /Coverage: only 8 of 412 objects listed in the inventory: this is part of the board, not the whole canvas;/);
  assert.ok(block.includes('- ... 404 more objects not listed (inventory cap)'));
  assert.match(CANVAS_CONTEXT_RULES, /only part of the board was listed, say so, and never present the answer as covering the whole canvas/);
  assert.doesNotMatch(canvasContextText(validateCanvasContext(pkg)), /part of the board/, 'a full inventory says all');
});

test('the title never decides the topic: the same content under any title renders the same, title aside', () => {
  const a = canvasContextText(validateCanvasContext(canvasPackage({ title: 'A stale subject' })));
  const b = canvasContextText(validateCanvasContext(canvasPackage({ title: null })));
  const body = s => s.split('\n').filter(l => !l.startsWith('Title ')).join('\n');
  assert.equal(body(a), body(b));
});

// The Tutor planner route (Auto with an active Tutor): the same block and rules, beside context, for any wording.
async function plan(body) {
  let request = null;
  const deps = {
    authorize: async () => ({ org: 'o', email: 'owner@example.test', user_id: 'u1', app: 'canvas-0a1b2c3d' }),
    documents: async () => [],
    callModel: async (env, body) => { request = body; return Response.json({ content: [{ type: 'text', text: 'no plan' }], stop_reason: 'end_turn' }); },
  };
  const req = new Request('https://app.test/api/learn/tutor/plan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const response = await tutorRoute('/api/learn/tutor/plan', req, { SMALL_ENV: 'test', ANTHROPIC_API_KEY: 'test-only' }, deps);
  return { response, request };
}
const tutorContext = message => ({ canvas_context: { goal: null, origin: null }, learner_intent: { kind: 'question', text: message }, allowed_actions: ['respond_text'] });

test('Tutor plan: the package rides as a user block after the documents with its rules as an uncached system block, for any paraphrase', async () => {
  const blocks = [];
  for (const message of ['What am I missing here?', 'Is this complete?', 'Review my work', 'Does this contradict anything else on the board?', 'ok, and next?']) {
    const { request } = await plan({ app: 'canvas-0a1b2c3d', context: tutorContext(message), canvas_context: canvasPackage() });
    assert.ok(request, message);
    const content = request.messages[0].content;
    assert.match(content.at(-1).text, /^Compose this turn\./);
    blocks.push(content.at(-2).text);
    const system = Array.isArray(request.system) ? request.system.map(b => b.text).join('\n') : request.system;
    assert.ok(system.startsWith(CANVAS_SYSTEM), 'the canvas prompt still leads');
    assert.ok(system.endsWith(CANVAS_CONTEXT_RULES), message);
  }
  assert.equal(new Set(blocks).size, 1, 'the same block for every wording');
  assert.equal(blocks[0], canvasContextText(validateCanvasContext(canvasPackage())));
  const { request } = await plan({ app: 'canvas-0a1b2c3d', context: tutorContext('Review my work') });
  assert.equal(typeof request.messages[0].content, 'string', 'no package: the request is as before');
  assert.equal(JSON.stringify(request.system).includes('Canvas context: the turn carries'), false, 'no package: no canvas rules');
  const refused = await plan({ app: 'canvas-0a1b2c3d', context: tutorContext('x'), canvas_context: canvasPackage({ version: 3 }) });
  assert.equal(refused.response.status, 400);
  assert.match((await refused.response.json()).error, /canvas_context: version/);
});
