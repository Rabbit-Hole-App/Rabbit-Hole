// M7B: the HyperFrames backend. Fast tests (no browser) cover the contract, the Author, staging and
// the Node network guard; MOTION_RENDER_TESTS=1 adds real local renders of the known fixtures
// (motion/fixtures/m7b), never model-generated source:
//   A basic text and movement   B code panel fonts          C chart        D multi-beat coverage
//   E transitions               F exact 15 s (the service)  G first/last frame nonblank
//   H determinism (two fresh contexts)  I network denial    J malformed composition rejection
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { AUTHOR_TOOL, HF_AUTHOR_TOOL, authorRequest, checkAuthorOutput } from './author.js';
import { DEFAULT_RENDERER, STAGE } from './contracts.js';
import { HF_AUTHOR_SYSTEM } from './hf-author.js';
import { checkHyperFramesComposition, checkHyperFramesSource } from './hf-static-check.js';
import { guardNodeNetwork, inspectionErrors, stageHtml } from './hyperframes-renderer.mjs';
import { HF_NET_PROBE, NET_PROBE_PREFIX } from './probes.js';
import { coverageErrors, coverageFrames } from './render-coverage.js';
import { localService, renderComposition, renderPreview, renderRequest } from './render-job.mjs';
import { CSP, lumaStddev } from './renderer-common.mjs';
import { rendererGate } from './renderers.mjs';

const FIX = join(fileURLToPath(new URL('.', import.meta.url)), 'fixtures');
const json = f => JSON.parse(readFileSync(join(FIX, f), 'utf8'));
const brief = json('m2/softmax-15s-attention.brief.json'), storyboard = json('m3/softmax-15s-attention.real.storyboard.json');
const CONTROL = readFileSync(join(FIX, 'm7b/softmax-control.hyperframes.html'), 'utf8');
const BASIC = readFileSync(join(FIX, 'm7b/basic-motion.hyperframes.html'), 'utf8');
const ID = 'softmax-hyperframes-control';
const safety = source => checkHyperFramesComposition(source, { compositionId: ID, durationSeconds: 15 });
const has = (errors, re) => assert.ok(errors.some(e => re.test(e)), `${re} not in:\n${errors.join('\n')}`);
const control = { status: 'composition', output: { status: 'composition', composition_id: ID, source: CONTROL } };

