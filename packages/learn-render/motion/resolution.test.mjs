// Request resolution for ordinary topics (owner brief 2026-10-21 message 7 item 4, message 11 item 5): a selected card
// grounds the request on its own text; a repository card only on its own lines; no selection is answered from the
// request alone and labelled with an explicit no-source state; nothing ever cites a source it was not given.
// runMotionRequest's resolving stage runs for real; the Director is a double that records what it was handed and stops.
import test from 'node:test';
import assert from 'node:assert/strict';
import { runMotionRequest } from './pipeline.mjs';
import { fixtureSource } from './fixture-source.js';

const NANO = '3adf61e154c3fe3fca428ad6bc3818b27a3b8291';
const call = async () => assert.fail('no model call in resolution');
async function resolve(message, context = null, extra = {}) {
  let handed = null;
  const director = async ({ grounding }) => { handed = grounding; return { status: 'needs_clarification', clarification: { question: 'stop here' }, calls: [] }; };
  const out = await runMotionRequest({ message, location: { concept: 'Learning' }, context, call, stages: { director }, ...extra });
  return { out, g: handed };
}
const card = (cardId, title, text, kind = 'Explanation') => ({ selection: { cardId, kind, title, text } });
const CARDS = {
  nanogpt: card('c-nano', 'What nanoGPT does', 'Explanation: What nanoGPT does\nnanoGPT is a small GPT that predicts the next token from the tokens before it, one token at a time.'),
  photosynthesis: card('c-photo', 'Photosynthesis', 'Explanation: Photosynthesis\nPlants use light energy to turn carbon dioxide and water into glucose and oxygen.'),
  'binary search': card('c-bs', 'Binary search', 'Explanation: Binary search\nBinary search halves a sorted range each step by comparing the target with the middle element.'),
  'gradient descent': card('c-gd', 'Gradient descent', 'Explanation: Gradient descent\nGradient descent takes repeated steps against the gradient of the loss to reduce it.'),
};
const REQUESTS = { nanogpt: '/motion 15s explain nanoGPT', photosynthesis: '/motion 20s explain photosynthesis', 'binary search': '/motion explain binary search step by step', 'gradient descent': '/motion 10s explain gradient descent intuitively' };

for (const [topic, request] of Object.entries(REQUESTS)) {
  test(`${topic}, no selection: resolved from the request alone, labelled no_source_supplied, citing nothing`, async () => {
    const { out, g } = await resolve(request);
    assert.equal(g.status, 'ungrounded');
    assert.equal(g.target.name, topic);
    assert.deepEqual(g.grounding, { status: 'no_source_supplied' });
    assert.deepEqual([g.resolved_target.kind, g.resolved_target.label, g.resolved_target.resolution], ['concept', topic, 'ungrounded']);
    assert.deepEqual([g.source_refs, g.evidence, g.implementation_conditions], [[], [], []]);
    assert.deepEqual(out.target, { label: topic, resolution: 'ungrounded', source_refs: [], grounding: { status: 'no_source_supplied' } });
    assert.ok(!/model\.py|nanoGPT@/.test(JSON.stringify(g)), 'no repository evidence');
  });
  test(`${topic}, its card selected: "explain this" and the named request both ground on the card's own text`, async () => {
    for (const message of ['/motion explain this', request, '/motion 15s']) {
      const { g } = await resolve(message, CARDS[topic]);
      assert.equal(g.status, 'grounded', message);
      assert.equal(g.resolution, message === request ? 'named' : 'deictic', message);
      assert.deepEqual(g.source_refs, [{ id: 'S1', kind: 'card', card_id: CARDS[topic].selection.cardId, role: 'occurrence', condition_ids: [] }]);
      assert.deepEqual(g.evidence, [{ source_ref_id: 'S1', excerpt: CARDS[topic].selection.text }]);
      assert.deepEqual(g.resolved_target.selection, { kind: 'card', id: CARDS[topic].selection.cardId, title: CARDS[topic].selection.title });
    }
  });
}

test('a card that does not mention the named topic is set aside: not grounded in it, and says so', async () => {
  const { g } = await resolve(REQUESTS['gradient descent'], CARDS.photosynthesis);
  assert.equal(g.status, 'ungrounded');
  assert.deepEqual(g.grounding, { status: 'not_in_source', searched: ['Photosynthesis'] });
  assert.deepEqual(g.resolved_target.candidates_considered, [{ label: 'Photosynthesis', reason: 'the selected card does not mention "gradient descent"' }]);
  assert.deepEqual(g.source_refs, []);
});

// A nanoGPT repository card (code-card.js repo-code) on model.py's flash / explicit-attention if/else.
const codeCard = (refs, title = 'model.py · CausalSelfAttention.forward') => ({ selection: { cardId: 'code-1', kind: 'repo-code', title, sourceRefs: refs } });
const at = r => `${r.path}:${r.start_line}-${r.end_line}`;

