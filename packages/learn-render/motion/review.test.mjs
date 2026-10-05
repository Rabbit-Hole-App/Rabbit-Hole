// M6: fresh blind reviewers, the harness's preview checks, the single repair round and its routing.
// Fast tests use doubles for the model, the service and the stages; MOTION_RENDER_TESTS=1 adds real
// preview renders through the local service (no model call).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkAuthorSource } from './author-check.js';
import { REPAIR_RULES, authorRequest } from './author.js';
import { BLOCKING_CATEGORIES, validateFinding, validateJob, validateRenderRequest, validateRenderResult } from './contracts.js';
import { localService, renderComposition, renderPreview } from './render-job.mjs';
import { harnessFindings, runMotionJob } from './review-job.mjs';
import { REVIEWER_CATEGORIES, reviewRequest, runReviewer, validateReviewOutput } from './review.js';
import { checkComposition } from './static-check.js';
import { storyboardRequest } from './storyboard.js';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const FIX = join(HERE, 'fixtures');
const INPUTS = JSON.parse(readFileSync(join(FIX, 'm5', 'inputs.json'), 'utf8'));
const load = name => {
  const i = INPUTS[name], json = f => JSON.parse(readFileSync(join(FIX, f), 'utf8'));
  const source = readFileSync(join(FIX, i.composition), 'utf8');
  return { brief: json(i.brief), storyboard: json(i.storyboard), source, author: { status: 'composition', output: { status: 'composition', composition_id: i.composition_id, source, notes: 'AUTHOR-NOTES-NEVER-REVIEWED' } }, origin: { storyboard: i.storyboard_origin, composition: i.composition_origin } };
};
const tmp = () => mkdtempSync(join(tmpdir(), 'motion-review-test-'));
// One tiny PNG per frame: the reviewers' input is files on disk.
function framesIn(dir, frames) {
  mkdirSync(join(dir, 'frames'), { recursive: true });
  const png = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex');
  return frames.map(([frame, beat]) => { const file = `frames/frame-${String(frame).padStart(4, '0')}.png`; writeFileSync(join(dir, file), png); return { frame, time: frame / 30, beat, file }; });
}
const reply = input => new Response(JSON.stringify({ model: 'claude-opus-5-5', stop_reason: 'tool_use', usage: { input_tokens: 100, output_tokens: 20 }, content: [{ type: 'tool_use', id: 'toolu_1', name: 'motion_review', input }] }), { status: 200, headers: { 'content-type': 'application/json' } });

test('reviewers are blind: brief and frames only, never the source, notes, storyboard text or findings', () => {
  const { brief, storyboard, source } = load('softmax');
  const dir = tmp();
  const frames = framesIn(dir, [[0, 'B1'], [60, 'B2']]);
  for (const reviewer of ['visual', 'pedagogical']) {
    const body = reviewRequest(reviewer, brief, frames, dir);
    const text = JSON.stringify(body);
    assert.ok(!text.includes(source.split('\n').find(l => l.includes('export const timeline'))), `${reviewer}: no composition source`);
    assert.ok(!text.includes('AUTHOR-NOTES'), `${reviewer}: no Author notes`);
    for (const o of storyboard.beats.flatMap(b => b.visible_objects)) assert.ok(!text.includes(o.description), `${reviewer}: no storyboard object description`);
    assert.ok(!text.includes(brief.raw_user_request) && !text.includes(JSON.stringify(brief.audience_context)), `${reviewer}: no learner request or audience context`);
    assert.ok(!/blocking_findings|finding/i.test(body.messages[0].content[0].text), `${reviewer}: no earlier findings`);
    assert.equal(body.messages.length, 1, `${reviewer}: a fresh conversation`);
    assert.equal(body.messages[0].content.filter(c => c.type === 'image').length, 2);
    assert.deepEqual(body.messages[0].content.filter(c => c.type === 'text').slice(1).map(c => c.text), ['frame 0 (0.00 s, B1)', 'frame 60 (2.00 s, B2)']);
    assert.deepEqual(body.tool_choice, { type: 'auto' });
    assert.deepEqual(body.thinking, { type: 'adaptive' });
  }
  const visual = JSON.stringify(reviewRequest('visual', brief, frames, dir).messages[0].content[0]);
  const pedagogical = JSON.stringify(reviewRequest('pedagogical', brief, frames, dir).messages[0].content[0]);
  assert.ok(!visual.includes('evidence') && !visual.includes(brief.claim_registry[0].text), 'visual: the brief without claims or evidence');
  assert.ok(pedagogical.includes('evidence') && pedagogical.includes(brief.must_not_claim[0]), 'pedagogical: claims, must_not_claim and source evidence');
});

