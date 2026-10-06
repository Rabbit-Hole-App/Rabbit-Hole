// The §9.4 adapter boundary and the parts of the Remotion adapter that need no browser.
// The rendering proofs themselves run in `node scripts/motion.mjs prove` (slow).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { CSP, FONT_PINS, RENDERER_METHODS, RemotionRenderer, contactFrames } from './remotion-renderer.mjs';

const read = p => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));

// M7B: both adapters implement one boundary (probeFrames moved into it from the service child).
test('RemotionRenderer and HyperFramesRenderer implement the same MotionRenderer boundary', async () => {
  assert.deepEqual(RENDERER_METHODS, ['validateSource', 'renderPreview', 'renderStills', 'probeFrames', 'renderFinal', 'validateFinal', 'collectDiagnostics']);
  const { HyperFramesRenderer } = await import('./hyperframes-renderer.mjs');
  for (const R of [RemotionRenderer, HyperFramesRenderer]) for (const m of [...RENDERER_METHODS, 'contactSheet', 'close']) assert.equal(typeof R.prototype[m], 'function', `${R.name}.${m}`);
  assert.deepEqual([new RemotionRenderer().name, new HyperFramesRenderer().name], ['remotion', 'hyperframes']);
});

test('validateSource gates brief, storyboard and composition together', () => {
  const r = new RemotionRenderer();
  const brief = read('./fixtures/demo-a/brief.json'), storyboard = read('./fixtures/demo-a/storyboard.json');
  const source = readFileSync(new URL('./fixtures/demo-a/composition.jsx', import.meta.url), 'utf8');
  assert.deepEqual(r.validateSource(brief, storyboard, source), []);
  assert.ok(r.validateSource(brief, storyboard, source.replace('const ease', 'const now = Date.now();\nconst ease')).some(e => /"Date" is not allowed/.test(e)));
  assert.ok(r.validateSource({ ...brief, teaching_mode: 'x' }, storyboard, source).some(e => /teaching_mode/.test(e)));
});

test('contact sheet frames: first, every beat start and middle, keyframes, last (§11.2)', () => {
  const frames = contactFrames(read('./fixtures/demo-a/brief.json'), read('./fixtures/demo-a/storyboard.json'));
  assert.deepEqual(frames, [0, 45, 90, 150, 165, 210, 270, 315, 330, 360, 390, 420, 449]);
});

test('the bundle page CSP allows only its own origin', () => {
  assert.match(CSP, /default-src 'self'/);
  assert.match(CSP, /connect-src 'self'(;|$)/);
  assert.match(CSP, /frame-src 'none'/);
  assert.doesNotMatch(CSP, /https?:|\*/);
});

test('bundled fonts match their pins', () => {
  for (const [file, pin] of Object.entries(FONT_PINS)) {
    assert.equal(createHash('sha256').update(readFileSync(new URL(`../assets/fonts/${file}`, import.meta.url))).digest('hex'), pin, file);
  }
});