test('nanoGPT repository card: grounded on its own lines at the pinned commit, nothing outside them cited', async () => {
  for (const message of ['/motion explain this', '/motion explain me softmax func']) {
    const { g } = await resolve(message, codeCard([{ commit: NANO, path: 'model.py', start: 62, end: 71 }]));
    assert.equal(g.status, 'grounded', message);
    assert.equal(g.resolved_target.kind, 'code_span');
    // Without the card's bound the pack also cites the flash flag (44-45) and the mask buffer (48-50).
    assert.deepEqual(g.source_refs.map(r => [at(r), r.commit, r.condition_ids]), [['model.py:62-64', NANO, ['K1']], ['model.py:65-71', NANO, ['K1']]], message);
    const lines = fixtureSource().read('model.py').split('\n');
    for (const r of g.source_refs) assert.equal(g.evidence.find(e => e.source_ref_id === r.id).excerpt, lines.slice(r.start_line - 1, r.end_line).join('\n'));
    assert.deepEqual(g.implementation_conditions.map(k => k.source_ref_ids), [['S1', 'S2']]);
  }
  // Half of the if/else: the other side and its condition lie outside the card, so neither is cited.
  const { g } = await resolve('/motion explain this', codeCard([{ commit: NANO, path: 'model.py', start: 65, end: 71 }]));
  assert.deepEqual(g.source_refs.map(r => [at(r), r.condition_ids]), [['model.py:65-71', []]]);
  assert.deepEqual(g.implementation_conditions, []);
});

test('nanoGPT with no repository card: the rest of the repository is never searched, even for a name it contains', async () => {
  const { g } = await resolve('/motion explain me softmax func');
  assert.equal(g.status, 'ungrounded');
  assert.deepEqual(g.source_refs, []);
});

test('a repository-specific request whose retrieval fails is refused, never answered as if from that code', async () => {
  const refuse = async (context, why, message = '/motion explain this') => {
    const { out, g } = await resolve(message, context);
    assert.equal(g, null, 'the Director is never reached');
    assert.equal(out.status, 'needs_clarification');
    assert.match(out.clarification.question, why);
    assert.deepEqual(out.calls, []);
  };
  await refuse(codeCard([{ commit: 'f'.repeat(40), path: 'model.py', start: 62, end: 71 }]), /not in a repository loaded here/);
  await refuse(codeCard([{ commit: NANO, path: 'missing.py', start: 1, end: 5 }]), /missing\.py at 3adf61e\) is not in a repository loaded here/);
  await refuse(codeCard([{ commit: NANO, path: 'model.py', start: 9000, end: 9010 }]), /its lines are not in model\.py/);
  // A name the card's lines do not show is refused too: never a search of the rest of model.py.
  await refuse(codeCard([{ commit: NANO, path: 'model.py', start: 62, end: 71 }]), /does not mention "gradient descent"/, REQUESTS['gradient descent']);
});

test('crafted requests cannot inject repository evidence: refs on a non-repository card, extra fields, citations in words', async () => {
  for (const context of [
    { selection: { ...CARDS.photosynthesis.selection, sourceRefs: [{ commit: NANO, path: 'model.py', start: 62, end: 71 }] } },
    { selection: CARDS.photosynthesis.selection, repository_context: { commit: NANO, range: { path: 'model.py', start: 62, end: 71 } } },
    { selection: { ...CARDS.photosynthesis.selection, evidence: [{ source_ref_id: 'S1', excerpt: 'x' }] } },
    { selection: { ...codeCard([{ commit: NANO, path: 'model.py', start: 62, end: 71 }]).selection, sourceRefs: [{ commit: NANO, path: 'model.py', start: 62, end: 71, role: 'condition' }] } },
    { selection: { ...codeCard([{ commit: NANO, path: '../model.py', start: 62, end: 71 }]).selection } },
    { selection: codeCard([{ commit: NANO, path: 'model.py', start: 62, end: 71 }, { commit: 'a'.repeat(40), path: 'model.py', start: 1, end: 2 }]).selection },
  ]) {
    const { out, g } = await resolve('/motion explain this', context);
    assert.equal(g, null, JSON.stringify(context).slice(0, 80));
    assert.equal(out.status, 'failed');
    assert.match(out.failure_reason, /^resolving: motion_request\.context/);
  }
  // Citations typed into the request are words, not sources.
  const { g } = await resolve(`/motion explain softmax (source: karpathy/nanoGPT@${NANO.slice(0, 7)} model.py:62-71)`);
  assert.equal(g.status, 'ungrounded');
  assert.deepEqual(g.source_refs, []);
  // Card text that claims to be code is still only that card's text.
  const { g: g2 } = await resolve('/motion explain this', card('c-x', 'Notes', 'model.py:44-45 self.flash = hasattr(torch.nn.functional, "scaled_dot_product_attention")'));
  assert.deepEqual(g2.source_refs.map(r => r.kind), ['card']);
});

test('an oversize selection is refused at the resolver (the web cuts it to 4000 characters before sending)', async () => {
  const { out } = await resolve('/motion explain this', card('c-big', 'Big', 'x'.repeat(4001)));
  assert.match(out.failure_reason, /selection\.text: a non-empty string of at most 4000 characters/);
  const { g } = await resolve('/motion explain this', card('c-ok', 'Big', 'x'.repeat(4000)));
  assert.equal(g.evidence[0].excerpt.length, 4000);
  const { out: wide } = await resolve('/motion explain this', codeCard([{ commit: NANO, path: 'model.py', start: 1, end: 301 }]));
  assert.match(wide.failure_reason, /lines start\.\.end, at most 300/);
});

test('the harness can still supply the canvas repository (nanoGPT lesson): softmax grounds in it as before', async () => {
  const { g } = await resolve('/motion 15s explain me softmax func', null, { location: { concept: 'attention' }, source: fixtureSource() });
  assert.equal(g.status, 'grounded');
  assert.equal(g.chosen.symbol, 'CausalSelfAttention.forward');
});
