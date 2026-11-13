import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildSync } from 'esbuild';
import { normalizeFrame } from './frame.js';
import { programSdkSource } from './sdk.js';
import { TEACHING } from '../tutor-diagrams/teaching-theme.js';

// The look of a generated card's scene (frame-look.js), drawn by the real Frame in interact mode: structural markup checks on frames built with the sdk-8 helpers in this process. The helpers are the
// real guest source (programSdkSource), so a naming convention these tests rely on is the one the author's own helper calls produce.
function frameBundle() {
  const dir = mkdtempSync(join(tmpdir(), 'frame-look-'));
  const outfile = join(dir, 'frame.cjs');
  try {
    buildSync({
      stdin: { contents: "export { Frame } from '../AnimatedScene.jsx'; export { createElement } from 'react'; export { renderToStaticMarkup } from 'react-dom/server';", resolveDir: fileURLToPath(new URL('.', import.meta.url)) },
      bundle: true, outfile, platform: 'node', format: 'cjs', jsx: 'automatic', loader: { '.css': 'empty' },
    });
    return createRequire(import.meta.url)(outfile);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
const bundle = frameBundle();
export const sdk = new Function(`${programSdkSource('sdk-8')}\nreturn sdk;`)();
export const draw = (objects, size = { width: 640, height: 420 }) => {
  const result = normalizeFrame({ ...size, objects });
  assert.equal(result.ok, true, result.issue);
  return bundle.renderToStaticMarkup(bundle.createElement(bundle.Frame, { scene: result.scene, state: result.state, interact: true, fixedView: true, pop: { duration: 0 } }));
};
export const group = (markup, id) => { const at = markup.indexOf(`data-animation-object="${id}"`); const next = markup.indexOf('data-animation-object=', at + 1); return at < 0 ? '' : markup.slice(at, next < 0 ? undefined : next); };
export const texts = markup => [...markup.matchAll(/<(?:tspan|text)[^>]*>([^<]+)<\/(?:tspan|text)>/g)].map(match => match[1]);

const yAxis = sdk.axis('height', { x: 64, y: 330, length: 260, orientation: 'y', min: 0, max: 2, ticks: [0, 0.5, 1, 1.5, 2], label: 'Height', unit: 'm' });
const lanes = [...sdk.panel({ id: 'toss', x: 60, y: 50, w: 250, h: 300, title: 'Toss', state: 'Rising' }), ...sdk.panel({ id: 'drop', x: 340, y: 50, w: 250, h: 300, title: 'Drop', state: 'Held' })];

test('a lane is a blue-soft card (the first) or a warm-soft card (the second) with a 1 px border and radius 10, not a solid role fill', () => {
  const markup = draw([...lanes]);
  const toss = group(markup, 'toss'), drop = group(markup, 'drop');
  assert.match(toss, new RegExp(`<rect[^>]*rx="10"[^>]*fill="${TEACHING.blueSoft}"[^>]*stroke="${TEACHING.line}"[^>]*stroke-width="1"`));
  assert.match(drop, new RegExp(`<rect[^>]*rx="10"[^>]*fill="${TEACHING.warmSoft}"`));
  assert.match(toss, /data-frame-lane="toss"/);
});

test('the lane heading row: the title at 15 px / 600 in ink and the state at 12 px in muted, where sdk.panel put them', () => {
  const markup = draw([...lanes]);
  assert.match(group(markup, 'toss.title'), new RegExp(`<text x="60" y="36" fill="${TEACHING.ink}" font-size="15" font-weight="600">Toss</text>`));
  assert.match(group(markup, 'toss.state'), new RegExp(`fill="${TEACHING.muted}" font-size="12">Rising</text>`));
});

test('every lane draws its own y axis: ticks 0.0 to 2.0 step 0.5 in 11 px muted labels, a dashed grid across, the axis title top left, and the stand-alone axis is not drawn a second time', () => {
  const markup = draw([yAxis, ...lanes]);
  for (const id of ['toss', 'drop']) {
    const lane = group(markup, id);
    assert.deepEqual(texts(lane).filter(text => /^\d\.\d$/.test(text)), ['0.0', '0.5', '1.0', '1.5', '2.0'], `${id}: one decimal on every tick`);
    assert.ok(texts(lane).includes('Height (m)'), `${id}: the axis title`);
    assert.equal((lane.match(/stroke-dasharray/g) || []).length, 4, `${id}: a dashed grid line at every tick above the baseline`);
    assert.match(lane, /font-size="11"/);
  }
  assert.equal(group(markup, 'height').includes('data-frame-figure'), false, 'the frame axis is drawn by the lanes');
  assert.equal(group(markup, 'height').includes('<polyline'), false);
  // a frame without lanes still draws its axis as before
  assert.match(group(draw([yAxis]), 'height'), /data-frame-figure="axis"/);
});

test('a label inside a lane is kept inside it: a callout-sized text past the lane edge is drawn back within the lane', () => {
  const markup = draw([...lanes, sdk.text('late', 300, 120, 'a long label', {})]);
  const x = Number(group(markup, 'late').match(/<text x="([0-9.]+)"/)[1]);
  assert.ok(x < 310 - 6 - 60 && x > 60, `x ${x} is inside the lane (right edge 310)`);
  const middle = draw([...lanes, sdk.text('mid', 305, 120, 'centre', { align: 'middle' })]);
  assert.ok(Number(group(middle, 'mid').match(/<text x="([0-9.]+)"/)[1]) < 304, 'a middle-aligned text keeps its half width inside');
});
