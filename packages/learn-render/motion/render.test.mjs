// M5: a validated Author composition through the render service, the artifacts validated again
// on this side, one RenderResult. Fast tests use a fake service (or the real service with the stub
// child); MOTION_RENDER_TESTS=1 adds real local renders of the generated compositions (minutes).
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, truncateSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RENDER_ARTIFACTS, validateRenderRequest, validateRenderResult } from './contracts.js';
import { finalChecks } from './remotion-renderer.mjs';
import { coverageErrors, coverageFrames, determinismFrames, probeErrors } from './render-coverage.js';
import { canonical, judgeDeterminism, localService, previewChecks, renderComposition, renderProvenance, renderRequest, serviceClient, validateArtifacts } from './render-job.mjs';
import { motionRenderService } from './service/server.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const FIX = join(HERE, 'fixtures');
const INPUTS = JSON.parse(readFileSync(join(FIX, 'm5', 'inputs.json'), 'utf8'));
const load = name => {
  const i = INPUTS[name], json = f => JSON.parse(readFileSync(join(FIX, f), 'utf8'));
  const source = readFileSync(join(FIX, i.composition), 'utf8');
  return { brief: json(i.brief), storyboard: json(i.storyboard), source, author: { status: 'composition', output: { status: 'composition', composition_id: i.composition_id, source } }, origin: { storyboard: i.storyboard_origin, composition: i.composition_origin } };
};
const dir = () => mkdtempSync(join(tmpdir(), 'motion-render-test-'));
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
// A service double: every call is logged, so "never submitted" is a count of zero.
function fakeService({ submit = json(202, { render_id: 'a'.repeat(32), status: 'rendering' }), records = [], artifacts = {} } = {}) {
  const calls = [];
  let poll = 0;
  return {
    calls,
    health: async () => { calls.push('health'); return { version: 'motion-renderer-1-test' }; },
    submit: async request => { calls.push('submit'); return typeof submit === 'function' ? submit(request) : submit; },
    status: async () => { calls.push('status'); return records[Math.min(poll++, records.length - 1)]; },
    artifact: async (id, name) => { calls.push(`artifact ${name}`); return name in artifacts ? new Response(artifacts[name]) : json(404, { error: 'not_found' }); },
  };
}
const run = (name, service, extra = {}) => { const x = load(name); return renderComposition({ ...x, service, dir: dir(), pollMs: 1, sleep: async () => {}, ...extra }); };

test('Author composition -> the canonical motion-render/1 request, nothing else', () => {
  for (const name of ['softmax', 'softmax-m4', 'generate']) {
    const { brief, storyboard, author } = load(name);
    const r = renderRequest(brief, storyboard, author.output);
    assert.deepEqual(Object.keys(r), ['schema', 'renderer', 'brief', 'storyboard', 'composition']);
    assert.deepEqual(Object.keys(r.composition), ['composition_id', 'source']);
    assert.deepEqual(validateRenderRequest(r), [], name);
  }
});

test('needs_revision, author_invalid and failed Author results are never submitted', async () => {
  const revision = JSON.parse(readFileSync(join(FIX, 'm4', 'needs-revision.real.author.json'), 'utf8'));
  for (const author of [{ status: 'needs_revision', output: revision }, { status: 'author_invalid', output: { status: 'composition', source: 'x' } }, { status: 'failed' }, null]) {
    const service = fakeService();
    const r = await run('softmax', service, { author });
    assert.equal(r.submitted, false);
    assert.match(r.reason, /only a validated composition is rendered/);
    assert.deepEqual(service.calls, [], `${author?.status}: zero render calls`);
  }
});

