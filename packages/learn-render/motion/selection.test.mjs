// Owner brief 2026-10-23: the duration and aspect ratio the learner selected are what every renderer input carries and what the
// output is checked against. Fast tests only: no model, no render, no network. The real renders stay MOTION_RENDER_TESTS=1.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { AUTHOR_SYSTEM, authorContext, authorRequest, authorSystem } from './author.js';
import { STAGE, stageFor, stageOf, validateBrief, validateRenderRequest } from './contracts.js';
import { HF_AUTHOR_SYSTEM, hfAuthorSystem, hfRendererFacts } from './hf-author.js';
import { checkHyperFramesComposition } from './hf-static-check.js';
import { inspectionErrors } from './hyperframes-renderer.mjs';
import { approvedErrors } from './pipeline.mjs';
import { previewChecks, renderRequest } from './render-job.mjs';
import { finalChecks } from './renderer-common.mjs';
import { checkComposition } from './static-check.js';
import { MOTION_RATIOS, MOTION_STAGE_SIZES } from './stage-sizes.js';
import { validateJobRequest } from './orchestrator.mjs';
import { approvedProposal, validateSettings } from '../../control-plane/src/generation-proposal.js';

const FIX = join(fileURLToPath(new URL('.', import.meta.url)), 'fixtures');
const json = f => JSON.parse(readFileSync(join(FIX, f), 'utf8'));
const base = json('m2/softmax-15s-attention.brief.json'), storyboard = json('m3/softmax-15s-attention.real.storyboard.json');
const REMOTION = readFileSync(join(FIX, 'm5', 'softmax-15s-attention.real.composition.jsx'), 'utf8');
const HF = readFileSync(join(FIX, 'm7b/softmax-control.hyperframes.html'), 'utf8');
const DURATIONS = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60];

// A brief for a saved selection, the way the Director sets it (director.js assembleBrief).
const briefFor = (ratio, seconds = 15) => {
  const size = stageFor(ratio);
  return { ...base, aspect_ratio: ratio, duration: { seconds, requested_seconds: seconds }, qa_requirements: { blocking_categories: base.qa_requirements.blocking_categories },
    output_requirements: { ...base.output_requirements, stage_width: size.width, stage_height: size.height } };
};
// What the saved settings become: the proposal's approved_proposal, validated as the orchestrator does, then the stage.
const approvedFor = (duration_seconds, aspect_ratio) => {
  const checked = validateSettings('motion', { duration_seconds, aspect_ratio, audio: false });
  assert.equal(checked.error, undefined);
  return approvedProposal({ title: 'T', description: 'D', settings: checked.value });
};

test('the saved selection reaches the render inputs: approved proposal -> brief -> stage, frames, composition literal, checks', () => {
  for (const ratio of MOTION_RATIOS) for (const seconds of DURATIONS) {
    const approved = approvedFor(seconds, ratio);
    assert.deepEqual([approved.duration_seconds, approved.aspect_ratio], [seconds, ratio]);
    const orchestratorSide = validateJobRequest({ request: '/motion x', idempotency_key: 'motion-abcdefgh', grant: { micros: 1, issued_at: 1, boot: 'a'.repeat(32), sig: 'x' }, approved_proposal: { ...approved, title: 'T', description: 'D' } });
    assert.deepEqual(orchestratorSide, [], `${ratio} ${seconds}s`);
    const brief = briefFor(approved.aspect_ratio, approved.duration_seconds);
    assert.deepEqual(approvedErrors(brief, { ...approved, title: brief.title }), [], 'the brief keeps the approved duration and ratio');
    const size = MOTION_STAGE_SIZES[ratio];
    // The Author is told exactly this stage, in frames.
    const context = authorContext(brief, storyboard);
    assert.deepEqual(context.renderer.stage, { width: size.width, height: size.height, fps: 30, durationInFrames: seconds * 30 }, `${ratio} ${seconds}s`);
    assert.deepEqual(hfRendererFacts(context).stage, { width: size.width, height: size.height, fps: 30, duration_seconds: seconds });
    // The static check demands those literals in the composition and nothing else.
    const literal = `export const stage = { width: ${size.width}, height: ${size.height}, fps: 30, durationInFrames: ${seconds * 30} };`;
    const source = REMOTION.replace(/export const stage = \{[^}]*\};/, literal);
    assert.deepEqual(checkComposition(source, { durationSeconds: seconds, stage: stageOf(brief) }), [], `${ratio} ${seconds}s`);
    // The final video must be that size, frame count and duration; the preview that size at the preview scale.
    const scale = brief.output_requirements.preview_scale;
    const probe = (w, h) => ({ v: { duration: String(seconds), nb_read_frames: String(seconds * 30), r_frame_rate: '30/1', width: w, height: h, codec_name: 'h264', pix_fmt: 'yuv420p', color_space: 'bt709' }, duration: seconds, size: 1e6 }); // muted: the container is the video stream
    assert.deepEqual(finalChecks(probe(size.width, size.height), seconds, stageOf(brief)).filter(c => !c[1]), [], `${ratio} ${seconds}s final`);
    assert.deepEqual(previewChecks(probe(size.width * scale, size.height * scale), brief).filter(c => !c[1]), [], `${ratio} ${seconds}s preview`);
  }
});

