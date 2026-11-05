// The whiteboard composition (roadmap v1 section 6.2; W1.4). Fast: the timeline math, primitive-kind coverage, and that no manifest string is
// ever evaluated. MOTION_RENDER_TESTS=1 adds one real 10 s render through the service and the real child (unsandboxed, minutes), checked with
// ffprobe: 300 frames, h264, yuv420p, AAC, video duration within one frame.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRIMITIVE_KINDS } from './contracts.mjs';
import { CAPTION_CHARS, audioName, captionCues, itemsAt, schedule, strokesFor } from '../src/whiteboard/timeline.js';
import { requestFor, sampleManifest, timingFor } from './test-requests.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const PKG = join(HERE, '..');
// The stroke types src/lecture/WhiteboardScene.jsx draws (drawablesFor, plus HandText for text).
const DRAWN = new Set(['rect', 'ellipse', 'line', 'cross', 'arrow', 'path', 'text']);

test('every W1 primitive kind becomes strokes the lecture board draws; graph is two axes and its polyline inside its box', () => {
  const { scenes: [scene] } = sampleManifest();
  assert.deepEqual([...new Set(scene.primitives.map(p => p.kind))].sort(), Object.keys(PRIMITIVE_KINDS).sort(), 'the sample covers every kind');
  for (const p of scene.primitives) for (const s of strokesFor(p)) assert.ok(DRAWN.has(s.type), `${p.kind} -> ${s.type}`);
  assert.deepEqual(strokesFor(scene.primitives.find(p => p.kind === 'equation')).map(s => [s.type, s.text]), [['text', 'x - 0.2 * 6 = 1.8']]);
  const g = scene.primitives.find(p => p.kind === 'graph'), [xAxis, yAxis, line] = strokesFor(g);
  assert.deepEqual([xAxis.type, yAxis.type, line.type], ['arrow', 'arrow', 'path']);
  assert.deepEqual(line.points[0], [g.x, g.y], '(-4, 16) is the top left of the box');
  assert.deepEqual(line.points[2], [g.x + g.w / 2, g.y + g.h], '(0, 0) is the bottom middle');
  const wild = strokesFor({ ...g, domain: [1, 1], points: [[1e12, -1e12], [0, 0]] })[2].points.flat();
  assert.ok(wild.every(Number.isFinite), 'a zero-width domain or a far point stays finite');
  assert.throws(() => strokesFor({ kind: 'code' }), /no stroke/);
});

test('the schedule: one board per plan window, each beat drawing its reveals in order within its narration and pause, audio at its start frame', () => {
  const m = sampleManifest(), plan = schedule(m);
  assert.equal(plan.totalFrames, 300);
  assert.deepEqual(plan.scenes.map(s => [s.id, s.from, s.durationInFrames]), [['s1', 0, 300]]);
  const [b1, b2] = m.timing.beats;
  assert.deepEqual(plan.audio, [{ from: b1.startFrame, durationInFrames: b1.audioFrames, src: audioName(0) }, { from: b2.startFrame, durationInFrames: b2.audioFrames, src: audioName(1) }]);
  const strokes = plan.scenes[0].strokes;
  assert.ok(strokes.every((s, i) => i === 0 || s.startF >= strokes[i - 1].startF), 'strokes start in reveal order');
  const firstBeat = strokes.filter(s => s.startF < b2.startFrame);
  assert.equal(firstBeat.length, 5, 'rect, ellipse, line, cross, arrow: one stroke each');
  assert.ok(firstBeat.every(s => s.startF + s.durF <= b1.audioFrames + 1), 'beat 1 draws while it speaks');
  const lastEnd = Math.max(...strokes.map(s => s.startF + s.durF));
  assert.ok(lastEnd <= b2.startFrame + b2.audioFrames + 15 + 1, 'beat 2 draws within its narration plus its 15-frame pause');
  assert.deepEqual(itemsAt(strokes, 0).map(i => i.p), [0], 'frame 0: the first stroke has just started');
  assert.ok(itemsAt(strokes, 299).every(i => i.p === 1) && itemsAt(strokes, 299).length === strokes.length, 'the last frame shows everything drawn');
  assert.deepEqual(schedule(m), schedule(sampleManifest()), 'deterministic, seeds included');
});

