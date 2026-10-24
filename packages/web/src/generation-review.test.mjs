// UI-15.1: the shared generation-review contract. Pure: the pill grammar, references, the canonical form and its hash, edits,
// reference states. The server's signing and execution are tested in packages/control-plane/test/generation-review.test.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  REFERENCE_KINDS, applyEdit, blockedReferences, canonicalReview, classifyReference, escapeText, isReviewProposal, mentionedIds, nextReferenceId, parsePrompt, plainPrompt,
  promptSegments, referenceFromContextRef, referenceStates, removeReference, reviewHash, reviewOf, serializePrompt, validateReference, validateReview,
} from './generation-review.js';

const SHA = 'a'.repeat(64), SHA2 = 'b'.repeat(64);
const cad = { id: 'r1', label: 'CAD · Roller assembly', kind: 'card', sourceId: 'card:cad-1', revision: 'rev-1', range: null };
const img = { id: 'r2', label: 'Image · Concept sketch', kind: 'image', sourceId: 'image:img-1', revision: 'rev-7', range: null };
const review = (over = {}) => ({ command: 'motion', mode: 'generate', original_request: '/motion roller', title: 'Roller', prompt: 'Show {{ref:r1}} turning, coloured like {{ref:r2}}.', visual_constraints: ['No text on screen.'],
  references: [cad, img], settings: { duration_seconds: 10, audio: false }, quote: null, destination: { org: 'o', app: 'canvas-1' }, ...over });

test('the pill grammar: every string round-trips and user text can never forge a pill', () => {
  const samples = ['', 'plain words', 'a {{ref:r1}} b', '{{ref:r1}}{{ref:r2}}', 'a \\{{ref:r1}} b', 'back\\slash', '\\', '{', '}}', '{{ref:}}', 'x {{ref:r1', '{{REF:r1}}', '\\\\{{ref:r1}}', 'ends with brace {', 'ünïcode {{ref:r9}} ✓'];
  for (const text of samples) {
    const escaped = escapeText(text);
    const parsed = parsePrompt(escaped);
    assert.ok(!parsed.error, `escaped ${JSON.stringify(text)} parses`);
    assert.deepEqual(parsed.segments, text ? [{ text }] : [], 'typed text is always text, never a reference');
    assert.equal(serializePrompt(parsed.segments), escaped);
  }
  // a real pill between texts, and the exact segments
  const p = parsePrompt(`Use ${'{{ref:r1}}'} for shape and ${escapeText('{{ref:r1}}')} typed.`);
  assert.deepEqual(p.segments, [{ text: 'Use ' }, { ref: 'r1' }, { text: ' for shape and {{ref:r1}} typed.' }]);
  assert.equal(serializePrompt(p.segments), 'Use {{ref:r1}} for shape and \\{\\{ref:r1}} typed.');
  assert.deepEqual(mentionedIds(parsePrompt('{{ref:r2}} {{ref:r1}} {{ref:r2}}').segments), ['r2', 'r1']);
});

test('the grammar refuses what is neither an escape nor a whole token, with the position', () => {
  for (const text of ['{', 'a { b', '{{ref:}}', '{{ref:bad id}}', '{{ref:r1}', '{{other:r1}}', 'a \\ b', 'trailing \\', '{{ref:' + 'x'.repeat(33) + '}}']) {
    const parsed = parsePrompt(text);
    assert.equal(parsed.code, 'prompt_syntax', JSON.stringify(text));
    assert.ok(Number.isInteger(parsed.at) || parsed.at === undefined);
  }
  assert.equal(parsePrompt(42).code, 'prompt_syntax');
});