test('a static-invalid or contract-invalid composition is refused before submission', async () => {
  const { author } = load('softmax');
  for (const [source, re] of [[author.output.source.replace('export default', "fetch('https://example.com');\nexport default"), /fetch/], [author.output.source.replace(/export const TEXT/, 'const TEXT'), /TEXT: missing/]]) {
    const service = fakeService();
    const r = await run('softmax', service, { author: { status: 'composition', output: { ...author.output, source } } });
    assert.equal(r.submitted, false);
    assert.equal(r.reason, 'invalid_job');
    assert.match(r.errors.join('\n'), re);
    assert.deepEqual(service.calls, []);
  }
});

test('a service refusal is render_failed before anything ran: no render id, no artifacts', async () => {
  for (const [status, body] of [[400, { error: 'invalid_job', errors: ['request.composition.source: required'] }], [429, { error: 'busy', detail: 'one render at a time' }], [503, { error: 'degraded', detail: 'restart' }]]) {
    const r = (await run('softmax', fakeService({ submit: json(status, body) }))).result;
    assert.deepEqual([r.status, r.failure.category, r.render_id], ['render_failed', body.error, null]);
    assert.deepEqual(r.artifacts, {});
    assert.deepEqual(validateRenderResult(r), []);
  }
});

test('compile and runtime failures are render_failed with their normalized category', async () => {
  for (const [error, detail] of [['compile_failed', 'Module parse failed'], ['runtime_error', 'TypeError: Cannot read properties of undefined']]) {
    const service = fakeService({ records: [{ status: 'rendering' }, { status: 'failed', error, detail, render_id: 'a'.repeat(32), sandbox: { mode: 'linux' } }] });
    const r = (await run('softmax', service)).result;
    assert.deepEqual([r.status, r.failure.category, r.failure.detail], ['render_failed', error, detail]);
    assert.ok(!service.calls.some(c => c.startsWith('artifact')), 'nothing is fetched from a failed render');
  }
});

test('timeout: the service limit, and the caller\'s own deadline, are render_failed / timeout', async t => {
  const jobsDir = dir();
  const svc = motionRenderService({ token: 't'.repeat(40), sandbox: 'none', jobsDir, childScript: join(HERE, 'service', 'stub-child.mjs'), childArgs: ['sleep'], timeoutMs: 400 });
  await new Promise(r => svc.server.listen(0, '127.0.0.1', r));
  t.after(() => { svc.stop(); svc.server.close(); });
  const client = serviceClient({ url: `http://127.0.0.1:${svc.server.address().port}`, token: 't'.repeat(40) });
  const viaService = (await renderComposition({ ...load('softmax'), service: client, dir: dir(), pollMs: 100 })).result;
  assert.deepEqual([viaService.status, viaService.failure.category], ['render_failed', 'timeout']);
  assert.match(viaService.render_id, /^[0-9a-f]{32}$/);

  let clock = 0;
  const stuck = (await run('softmax', fakeService({ records: [{ status: 'rendering' }] }), { waitMs: 10000, now: () => clock, sleep: async ms => { clock += ms; }, pollMs: 2000 })).result;
  assert.deepEqual([stuck.status, stuck.failure.category], ['render_failed', 'timeout']);
  assert.match(stuck.failure.detail, /within 10s/);
});

