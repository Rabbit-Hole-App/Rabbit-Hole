// M0 contracts: duration normalization (§2.2), MotionBrief / storyboard / author / finding /
// job validation (§5), the single repair round and the format re-ask (§4.8), provenance (§18),
// and the §27 fixtures pinned to full SHAs. node --test, no rendering, no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import {
  MODEL_ROLES, BLOCKING_CATEGORIES, ADVISORY_CATEGORIES, STRUCTURED_STAGES, validateBrief, validateStoryboard, validateAuthorOutput,
  validateFinding, classifyFindings, afterReview, afterNeedsRevision, startRepair, afterMalformed, validateJob, blockProvenance, leakErrors,
  validateRenderRequest,
} from './contracts.js';
import { durationDecision, parseDuration } from './duration.js';

const read = p => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const brief = () => read('./fixtures/demo-a/brief.json');
const storyboard = () => read('./fixtures/demo-a/storyboard.json');
const has = (errors, re) => assert.ok(errors.some(e => re.test(e)), `expected ${re} in:\n${errors.join('\n')}`);

test('duration: every §2.2 row and the owner decisions', () => {
  const rows = [
    ['', 10, '✓ duration: 10s (default)'],
    ['/motion explain me softmax func', 10, '✓ duration: 10s (default)'],
    ['12 seconds', 12, '✓ duration: 12s'],
    ['25 sec', 25, '✓ duration: 25s'],
    ['45 sec', 30, '✓ duration: 30s (asked 45s; Motion V1 max is 30s)'],
    ['1 minute', 30, '✓ duration: 30s (asked 60s; Motion V1 max is 30s)'],
    ['3 sec', 5, '✓ duration: 5s (asked 3s; Motion V1 min is 5s)'],
    ['12.4s', 12, '✓ duration: 12s (asked 12.4s)'],
    ['12.5s', 13, '✓ duration: 13s (asked 12.5s)'],
    ['3', 10, '✓ duration: 10s (default)'], // a bare number is not a duration
    ['/motion 3s explain attention', 5, '✓ duration: 5s (asked 3s; Motion V1 min is 5s)'],
    ['/motion 15s explain me softmax func', 15, '✓ duration: 15s'],
    ['/motion 20s explain gradient descent visually', 20, '✓ duration: 20s'],
    ['/motion explain attention in 5 sec', 5, '✓ duration: 5s'],
    ['4.5s', 5, '✓ duration: 5s (asked 4.5s)'],
    ['4.4s', 5, '✓ duration: 5s (asked 4.4s; Motion V1 min is 5s)'],
    ['30.5s', 30, '✓ duration: 30s (asked 30.5s; Motion V1 max is 30s)'],
    ['0.25 min', 15, '✓ duration: 15s'],
  ];
  for (const [text, seconds, line] of rows) {
    const d = durationDecision(text);
    assert.equal(d.duration.seconds, seconds, text);
    assert.equal(d.line, line, text);
    assert.ok(Number.isInteger(d.duration.seconds) && d.duration.seconds >= 5 && d.duration.seconds <= 30);
    // the brief records both values; normalization only when they differ, never silently
    if (d.duration.requested_seconds !== undefined) assert.equal(!!d.duration.normalization, d.duration.seconds !== d.duration.requested_seconds, text);
  }
  assert.equal(parseDuration('explain it a second time'), null);
  assert.deepEqual(durationDecision('45 sec').duration, { requested_text: '45 sec', requested_seconds: 45, seconds: 30, normalization: '✓ duration: 30s (asked 45s; Motion V1 max is 30s)' });
});

test('MotionBrief: the Demo A fixture validates', () => assert.deepEqual(validateBrief(brief()), []));