test('references bind by id, source identity and revision; two cards with one title stay distinct', () => {
  const a = { ...cad, id: 'r1', label: 'CAD · Bracket', sourceId: 'card:a', revision: 'v1' }, b = { ...cad, id: 'r2', label: 'CAD · Bracket', sourceId: 'card:b', revision: 'v1' };
  const both = validateReview(review({ prompt: 'Compare {{ref:r1}} with {{ref:r2}}.', references: [a, b] }));
  assert.ok(both.value, both.error);
  assert.equal(both.value.references[0].label, both.value.references[1].label);
  assert.notEqual(canonicalReview(both.value), canonicalReview({ ...both.value, references: [b, a].map((r, i) => ({ ...r, id: `r${i + 1}` })) }), 'which card is which is part of the canonical form');
  // the same part of one source twice is refused; a different range is a different reference
  assert.equal(validateReview(review({ prompt: '{{ref:r1}} {{ref:r2}} x', references: [a, { ...a, id: 'r2' }] })).code, 'reference_duplicate');
  assert.ok(validateReview(review({ prompt: '{{ref:r1}} {{ref:r2}} x', references: [{ ...a, range: { page: 1 } }, { ...a, id: 'r2', range: { page: 2 } }] })).value);
  assert.equal(validateReview(review({ references: [cad, { ...img, id: 'r1' }] })).code, 'reference_duplicate');
});

test('validateReference is strict about shape, kind, revision and range', () => {
  assert.deepEqual(validateReference({ ...cad, label: '  CAD  ·  Roller\n assembly ' }).value.label, 'CAD · Roller assembly');
  for (const [over, why] of [[{ id: 'has space' }, /id/], [{ label: '' }, /label/], [{ kind: 'tool' }, /kind/], [{ sourceId: '' }, /sourceId/], [{ revision: '' }, /revision/], [{ revision: 'a b' }, /revision/], [{ range: 'p1' }, /range/], [{ extra: 1 }, /not a reference field/]]) {
    assert.match(validateReference({ ...cad, ...over }).error, why, JSON.stringify(over));
  }
  assert.deepEqual(validateReference({ ...cad, range: { b: 1, a: 2 } }).value.range, { a: 2, b: 1 }, 'range keys are sorted so one range has one form');
  assert.ok(REFERENCE_KINDS.includes('file') && REFERENCE_KINDS.includes('card'));
});

test('referenceFromContextRef: file refs carry their own sha, others their version, none without a revision', () => {
  const file = referenceFromContextRef({ kind: 'file', sourceId: `file:fs_${'1'.repeat(24)}@${SHA}`, name: 'Plan.pdf', version: '' }, 'r1', 'File');
  assert.equal(file.value.revision, SHA); assert.equal(file.value.label, 'File · Plan.pdf');
  assert.equal(referenceFromContextRef({ kind: 'card', sourceId: 'card:x', name: 'Roller', version: 'v9', range: null }, 'r1').value.revision, 'v9');
  assert.equal(referenceFromContextRef({ kind: 'card', sourceId: 'card:x', name: 'Roller', version: '' }, 'r1').code, 'reference_invalid');
  assert.equal(nextReferenceId([{ id: 'r1' }, { id: 'r3' }]), 'r2');
});

test('validateReview: prompt and references must agree both ways, and nothing hides in a pill-only prompt', () => {
  assert.ok(validateReview(review()).value);
  const cases = [
    [review({ prompt: 'Show {{ref:r9}}.' }), 'prompt_reference_unknown'],
    [review({ prompt: 'Show {{ref:r1}} only.' }), 'reference_unmentioned'],
    [review({ prompt: '{{ref:r1}} {{ref:r2}}' }), 'prompt_invalid'],
    [review({ prompt: '' }), 'prompt_invalid'],
    [review({ prompt: 'x'.repeat(4001), references: [] }), 'prompt_invalid'],
    [review({ prompt: 'bad { brace', references: [] }), 'prompt_syntax'],
    [review({ references: Array.from({ length: 9 }, (_, i) => ({ ...cad, id: `r${i + 1}`, sourceId: `card:${i}` })) }), 'reference_invalid'],
    [review({ command: '' }), 'review_invalid'], [review({ mode: 'repaint' }), 'review_invalid'], [review({ title: '' }), 'review_invalid'],
    [review({ settings: [] }), 'review_invalid'], [review({ destination: { org: 'o' } }), 'review_invalid'], [review({ destination: { org: 'o', app: 'a', extra: 1 } }), 'review_invalid'],
    [review({ quote: { estimate_credits: -1 } }), 'review_invalid'], [review({ quote: { estimate_credits: 1, other: 2 } }), 'review_invalid'], [review({ visual_constraints: ['a', 5] }), 'review_invalid'],
  ];
  for (const [fields, code] of cases) assert.equal(validateReview(fields).code, code, `${code}: ${JSON.stringify(fields).slice(0, 90)}`);
  assert.deepEqual(validateReview(review({ quote: { estimate_credits: 12 } })).value.quote, { estimate_credits: 12, reserve_credits: null });
  assert.equal(validateReview(review({ mode: undefined })).value.mode, 'generate');
});