test('an unrevealed primitive is never drawn; a silent beat has no audio and no caption', () => {
  const m = sampleManifest(), scene = m.scenes[0];
  scene.beats[1] = { ...scene.beats[1], narration: '', reveals: ['p'] };
  m.timing = timingFor(m.plan, m.scenes);
  const plan = schedule(m);
  assert.equal(plan.audio.length, 1);
  assert.ok(plan.cues.every(c => c.from < m.timing.beats[1].startFrame));
  assert.ok(!plan.scenes[0].strokes.some(s => s.stroke.text === 'slope = 2x'));
});

test('captions: lines of at most 90 characters at word boundaries, in order, inside the beat\'s audio', () => {
  const text = 'word '.repeat(60).trim() + ' ' + 'x'.repeat(200);
  const cues = captionCues(text, 100, 240);
  assert.ok(cues.every(c => c.text.length <= CAPTION_CHARS));
  assert.equal(cues.map(c => c.text).join(' ').replace(/x /g, 'x'), text.replace(/x /g, 'x'));
  assert.equal(cues[0].from, 100);
  assert.ok(cues.every((c, i) => i === 0 || c.from > cues[i - 1].from));
  assert.ok(cues.at(-1).from + cues.at(-1).durationInFrames <= 340);
  assert.deepEqual(captionCues('   ', 0, 30), []);
});