test('MotionBrief: §5.1 rules reject', () => {
  const bad = (mutate, re) => { const b = brief(); mutate(b); has(validateBrief(b), re); };
  bad(b => { b.duration.seconds = 31; }, /duration.seconds: integer 5..30/);
  bad(b => { b.duration.seconds = 20; }, /never lengthens or silently changes/);
  bad(b => { b.duration = { seconds: 15 }; }, /never lengthens or silently changes/); // no request: default 10, not 15
  bad(b => { b.duration = { requested_text: '12.5s', requested_seconds: 12.5, seconds: 13 }; }, /decision line is required/);
  bad(b => { b.teaching_mode = 'cinematic'; }, /teaching_mode/);
  bad(b => { b.teaching_mode = 'intuition_first'; }, /analogy_map/);
  bad(b => { b.claim_registry[0].source_ref_ids = ['S9']; }, /unknown S9/);
  bad(b => { b.claim_registry[1].condition_ids = ['K7']; }, /unknown K7/);
  bad(b => { b.source_refs[0].commit = '3adf61e'; }, /full 40-hex SHA/);
  bad(b => { delete b.source_refs[1].end_line; }, /line range/);
  bad(b => { b.must_show = []; }, /must_show/);
  bad(b => { b.must_not_claim = []; }, /must_not_claim/);
  bad(b => { b.implementation_conditions[0].branches.pop(); }, /at least two/);
  bad(b => { b.output_requirements.preview_scale = 0.4448; }, /whole, even preview dimensions/);
  bad(b => { b.aspect_ratio = '9:16'; }, /16:9/);
  bad(b => { b.qa_requirements.blocking_categories = ['aesthetic_preference']; }, /blocking_categories/);
  bad(b => { b.resolved_target.selection = { kind: 'tab', id: 'x' }; }, /SELECTIONS/);
  bad(b => { b.title = 'Made by claude-opus-5-5'; }, /model ID/);
  bad(b => { b.visual_direction = `use key ${['sk', 'ant', 'api03'].join('-')}-${'x'.repeat(16)}`; }, /credential/); // assembled so scanners see no literal key
});

test('MotionStoryboard: the Demo A fixture validates', () => assert.deepEqual(validateStoryboard(storyboard(), brief()), []));

