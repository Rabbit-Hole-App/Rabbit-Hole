import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { buildSync } from 'esbuild';
import { normalizeFrame } from './explain-program/frame.js';
import { INTERACT_BOX_RADIUS, INTERACT_FONT, interactDataStyle, interactMarkColor, interactShapeStyle } from './interact-style.js';
import { inkOver, selectionStyle, shapeStyle } from './scene-style.js';
import { PALETTE, PATH } from './tutor-diagrams/primitives.js';
import { TEACHING_STYLE } from './tutor-diagrams/teaching-theme.js';

const SWATCHES = {
  input: PALETTE.process,
  output: PALETTE.outcome,
  prediction: '#B9A4E8',
  observed: PALETTE.olive,
  learner: PALETTE.decision,
  tutor: '#E8A3B7',
  code: '#A8BBD0',
  warning: PALETTE.coral,
  success: PALETTE.outcome,
};
const rgb = hex => hex.slice(1).match(/../g).map(part => parseInt(part, 16));
const mix = (a, b, percent) => a.map((channel, index) => (channel * percent + b[index] * (100 - percent)) / 100);
function luminance(rgb) {
  return rgb.reduce((sum, channel, index) => {
    const s = channel / 255;
    return sum + [0.2126, 0.7152, 0.0722][index] * (s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4);
  }, 0);
}
const contrast = (a, b) => {
  const [lo, hi] = [luminance(a), luminance(b)].sort((a, b) => a - b);
  return (hi + 0.05) / (lo + 0.05);
};
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('filled interactive shapes share the written palette and geometry while ordinary shapes keep their existing style', () => {
  for (const [role, hue] of Object.entries(SWATCHES)) {
    const node = interactShapeStyle(role);
    assert.equal(node.fill, hue);
    assert.equal(node.stroke, '#32211c');
    assert.ok(contrast(rgb(node.fill), rgb(node.onFill)) >= 4.5, role);
    assert.notEqual(shapeStyle(role).fill, hue);
  }
  assert.equal(interactShapeStyle('neutral').fill, 'var(--viz-surface, #fbfbfa)');
  assert.equal(interactShapeStyle('input', {}, undefined, 'identity-1').fill, PALETTE.process);
  assert.equal(interactShapeStyle('input', {}, undefined, 'identity-2').fill, PALETTE.olive);
  assert.equal(interactShapeStyle('input', {}, undefined, 'identity-3').fill, PALETTE.coral);
  assert.equal(INTERACT_BOX_RADIUS, 7);
  assert.match(read('./tutor-diagrams/TutorDiagram.js'), new RegExp(INTERACT_FONT));
});

test('line and data cues keep contrast and preserve selection while interactive styling is scoped', () => {
  const chosen = interactShapeStyle('tutor', { chosen: true });
  const active = interactShapeStyle('tutor', { highlighted: true });
  const disabled = interactShapeStyle('tutor', { chosen: true, disabled: true });
  assert.deepEqual([chosen.strokeWidth, active.strokeWidth, disabled.strokeWidth], [2.5, 2, 1]);
  assert.equal(chosen.fill, active.fill);
  assert.notEqual(disabled.fill, active.fill);
  assert.equal(selectionStyle().outer.stroke, 'var(--viz-selection-outer)');
  assert.equal(selectionStyle().inner.stroke, 'var(--viz-selection-inner)');
  for (const [role, hue] of Object.entries(SWATCHES)) {
    const markPercent = Number(interactMarkColor(role).match(/ (\d+)%/)?.[1]);
    const rest = interactDataStyle(role);
    const selected = interactDataStyle(role, { selected: true });
    const restPercent = Number(rest.fill.match(/ (\d+)%/)?.[1]);
    assert.equal(rest.onFill, 'var(--color-ink, #32211c)');
    assert.equal(selected.fill, hue);
    assert.equal(selected.onFill, '#32211c');
    for (const [background, ink] of [['#fbfbfa', '#37352f'], ['#1f1f1f', '#d4d4d4']]) {
      assert.ok(contrast(mix(rgb(hue), rgb(ink), markPercent), rgb(background)) >= 4.5, role + ' line ' + background);
      assert.ok(contrast(mix(rgb(hue), rgb(background), restPercent), rgb(ink)) >= 4.5, role + ' cell ' + background);
    }
  }
});

