// EXP-T18 review: refusals before spending, image transport, verdict coverage. No live model call.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REVIEW_LIMITS, buildReviewContent, parseReview, reviewCaptures } from '../src/explain-review.js';

const png = n => new Uint8Array(Array.from({ length: n }, (_, i) => i % 256));
const cap = (id, extra = {}) => ({ id, compiledHash: 'h1abcdef', theme: 'light', time: 1, inputs: {}, png: png(64), ...extra });
const base = { request: 'Explain attention.', compiledHash: 'h1abcdef', facts: ['softmax weights sum to 1'], evidence: [] };
const pass = captures => ({ captures: captures.map(c => ({ id: c.id, semantic: 'pass', visual: 'pass', findings: [] })) });

test('refusals happen before any call: missing pixels, missing request, stale version, oversize', async () => {
  let called = 0;
  const callRole = async () => { called++; return { input: pass([]) }; };
  const cases = [
    [{ ...base, captures: [cap('a', { png: undefined })] }, 'missing_pixels'],
    [{ ...base, captures: [] }, 'missing_pixels'],
    [{ ...base, request: ' ', captures: [cap('a')] }, 'missing_evidence'],
    [{ ...base, captures: [cap('a', { compiledHash: 'old12345' })] }, 'stale_version'],
    [{ ...base, captures: [cap('a', { png: png(REVIEW_LIMITS.maxImageBytes + 1) })] }, 'payload_too_large'],
    [{ ...base, captures: [cap('a'), cap('a')] }, 'bad_capture'],
  ];
  for (const [input, code] of cases) await assert.rejects(reviewCaptures(input, { callRole }), { code });
  assert.equal(called, 0);
});

test('the request carries each capture as a real image block with its id and state', () => {
  const { content, imageBlocks } = buildReviewContent({ ...base, captures: [cap('c1'), cap('c2', { theme: 'dark', inputs: { n: 3 } })] });
  assert.equal(imageBlocks, 2);
  const images = content.filter(b => b.type === 'image');
  assert.equal(images.length, 2);
  assert.equal(images[0].source.media_type, 'image/png');
  assert.equal(Buffer.from(images[0].source.data, 'base64').length, 64);
  assert.ok(content.some(b => b.type === 'text' && /Capture c2 \(theme dark, time 1s, inputs \{"n":3\}\)/.test(b.text)));
});

test('more captures than one request holds are split, each batch with images and the full evidence', async () => {
  const captures = Array.from({ length: 8 }, (_, i) => cap(`c${i}`));
  const seen = [];
  const out = await reviewCaptures({ ...base, captures }, { callRole: async (role, req) => {
    seen.push(req.content);
    const ids = req.content.filter(b => b.type === 'text' && b.text.startsWith('Capture ')).map(b => b.text.split(' ')[1]);
    return { input: pass(ids.map(id => ({ id }))), identity: { requested: 'claude-opus-5-5', served: 'claude-opus-5-5' } };
  } });
  assert.equal(seen.length, 2);
  assert.ok(seen.every(content => content[0].text.includes('softmax weights sum to 1')));
  assert.equal(out.captures.length, 8);
  assert.equal(out.accepted, true);
});

test('every capture needs both verdicts; a pass with a major finding is a fail; unknown ids are refused', () => {
  const captures = [cap('a'), cap('b')];
  assert.throws(() => parseReview(pass([captures[0]]), captures), { code: 'incomplete_review' });
  assert.throws(() => parseReview({ captures: [{ id: 'a', semantic: 'pass', findings: [] }, { id: 'b', semantic: 'pass', visual: 'pass', findings: [] }] }, captures), { code: 'invalid_review' });
  assert.throws(() => parseReview(pass([...captures, { id: 'z' }]), captures), { code: 'invalid_review' });
  const out = parseReview({ captures: [
    { id: 'a', semantic: 'pass', visual: 'pass', findings: [{ verdict: 'visual', category: 'component', severity: 'major', object: 'label-1', message: 'caption covers the arrow', repairable: true }] },
    { id: 'b', semantic: 'pass', visual: 'pass', findings: [{ verdict: 'visual', category: 'component', severity: 'minor', message: 'tight spacing', repairable: true }] },
  ] }, captures);
  assert.equal(out.captures[0].visual, 'fail');
  assert.deepEqual(out.captures[0].findings[0].target, { capture: 'a', object: 'label-1' });
  assert.equal(out.captures[1].visual, 'pass');
  assert.equal(out.accepted, false);
});

test('an outage is review_unavailable, never an accept', async () => {
  await assert.rejects(reviewCaptures({ ...base, captures: [cap('a')] }, { callRole: async () => { throw new Error('HTTP 529 overloaded'); } }), { code: 'review_unavailable' });
  await assert.rejects(reviewCaptures({ ...base, captures: [cap('a')] }, {}), { code: 'no_transport' });
});