test('each reviewer has its own categories; the harness owns duration, corruption and render failures', () => {
  const all = [...REVIEWER_CATEGORIES.visual, ...REVIEWER_CATEGORIES.pedagogical];
  assert.deepEqual(BLOCKING_CATEGORIES.filter(c => !all.includes(c)), ['duration_over_max', 'corrupt_output', 'renderer_failure', 'storyboard_fidelity']);
  assert.ok(!REVIEWER_CATEGORIES.visual.some(c => REVIEWER_CATEGORIES.pedagogical.includes(c)));
  const beats = ['B1', 'B2'];
  assert.deepEqual(validateReviewOutput('visual', { findings: [] }, beats), []);
  assert.deepEqual(validateReviewOutput('visual', { findings: [{ category: 'clipped_text', beat_id: 'B2', timestamp: 2, description: 'cut off' }] }, beats), []);
  assert.match(validateReviewOutput('visual', { findings: [{ category: 'unsupported_claim', description: 'x' }] }, beats).join(), /category: one of/);
  assert.match(validateReviewOutput('pedagogical', { findings: [{ category: 'blank_frame', description: 'x' }] }, beats).join(), /category: one of/);
  assert.match(validateReviewOutput('visual', { findings: [{ category: 'clipped_text', beat_id: 'B9', description: 'x' }] }, beats).join(), /beat_id: one of B1, B2/);
  assert.match(validateReviewOutput('visual', { findings: [{ category: 'clipped_text', description: 'x', blocking: true }] }, beats).join(), /blocking: not a field/);
  assert.match(validateReviewOutput('visual', { verdict: 'good', findings: [] }, beats).join(), /verdict: not a field/);
});

test('a reviewer pass: findings tagged with reviewer and round; one schema-only re-ask, then the pass fails', async () => {
  const { brief, storyboard } = load('softmax');
  const dir = tmp();
  const frames = framesIn(dir, [[0, 'B1']]);
  const replies = [reply({ findings: [{ category: 'clipped_text', beat_id: 'B1', timestamp: 0, description: 'The heading is cut off.' }] })];
  const r = await runReviewer({ reviewer: 'visual', brief, storyboard, frames, dir, round: 1, call: async () => replies.shift() });
  assert.equal(r.status, 'reviewed');
  assert.deepEqual(r.findings, [{ reviewer: 'visual', round: 1, category: 'clipped_text', beat_id: 'B1', timestamp: 0, description: 'The heading is cut off.' }]);
  assert.deepEqual(r.calls.map(c => [c.stage, c.round, c.role]), [['visual_review', 1, 'MOTION_VISUAL_REVIEW_MODEL']]);
  const bodies = [];
  const bad = [reply({ findings: [{ category: 'jitter', description: 'x' }] }), reply({ findings: 'none' })];
  const f = await runReviewer({ reviewer: 'visual', brief, storyboard, frames, dir, call: async (env, body) => { bodies.push(body); return bad.shift(); } });
  assert.equal(f.status, 'failed');
  assert.equal(f.error, 'malformed');
  assert.deepEqual(f.format_retries.map(x => [x.stage, x.round]), [['visual_review', 0]]);
  assert.equal(bodies.length, 2);
  assert.match(JSON.stringify(bodies[1].messages.at(-1)), /SAME findings/);
});