test('overlapping text reads the ink of a filled interactive role, while legacy tint behavior remains', () => {
  const glyph = { xMin: 8, yMin: 8, xMax: 12, yMax: 12 };
  const shape = { role: 'input', xMin: 0, yMin: 0, xMax: 20, yMax: 20, onFill: '#32211c' };
  assert.equal(inkOver('legacy text', [shape], glyph), 'legacy text');
  assert.equal(inkOver('dark theme text', [{ ...shape, filled: true }], glyph), '#32211c');
});

test('both normal interactive card entry points opt in, and the shared drawing remains opt-in', () => {
  const learning = read('./LearningBlocks.jsx');
  const player = read('./explain-program/ProgramScene.jsx');
  const scene = read('./AnimatedScene.jsx');
  assert.match(learning, /<AnimatedScene key="proposed" interact /);
  assert.match(learning, /<AnimatedScene block=\{block\} interact=\{[^}]*block\.explain/);
  assert.match(player, /<Frame interact scene=\{view\.scene\}/);
  assert.match(scene, /export function Frame\([^)]*interact = false/);
  assert.match(scene, /<Frame scene=\{scene\} interact=\{interact\}/);
  assert.match(scene, /<svg viewBox=\{view\} fontFamily=\{interact \? INTERACT_FONT : undefined\}/);
});

test('production review opts in to the same interactive frame without restyling generic catalog captures', () => {
  const program = read('../render/program-render.jsx');
  const catalog = read('../render/render-scene.jsx');
  assert.match(program, /<Frame interact scene=\{view\.scene\}/);
  assert.match(catalog, /<AnimatedScene key=\{\+\+mounts\} block=\{block\} interact=\{interact === true\}/);
});