test('canonical form: fixed order, sorted keys, every approved part in it, equal content hashes equal', async () => {
  const base = validateReview(review()).value;
  const hash = await reviewHash(base);
  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.equal(await reviewHash(validateReview(review({ settings: { audio: false, duration_seconds: 10 } })).value), hash, 'key order is not content');
  const changes = {
    prompt: { prompt: 'Show {{ref:r1}} turning, coloured like {{ref:r2}}!' }, title: { title: 'Roller 2' }, settings: { settings: { duration_seconds: 11, audio: false } }, request: { original_request: '/motion other' },
    destination: { destination: { org: 'o', app: 'canvas-2' } }, quote: { quote: { estimate_credits: 3 } }, constraints: { visual_constraints: [] }, command: { command: 'explain' }, mode: { mode: 'edit' },
    order: { prompt: 'Show {{ref:r2}} turning, coloured like {{ref:r1}}.', references: [img, cad] },
    revision: { references: [{ ...cad, revision: 'rev-2' }, img] }, source: { references: [{ ...cad, sourceId: 'card:cad-2' }, img] }, label: { references: [{ ...cad, label: 'CAD · Other' }, img] },
    requirements: { requirements: ['Wall 3 mm'] }, assumptions: { assumptions: ['Steel'] }, missing: { missing_information: ['Length?'] }, limitations: { limitations: ['No threads'] },
    range: { references: [{ ...cad, range: { page: 1 } }, img] }, kind: { references: [{ ...cad, kind: 'image' }, img] }, refId: { prompt: 'Show {{ref:q1}} turning, coloured like {{ref:r2}}.', references: [{ ...cad, id: 'q1' }, img] },
  };
  for (const [name, over] of Object.entries(changes)) {
    const next = validateReview(review(over));
    assert.ok(next.value, `${name}: ${next.error}`);
    assert.notEqual(await reviewHash(next.value), hash, `${name} is bound by the hash`);
  }
  // a reordered reference list with swapped ids and prompt is a different review even though the sentence reads the same
  assert.equal(JSON.parse(canonicalReview(base))[0], 'generation-review/1');
});

test('applyEdit: prompt, references, settings, title and constraints change; command, request, mode and destination never do', () => {
  const current = validateReview(review()).value;
  const edited = applyEdit(current, { prompt: 'Show {{ref:r1}} spinning.', references: [cad] });
  assert.ok(edited.value && edited.changed); assert.deepEqual(edited.value.references, [cad]);
  assert.equal(applyEdit(current, {}).changed, false);
  assert.equal(applyEdit(current, { prompt: current.prompt }).changed, false);
  assert.deepEqual(applyEdit(current, { requirements: ['  Wall   3 mm '] }).value.requirements, ['Wall 3 mm']);
  assert.equal(applyEdit(current, { assumptions: [''] }).code, 'review_invalid');
  for (const field of ['command', 'mode', 'original_request', 'destination', 'quote', 'proposal_id']) assert.match(applyEdit(current, { [field]: 'x' }).error, /cannot be edited/, field);
  assert.equal(applyEdit(current, { prompt: 'Show {{ref:r9}}.' }).code, 'prompt_reference_unknown');
  assert.equal(applyEdit(current, { references: [cad] }).code, 'prompt_reference_unknown', 'a removed reference cannot stay in the prompt');
  assert.equal(applyEdit(current, { prompt: 'No refs at all.', references: [img, cad] }).code, 'reference_unmentioned');
  assert.equal(applyEdit('nope', {}).code, 'review_invalid');
});

