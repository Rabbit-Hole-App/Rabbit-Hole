// /explain independent review of ACTUAL rendered captures (EXP-T18; plan sections 3.2, 3.5).
// One combined request per explanation: the learner request, the evidence and the spec's visible facts as text, plus each
// capture as a real PNG image block labelled with its id and state. The reviewer returns a semantic and a visual verdict
// for every capture. Everything that can be refused is refused BEFORE the call is made: missing pixels or evidence,
// stale captures, too many or too large images. A request with no image block can never count as an image review.
// The model call is injected (callRole: Lane C's callExplainRole on the explain_review role, admitted by the job).

export const REVIEW_LIMITS = Object.freeze({ maxImages: 6, maxImageBytes: 3_500_000, maxTotalBytes: 18_000_000, maxEvidence: 16, maxExcerpt: 1500, maxFacts: 120 });

export class ReviewError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

export const REVIEW_TOOL = {
  name: 'report_review',
  description: 'Report one semantic verdict and one visual verdict for EVERY capture id you were shown, with a finding for each problem.',
  input_schema: {
    type: 'object', additionalProperties: false, required: ['captures'],
    properties: {
      captures: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'semantic', 'visual', 'findings'], properties: {
        id: { type: 'string' },
        semantic: { type: 'string', enum: ['pass', 'fail'] },
        visual: { type: 'string', enum: ['pass', 'fail'] },
        findings: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['verdict', 'category', 'severity', 'message', 'repairable'], properties: {
          verdict: { type: 'string', enum: ['semantic', 'visual'] },
          category: { type: 'string', enum: ['source', 'spec', 'component', 'renderer', 'budget'] },
          severity: { type: 'string', enum: ['blocker', 'major', 'minor'] },
          object: { type: 'string', maxLength: 64 },
          message: { type: 'string', maxLength: 400 },
          repairable: { type: 'boolean' },
        } } },
      } } },
    },
  },
};

export const REVIEW_SYSTEM = `You independently review a rendered explanation card for a learner. You did not author it.
You receive the learner's request, the evidence the explanation may rely on, the facts the spec states, and one or more captures: PNG screenshots of the actual rendered card, each labelled with its capture id and state (theme, time, input values).
For EVERY capture give two verdicts:
- semantic: is what the capture shows correct and supported by the evidence, and does it answer the request? Unsupported or wrong claims fail.
- visual: can a learner read it as drawn? Fail on overlapping or clipped text, labels covering arrows or other labels, a connector crossing unrelated parts or taking a confusing route, missing or replacement glyphs (empty boxes, tofu, wrong symbols), formulas or text touching lines or borders, crowded labels, or anything unreadable in that theme.
Judge only what the pixels show; never assume the intended layout. Report each problem as one finding with the object it concerns when you can name it, and say whether changing layout hints could fix it (repairable) or the content itself is wrong.
Call report_review exactly once.`;

const b64Length = data => Math.floor((data.length * 3) / 4) - (data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0);
const toBase64 = bytes => (typeof Buffer !== 'undefined' ? Buffer.from(bytes).toString('base64') : btoa(String.fromCharCode(...bytes)));
const stateText = c => `theme ${c.theme || 'light'}, ${c.step ? `step "${c.step}", ` : ''}time ${c.time ?? 'end'}s${c.inputs && Object.keys(c.inputs).length ? `, inputs ${JSON.stringify(c.inputs)}` : ''}`;

// Validate and build the user turn. input: { request, compiledHash, facts: [string], evidence: [EvidenceRecord-ish],
// captures: [{ id, compiledHash, theme, time, inputs, png: Uint8Array } | { ..., data: base64, mediaType }] }.
export function buildReviewContent(input, limits = REVIEW_LIMITS) {
  const { request, compiledHash, captures = [], evidence = [], facts = [] } = input;
  if (typeof request !== 'string' || !request.trim()) throw new ReviewError('missing_evidence', 'review needs the learner request');
  if (!captures.length) throw new ReviewError('missing_pixels', 'review needs at least one rendered capture');
  if (captures.length > limits.maxImages) throw new ReviewError('split_required', `review takes at most ${limits.maxImages} captures per request; split with reviewBatches`);
  if (evidence.length > limits.maxEvidence) throw new ReviewError('payload_too_large', `at most ${limits.maxEvidence} evidence records`);
  const ids = new Set();
  let total = 0;
  const images = captures.map(c => {
    if (!c.id || ids.has(c.id)) throw new ReviewError('bad_capture', `capture id missing or repeated: ${c.id}`);
    ids.add(c.id);
    if (compiledHash && c.compiledHash !== compiledHash) throw new ReviewError('stale_version', `capture ${c.id} is of a different compiled version`);
    const data = c.data || (c.png?.length ? toBase64(c.png) : null);
    if (!data) throw new ReviewError('missing_pixels', `capture ${c.id} has no image bytes`);
    const bytes = b64Length(data);
    if (bytes > limits.maxImageBytes) throw new ReviewError('payload_too_large', `capture ${c.id} is ${bytes} bytes`);
    total += bytes;
    return { c, data, mediaType: c.mediaType || 'image/png' };
  });
  if (total > limits.maxTotalBytes) throw new ReviewError('payload_too_large', `captures total ${total} bytes`);
  const evidenceText = evidence.length
    ? evidence.map(e => `[${e.id}] ${e.location || ''}${e.limitations?.length ? ` (limits: ${e.limitations.join('; ')})` : ''}\n${String(e.excerpt || '').slice(0, limits.maxExcerpt)}`).join('\n\n')
    : 'No external evidence: judge correctness from the request and general knowledge, and flag any specific claim that would need a source.';
  const content = [{ type: 'text', text: `Learner request:\n${request.trim()}\n\nEvidence:\n${evidenceText}\n\nFacts the spec states:\n${facts.slice(0, limits.maxFacts).map(f => `- ${f}`).join('\n') || '- (none listed)'}\n\nCaptures to review: ${images.map(i => i.c.id).join(', ')}` }];
  for (const { c, data, mediaType } of images) {
    content.push({ type: 'text', text: `Capture ${c.id} (${stateText(c)}):` });
    content.push({ type: 'image', source: { type: 'base64', media_type: mediaType, data } });
  }
  return { content, imageBlocks: images.length, bytes: total };
}