test('output that is not the selection fails: another size, another duration, another frame count', () => {
  const brief = briefFor('9:16', 45), size = MOTION_STAGE_SIZES['9:16'];
  const v = { duration: '45', nb_read_frames: '1350', r_frame_rate: '30/1', width: size.width, height: size.height, codec_name: 'h264', pix_fmt: 'yuv420p', color_space: 'bt709' };
  const failing = (over, seconds = 45) => finalChecks({ v: { ...v, ...over }, duration: 45.02, size: 1e6 }, seconds, stageOf(brief)).filter(c => !c[1]).map(c => c[0]);
  assert.deepEqual(failing({}), []);
  assert.deepEqual(failing({ width: 1920, height: 1080 }), ['resolution'], 'a 16:9 render for a 9:16 selection is a failure, not a silent substitute');
  assert.deepEqual(failing({ width: 1080, height: 1080 }), ['resolution']);
  assert.deepEqual(failing({ duration: '30', nb_read_frames: '900' }), ['duration', 'frame count'], 'a clamped duration is a failure');
  assert.deepEqual(finalChecks({ v: { ...v, duration: '61', nb_read_frames: '1830' }, duration: 61, size: 1e6 }, 61, stageOf(brief)).filter(c => !c[1]).map(c => c[0]), ['duration'], 'over 60 s is refused');
  assert.equal(previewChecks({ v: { ...v, width: 486, height: 864 }, size: 1e5 }, brief).find(c => c[0] === 'resolution')[1], true);
  assert.equal(previewChecks({ v: { ...v, width: 864, height: 486 }, size: 1e5 }, brief).find(c => c[0] === 'resolution')[1], false);
});

test('a composition at the wrong stage is refused for the selected ratio (Remotion and HyperFrames)', () => {
  const portrait = briefFor('9:16', 15);
  const errors = checkComposition(REMOTION, { durationSeconds: 15, stage: stageOf(portrait) });
  assert.ok(errors.some(e => /stage.width must be the literal 1080/.test(e)), errors.join('\n'));
  assert.ok(errors.some(e => /stage.height must be the literal 1920/.test(e)), errors.join('\n'));
  assert.deepEqual(checkComposition(REMOTION, { durationSeconds: 15 }), [], 'no stage named: the original 16:9, as before');
  const hf = checkHyperFramesComposition(HF, { compositionId: 'softmax-hyperframes-control', durationSeconds: 15, stage: stageOf(portrait) });
  assert.ok(hf.some(e => /data-width="1080"/.test(e)) && hf.some(e => /data-height="1920"/.test(e)), hf.join('\n'));
  assert.deepEqual(checkHyperFramesComposition(HF, { compositionId: 'softmax-hyperframes-control', durationSeconds: 15 }), []);
  const portraitHf = HF.replace('data-width="1920"', 'data-width="1080"').replace('data-height="1080"', 'data-height="1920"');
  assert.deepEqual(checkHyperFramesComposition(portraitHf, { compositionId: 'softmax-hyperframes-control', durationSeconds: 15, stage: stageOf(portrait) }), []);
  // The page the HyperFrames renderer inspects must measure the selected stage.
  const page = { root: { width: 1080, height: 1920 }, animations: [], faces: [] };
  assert.deepEqual(inspectionErrors(page, 15, stageOf(portrait)), []);
  assert.match(inspectionErrors({ ...page, root: { width: 1920, height: 1080 } }, 15, stageOf(portrait)).join(' '), /the root is 1920x1080; it must be 1080x1920/);
});

test('the render request is refused when the composition is not at the brief stage, accepted when it is', () => {
  const portrait = briefFor('9:16', 15);
  const request = renderRequest(portrait, storyboard, { status: 'composition', composition_id: 'softmax-portrait', source: REMOTION.replace(/export const stage = \{[^}]*\};/, 'export const stage = { width: 1080, height: 1920, fps: 30, durationInFrames: 450 };') });
  assert.deepEqual([request.brief.aspect_ratio, request.brief.output_requirements.stage_width, request.brief.output_requirements.stage_height, request.brief.duration.seconds], ['9:16', 1080, 1920, 15], 'the request carries the selection');
  assert.deepEqual(validateRenderRequest(request), []);
  assert.deepEqual(checkComposition(request.composition.source, { durationSeconds: 15, stage: stageOf(request.brief) }), []);
  // A brief whose stage is not its ratio's never reaches a renderer.
  assert.ok(validateRenderRequest({ ...request, brief: { ...request.brief, output_requirements: { ...request.brief.output_requirements, stage_width: 1920, stage_height: 1080 } } }).some(e => /stage_width: 1080, stage_height: 1920 \(for 9:16\)/.test(e)));
});