test('MotionStoryboard: §5.2 rules reject', () => {
  const bad = (mutate, re, b = brief()) => { const s = storyboard(); mutate(s, b); has(validateStoryboard(s, b), re); };
  bad(s => { s.beats[1].start_time = 3.5; }, /gap or overlap/);
  bad(s => { s.beats[1].start_time = 2.5; }, /gap or overlap/);
  bad(s => { s.beats.at(-1).end_time = 14; }, /must end at exactly 15s/);
  bad(s => { s.beats = s.beats.slice(0, 1); }, /2-8 beats/);
  bad(s => { s.beats = Array.from({ length: 9 }, (_, i) => ({ ...s.beats[0], id: `B${i + 1}` })); }, /2-8 beats/);
  bad(s => { s.beats[0].claim_ids = []; }, /at least one claim/);
  bad(s => { s.beats[0].claim_ids = ['C9']; }, /unknown C9/);
  bad(s => { delete s.beats[1].condition_ids; }, /conditional claim C2 but does not name its condition K1/);
  bad(s => { s.beats[3].claim_ids = ['C2']; s.beats[4].claim_ids = ['C1', 'C2']; }, /required claim C3/);
  bad(s => { s.beats[2].must_show_covered = ['normalized allowed weights']; }, /must_show "weights summing to 1/);
  bad(s => { s.beats[0].must_show_covered.push('a sparkle'); }, /not a brief must_show item/);
  bad(s => { s.beats[0].narration_line = 'Here is softmax.'; }, /narration_policy is none/);
  bad(s => { s.brief_id = 'other'; }, /brief_id/);
});

test('Author output: exactly one of composition | needs_revision (§5.3)', () => {
  assert.deepEqual(validateAuthorOutput({ status: 'composition', source: 'export default 1', composition_id: 'softmax-demo' }), []);
  assert.deepEqual(validateAuthorOutput({ status: 'needs_revision', reason: 'storyboard claims masking always uses F.softmax', stage: 'storyboard', refs: ['B2', 'C2', 'K1'] }), []);
  has(validateAuthorOutput({ status: 'composition', source: 'x', composition_id: 'a', reason: 'both' }), /not part of a composition result/);
  has(validateAuthorOutput({ status: 'needs_revision', reason: 'x', stage: 'render', refs: ['B1'] }), /brief \| storyboard/);
  has(validateAuthorOutput({ status: 'done' }), /composition \| needs_revision/);
});

test('findings: the harness classifies by category (§13)', () => {
  const f = (category, reviewer = 'visual') => ({ reviewer, category, description: category });
  assert.deepEqual(validateFinding({ ...f('blank_frame'), beat_id: 'B1', timestamp: 0 }), []);
  has(validateFinding(f('looks_meh')), /unknown "looks_meh"/);
  const { blocking, advisory } = classifyFindings([f('aesthetic_preference'), f('must_not_claim_violation', 'pedagogical'), f('minor_spacing')]);
  assert.deepEqual(blocking.map(x => x.category), ['must_not_claim_violation']);
  assert.equal(advisory.length, 2);
  assert.equal(BLOCKING_CATEGORIES.length, 12);
  assert.equal(ADVISORY_CATEGORIES.length, 4);
});

const job = () => {
  const b = brief();
  return {
    id: 'job-demo-a1', status: 'reviewing', owner: { org: 'example-team', app: 'nanogpt', learner: 'learner-1' },
    brief: b, storyboard: storyboard(), renderer: { name: 'remotion', version: 'remotion@4.0.521' }, prompt_spec_version: 'motion-v1.0',
    director_model_config: { role: 'MOTION_DIRECTOR_MODEL', resolved_model: 'claude-opus-5-5' },
    author_model_config: { role: 'MOTION_AUTHOR_MODEL', resolved_model: 'claude-opus-5-5' },
    review_model_config: { visual: { role: 'MOTION_VISUAL_REVIEW_MODEL' }, pedagogical: { role: 'MOTION_PEDAGOGICAL_REVIEW_MODEL' } },
    repair_count: 0, format_retries: [], findings: [], preview_refs: { contact_sheet: 'job/contact-sheet.png', keyframes: [] },
    source_refs: b.source_refs, created_at: '2026-10-04T00:00:00Z', updated_at: '2026-10-04T00:00:00Z',
  };
};

test('exactly one semantic repair round per job (§4.8)', () => {
  const j = job();
  const blank = [{ reviewer: 'visual', category: 'blank_frame', description: 'frame 0 is white' }];
  assert.equal(afterReview(j, [{ reviewer: 'visual', category: 'aesthetic_preference', description: 'x' }]), 'render_final'); // advisory never repairs
  assert.equal(afterReview(j, blank), 'repair');
  startRepair(j);
  assert.equal(j.repair_count, 1);
  assert.equal(afterReview(j, blank), 'fail'); // still blocking after the repaired render: no second loop
  assert.throws(() => startRepair(j), /already used/);
  // an Author needs_revision consumes the round; one from the repair call fails the job
  assert.equal(afterNeedsRevision(job()), 'repair');
  assert.equal(afterNeedsRevision(j), 'fail');
  assert.deepEqual(validateJob(j), []);
  has(validateJob({ ...job(), repair_count: 2 }), /0 or 1/);
});

test('malformed output: one schema-only re-ask per structured invocation, never a repair (§4.8)', () => {
  const j = job();
  assert.equal(afterMalformed(j, 'storyboard', ['beats: not an array']), 'reask');
  assert.equal(afterMalformed(j, 'author', ['unparseable JSON']), 'reask');
  assert.equal(j.repair_count, 0);
  assert.deepEqual(j.format_retries.map(r => [r.stage, r.round]), [['storyboard', 0], ['author', 0]]);
  assert.deepEqual(validateJob(j), []);
  assert.equal(afterMalformed(j, 'storyboard', ['still not an array']), 'fail');
  assert.equal(j.status, 'failed');
  assert.match(j.failure_reason, /^storyboard: output was malformed again/);
  has(validateJob({ ...job(), format_retries: [{ stage: 'brief', round: 0, errors: [] }, { stage: 'brief', round: 0, errors: [] }] }), /more than one re-ask for brief in round 0/);
  has(validateJob({ ...job(), format_retries: [{ stage: 'brief', errors: [] }] }), /round: 0 \| 1/);
  has(validateJob({ ...job(), format_retries: [{ stage: 'author', round: 1, errors: [] }] }), /never past repair_count/);
  assert.deepEqual(STRUCTURED_STAGES, ['brief', 'storyboard', 'author', 'visual_review', 'pedagogical_review']);
});

test('the repair round\'s Author call gets its own schema-only re-ask; repair_count stays 1 (owner decision 2026-10-04)', () => {
  const j = job();
  assert.equal(afterMalformed(j, 'author', ['unparseable JSON']), 'reask'); // round 0
  startRepair(j);
  assert.equal(afterMalformed(j, 'author', ['missing composition_id']), 'reask'); // round 1: a distinct invocation
  assert.equal(j.repair_count, 1);
  assert.deepEqual(j.format_retries.map(r => [r.stage, r.round]), [['author', 0], ['author', 1]]);
  assert.deepEqual(validateJob(j), []);
  assert.equal(afterMalformed(j, 'author', ['still malformed']), 'fail'); // the same invocation twice
  assert.match(j.failure_reason, /^author \(repair round\): output was malformed again/);
  assert.equal(j.repair_count, 1);
});

test('render request: only an already-validated job, no paths, URLs or options (§10.2)', () => {
  const source = readFileSync(new URL('./fixtures/demo-a/composition.jsx', import.meta.url), 'utf8');
  const req = () => ({ schema: 'motion-render/1', renderer: 'remotion', brief: brief(), storyboard: storyboard(), composition: { composition_id: 'demo-a1', source } });
  assert.deepEqual(validateRenderRequest(req()), []);
  has(validateRenderRequest({ ...req(), dir: '../../etc' }), /request\.dir: unknown field/);
  has(validateRenderRequest({ ...req(), output: '/app/x.mp4' }), /request\.output: unknown field/);
  has(validateRenderRequest({ ...req(), composition: { composition_id: 'demo-a1', source, path: '/etc/passwd' } }), /composition\.path: unknown field/);
  has(validateRenderRequest({ ...req(), composition: { composition_id: '../x', source } }), /composition_id: letters, digits and dashes/);
  has(validateRenderRequest({ ...req(), renderer: 'hyperframes' }), /only V1 renderer/);
  has(validateRenderRequest({ ...req(), schema: 'motion-render/2' }), /request\.schema/);
  has(validateRenderRequest({ ...req(), storyboard: { ...storyboard(), beats: [] } }), /2-8 beats/);
  has(validateRenderRequest([]), /not an object/);
});

test('MotionJob: roles, not model IDs, are the contract (§4.9, §5.5)', () => {
  assert.deepEqual(MODEL_ROLES, { director: 'MOTION_DIRECTOR_MODEL', author: 'MOTION_AUTHOR_MODEL', visual_review: 'MOTION_VISUAL_REVIEW_MODEL', pedagogical_review: 'MOTION_PEDAGOGICAL_REVIEW_MODEL' });
  assert.deepEqual(validateJob(job()), []); // resolved_model is allowed as provenance
  const j = job(); j.brief.objective += ' (written by claude-opus-5-5)';
  has(validateJob(j), /model ID/);
  has(validateJob({ ...job(), failure_reason: 'opus-5 timed out' }), /model ID/);
  has(validateJob({ ...job(), director_model_config: { role: 'MOTION_DIRECTOR_MODEL', api_key: 'x' } }), /credential-shaped key/);
  has(validateJob({ ...job(), author_model_config: { role: 'claude-opus-5-5' } }), /MOTION_AUTHOR_MODEL/);
  has(validateJob({ ...job(), source_refs: [] }), /copied from the brief/);
  has(validateJob({ ...job(), status: 'ready' }), /final_ref/);
  has(validateJob({ ...job(), status: 'failed' }), /failure_reason/);
});

test('provenance: what source and claims made this video (§18)', () => {
  const p = blockProvenance(job());
  assert.deepEqual(JSON.parse(JSON.stringify(p)), p);
  assert.deepEqual(Object.keys(p), ['motion_job_id', 'prompt_spec_version', 'source_refs', 'claim_ids']);
  assert.deepEqual(p.claim_ids, ['C1', 'C2', 'C3']);
  assert.deepEqual(p.source_refs[0], { id: 'S1', kind: 'code', repository: 'karpathy/nanoGPT', commit: '3adf61e154c3fe3fca428ad6bc3818b27a3b8291', path: 'model.py', start_line: 44, end_line: 45 });
  assert.deepEqual(leakErrors(p, 'provenance'), []);
});

test('§27 fixtures: pinned full SHAs, verbatim evidence', () => {
  const { excerpts } = read('./fixtures/sources/excerpts.json');
  const { demos } = read('./fixtures/demos.json');
  assert.deepEqual(demos.map(d => d.id), ['A1', 'A2', 'B', 'C1', 'C2']);
  for (const d of demos) {
    assert.match(d.commit, /^[0-9a-f]{40}$/);
    assert.equal(durationDecision(d.request).line, d.expected.duration_line, d.id);
  }
  for (const e of Object.values(excerpts)) {
    assert.match(e.commit, /^[0-9a-f]{40}$/);
    assert.equal(e.text.split('\n').length, e.end_line - e.start_line + 1);
  }
  // Every evidence excerpt in the brief is verbatim pinned source.
  const pinned = Object.values(excerpts).filter(e => e.repository === 'karpathy/nanoGPT').map(e => e.text).join('\n');
  for (const ev of brief().evidence) assert.ok(pinned.includes(ev.excerpt), ev.source_ref_id);
  assert.match(excerpts['nanogpt/model.py:62-71'].text.split('\n')[7], /F\.softmax\(att, dim=-1\)/); // line 69
  assert.match(excerpts['nanogpt/model.py:305-330'].text.split('\n')[19], /F\.softmax\(logits, dim=-1\)/); // line 324
  // This repository's excerpts re-verify against git when the pinned commit is present.
  const C = 'e9d6dbe7f088a8a2d99e138c0b08a4c7a2dfcc25';
  let available = true;
  try { execFileSync('git', ['cat-file', '-e', `${C}^{commit}`], { stdio: 'ignore' }); } catch { available = false; }
  for (const e of Object.values(excerpts).filter(x => x.commit === C)) {
    if (!available) continue; // ponytail: a shallow clone without the pinned commit skips this cross-check
    const file = execFileSync('git', ['show', `${C}:${e.path}`], { encoding: 'utf8' });
    assert.equal(file.split('\n').slice(e.start_line - 1, e.end_line).join('\n'), e.text, e.path);
  }
});