test('the real frame renders the Tutor palette, legible on-fill text and the same selection ring', () => {
  const dir = mkdtempSync(join(tmpdir(), 'interact-frame-'));
  const outfile = join(dir, 'frame.cjs');
  let bundle;
  try {
    buildSync({
      stdin: {
        contents: "export { Frame } from './AnimatedScene.jsx'; export { createElement } from 'react'; export { renderToStaticMarkup } from 'react-dom/server';",
        resolveDir: fileURLToPath(new URL('.', import.meta.url)),
      },
      bundle: true, outfile, platform: 'node', format: 'cjs', jsx: 'automatic', loader: { '.css': 'empty' },
    });
    bundle = createRequire(import.meta.url)(outfile);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  const result = normalizeFrame({ width: 400, height: 200, objects: [
    { kind: 'box', id: 'input', x: 20, y: 20, w: 150, h: 40, role: 'input', text: 'Entry' },
    { kind: 'text', id: 'label', x: 70, y: 42, text: 'Label', role: 'output' },
  ] });
  assert.equal(result.ok, true, result.issue);
  const { scene, state } = result;
  const render = interact => bundle.renderToStaticMarkup(bundle.createElement(bundle.Frame, {
    scene, state, interact, fixedView: true, picked: 'input', pop: { duration: 0 },
  }));
  const themed = render(true);
  const standard = render(false);
  assert.match(themed, /font-family="Inter, Liberation Sans, Arial, sans-serif"/);
  assert.match(themed, new RegExp(`rx="7"[^>]+fill:${PALETTE.process}`));
  assert.match(themed, /fill:#32211c"[^>]*>Label</);
  assert.doesNotMatch(standard, new RegExp(`font-family="Inter, Liberation Sans, Arial, sans-serif"|font-family="Arial, Liberation Sans, sans-serif"|fill:${PALETTE.process}`));
  for (const svg of [themed, standard]) assert.match(svg, /--viz-selection-outer/);
});

// The real Frame bundled once for the tests that render it.
function frameBundle() {
  const dir = mkdtempSync(join(tmpdir(), 'interact-frame-'));
  const outfile = join(dir, 'frame.cjs');
  try {
    buildSync({
      stdin: { contents: "export { Frame } from './AnimatedScene.jsx'; export { createElement } from 'react'; export { renderToStaticMarkup } from 'react-dom/server';", resolveDir: fileURLToPath(new URL('.', import.meta.url)) },
      bundle: true, outfile, platform: 'node', format: 'cjs', jsx: 'automatic', loader: { '.css': 'empty' },
    });
    return createRequire(import.meta.url)(outfile);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
const LEGACY_FRAME = { width: 480, height: 260, objects: [
  { kind: 'box', id: 'b', x: 20, y: 20, w: 120, h: 40, role: 'input', text: 'Entry' },
  { kind: 'circle', id: 'c', x: 200, y: 40, w: 40, role: 'output', text: 'v' },
  { kind: 'arrow', id: 'a', from: { x: 60, y: 120 }, to: { x: 160, y: 120 }, role: 'warning' },
  { kind: 'line', id: 'l', from: { x: 60, y: 160 }, to: { x: 160, y: 200 }, role: 'neutral' },
  { kind: 'polyline', id: 'p', points: [[220, 200], [260, 150], [320, 190]], role: 'learner' },
  { kind: 'text', id: 't', x: 300, y: 60, text: 'Label', role: 'neutral' },
] };

test('a legacy (non-interact) frame renders byte for byte as before the interactive restyle: a pinned hash of its markup', () => {
  const bundle = frameBundle();
  const result = normalizeFrame(LEGACY_FRAME);
  assert.equal(result.ok, true, result.issue);
  const markup = bundle.renderToStaticMarkup(bundle.createElement(bundle.Frame, { scene: result.scene, state: result.state, interact: false, fixedView: true, picked: 'b', pop: { duration: 0 } }));
  const hash = createHash('sha256').update(markup).digest('hex');
  assert.equal(hash, 'a8bf78ff4ecb1b46f4ac8b1e6b6c281876a03f039c990c4e49bb74a7e71e176d', 'update only with an owner decision to restyle /animation');
});

test('interact mode draws line and arrow as the written connector: INK by default, PATH when chosen, a role hue only for output, warning and learner', () => {
  const bundle = frameBundle();
  const result = normalizeFrame({ width: 480, height: 200, objects: [
    { kind: 'arrow', id: 'plain', from: { x: 20, y: 40 }, to: { x: 140, y: 40 }, role: 'input' },
    { kind: 'arrow', id: 'watch', from: { x: 20, y: 80 }, to: { x: 140, y: 80 }, role: 'warning' },
    { kind: 'arrow', id: 'picked', from: { x: 20, y: 120 }, to: { x: 140, y: 120 }, role: 'neutral' },
    { kind: 'line', id: 'bare', from: { x: 200, y: 40 }, to: { x: 320, y: 40 }, role: 'neutral' },
  ] });
  assert.equal(result.ok, true, result.issue);
  const render = interact => bundle.renderToStaticMarkup(bundle.createElement(bundle.Frame, { scene: result.scene, state: result.state, interact, fixedView: true, picked: 'picked', pop: { duration: 0 } }));
  const themed = render(true), group = id => { const at = themed.indexOf(`data-animation-object="${id}"`); const next = themed.indexOf('data-animation-object=', at + 1); return at < 0 ? '' : themed.slice(at, next < 0 ? undefined : next); };
  assert.match(themed, /data-tutor-arrowhead/, 'the arrowhead is the written connector polygon');
  assert.match(group('plain'), /stroke="var\(--color-ink, #32211c\)"/); assert.match(group('plain'), /fill="var\(--color-ink, #32211c\)"/);
  assert.match(group('picked'), new RegExp(`stroke="${PATH}"`)); assert.match(group('picked'), /stroke-width="3"/);
  assert.match(group('watch'), /stroke="color-mix\(in srgb, #F58371 33%/); assert.match(group('watch'), /fill="color-mix\(in srgb, #F58371 33%/);
  assert.doesNotMatch(group('bare'), /data-tutor-arrowhead/, 'a line has no head');
  assert.doesNotMatch(render(false), /data-tutor-arrowhead/, 'the /animation frame keeps its marker arrows');
});

test('interact mode draws the frame on the teaching surface with the written diagrams outer rect; the /animation frame has neither', () => {
  const bundle = frameBundle();
  const result = normalizeFrame({ width: 300, height: 160, objects: [{ kind: 'text', id: 't', x: 20, y: 40, text: 'hi', role: 'neutral' }] });
  assert.equal(result.ok, true, result.issue);
  const render = interact => bundle.renderToStaticMarkup(bundle.createElement(bundle.Frame, { scene: result.scene, state: result.state, interact, fixedView: true, pop: { duration: 0 } }));
  const themed = render(true), standard = render(false);
  for (const [name, value] of Object.entries(TEACHING_STYLE)) assert.ok(themed.includes(`${name}:${value}`), `${name} comes from TEACHING_STYLE`);
  assert.match(themed, /<rect x="0\.5" y="0\.5"[^>]*rx="12"[^>]*stroke="var\(--color-line\)"/);
  assert.doesNotMatch(standard, /--viz-surface:#|rx="12"[^>]*fill="var\(--viz-surface/);
  assert.match(read('./InteractSupportPanels.jsx'), /background: TEACHING\.inset/);
});