test('removing a reference updates the prompt and the inputs together', () => {
  const current = validateReview(review()).value;
  const gone = removeReference(current, 'r2');
  assert.equal(gone.prompt, 'Show {{ref:r1}} turning, coloured like Image · Concept sketch.');
  assert.deepEqual(gone.references, [cad]);
  assert.ok(validateReview({ ...current, ...gone }).value, 'the result is a valid review');
  assert.equal(removeReference(current, 'r2', { asLabel: false }).prompt, 'Show {{ref:r1}} turning, coloured like .');
  // a label with braces in it cannot become a pill: it is escaped back through the grammar
  const tricky = { ...img, label: 'Image · {{ref:r1}}' };
  const t = validateReview(review({ references: [cad, tricky] })).value;
  const removed = removeReference(t, 'r2');
  assert.equal(parsePrompt(removed.prompt).segments.filter(s => s.ref !== undefined).length, 1, 'only the real r1 pill remains');
});

test('plainPrompt and promptSegments: labels for old readers, whole references for the pills', () => {
  const r = validateReview(review()).value;
  assert.equal(plainPrompt(r.prompt, r.references), 'Show CAD · Roller assembly turning, coloured like Image · Concept sketch.');
  assert.deepEqual(promptSegments(r.prompt, r.references).map(s => s.type), ['text', 'ref', 'text', 'ref', 'text']);
  assert.equal(promptSegments(r.prompt, r.references)[1].reference.sourceId, 'card:cad-1');
  assert.equal(plainPrompt('{', []), null); assert.equal(promptSegments('{', []), null);
  assert.equal(plainPrompt('typed \\{\\{ref:r1}}', [cad]), 'typed {{ref:r1}}');
});

test('reviewOf: a v3 proposal is its own review, a v2 proposal is the model description with no references', () => {
  const v3 = { sig: `v3.${'0'.repeat(64)}`, ...review(), source_refs: [] };
  assert.ok(isReviewProposal(v3)); assert.deepEqual(validateReview(reviewOf(v3)).value.references, [cad, img]);
  const v2 = { sig: `v2.${'0'.repeat(64)}`, command: 'motion', title: 'Water {cycle}', description: 'Sunlight warms water. It rises. It rains.', settings: { duration_seconds: 10, audio: false }, input: { org: 'o', app: 'a', request: '/motion water' } };
  assert.ok(!isReviewProposal(v2));
  const derived = validateReview(reviewOf(v2));
  assert.ok(derived.value, derived.error);
  assert.equal(plainPrompt(derived.value.prompt, []), v2.description);
  assert.deepEqual(derived.value.destination, { org: 'o', app: 'a' });
  const braces = validateReview(reviewOf({ ...v2, description: 'Use {braces} and \\ slashes. Fine. Yes.' }));
  assert.equal(plainPrompt(braces.value.prompt, []), 'Use {braces} and \\ slashes. Fine. Yes.', 'model text with braces is plain text');
});

test('reference states: every probe outcome is typed, never silently ok', () => {
  assert.equal(classifyReference(cad, {}), 'ok');
  assert.equal(classifyReference(cad, { revision: 'rev-1' }), 'ok');
  assert.equal(classifyReference(cad, { revision: 'rev-2' }), 'changed');
  assert.equal(classifyReference(cad, { exists: false, revision: 'rev-2' }), 'deleted');
  assert.equal(classifyReference(cad, { access: false }), 'inaccessible');
  assert.equal(classifyReference(cad, { supported: false, exists: false }), 'unsupported');
  const states = referenceStates([cad, img], { r1: { revision: 'rev-2' }, r2: { supported: false } });
  assert.deepEqual(states.map(s => s.state), ['changed', 'unsupported']);
  assert.ok(states.every(s => /\S/.test(s.message) && !/\.\.\.|…/.test(s.message)), 'a state says why, with no ellipsis');
  assert.deepEqual(blockedReferences(states).map(s => s.id), ['r1', 'r2']);
  assert.deepEqual(blockedReferences(referenceStates([cad], {})), []);
  assert.equal(referenceStates([cad], {})[0].message, null);
});