test('missing or corrupt artifacts are artifact_invalid; nothing partial is ready', async () => {
  const ready = { status: 'ready', render_id: 'a'.repeat(32), duration_seconds: 15, fps: 30, width: 1920, height: 1080, sandbox: { mode: 'none' } };
  const missing = (await run('softmax', fakeService({ records: [ready], artifacts: { 'final.mp4': 'x', 'preview.mp4': 'x', 'contact-sheet.png': 'x' } }))).result;
  assert.deepEqual([missing.status, missing.failure.category], ['artifact_invalid', 'artifact_missing']);
  assert.match(missing.failure.detail, /poster\.png: HTTP 404/);
  const garbage = Object.fromEntries(Object.values(RENDER_ARTIFACTS).map(n => [n, 'not a video or an image']));
  const corrupt = (await run('softmax', fakeService({ records: [ready], artifacts: garbage }))).result;
  assert.deepEqual([corrupt.status, corrupt.failure.category], ['artifact_invalid', 'final_invalid']);
  assert.match(corrupt.failure.detail, /final\.mp4 decodes/);
  assert.equal(Object.keys(corrupt.hashes).length, 4); // what arrived is still identified
  // The contract itself refuses a partial or unvalidated ready.
  const good = JSON.parse(readFileSync(join(FIX, 'm5', 'reference.render-result.json'), 'utf8'));
  assert.deepEqual(validateRenderResult(good), []);
  const { poster, ...three } = good.artifacts;
  assert.match(validateRenderResult({ ...good, artifacts: three }).join(), /artifacts\.poster: required when ready/);
  assert.match(validateRenderResult({ ...good, validation: { ...good.validation, coverage: { ok: false } } }).join(), /validation\.coverage\.ok/);
  assert.match(validateRenderResult({ ...good, failure: { category: 'x', detail: '' } }).join(), /ready result has none/);
  assert.match(validateRenderResult({ ...good, provenance: { ...good.provenance, raw_user_request: 'explain softmax' } }).join(), /learner input/);
});

test('the final MP4 contract: exact duration, frames, 30 fps, 1920x1080, H.264 yuv420p bt709, 25 MB', () => {
  const ok = { v: { duration: '15.000000', nb_read_frames: '450', r_frame_rate: '30/1', width: 1920, height: 1080, codec_name: 'h264', pix_fmt: 'yuv420p', color_space: 'bt709' }, duration: 15.06, size: 1.5e6 };
  const failing = x => finalChecks({ ...ok, ...x, v: { ...ok.v, ...x.v } }, 15).filter(c => !c[1]).map(c => c[0]);
  assert.deepEqual(failing({}), []);
  assert.deepEqual(failing({ v: { nb_read_frames: '449' } }), ['frame count']);
  assert.deepEqual(failing({ v: { duration: '15.1' } }), ['duration']);
  assert.deepEqual(failing({ v: { r_frame_rate: '25/1' } }), ['fps']);
  assert.deepEqual(failing({ v: { width: 1280, height: 720 } }), ['resolution']);
  assert.deepEqual(failing({ v: { pix_fmt: 'yuv444p' } }), ['codec']);
  assert.deepEqual(failing({ v: { color_space: 'bt470bg' } }), ['codec']);
  assert.deepEqual(failing({ size: 26 * 1024 * 1024 }), ['size']);
  const brief = load('softmax').brief; // preview_scale 0.45 -> 864x486
  const preview = { v: { ...ok.v, width: 864, height: 486 }, size: 9e5 };
  assert.deepEqual(previewChecks(preview, brief).filter(c => !c[1]), []);
  assert.deepEqual(previewChecks({ ...preview, v: { ...preview.v, nb_read_frames: '300' } }, brief).filter(c => !c[1]).map(c => c[0]), ['frame count']);
});

// The real softmax storyboard: B1 0-4 s, B2 4-7, B3 7-10, B4 10-12.5, B5 12.5-15.
const obs = (frame, visible, extra = {}) => ({ frame, objects: visible.map(id => ({ id, opacity: 1, on_stage: true })), ...extra });