test('no manifest string is ever evaluated: the composition and renderer sources hold no eval, Function, innerHTML or dynamic import, and a script-looking text is drawn verbatim', () => {
  const sources = [
    ...readdirSync(join(PKG, 'src', 'whiteboard')).map(f => join(PKG, 'src', 'whiteboard', f)),
    join(PKG, 'src', 'lecture', 'WhiteboardScene.jsx'), join(PKG, 'whiteboard', 'render.mjs'), join(PKG, 'whiteboard', 'contracts.mjs'),
  ];
  for (const f of sources) {
    const code = readFileSync(f, 'utf8').replace(/^\s*\/\/.*$/gm, '');
    assert.doesNotMatch(code, /\beval\s*\(|\bnew\s+Function\b|\bFunction\s*\(|dangerouslySetInnerHTML|innerHTML|\bimport\s*\(|setTimeout\s*\(\s*['"`]/, f);
  }
  const hostile = '${process.exit(1)}<script>alert(1)</script>';
  const [stroke] = strokesFor({ id: 't', kind: 'text', color: '#000000', width: 2, x: 1, y: 1, size: 20, text: hostile });
  assert.equal(stroke.text, hostile);
  assert.equal(captionCues(hostile, 0, 30).map(c => c.text).join(' '), hostile);
});

// The real render: real MP3 narration (Remotion's bundled ffmpeg, libmp3lame), the real service and child, unsandboxed. Not run in CI by default.
test('a real 10 s whiteboard render to MP4 through the service: 300 frames, h264, yuv420p, AAC, duration within one frame', { skip: process.env.MOTION_RENDER_TESTS !== '1' && 'set MOTION_RENDER_TESTS=1 (minutes)', timeout: 15 * 60 * 1000 }, async t => {
  const { ffmpeg } = await import('../motion/renderer-common.mjs');
  const { motionRenderService } = await import('../motion/service/server.mjs');
  const scratch = mkdtempSync(join(tmpdir(), 'wb-real-'));
  t.after(() => rmSync(scratch, { recursive: true, force: true }));
  const mp3 = async seconds => {
    const f = join(scratch, `tone-${seconds}.mp3`);
    await ffmpeg('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', `sine=frequency=440:duration=${seconds}`, '-c:a', 'libmp3lame', '-b:a', '64k', f]);
    const d = Number(JSON.parse((await ffmpeg('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'json', f])).stdout).format.duration);
    return { b64: readFileSync(f).toString('base64'), frames: Math.round(d * 30) };
  };
  const tone = await mp3(1.5);
  const m = sampleManifest();
  m.timing = timingFor(m.plan, m.scenes, () => tone.frames);
  const body = requestFor(m, () => tone.b64);
  const TOKEN = 'r'.repeat(40), auth = { authorization: `Bearer ${TOKEN}` };
  const jobsDir = join(scratch, 'jobs');
  const svc = motionRenderService({ token: TOKEN, sandbox: 'none', jobsDir, childScript: join(PKG, 'motion', 'service', 'child.mjs') });
  await new Promise(r => svc.server.listen(0, '127.0.0.1', r));
  t.after(() => { svc.stop(); svc.server.close(); });
  const base = `http://127.0.0.1:${svc.server.address().port}`;
  const { render_id } = await (await fetch(`${base}/whiteboard/render`, { method: 'POST', headers: { ...auth, 'content-type': 'application/json' }, body: JSON.stringify(body) })).json();
  let r;
  for (const t0 = Date.now(); Date.now() - t0 < 14 * 60 * 1000; await new Promise(x => setTimeout(x, 2000))) {
    r = await (await fetch(`${base}/whiteboard/${render_id}`, { headers: auth })).json();
    if (r.status !== 'rendering') break;
  }
  console.log(JSON.stringify({ ...r, contact_sheet: `${r.contact_sheet?.length} tiles` }, null, 2));
  assert.equal(r.status, 'ready', `${r.error}: ${r.detail}`);
  assert.equal(r.determinism.identical, true);
  const file = join(scratch, 'final.mp4');
  writeFileSync(file, Buffer.from(await (await fetch(base + r.artifacts.final, { headers: auth })).arrayBuffer()));
  const probe = async (stream, entries) => JSON.parse((await ffmpeg('ffprobe', ['-v', 'error', '-select_streams', stream, '-count_frames', '-show_entries', entries, '-of', 'json', file])).stdout).streams[0];
  const v = await probe('v:0', 'stream=codec_name,pix_fmt,color_space,r_frame_rate,nb_read_frames,duration,width,height');
  const a = await probe('a:0', 'stream=codec_name');
  assert.equal(Number(v.nb_read_frames), 300);
  assert.deepEqual([v.codec_name, v.pix_fmt, v.color_space, v.r_frame_rate, v.width, v.height], ['h264', 'yuv420p', 'bt709', '30/1', 1920, 1080]);
  assert.ok(Math.abs(Number(v.duration) - 10) <= 1 / 30 + 1e-6, `video ${v.duration}s`);
  assert.equal(a.codec_name, 'aac');
  for (const name of ['poster', 'contact_sheet']) assert.equal((await fetch(base + r.artifacts[name], { headers: auth })).status, 200);
});

test('the child refuses beat audio that is not the length timing gave it, before any bundle or browser', async t => {
  const { renderWhiteboard } = await import('./render.mjs');
  const { ffmpeg } = await import('../motion/renderer-common.mjs');
  const dir = mkdtempSync(join(tmpdir(), 'wb-audio-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const { mkdirSync } = await import('node:fs');
  mkdirSync(join(dir, 'public', 'audio'), { recursive: true });
  mkdirSync(join(dir, 'out'));
  const m = sampleManifest(); // both beats 45 frames (1.5 s)
  writeFileSync(join(dir, 'public', audioName(0)), 'not audio');
  await ffmpeg('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=3', '-c:a', 'libmp3lame', '-b:a', '64k', join(dir, 'public', audioName(1))]);
  const r = await renderWhiteboard({ job: { manifest: m }, dir, out: join(dir, 'out'), work: dir, sandbox: { mode: 'none' } });
  assert.equal(r.status, 'failed');
  assert.equal(r.error, 'audio_mismatch');
  assert.match(r.detail, /s1\/b1: NaNs/);
  assert.match(r.detail, /s1\/b2: 3\.\d+s, timing 1\.5s/);
  assert.deepEqual(readdirSync(join(dir, 'public', 'fonts')).sort(), ['Inter-Medium.woff2', 'Inter-Regular.woff2', 'JetBrainsMono-Regular.woff2', 'Virgil.woff2'], 'the pinned fonts are in the job\'s public dir');
  assert.deepEqual(readdirSync(join(dir, 'out')), [], 'nothing rendered');
});