test('the Author prompts name the selected stage; the 16:9 prompts are the original text, byte for byte', () => {
  assert.equal(AUTHOR_SYSTEM, authorSystem(STAGE));
  assert.equal(HF_AUTHOR_SYSTEM, hfAuthorSystem(STAGE));
  assert.match(AUTHOR_SYSTEM, /export const stage = \{ width: 1920, height: 1080, fps: 30, durationInFrames: <given> \}/);
  const portrait = briefFor('9:16', 45);
  assert.match(authorSystem(stageOf(portrait)), /export const stage = \{ width: 1080, height: 1920, fps: 30, durationInFrames: <given> \}/);
  assert.match(hfAuthorSystem(stageOf(portrait)), /data-width="1080" data-height="1920"/);
  assert.doesNotMatch(authorSystem(stageOf(portrait)), /1920, height: 1080/);
  // authorRequest picks the system prompt of the brief's own stage, and tells the Author the frames of the selected duration.
  const remotion = authorRequest(portrait, storyboard), hf = authorRequest(portrait, storyboard, { renderer: 'hyperframes' });
  assert.match(remotion.system[0].text, /width: 1080, height: 1920/);
  assert.match(hf.system[0].text, /data-width="1080" data-height="1920"/);
  assert.match(remotion.messages[0].content, /"stage":\{"width":1080,"height":1920,"fps":30,"durationInFrames":1350\}/);
  assert.match(hf.messages[0].content, /"stage":\{"width":1080,"height":1920,"fps":30,"duration_seconds":45\}/);
  assert.equal(authorRequest(briefFor('16:9', 15), storyboard).system[0].text, AUTHOR_SYSTEM, 'unchanged for 16:9');
});

test('a brief and approval that disagree on duration or ratio are not the same video', () => {
  const approved = { title: base.title, duration_seconds: 45, aspect_ratio: '9:16', description: 'D' };
  assert.deepEqual(approvedErrors(briefFor('9:16', 45), approved), []);
  assert.match(approvedErrors(briefFor('16:9', 45), approved).join(' '), /aspect ratio 16:9 is not the approved 9:16/);
  assert.match(approvedErrors(briefFor('9:16', 30), approved).join(' '), /duration 30s is not the approved 45s/);
  // An approval from before the setting existed is 16:9.
  assert.deepEqual(approvedErrors(briefFor('16:9', 45), { ...approved, aspect_ratio: undefined }), []);
  assert.deepEqual(validateBrief(briefFor('9:16', 45)), []);
});

// The coverage probe's "on stage" test measures the selected stage, not a fixed 1920x1080.
test('probeDom: an object right of a 1080 wide stage is off stage, and on stage at 1920 wide (the default)', async () => {
  const { probeDom } = await import('../src/motion/probe-dom.js');
  const at = (left, top) => ({ nodeType: 1, parentElement: null, textContent: '', getAttribute: () => 'chip', querySelectorAll: () => [], getBoundingClientRect: () => ({ left, top, right: left + 100, bottom: top + 100, width: 100, height: 100 }) });
  const run = (el, stage) => {
    Object.assign(globalThis, { document: { querySelector: () => null, querySelectorAll: sel => (sel === '[data-object]' ? [el] : []), createTreeWalker: () => ({ nextNode: () => null }), body: {} }, NodeFilter: { SHOW_TEXT: 4 }, getComputedStyle: () => ({ display: 'block', visibility: 'visible', opacity: '1' }) });
    return probeDom(0, { left: 0, top: 0 }, stage).objects[0].on_stage;
  };
  try {
    assert.equal(run(at(1200, 100)), true, 'no stage: the original 1920 wide');
    assert.equal(run(at(1200, 100), { width: 1080, height: 1920 }), false, 'off the right edge of a 9:16 stage');
    assert.equal(run(at(100, 1500), { width: 1080, height: 1920 }), true, 'inside the tall stage');
    assert.equal(run(at(100, 1500)), false, 'below a 1080 high 16:9 stage');
  } finally { for (const k of ['document', 'NodeFilter', 'getComputedStyle']) delete globalThis[k]; }
});