test('beat coverage: each beat\'s start, start + 1, middle and end - 1; the middle holds the M4 rules', () => {
  const { storyboard } = load('softmax');
  const frames = coverageFrames(storyboard);
  assert.deepEqual(frames.map(s => s.frame), [0, 1, 60, 119, 120, 121, 165, 209, 210, 211, 255, 299, 300, 301, 338, 374, 375, 376, 413, 449]);
  assert.deepEqual(frames.find(s => s.frame === 60), { frame: 60, beat: 'B1', roles: ['mid'] });
  assert.deepEqual(frames.at(-1), { frame: 449, beat: 'B5', roles: ['last'] });
  // An object missing at its beat's middle is reported there, through the M4 rules.
  const { brief, source } = load('softmax');
  const all = frames.map(s => obs(s.frame, storyboard.beats.find(b => b.id === s.beat).visible_objects.map(o => o.id), { text: [] }));
  const errs = coverageErrors(all.map(o => (o.frame === 165 ? { ...o, objects: o.objects.filter(x => x.id !== 'future_marker') } : o)), brief, storyboard, {});
  assert.ok(errs.some(e => /^B2 #165: object future_marker is not visible/.test(e)), errs.join('\n'));
  assert.ok(coverageErrors(all.filter(o => o.frame !== 300), brief, storyboard, {}).some(e => /#300 \(boundary\): no observation/.test(e)));
  assert.ok(source.length > 0);
});

// M7A Run A (2026-10-06): a code panel's own Inter label failed the check twice, unlocatable. The check
// stays strict; the finding now names the exact node, and the Author contract says where labels go.
test('code panels: every text inside renders in JetBrains Mono; an Inter label outside is fine; the finding locates the node', () => {
  const { brief, storyboard } = load('softmax');
  const beat = storyboard.beats.find(b => b.id === 'B1'), panel = 'softmax_line';
  const frame = coverageFrames(storyboard).find(x => x.beat === 'B1' && x.roles.includes('mid')).frame;
  const fontErrors = text => probeErrors(new Map([[frame, { frame, objects: beat.visible_objects.map(o => ({ id: o.id, opacity: 1, on_stage: true, text: '' })), text }]]), brief, storyboard, {}).filter(e => /code panel/.test(e));
  const MONO = "'JetBrains Mono', monospace", INTER = 'Inter, sans-serif';
  // JetBrains Mono inside the panel: allowed.
  assert.deepEqual(fontErrors([{ value: 'att = F.softmax(att, dim=-1)', font: MONO, object: panel, within: [panel] }]), []);
  // The Inter label outside the panel (no object, or its own object beside the panel): allowed.
  assert.deepEqual(fontErrors([{ value: 'self.flash false', font: INTER, object: null, within: [] }]), []);
  assert.deepEqual(fontErrors([{ value: 'self.flash false', font: INTER, object: 'flash_if_line', within: ['flash_if_line'] }]).filter(e => e.includes(panel)), []);
  // The same label inside the panel: rejected, with the text, element, panel and both fonts.
  const inside = fontErrors([{ value: 'self.flash false', font: INTER, object: panel, within: [panel] }]);
  assert.deepEqual(inside, [`B1 #${frame}: text "self.flash false" (element in ${panel}) is inside code panel ${panel} and renders in "Inter"; expected "JetBrains Mono". Every text inside a code panel is code; an Inter label belongs in an element outside the panel`]);
  // Nested in its own data-object inside the panel is still inside the panel.
  assert.match(fontErrors([{ value: 'self.flash false', font: INTER, object: 'manual_tag', within: ['manual_tag', panel] }])[0], /"self\.flash false" \(element in manual_tag\) is inside code panel softmax_line and renders in "Inter"/);
  // A probe line from before `within` still checks its nearest object.
  assert.equal(fontErrors([{ value: 'self.flash false', font: INTER, object: panel }]).length, 1);
});

test('transition sampling: objects in both beats stay visible at boundary - 1, boundary, boundary + 1; leaving and arriving objects may fade', () => {
  const { brief, storyboard } = load('softmax');
  const only = list => coverageErrors(list, brief, storyboard, {}).filter(e => /#(119|120|121) /.test(e));
  const b1 = ['flash_if_line', 'flash_path_note', 'else_line', 'softmax_line', 'branch_tag'], b2 = ['softmax_line', 'branch_tag', 'order_chain', 'score_row', 'future_marker'];
  const base = coverageFrames(storyboard).map(s => obs(s.frame, storyboard.beats.find(b => b.id === s.beat).visible_objects.map(o => o.id), { text: [] }));
  const at = (frame, ids) => base.map(o => (o.frame === frame ? obs(frame, ids) : o));
  assert.deepEqual(only(at(119, b1)), []); // arriving order_chain not yet visible: fine
  assert.deepEqual(only(at(121, b2)), []); // leaving flash_if_line already gone: fine
  assert.deepEqual(only(at(120, ['softmax_line', 'branch_tag'])), []);
  assert.deepEqual(only(at(120, ['softmax_line'])), ['B2 #120 (boundary): branch_tag is in B1 and B2 but not visible here']);
  assert.deepEqual(only(at(119, b1.filter(x => x !== 'softmax_line'))), ['B1 #119 (before_boundary): softmax_line is in B1 and B2 but not visible here']);
  const faded = base.map(o => (o.frame === 121 ? { ...o, objects: o.objects.map(x => (x.id === 'branch_tag' ? { ...x, opacity: 0.02 } : x)) } : o));
  assert.deepEqual(only(faded), ['B2 #121 (after_boundary): branch_tag is in B1 and B2 but not visible here']);
});

test('determinism: the M1 frames at every contact-sheet timestamp, two fresh contexts, decoded pixels must match', () => {
  const { brief, storyboard } = load('softmax');
  const frames = determinismFrames(brief, storyboard);
  assert.deepEqual(frames, [0, 60, 120, 165, 210, 224, 255, 300, 338, 375, 413, 420, 449]); // first, beat starts and middles, the 14 s keyframe, last, + M1's middle
  const h = n => n.toString(16).padStart(64, '0');
  const record = { determinism: { frames: frames.map(f => ({ frame: f, hashes: [h(f), h(f)] })) } };
  assert.equal(judgeDeterminism(record, brief, storyboard).ok, true);
  const differ = structuredClone(record); differ.determinism.frames[5].hashes[1] = h(1);
  assert.deepEqual(judgeDeterminism(differ, brief, storyboard).errors, ['#224: the two fresh contexts differ']);
  const fewer = { determinism: { frames: record.determinism.frames.filter(f => f.frame !== 255) } };
  assert.match(judgeDeterminism(fewer, brief, storyboard).errors[0], /want \[0,60,120,165,210,224,255,300,338,375,413,420,449\]/);
});

test('provenance: canonical hashes of brief, storyboard and source; origins; fonts; no learner words', () => {
  assert.equal(canonical({ b: 1, a: [{ d: 2, c: 3 }] }), canonical({ a: [{ c: 3, d: 2 }], b: 1 }));
  for (const name of ['softmax', 'softmax-m4', 'generate', 'reference']) {
    const x = load(name);
    const recorded = JSON.parse(readFileSync(join(FIX, 'm5', `${name}.render-result.json`), 'utf8'));
    assert.deepEqual(recorded.provenance, renderProvenance({ ...x }), `${name}: the recorded render is of exactly these inputs`);
    assert.ok(!JSON.stringify(recorded).includes(x.brief.raw_user_request), `${name}: the learner's request never travels with a render`);
  }
  assert.equal(INPUTS.generate.storyboard_origin, 'fixture_with_manual_semantic_fix');
});

// Frames whose decoded luma spread is at or below the M1 threshold (2), from the validator's detail.
const blankFrames = r => r.validation.final.checks.find(c => c.name === 'nonblank frames').detail.split(' ').map(x => x.slice(1).split(':').map(Number)).filter(([, l]) => !(l > 2)).map(([f]) => f);
// The three generated compositions fail the unchanged M1 nonblank check at the opening frames and nothing else.
const GENERATED_BLANK = { softmax: [0, 1], 'softmax-m4': [0, 1], generate: [0] };

test('recorded results: the hand-written control is ready; every generated composition fails only its blank opening frames', () => {
  const rec = name => JSON.parse(readFileSync(join(FIX, 'm5', `${name}.render-result.json`), 'utf8'));
  for (const name of ['reference', ...Object.keys(GENERATED_BLANK)]) {
    const r = rec(name), x = load(name);
    assert.deepEqual(validateRenderResult(r), [], name);
    assert.equal(r.validation.coverage.ok && r.validation.coverage.observed === coverageFrames(x.storyboard).length, true, name);
    assert.deepEqual(r.validation.determinism.frames.map(f => f.frame), determinismFrames(x.brief, x.storyboard), name);
    assert.equal(r.validation.determinism.ok && r.validation.preview_final.ok, true, name);
    if (name === 'reference') { assert.equal(r.status, 'ready'); continue; }
    assert.deepEqual([r.status, r.failure.category], ['artifact_invalid', 'final_validation_failed'], name);
    assert.deepEqual(r.validation.final.checks.filter(c => !c.ok).map(c => c.name), ['nonblank frames'], name);
    assert.deepEqual(blankFrames(r), GENERATED_BLANK[name], name);
    assert.deepEqual(r.artifacts, {}, `${name}: the service withholds a refused render's artifacts`);
  }
});

// Real local renders through the service (unsandboxed child): minutes.
const real = process.env.MOTION_RENDER_TESTS !== '1' && 'set MOTION_RENDER_TESTS=1 (minutes)';
const realRender = async (t, name, author) => {
  const svc = await localService();
  t.after(() => svc.close());
  const x = load(name);
  const out = dir();
  return { out, x, r: await renderComposition({ ...x, ...(author ? { author } : {}), service: svc.client, dir: out }) };
};

test('the hand-written control is ready through the service; a truncated final.mp4 is then artifact_invalid', { skip: real, timeout: 10 * 60 * 1000 }, async t => {
  const { out, x, r } = await realRender(t, 'reference');
  assert.equal(r.result.status, 'ready', JSON.stringify(r.result.failure));
  truncateSync(join(out, 'final.mp4'), 200000);
  const again = await validateArtifacts({ dir: out, brief: x.brief, storyboard: x.storyboard, record: { determinism: { frames: r.result.validation.determinism.frames }, contact_sheet: { length: 0 } } });
  assert.equal(again.final.ok, false);
});

for (const name of Object.keys(GENERATED_BLANK)) {
  test(`generated ${name}: renders deterministic and covered through the service, artifact_invalid on its blank opening frames alone`, { skip: real, timeout: 10 * 60 * 1000 }, async t => {
    const { r } = await realRender(t, name);
    assert.deepEqual([r.result.status, r.result.failure.category], ['artifact_invalid', 'final_validation_failed']);
    assert.deepEqual(blankFrames(r.result), GENERATED_BLANK[name]);
    assert.equal(r.result.validation.coverage.ok && r.result.validation.determinism.ok && r.result.validation.preview_final.ok, true);
  });
}

test('real compile and runtime failures through the service: compile_failed, runtime_error', { skip: real, timeout: 10 * 60 * 1000 }, async t => {
  const { author } = load('reference');
  const broken = (from, to) => ({ status: 'composition', output: { ...author.output, source: author.output.source.replace(from, to) } });
  // A module that throws while it loads (bundles fine, never selectable); a frame that throws mid-render.
  const atLoad = await realRender(t, 'reference', broken('const INK', 'const BROKEN = TEXT.missing.length;\nconst INK'));
  assert.deepEqual([atLoad.r.result.status, atLoad.r.result.failure.category], ['render_failed', 'compile_failed']);
  const atFrame = await realRender(t, 'reference', broken('  const f = useCurrentFrame();', '  const f = useCurrentFrame();\n  if (f > 200) TEXT.missing.length;'));
  assert.deepEqual([atFrame.r.result.status, atFrame.r.result.failure.category], ['render_failed', 'runtime_error']);
  assert.match(atFrame.r.result.failure.detail, /missing|undefined/);
});