// J: what the contract refuses before anything renders.
test('J: the contract accepts the control and refuses each malformed composition before rendering', () => {
  assert.deepEqual(safety(CONTROL), []);
  assert.deepEqual(checkHyperFramesSource(CONTROL, brief, storyboard).errors, []);
  const at = '<div class="caption cap-b2">';
  const cases = [
    [CONTROL.replace(at, `<script>window.x = 1;</script>${at}`), /<script>: not allowed/],
    [CONTROL.replace('</style>', '</style><link rel="stylesheet" href="https://cdn.example/x.css">'), /contains a URL/],
    [CONTROL.replace(at, `<img src="a.png">${at}`), /<img>: not allowed/],
    [CONTROL.replace(at, `<video></video>${at}`), /<video>: not allowed/],
    [CONTROL.replace('data-duration="15"', 'data-duration="16"'), /root: data-duration="15"/],
    [CONTROL.replace(' data-no-timeline', ''), /data-no-timeline/],
    [CONTROL.replace(`data-composition-id="${ID}"`, 'data-composition-id="other"'), /root: data-composition-id/],
    [CONTROL.replace('.abs { position: absolute; }', '.abs { position: absolute; transition: opacity 1s; }'), /transition is not allowed/],
    [CONTROL.replace('animation: recede 15s linear both;', 'animation: recede 15s linear infinite;'), /infinite/],
    [CONTROL.replace("font-family: 'Inter';", "font-family: 'Inter', sans-serif;"), /"sans-serif" is not a bundled font/],
    [CONTROL.replace('.abs {', "@import 'x.css';\n  .abs {"), /@import is not allowed/],
    [CONTROL.replace('.abs {', "@font-face { font-family: 'X'; }\n  .abs {"), /@font-face is not allowed/],
    [CONTROL.replace('background: #0f1220; color', 'background: url(bg.png) #0f1220; color'), /url\(\): only url\(#id\)/],
    [CONTROL.replace('<div class="caption cap-b2">', '<div class="caption cap-b2" onclick="x()">'), /event handlers/],
    [CONTROL.replace('<div class="caption cap-b2">', '<div class="caption cap-b2" data-start="1" data-duration="2">'), /no timed clips/],
    [CONTROL.replace(at, `<div data-composition-id="inner" data-composition-src="inner.html"></div>${at}`), /exactly one element with data-composition-id/],
    [CONTROL.replace('.abs { position: absolute; }', ".abs { position: absolute; }\n  .x::after { content: 'hidden words'; }"), /content is "" or none/],
    [CONTROL.replace(at, `<!-- note -->${at}`), /no HTML comments/],
    [CONTROL.replace('</style>', `/* ${'x'.repeat(66 * 1024)} */</style>`), /bytes, at most 65536/],
    [CONTROL.replace(at, `<svg><use href="#a"></use></svg>${at}`), /<use>: not allowed/],
  ];
  for (const [source, re] of cases) has(safety(source), re);
});

test('the HyperFrames Author contract: timeline, one element per object, verbatim text, the text rules', () => {
  has(checkHyperFramesSource(CONTROL.replace('"B5":[375,450]', '"B5":[375,449]'), brief, storyboard).errors, /timeline.B5: must be \[375, 450\]/);
  has(checkHyperFramesSource(CONTROL.replace('data-object="matmul_node"', 'data-object="matmul"'), brief, storyboard).errors, /data-object "matmul_node": no element/);
  has(checkHyperFramesSource(CONTROL.replace('data-object="future_marker"', 'data-object="score_row"'), brief, storyboard).errors, /data-object "score_row": 2 elements/);
  has(checkHyperFramesSource(CONTROL.replace('>Row length unchanged<', '>Row length kept<'), brief, storyboard).errors, /the storyboard text "Row length unchanged" must appear verbatim/);
  has(checkHyperFramesSource(CONTROL.replace('>att = F.softmax(att, dim=-1)<', '>att = softmax(att)<'), brief, storyboard).errors, /the shown source line "att = F.softmax\(att, dim=-1\)" must appear verbatim/);
  // Author-added text under the Remotion Author's rules: one short line, the contract's words only.
  has(checkHyperFramesSource(CONTROL.replace('<div class="caption cap-b2">', '<div class="abs">This always runs</div><div class="caption cap-b2">'), brief, storyboard).errors, /text\.\S+: "always" in a brief with branch-dependent code/);
});

test('staging: the CSP first, the bundled faces, a zero margin; no <head> is refused', () => {
  const staged = stageHtml(CONTROL);
  const head = staged.slice(staged.indexOf('<head>'), staged.indexOf('<meta charset'));
  assert.ok(head.startsWith(`<head><meta http-equiv="Content-Security-Policy" content="${CSP}">`));
  for (const f of ['Inter-Regular.woff2', 'Inter-Medium.woff2', 'Virgil.woff2', 'JetBrainsMono-Regular.woff2']) assert.ok(head.includes(`url('assets/fonts/${f}')`), f);
  assert.ok(head.includes('html, body { margin: 0; padding: 0; overflow: hidden; }'));
  assert.ok(!stageHtml(CONTROL, { csp: false }).includes('Content-Security-Policy'));
  assert.throws(() => stageHtml('<html><body></body></html>'), /no <head>/);
});

// I (Node side): the producer may fetch fonts or media during compile; nothing but loopback answers.
test('I: in a HyperFrames render process, Node fetch reaches loopback only', async () => {
  guardNodeNetwork();
  await assert.rejects(fetch('http://example.com/'), /network request refused \(example\.com\)/);
  await assert.rejects(fetch('https://fonts.googleapis.com/css2?family=Inter'), /network request refused/);
});

test('J (run time): the page inspection refuses a wrong root and animations that never end or end late', () => {
  const ok = { root: { width: 1920, height: 1080 }, animations: [{ name: 'a', end: 15000, iterations: 1, target: 'x' }], faces: [], usedFamilies: [] };
  assert.deepEqual(inspectionErrors(ok, 15), []);
  has(inspectionErrors({ ...ok, root: { width: 1280, height: 720 } }, 15), /the root is 1280x720/);
  has(inspectionErrors({ ...ok, animations: [{ name: 'spin', end: Infinity, iterations: Infinity, target: 'chip' }] }, 15), /animation spin on chip never ends/);
  has(inspectionErrors({ ...ok, animations: [{ name: 'late', end: 16200, iterations: 1, target: 'chip' }] }, 15), /ends at 16.20 s, after the 15 s duration/);
  has(inspectionErrors({ ...ok, usedFamilies: ['Inter'], faces: [{ family: 'Inter', status: 'error' }] }, 15), /font Inter did not load/);
});

test('the HyperFrames Author: same brief and storyboard, an explicit target, its own sectioned prompt with no topic facts', () => {
  const sections = [...HF_AUTHOR_SYSTEM.matchAll(/^<([a-z_]+)>$/gm)].map(m => m[1]);
  assert.deepEqual(sections, ['role', 'objective', 'renderer_contract', 'determinism_rules', 'visual_rules', 'examples', 'output_contract']);
  for (const word of ['softmax', 'attention', 'mask', 'dropout', 'flash', 'nanogpt', 'torch', 'multinomial', 'logits', 'token']) assert.ok(!HF_AUTHOR_SYSTEM.toLowerCase().includes(word), `the HyperFrames prompt names "${word}"`);
  const hf = authorRequest(brief, storyboard, { renderer: 'hyperframes' }), rm = authorRequest(brief, storyboard);
  const input = r => JSON.parse(r.messages[0].content.split('input = ')[1]);
  assert.deepEqual(input(hf).brief, input(rm).brief, 'the same brief');
  assert.deepEqual(input(hf).storyboard, input(rm).storyboard, 'the same storyboard, never regenerated');
  assert.equal(input(hf).renderer.renderer_target, 'hyperframes');
  assert.deepEqual(input(hf).renderer.timeline, { B1: [0, 120], B2: [120, 210], B3: [210, 300], B4: [300, 375], B5: [375, 450] });
  assert.deepEqual(Object.keys(HF_AUTHOR_TOOL.input_schema.properties), Object.keys(AUTHOR_TOOL.input_schema.properties));
  assert.equal(hf.tools[0].name, 'motion_composition');
  assert.deepEqual(checkAuthorOutput(control.output, brief, storyboard, 'hyperframes').errors, []);
  has(checkAuthorOutput({ ...control.output, source: 'export default () => null;' }, brief, storyboard, 'hyperframes').errors, /static/);
  assert.equal(DEFAULT_RENDERER, 'remotion');
  assert.equal(renderRequest(brief, storyboard, control.output).renderer, 'remotion', 'Remotion stays the default');
  assert.equal(renderRequest(brief, storyboard, control.output, 'hyperframes').renderer, 'hyperframes');
  has(rendererGate('remotion').staticErrors(CONTROL, { durationSeconds: 15 }), /./);
  assert.throws(() => rendererGate('manim'), /unknown renderer "manim"/);
});

// Real renders (Windows authoring host or the Linux service image): minutes.
const real = process.env.MOTION_RENDER_TESTS !== '1' && 'set MOTION_RENDER_TESTS=1 (minutes)';
const scratch = () => mkdtempSync(join(tmpdir(), 'motion-hf-test-'));
const withRenderer = async (t, options = {}) => {
  const { HyperFramesRenderer } = await import('./hyperframes-renderer.mjs');
  const r = new HyperFramesRenderer({ fresh: true, ...options });
  t.after(() => r.close());
  return r;
};

test('A: basic text and movement: the seeked frame places the text exactly; frames are nonblank', { skip: real, timeout: 5 * 60 * 1000 }, async t => {
  const r = await withRenderer(t);
  const job = { id: 'a', dir: scratch(), brief: { duration: { seconds: 5 } }, source: BASIC };
  const { session } = await r.session(job, 1);
  const { captureFrame } = await import('@hyperframes/producer');
  const xs = [];
  for (const f of [0, 30, 60, 149]) { await captureFrame(session, f, f / STAGE.fps); xs.push(await session.page.evaluate(() => Math.round(document.getElementById('mover').getBoundingClientRect().x))); }
  assert.deepEqual(xs, [160, 460, 760, 760], 'translateX 0 -> 600 px over 0-2 s, linear, then held');
  for (const s of await r.renderStills(job, [0, 75, 149])) assert.ok(lumaStddev(PNG.sync.read(readFileSync(s.file))) > 2, `#${s.frame} nonblank`);
});

test('B, C, D, E: the control covers every beat and transition; code in JetBrains Mono; bars grow; captions cross-fade', { skip: real, timeout: 5 * 60 * 1000 }, async t => {
  const r = await withRenderer(t);
  const job = { id: 'bcde', dir: scratch(), brief, storyboard, source: CONTROL };
  const TEXT = checkHyperFramesSource(CONTROL, brief, storyboard).mapping.text;
  const sample = coverageFrames(storyboard).map(s => s.frame);
  const { observations } = await r.probeFrames(job, sample);
  assert.deepEqual(coverageErrors(observations, brief, storyboard, TEXT), [], 'D: every beat start, start + 1, middle and end - 1');
  const at = f => observations.find(o => o.frame === f);
  for (const tx of at(165).text.filter(x => x.within.some(id => ['flash_if_line', 'else_line', 'softmax_line'].includes(id)))) assert.match(tx.font, /^"?JetBrains Mono"?$/, `B: ${tx.value}`);
  assert.ok(at(165).text.some(x => x.value === 'else branch: self.flash is false' && /^"?Inter"?$/.test(x.font) && x.within.length === 1), 'B: the Inter label sits outside the code panel');
  const [{ observations: [fade] }] = [await r.probeFrames(job, [124])];
  const cap = fade.text.find(x => x.value.startsWith('After masked_fill'));
  assert.ok(cap && cap.opacity > 0.05 && cap.opacity < 0.95, `E: the B2 caption is mid-fade at 4.13 s (${cap?.opacity})`);
  const [before, after] = await r.renderStills(job, [212, 270], { scale: 0.5 });
  assert.notEqual(before.pixels_sha256, after.pixels_sha256, 'C: the bars grow between 7.07 s and 9.0 s');
  // B (negative): an Inter text inside a code panel is refused, with the exact node named.
  const r2 = await withRenderer(t);
  const bad = CONTROL.replace('data-object="else_line" style="', 'data-object="else_line" style="font-family: \'Inter\'; ');
  const { observations: obs2 } = await r2.probeFrames({ id: 'b-', dir: scratch(), brief, storyboard, source: bad }, [60]);
  has(coverageErrors(obs2, brief, { ...storyboard, beats: storyboard.beats.filter(b => b.id === 'B1') }, TEXT), /text "else:" \(element in else_line\) is inside code panel else_line and renders in "Inter"; expected "JetBrains Mono"/);
});

test('F, G, H: the control through the service: exactly 15 s, nonblank first and last frames, deterministic, ready', { skip: real, timeout: 15 * 60 * 1000 }, async t => {
  const svc = await localService();
  t.after(() => svc.close());
  const origin = { storyboard: 'model_generated', composition: 'handwritten' };
  const p = await renderPreview({ brief, storyboard, author: control, service: svc.client, dir: scratch(), origin, renderer: 'hyperframes' });
  assert.equal(p.result.status, 'ready', JSON.stringify(p.result.failure));
  assert.equal(p.result.nonblank.ok, true, p.result.nonblank.detail);
  assert.equal(p.result.coverage.ok, true, p.result.coverage.errors.join('; '));
  const out = scratch();
  const f = await renderComposition({ brief, storyboard, author: control, service: svc.client, dir: out, origin, renderer: 'hyperframes' });
  assert.equal(f.result.status, 'ready', JSON.stringify(f.result.failure));
  assert.equal(f.result.renderer.name, 'hyperframes');
  const checks = Object.fromEntries(f.result.validation.final.checks.map(c => [c.name, c]));
  for (const k of ['duration', 'frame count', 'fps', 'resolution', 'codec', 'nonblank frames']) assert.equal(checks[k]?.ok, true, `F/G ${k}: ${checks[k]?.detail}`);
  assert.match(checks['frame count'].detail, /^450 /);
  assert.match(checks['nonblank frames'].detail, /^#0:/);
  assert.match(checks['nonblank frames'].detail, /#449:[\d.]+$/);
  assert.equal(f.result.validation.determinism.ok, true, 'H: two fresh contexts, identical decoded pixels');
  assert.equal(f.result.validation.preview_final.ok, true);
});

test('I: the page CSP refuses every way out; only its own origin answers', { skip: real, timeout: 5 * 60 * 1000 }, async t => {
  const r = await withRenderer(t, { csp: true });
  await r.renderStills({ id: 'net', dir: scratch(), brief: { duration: { seconds: 5 } }, source: HF_NET_PROBE }, [0]);
  let probe = null;
  for (let i = 0; i < 100 && !probe; i++) {
    const line = r.browserLogs.find(l => l.includes(NET_PROBE_PREFIX));
    if (line) probe = JSON.parse(line.slice(line.indexOf(NET_PROBE_PREFIX) + NET_PROBE_PREFIX.length));
    else await new Promise(done => setTimeout(done, 200));
  }
  assert.ok(probe, 'the probe reported');
  for (const k of ['fetchOut', 'xhr', 'websocket', 'image', 'loopbackOtherPort']) assert.match(String(probe[k]), /^(failed|threw)/, `${k}: ${probe[k]}`);
  assert.match(probe.ownOrigin, /^reached 200/);
  assert.ok(probe.violations.length >= 4, probe.violations.join('; '));
});

test('J (run time): an animation that ends after the duration fails before anything renders', { skip: real, timeout: 5 * 60 * 1000 }, async t => {
  const r = await withRenderer(t);
  const late = CONTROL.replace('.matmul { animation: matmul 15s linear both; }', '.matmul { animation: matmul 15s linear 1s both; }');
  assert.deepEqual(safety(late), [], 'statically valid');
  await assert.rejects(r.prepare({ id: 'late', dir: scratch(), brief, storyboard, source: late }), /animation matmul on matmul_node ends at 16\.00 s, after the 15 s duration/);
});

// H (motion), M7B Run A (2026-10-06): the control samples held states, so it missed this. A
// model-generated composition (the first automatic HyperFrames run's repaired output, unedited) has
// frames mid-animation at determinism timestamps; in screenshot capture they differed between
// fresh contexts until each capture waited for the seek's pending pauses (settleAnimations).
test('H (motion): mid-animation frames of a model-generated composition are identical in four fresh contexts', { skip: real, timeout: 10 * 60 * 1000 }, async t => {
  const source = readFileSync(join(FIX, 'm7b/softmax-run-a.repaired.hyperframes.html'), 'utf8');
  const plan = json('m7b/plan-softmax.json');
  const frames = [375, 390, 413];
  const runs = [];
  for (let k = 0; k < 4; k++) {
    const r = await withRenderer(t);
    runs.push((await r.renderStills({ id: `h${k}`, dir: scratch(), brief: plan.brief, storyboard: plan.storyboard, source }, frames)).map(s => s.pixels_sha256));
    await r.close();
  }
  frames.forEach((f, i) => assert.equal(new Set(runs.map(h => h[i])).size, 1, `#${f}: ${runs.map(h => h[i].slice(0, 8)).join(' ')}`));
});