const blankPreview = (frames, extra = {}) => ({ submitted: true, result: { status: 'ready', frames: [{ frame: 0, beat: 'B1' }], nonblank: { ok: !frames.length, threshold: 2, blank: frames.map(([frame, luma]) => ({ frame, beat: 'B1', luma_stddev: luma })) }, ...extra } });
test('harness findings: blank or near-blank frames, a failed or refused render and a corrupt preview all block', () => {
  assert.deepEqual(harnessFindings(blankPreview([]), 0), []);
  const [blank] = harnessFindings(blankPreview([[0, 1.34], [1, 1.35]]), 0);
  assert.deepEqual({ ...blank, description: undefined }, { reviewer: 'harness', round: 0, category: 'blank_frame', beat_id: 'B1', timestamp: 0, description: undefined });
  assert.match(blank.description, /#0 \(0\.00 s, luma stddev 1\.34\), #1 \(0\.03 s, luma stddev 1\.35\)/);
  assert.match(blank.description, /above 2/);
  assert.deepEqual(validateFinding(blank), []);
  assert.equal(harnessFindings({ submitted: true, result: { status: 'render_failed', failure: { category: 'compile_failed', detail: 'x is not defined' } } }, 1)[0].category, 'renderer_failure');
  assert.equal(harnessFindings({ submitted: false, reason: 'invalid_job', errors: ['static: fetch'] }, 0)[0].category, 'renderer_failure');
  assert.equal(harnessFindings({ submitted: true, result: { status: 'artifact_invalid', failure: { category: 'preview_invalid', detail: '10 frames' } } }, 0)[0].category, 'corrupt_output');
  for (const c of ['blank_frame', 'renderer_failure', 'corrupt_output', 'storyboard_fidelity']) assert.ok(BLOCKING_CATEGORIES.includes(c));
  // M7A: the preview's coverage judgment (the first automatic run failed it only at final validation).
  const missing = harnessFindings(blankPreview([], { coverage: { ok: false, errors: ['B3 #225: object masked_fill_code_line is not visible', 'B5 #420: object row_direction_arrow is not visible'] } }), 0);
  assert.deepEqual(missing.map(f => [f.reviewer, f.category, f.beat_id]), [['harness', 'storyboard_fidelity', 'B3']]);
  assert.match(missing[0].description, /B3 #225: object masked_fill_code_line is not visible; B5 #420/);
  assert.deepEqual(validateFinding(missing[0]), []);
  assert.deepEqual(harnessFindings(blankPreview([[0, 0]], { coverage: { ok: false, errors: ['B1 #45: object x is not visible'] } }), 1).map(f => f.category), ['storyboard_fidelity', 'blank_frame']);
  assert.deepEqual(harnessFindings(blankPreview([], { coverage: { ok: true, errors: [] } }), 0), []);
});

test('the repair Author call: the previous source, the blocking findings and the four nonblank requirements, verbatim', () => {
  const { brief, storyboard, source } = load('softmax');
  const [blank] = harnessFindings(blankPreview([[0, 1.34]]), 0);
  const body = authorRequest(brief, storyboard, { repair: { source, findings: [blank] } });
  const text = body.messages[0].content;
  assert.match(text, /^Implement this storyboard\./);
  assert.match(text, /REPAIR ROUND/);
  for (const rule of REPAIR_RULES) assert.ok(text.includes(rule), rule);
  assert.match(REPAIR_RULES.join(' '), /Frame 0 is visibly nonblank/);
  assert.match(REPAIR_RULES.join(' '), /useful visible opacity/);
  assert.match(REPAIR_RULES.join(' '), /No fade-in leaves the first sampled frames/);
  assert.match(REPAIR_RULES.join(' '), /final frame also remains nonblank/);
  assert.ok(text.includes(`previous_source =\n${source}`));
  assert.ok(text.includes('"category":"blank_frame"') && !text.includes('"round"'), 'findings as the repair sees them');
  assert.ok(!text.includes(brief.raw_user_request));
  assert.equal(authorRequest(brief, storyboard).messages[0].content.includes('REPAIR'), false, 'a first-pass Author call has no repair section');
  const revision = storyboardRequest(brief, { revision: { storyboard, findings: [{ reviewer: 'pedagogical', category: 'missing_must_show', description: 'never shows the mask' }] } }).messages[0].content;
  assert.match(revision, /REVISION ROUND[\s\S]*missing_must_show[\s\S]*storyboard = /);
});

// The loop with every stage doubled: what ran, in which round, with which inputs.
function harness({ previews, reviews, final = 'ready', author = 'composition', revision = 'storyboard' }) {
  const log = [];
  const stages = {
    service: { health: async () => ({ version: 'motion-renderer-1-test' }) },
    preview: async a => { log.push(['preview', a.author.output.source.slice(0, 12), a.storyboard.version ?? 1]); return previews.shift(); },
    review: async a => { log.push([`${a.reviewer}_review`, a.round, Object.keys(a).sort().join(',')]); return { status: 'reviewed', findings: (reviews.shift() || []).map(f => ({ reviewer: a.reviewer, round: a.round, ...f })), calls: [{ stage: `${a.reviewer}_review`, round: a.round }], format_retries: [] }; },
    repairAuthor: async a => {
      log.push(['author', a.round, a.repair?.findings.map(f => f.category) ?? null, a.repair?.source?.slice(0, 12) ?? null]);
      return author === 'composition' ? { status: 'composition', output: { status: 'composition', composition_id: 'softmax-fixed', source: 'REPAIRED-SOURCE' }, calls: [{ stage: 'author', round: 1 }], format_retries: [] }
        : { status: 'needs_revision', output: { status: 'needs_revision', reason: 'cannot', stage: 'storyboard', refs: ['B1'], requested_changes: ['split B1'] }, calls: [], format_retries: [] };
    },
    revise: async a => { log.push(['storyboard', a.round, a.revision.findings.map(f => f.category)]); return revision === 'storyboard' ? { status: 'storyboard', storyboard: { ...a.revision.storyboard, version: 2 }, check: { errors: [] }, calls: [{ stage: 'storyboard', round: 1 }], format_retries: [] } : { status: 'storyboard_invalid', storyboard: {}, check: { errors: ['B9: unknown claim'] }, calls: [], format_retries: [] }; },
    final: async a => { log.push(['final', a.author.output.source.slice(0, 12)]); return { submitted: true, result: { status: final, validation: { ok: final === 'ready' }, ...(final === 'ready' ? {} : { failure: { category: 'final_invalid', detail: 'nonblank frames' } }) } }; },
  };
  return { log, stages };
}
const clean = () => blankPreview([]);
const run = async (name, h, extra = {}) => { const x = load(name); return runMotionJob({ ...x, ...h.stages, call: async () => assert.fail('no real model call'), dir: tmp(), ...extra }); };
const SRC = name => load(name).source.slice(0, 12);

test('clean first review: final render, no repair, no Author call', async () => {
  const h = harness({ previews: [clean()], reviews: [[], []] });
  const r = await run('softmax', h);
  assert.equal(r.job.status, 'ready');
  assert.equal(r.job.repair_count, 0);
  assert.deepEqual(r.job_errors, []);
  assert.deepEqual(h.log.map(l => l[0]), ['preview', 'visual_review', 'pedagogical_review', 'final']);
  // Fresh and blind: each reviewer call gets the brief, the frames and its round, nothing else.
  assert.deepEqual(h.log.filter(l => l[0].endsWith('_review')).map(l => l[2]), Array(2).fill('brief,call,dir,effort,env,frames,reviewer,round,storyboard'));
});

test('blank opening: the harness finding spends the ONE repair round on the Author, then fresh reviews and the final render', async () => {
  const h = harness({ previews: [blankPreview([[0, 1.34], [1, 1.35]]), clean()], reviews: [[], [], [], []] });
  const r = await run('softmax', h);
  assert.equal(r.job.status, 'ready');
  assert.equal(r.job.repair_count, 1);
  assert.deepEqual(r.job_errors, []);
  assert.deepEqual(h.log, [
    ['preview', SRC('softmax'), 1], ['visual_review', 0, 'brief,call,dir,effort,env,frames,reviewer,round,storyboard'], ['pedagogical_review', 0, 'brief,call,dir,effort,env,frames,reviewer,round,storyboard'],
    ['author', 1, ['blank_frame'], SRC('softmax')],
    ['preview', 'REPAIRED-SOU', 1], ['visual_review', 1, 'brief,call,dir,effort,env,frames,reviewer,round,storyboard'], ['pedagogical_review', 1, 'brief,call,dir,effort,env,frames,reviewer,round,storyboard'],
    ['final', 'REPAIRED-SOU'],
  ]);
  assert.deepEqual(r.repair, { route: 'author', findings: 1, author: { status: 'composition' } });
  assert.deepEqual(r.passes.map(p => [p.round, p.blocking, p.decision]), [[0, 1, 'repair'], [1, 0, 'render_final']]);
  assert.deepEqual(r.job.findings.map(f => [f.reviewer, f.round, f.category]), [['harness', 0, 'blank_frame']]);
  assert.equal(r.composition.source, 'REPAIRED-SOURCE');
});

test('still blank after the repair: the job fails with diagnostics; no final render, no second Author call', async () => {
  const h = harness({ previews: [blankPreview([[0, 0]]), blankPreview([[0, 1.1]])], reviews: [[], [], [], []] });
  const r = await run('generate', h);
  assert.equal(r.job.status, 'failed');
  assert.match(r.job.failure_reason, /still blocking after the Author repair: blank_frame/);
  assert.equal(h.log.filter(l => l[0] === 'author').length, 1);
  assert.equal(h.log.filter(l => l[0] === 'final').length, 0);
  assert.equal(r.job.repair_count, 1);
  assert.deepEqual(r.job.findings.map(f => [f.round, f.category]), [[0, 'blank_frame'], [1, 'blank_frame']]);
  assert.deepEqual(r.job_errors, []);
});

test('pedagogical blocking finding: one Director revision, then one Author call on the revised storyboard', async () => {
  const h = harness({ previews: [clean(), clean()], reviews: [[{ category: 'aesthetic_preference', description: 'busy' }], [{ category: 'missing_must_show', beat_id: 'B2', description: 'the row sum is never shown' }], [], []] });
  const r = await run('softmax', h);
  assert.equal(r.job.status, 'ready');
  assert.deepEqual(h.log.filter(l => ['storyboard', 'author', 'preview'].includes(l[0])), [
    ['preview', SRC('softmax'), 1], ['storyboard', 1, ['missing_must_show']], ['author', 1, ['missing_must_show'], SRC('softmax')], ['preview', 'REPAIRED-SOU', 2],
  ]);
  assert.equal(r.storyboard_revised, true);
  assert.equal(r.repair.route, 'director_revision_then_author');
});

test('advisory findings never repair; a final failure fails the job without a repair', async () => {
  const h = harness({ previews: [clean()], reviews: [[{ category: 'minor_spacing', description: 'tight' }], []], final: 'artifact_invalid' });
  const r = await run('softmax', h);
  assert.equal(r.job.status, 'failed');
  assert.match(r.job.failure_reason, /^final: artifact_invalid: final_invalid/);
  assert.equal(r.job.repair_count, 0);
  assert.equal(h.log.filter(l => l[0] === 'author').length, 0);
});

test('needs_revision: from the first Author it consumes the round; from the repair call it fails the job', async () => {
  const x = load('softmax');
  const first = { status: 'needs_revision', output: { status: 'needs_revision', reason: 'B1 needs an image', stage: 'storyboard', refs: ['B1'], requested_changes: ['drop the image'] } };
  const h = harness({ previews: [clean()], reviews: [[], []] });
  const r = await run('softmax', h, { author: first });
  assert.equal(r.job.status, 'ready');
  assert.deepEqual(h.log.filter(l => l[0] !== 'visual_review' && l[0] !== 'pedagogical_review').map(l => l.slice(0, 3)), [['storyboard', 1, ['needs_revision']], ['author', 1, null], ['preview', 'REPAIRED-SOU', 2], ['final', 'REPAIRED-SOU']]);
  const h2 = harness({ previews: [blankPreview([[0, 0]])], reviews: [[], []], author: 'needs_revision' });
  const r2 = await run('softmax', h2);
  assert.equal(r2.job.status, 'failed');
  assert.match(r2.job.failure_reason, /the Author returned needs_revision with a repair already spent/);
  assert.equal(x.author.status, 'composition');
});

test('a reviewer that fails, or a revision that does not validate, fails the job', async () => {
  const h = harness({ previews: [clean()], reviews: [] });
  h.stages.review = async a => ({ status: 'failed', error: 'malformed', detail: 'twice', calls: [], format_retries: [{ stage: `${a.reviewer}_review`, round: 0, errors: ['x'] }] });
  const r = await run('softmax', h);
  assert.equal(r.job.status, 'failed');
  assert.match(r.job.failure_reason, /^visual review: malformed: twice/);
  assert.deepEqual(r.job_errors, []);
  const h2 = harness({ previews: [clean()], reviews: [[], [{ category: 'unsupported_claim', description: 'x' }]], revision: 'invalid' });
  const r2 = await run('softmax', h2);
  assert.match(r2.job.failure_reason, /storyboard repair \(Director revision\): storyboard_invalid: B9: unknown claim/);
  assert.equal(h2.log.filter(l => l[0] === 'author').length, 0);
});

test('the job record validates: harness reviewer, rounds, the render stage field', () => {
  assert.deepEqual(validateFinding({ reviewer: 'harness', round: 1, category: 'blank_frame', description: 'x' }), []);
  assert.match(validateFinding({ reviewer: 'author', category: 'blank_frame', description: 'x' }).join(), /reviewer/);
  assert.match(validateFinding({ reviewer: 'visual', round: 2, category: 'blank_frame', description: 'x' }).join(), /round: 0 \| 1/);
  const { brief, storyboard, author } = load('softmax');
  const req = { schema: 'motion-render/1', renderer: 'remotion', brief, storyboard, composition: { composition_id: author.output.composition_id, source: author.output.source } };
  assert.deepEqual(validateRenderRequest({ ...req, stage: 'preview' }), []);
  assert.deepEqual(validateRenderRequest({ ...req, stage: 'final' }), []);
  assert.match(validateRenderRequest({ ...req, stage: 'draft' }).join(), /request\.stage/);
});

// The real M6 runs (2026-10-04/05, local service on the Windows authoring host): the recorded
// job, both review passes, the one repair and the final RenderResult, plus the repaired source.
const recorded = name => { const r = JSON.parse(readFileSync(join(FIX, 'm6', `${name}.review-job.json`), 'utf8')); return { r, source: readFileSync(join(FIX, r.composition.file), 'utf8') }; };
test('recorded M6 runs: blank opening found on the preview, ONE Author repair, clean fresh reviews, final ready', () => {
  for (const [name, blocking0] of [['softmax', ['harness/blank_frame']], ['generate', ['harness/blank_frame', 'visual/overlapping_text']]]) {
    const { r, source } = recorded(name), x = load(name);
    assert.equal(r.job.status, 'ready', name);
    assert.equal(r.job.repair_count, 1, name);
    assert.deepEqual(r.job.format_retries, [], name);
    // M6 records predate per-stage repairs (2026-10-05): their one repair was the Author's.
    assert.deepEqual(validateJob({ ...r.job, repairs: { storyboard: 0, author: r.job.repair_count } }), [], name);
    assert.deepEqual(r.passes.map(p => [p.round, p.decision]), [[0, 'repair'], [1, 'render_final']], name);
    assert.deepEqual(r.passes[0].findings.filter(f => BLOCKING_CATEGORIES.includes(f.category)).map(f => `${f.reviewer}/${f.category}`), blocking0, name);
    assert.equal(r.passes[0].preview.nonblank.blank[0].frame, 0, name);
    assert.equal(r.passes[1].preview.nonblank.ok, true, name);
    assert.equal(r.passes[1].blocking, 0, name);
    assert.deepEqual(r.repair, { route: 'author', findings: blocking0.length, author: { status: 'composition' } }, name);
    assert.deepEqual(r.calls.map(c => `${c.stage}@${c.round}`), ['visual_review@0', 'pedagogical_review@0', 'author@1', 'visual_review@1', 'pedagogical_review@1'], name);
    assert.equal(r.storyboard_revised, false, name);
    assert.deepEqual(validateRenderResult(r.render), [], name);
    assert.equal(r.render.status, 'ready', name);
    assert.equal(r.render.provenance.composition_sha256, createHash('sha256').update(source).digest('hex'), name);
    assert.equal(r.render.provenance.storyboard_origin, x.origin.storyboard, name);
    assert.deepEqual([...checkComposition(source, { durationSeconds: x.brief.duration.seconds }), ...checkAuthorSource(source, x.brief, x.storyboard).errors], [], name);
    assert.notEqual(source, x.source, name);
  }
  assert.equal(recorded('generate').r.render.provenance.storyboard_origin, 'fixture_with_manual_semantic_fix');
});

const real = process.env.MOTION_RENDER_TESTS === '1' ? {} : { skip: 'set MOTION_RENDER_TESTS=1 (minutes)' };
test('real preview stage through the local service: the generated softmax opens near-blank, the control does not', real, async () => {
  const svc = await localService();
  try {
    for (const [name, blank] of [['softmax', [0, 1]], ['reference', []]]) {
      const x = load(name);
      const p = await renderPreview({ ...x, service: svc.client, dir: tmp() });
      assert.equal(p.result.status, 'ready', name);
      assert.deepEqual(p.result.nonblank.blank.map(b => b.frame), blank, name);
      assert.equal(p.result.checks.ok, true, name);
      assert.ok(p.result.frames.length >= 12 && !p.result.artifacts.final_mp4, name);
    }
  } finally { svc.close(); }
});

test('real final renders of the recorded repaired compositions: ready, deterministic, nonblank', real, async () => {
  const svc = await localService();
  try {
    for (const name of ['softmax', 'generate']) {
      const x = load(name), { r, source } = recorded(name);
      const out = await renderComposition({ ...x, author: { status: 'composition', output: { status: 'composition', composition_id: r.composition.composition_id, source } }, service: svc.client, dir: tmp() });
      assert.equal(out.result.status, 'ready', `${name}: ${JSON.stringify(out.result.failure)}`);
      assert.deepEqual(out.result.validation.determinism.frames.map(f => f.hashes[0]), r.render.validation.determinism.frames.map(f => f.hashes[0]), `${name}: the same pixels as the recorded run`);
    }
  } finally { svc.close(); }
});

// Owner decision 2026-10-05: one repair per artifact stage. The storyboard's never takes the Author's.
test('the storyboard repair already spent (its checks failed): the Author repair is still there for a blank opening', async () => {
  const h = harness({ previews: [blankPreview([[0, 0]]), clean()], reviews: [[], [], [], []] });
  const r = await run('softmax', h, { prior: { repairs: { storyboard: 1, author: 0 }, format_retries: [{ stage: 'storyboard', round: 1, errors: ['x'] }] } });
  assert.equal(r.job.status, 'ready');
  assert.deepEqual([r.job.repairs, r.job.repair_count], [{ storyboard: 1, author: 1 }, 2]);
  assert.deepEqual(h.log.filter(l => l[0] === 'author'), [['author', 1, ['blank_frame'], SRC('softmax')]]);
  assert.deepEqual(r.job_errors, []);
});

test('storyboard-level findings: a Director revision only while the storyboard repair is unused; never a third repair', async () => {
  const pedagogical = [{ category: 'missing_must_show', description: 'the row sum is never shown' }];
  // Both unused: revision + Author repair (two repairs), then still blocking: failed, nothing more.
  const h = harness({ previews: [clean(), clean()], reviews: [[], pedagogical, [], pedagogical] });
  const r = await run('softmax', h);
  assert.equal(r.job.status, 'failed');
  assert.deepEqual([r.job.repairs, r.job.repair_count], [{ storyboard: 1, author: 1 }, 2]);
  assert.deepEqual(h.log.filter(l => ['storyboard', 'author'].includes(l[0])).map(l => l[0]), ['storyboard', 'author'], 'one of each, no third');
  assert.match(r.job.failure_reason, /still blocking after the Author repair: missing_must_show/);
  // Storyboard repair already spent: the Author repair alone, recorded as such.
  const h2 = harness({ previews: [clean(), clean()], reviews: [[], pedagogical, [], []] });
  const r2 = await run('softmax', h2, { prior: { repairs: { storyboard: 1, author: 0 } } });
  assert.equal(r2.job.status, 'ready');
  assert.deepEqual(r2.repair, { route: 'author', findings: 1, storyboard_repair_already_spent: true, author: { status: 'composition' } });
  assert.deepEqual(h2.log.filter(l => l[0] === 'storyboard'), []);
});