// Split only when the captures cannot fit one request; every batch carries the full text evidence.
export const reviewBatches = (captures, maxImages = REVIEW_LIMITS.maxImages) => {
  const batches = [];
  for (let i = 0; i < captures.length; i += maxImages) batches.push(captures.slice(i, i + maxImages));
  return batches;
};

// Check the reviewer's answer covers every capture exactly once with both verdicts; map findings to ReviewFinding.
export function parseReview(output, captures) {
  const want = new Set(captures.map(c => c.id));
  const seen = new Map();
  for (const entry of output?.captures || []) {
    if (!want.has(entry.id)) throw new ReviewError('invalid_review', `review names unknown capture ${entry.id}`);
    if (seen.has(entry.id)) throw new ReviewError('invalid_review', `review repeats capture ${entry.id}`);
    if (!['pass', 'fail'].includes(entry.semantic) || !['pass', 'fail'].includes(entry.visual)) throw new ReviewError('invalid_review', `capture ${entry.id} lacks a semantic or visual verdict`);
    seen.set(entry.id, entry);
  }
  const missing = [...want].filter(id => !seen.has(id));
  if (missing.length) throw new ReviewError('incomplete_review', `no verdict for ${missing.join(', ')}`);
  let n = 0;
  const results = captures.map(c => {
    const entry = seen.get(c.id);
    const findings = (entry.findings || []).map(f => ({
      version: 1, id: `rf${++n}`, verdict: f.verdict, category: f.category, severity: f.severity,
      target: { capture: c.id, ...(f.object ? { object: String(f.object).slice(0, 64) } : {}) },
      evidence: [], specRepairable: Boolean(f.repairable), message: String(f.message || '').slice(0, 400),
    }));
    // A pass that still reports a blocker or major problem is not a pass.
    const failsBy = kind => entry[kind] === 'fail' || findings.some(f => f.verdict === kind && f.severity !== 'minor');
    return { captureId: c.id, semantic: failsBy('semantic') ? 'fail' : 'pass', visual: failsBy('visual') ? 'fail' : 'pass', findings };
  });
  return { captures: results, accepted: results.every(r => r.semantic === 'pass' && r.visual === 'pass') };
}

// One review round. callRole(role, { system, tool, content }) -> { input, identity, usage } (Lane C's callExplainRole).
// Failures before the call spend nothing; a failed call is review_unavailable, never an accept.
export async function reviewCaptures(input, { callRole, limits = REVIEW_LIMITS }) {
  if (typeof callRole !== 'function') throw new ReviewError('no_transport', 'review has no admitted model transport');
  if (!input.captures?.length) throw new ReviewError('missing_pixels', 'review needs at least one rendered capture');
  const results = [];
  const calls = [];
  for (const batch of reviewBatches(input.captures || [], limits.maxImages)) {
    const { content, imageBlocks } = buildReviewContent({ ...input, captures: batch }, limits);
    if (imageBlocks !== batch.length || !imageBlocks) throw new ReviewError('missing_pixels', 'a review without images is not an image review');
    let reply;
    try { reply = await callRole('review', { system: REVIEW_SYSTEM, tool: REVIEW_TOOL, content }); }
    catch (error) { throw Object.assign(new ReviewError('review_unavailable', `review call failed: ${error.message}`), { cause: error }); }
    calls.push({ identity: reply.identity ?? null, usage: reply.usage ?? null, imageBlocks });
    results.push(...parseReview(reply.input, batch).captures);
  }
  return { captures: results, accepted: results.every(r => r.semantic === 'pass' && r.visual === 'pass'), calls };
}
