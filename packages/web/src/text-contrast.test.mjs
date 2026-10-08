import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as style from './scene-style.js';
import { GEOMETRY, IDENTITY_SLOTS, ROLES, ROLE_FILL } from './scene-vocab.js';
import { BOARDS, BOARD_REVIEW_STATES } from './demo-scenes.js';
import { evaluateScene } from './scene-evaluate.js';
import { CHIP_CHAR, CHIP_GAP, CHIP_PAD } from './animation-scene.js';
import { COLUMN_LABEL_GAP, ROW_LABEL_GAP, centreOf, estimateTextBox, labelAt } from './scene-layout.js';
import { cellNumeralSize, formatCell } from './scene-format.js';

// Owner rule (2026-09-29, docs/features/learn-canvas-blocks.md "Practice and
// secondary text"): secondary text - --color-ink-2, the unlit/quiet ink of
// captions, provenance lines, unlit token characters, unlit cell numbers,
// control labels - is learner-facing text and clears normal-text contrast
// (4.5:1) on every surface it is drawn on, in both themes. Fixed in the
// semantic token, never per card. The surfaces are read from the code:
//   1. chrome: every background class a `text-ink-2` element carries in the
//      app's JSX (scanned below), plus the page/card surface itself;
//   2. the scene surface: AnimatedScene.jsx's <svg> background, --viz-surface
//      (captions, annotations, code text, data labels, bar and token labels,
//      grid row/column labels all sit on it);
//   3. every resting data-cell fill an unlit numeral is drawn on: the
//      role's rest step (shapeStyle), in the role's hue or any identity hue,
//      composited over --viz-surface the way color-mix(..., transparent) is.
// The same bar holds for role-hued scene text, for every glyph on the scene
// surface at its resting opacity on every card, and for the practice
// panel's pass/fail feedback.

const here = fileURLToPath(new URL('.', import.meta.url));
const css = readFileSync(`${here}index.css`, 'utf8');
const darkStart = css.indexOf('.dark {');
const BLOCKS = { light: css.slice(0, darkStart), dark: css.slice(darkStart, css.indexOf('}', darkStart)) };
// Tailwind's own white when the light theme does not redefine it (only .dark does).
const DEFAULTS = { '--color-white': '#ffffff' };
const declared = (block, name) => block.match(new RegExp(`^\\s*${name}\\s*:\\s*([^;]+);`, 'm'))?.[1].trim();
// .dark sits on the same <html> as :root, so a name .dark leaves alone keeps its light value.
const declaration = (theme, name) => (theme === 'dark' && declared(BLOCKS.dark, name)) || declared(BLOCKS.light, name) || DEFAULTS[name];
// A CSS value to its hex in a theme, following var() references and fallbacks.
const hexOf = (theme, value) => {
  const ref = value.match(/^var\((--[\w-]+)(?:,\s*(.+))?\)$/);
  if (!ref) {
    assert.match(value, /^#[0-9a-fA-F]{6}$/, `${value} (${theme}) is not a hex colour`);
    return value;
  }
  const own = declaration(theme, ref[1]);
  assert.ok(own || ref[2], `no ${ref[1]} in the ${theme} tokens`);
  return hexOf(theme, own || ref[2]);
};
const token = (theme, name) => hexOf(theme, `var(${name})`);
const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
const luminance = channels => {
  const [r, g, b] = channels.map(c => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
};
// color-mix(in srgb, X P%, transparent) over a surface is an alpha blend of X at P%.
const over = (hex, percent, surface) => rgb(hex).map((c, i) => c * percent / 100 + rgb(surface)[i] * (1 - percent / 100));
const fillOver = (theme, fill, surface) => {
  if (fill === 'transparent') return rgb(surface);
  const match = fill.match(/^color-mix\(in srgb, var\((--[\w-]+)\) (\d+)%, transparent\)$/) || fill.match(/^var\((--[\w-]+)\)$/);
  assert.ok(match, `unrecognised fill ${fill}`);
  return over(token(theme, match[1]), match[2] ? Number(match[2]) : 100, surface);
};
const THEMES = ['light', 'dark'];
const renderer = readFileSync(`${here}AnimatedScene.jsx`, 'utf8');

const jsxFiles = (() => {
  const files = [];
  (function walk(dir) {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry.endsWith('.jsx')) files.push(full);
    }
  })(here);
  return files;
})();

// 1. Every bare `bg-*` on a string literal that also carries `text-ink-2`,
// across the app's JSX. A hover:/active: variant is not a resting surface
// (those rules also swap the text to ink); `/NN` opacity is judged at full
// strength, the worst case against the page in both themes.
function chromeBackgrounds() {
  const found = new Set(['white']); // the page and every card body
  for (const file of jsxFiles) {
    const source = readFileSync(file, 'utf8');
    for (const hit of source.matchAll(/(?<=["'`\s])text-ink-2(?=["'`\s])/g)) {
      let start = hit.index;
      while (start > 0 && !'"\'`'.includes(source[start - 1])) start -= 1;
      const literal = source.slice(start, source.indexOf(source[start - 1], hit.index));
      for (const bg of literal.matchAll(/(?:^|\s)bg-([a-z0-9-]+)(?:\/\d+)?(?=\s|$)/g)) found.add(bg[1]);
    }
  }
  return [...found];
}

const measure = (theme, surfaces) => {
  const ink = rgb(token(theme, '--color-ink-2'));
  return surfaces.map(([name, channels]) => ({ name, ratio: contrast(ink, channels) }));
};
const failing = rows => rows.filter(row => row.ratio < 4.5).map(row => `${row.name} ${row.ratio.toFixed(2)}:1`);
const low = rows => rows.reduce((a, b) => (b.ratio < a.ratio ? b : a));

test('secondary ink clears 4.5:1 on every chrome background it is used on, and on the scene surface, in both themes', t => {
  const backgrounds = chromeBackgrounds();
  assert.ok(backgrounds.length >= 3, `the scan found only ${backgrounds.join(', ')} - did it break?`);
  const failures = [];
  for (const theme of THEMES) {
    const rows = measure(theme, [
      ...backgrounds.map(bg => [`bg-${bg}`, rgb(token(theme, `--color-${bg}`))]),
      ['scene surface', rgb(token(theme, '--viz-surface'))],
    ]);
    t.diagnostic(`${theme} ink-2 ${token(theme, '--color-ink-2')}: ${rows.map(row => `${row.name} ${row.ratio.toFixed(2)}`).join(', ')}`);
    failures.push(...failing(rows).map(row => `${theme} ${row}`));
  }
  assert.deepEqual(failures, [], 'secondary ink under 4.5:1');
});

// A soft role's resting cell is a 12% tint; any role hue or identity hue can
// fill it (shapeStyle), so every one is checked - c25's lilac probability
// cells are prediction's.
test('secondary ink clears 4.5:1 on every soft resting cell fill, in every role and identity hue, in both themes', t => {
  const soft = ROLES.filter(role => !ROLE_FILL[role]);
  const failures = [];
  for (const theme of THEMES) {
    const surface = token(theme, '--viz-surface');
    const rows = measure(theme, soft.flatMap(role => [null, ...IDENTITY_SLOTS].map(slot => {
      const { fill } = style.shapeStyle(role, { selected: false }, undefined, slot);
      return [`${role}${slot ? `/${slot}` : ''} ${fill.match(/(\d+)%/)?.[1] ?? 100}%`, fillOver(theme, fill, surface)];
    })));
    const worst = low(rows);
    t.diagnostic(`${theme} ink-2 ${token(theme, '--color-ink-2')}: lowest ${worst.name} ${worst.ratio.toFixed(2)}:1 over ${rows.length} fills`);
    failures.push(...failing(rows).map(row => `${theme} ${row}`));
  }
  assert.deepEqual(failures, [], 'secondary ink under 4.5:1');
});

// Where no secondary grey can pass - a strong tint in dark (it would have to
// be --color-ink itself) or a solid fill in either theme - an unlit numeral
// takes the fill's own ink instead (the step's inkOn, shapeStyle's onFill),
// exactly as a lit one does and as a box's label does. Every step a numeral
// can sit on (rest, lit = highlighted, peak = selected), in the role's hue
// and every identity hue, is measured. An identity hue on a loud fill has no
// on-ink of its own, so it is named as unproven - here, in cellInk's
// ponytail and in the doc rule - not fixed.
const UNPROVEN = (theme, role, slot) => slot != null; // an identity hue on any loud fill
const STEPS = { rest: {}, lit: { highlighted: true }, peak: { selected: true } };
test('an unlit cell numeral uses secondary ink only on a soft fill; on a loud fill its own ink passes on every step, or is named unproven', () => {
  assert.equal(typeof style.cellInk, 'function', 'scene-style.js exports no cellInk - the renderer still hard-codes secondary ink on every fill');
  for (const role of ROLES) {
    if (ROLE_FILL[role]) {
      const { onFill } = style.shapeStyle(role, {});
      assert.equal(style.cellInk(role, false, onFill), onFill, `${role}: a ${ROLE_FILL[role]} fill carries its own ink`);
      assert.equal(style.cellInk(role, true, onFill), onFill, role);
    } else {
      assert.equal(style.cellInk(role, false), 'var(--color-ink-2)', role);
      assert.equal(style.cellInk(role, true), 'var(--color-ink)', role);
    }
  }
  const failures = [], stale = [];
  for (const theme of THEMES) {
    const surface = token(theme, '--viz-surface');
    for (const role of ROLES.filter(r => ROLE_FILL[r])) {
      for (const slot of [null, ...IDENTITY_SLOTS]) {
        for (const [step, state] of Object.entries(STEPS)) {
          const look = style.shapeStyle(role, state, undefined, slot);
          const fill = fillOver(theme, look.fill, surface);
          const ratio = contrast(rgb(hexOf(theme, style.cellInk(role, step !== 'rest', look.onFill))), fill);
          const name = `${theme} ${role}${slot ? `/${slot}` : ''} ${step} ${ratio.toFixed(2)}:1`;
          if (ratio < 4.5 && !UNPROVEN(theme, role, slot, step)) failures.push(name);
          if (ratio >= 4.5 && slot == null && UNPROVEN(theme, role, slot, step)) stale.push(name);
        }
      }
    }
  }
  assert.deepEqual(failures, [], 'a loud-fill numeral under 4.5:1 that nobody named');
  assert.deepEqual(stale, [], 'these now pass - drop them from UNPROVEN, cellInk\'s ponytail and the doc rule');
  assert.match(renderer, /const ink = heat \? heat\.inkToken : cellInk\(role, lit, look\.onFill\);/, 'the grid/strip numeral ink goes through cellInk, with its step\'s on-ink');
  // Every other secondary-ink use in the renderer sits on the scene surface:
  // row labels, column labels, bar labels, label-style tokens, text/data
  // labels. A new one means a new surface - add it above before raising this.
  assert.equal(renderer.split("'var(--color-ink-2)'").length - 1, 5, 'a new secondary-ink use in AnimatedScene.jsx: check its surface here');
});

test('secondary ink stays visibly lighter than the primary ink', () => {
  for (const theme of THEMES) {
    const ink = rgb(token(theme, '--color-ink')), secondary = rgb(token(theme, '--color-ink-2'));
    const lighter = theme === 'light' ? luminance(secondary) > luminance(ink) : luminance(secondary) < luminance(ink);
    assert.ok(lighter, `${theme}: --color-ink-2 must sit on the quiet side of --color-ink`);
    assert.ok(contrast(ink, secondary) >= 1.7, `${theme}: ink vs ink-2 only ${contrast(ink, secondary).toFixed(2)}:1 apart - the hierarchy collapsed`);
  }
});

// The ink a scene text object's glyphs get. Before textObjectInk the renderer
// painted a role's raw hue; the fallback keeps that so this check measures
// (and names each failing hue) against such a renderer instead of only erroring.
const textInk = style.textObjectInk
  ?? ((role, typography, slot) => (role === 'neutral' ? style.textStyle(typography).fill : style.identityVar(slot) ?? style.roleVar(role)));

test('role- and identity-hued scene text clears 4.5:1 on the scene surface: every role x identity slot, both themes', () => {
  const failures = [];
  for (const theme of THEMES) {
    const surface = rgb(token(theme, '--viz-surface'));
    for (const role of ROLES.filter(r => r !== 'neutral')) {
      for (const slot of [null, ...IDENTITY_SLOTS]) {
        const ratio = contrast(rgb(hexOf(theme, textInk(role, 'annotation', slot))), surface);
        if (ratio < 4.5) failures.push(`${theme} ${role}${slot ? `/${slot}` : ''} ${ratio.toFixed(2)}:1`);
      }
    }
  }
  assert.deepEqual(failures, [], 'role-hued text under 4.5:1');
  assert.match(renderer, /\? textObjectInk\(role, object\.typography, object\.identitySlot\)/, 'the text path draws a text object through textObjectInk');
});

// Every glyph drawn straight on the scene surface, with the ink the renderer
// gives it (AnimatedScene.jsx): a text object's; secondary ink for code, a
// data object's caption, its row/column/bar labels and label-style token
// characters (the unlit case - lit ones are page ink). A glyph on a cell,
// chip or shape fill - its own or another object's - is the glyph-over-fill
// check below's, composited with its opacity and the box shadow.
const DATA_TYPES = ['grid', 'strip', 'bars', 'tokens'];
function surfaceInks(object) {
  if (object.type === 'text') return [textInk(object.role, object.typography, object.identitySlot)];
  if (object.type === 'equation') return ['var(--color-ink)'];
  if (object.type === 'code') return ['var(--color-ink-2)'];
  const labelled = DATA_TYPES.includes(object.type) && (object.label || object.rowLabels?.length || object.columnLabels?.length
    || (object.type === 'bars' && object.labels?.length) || object.tokenStyle === 'labels');
  return labelled ? ['var(--color-ink-2)'] : [];
}
const domainOf = (declaration, data) => {
  if (declaration.hidden) return [];
  if (declaration.type === 'bool') return [false, true];
  if (declaration.type === 'index') return (data?.[declaration.of] || []).map((unused, i) => i);
  if (declaration.type === 'choice') return (declaration.options || []).map(option => option.id);
  return [];
};
// Owner classification (NC10, 2026-09-29; docs/features/learn-canvas-blocks.md
// "Dimmed text stays readable"): a dim under 4.5:1 is allowed only on content
// that is intentionally unavailable (B), named here by object and by the input
// state it is dimmed in, with the reason. The check fails on any other glyph,
// and on a listed object that no longer fails in its state. A scene may list
// more than one rule; `when` also gets the object id, for a dim that moves
// with an input (a stepper, a picker).
const EXEMPT = {
  'depth-architecture-overview': [
    { when: s => s.stage < 5, objects: ['loop-note'],
      why: 'stages 1-5: the loop is a stage not yet reached; its note reads at full strength on stage 6' },
    { when: (s, id) => Number(id.slice('stage-'.length)) > s.stage, objects: ['stage-1', 'stage-2', 'stage-3', 'stage-4', 'stage-5'],
      why: 'a pipeline stage box the stepper has not reached yet (0.3); it reads at full strength from its own stage on' },
  ],
  'depth-architecture-deep': { when: s => s.call === 'direct',
    objects: ['embed-shape', 'eq-embed', 'block-header', 'qkv-shape', 'att-shape', 'att-path', 'att-path-default', 'attnOut-shape', 'fc-shape',
      'mlpOut-shape', 'eq-att', 'eq-attn', 'eq-mlp', 'lnf-shape', 'head-shape', 'loss-shape', 'eq-logits',
      'embed-step', 'qkv-step', 'att-step', 'attnOut-step', 'fc-step', 'mlpOut-step', 'lnf-step', 'head-step', 'loss-step'],
    why: 'model(idx) at T = 257 fails the assert: nothing below it runs (its lines and its step boxes), and the warning line says so' },
  'depth-attention-deep': { when: s => s.path === 'fused',
    objects: ['shape-scores', 'shape-scale', 'shape-mask', 'shape-softmax', 'shape-mix', 'att', 'step-scores', 'step-scale', 'step-mask', 'step-softmax', 'step-mix'],
    why: 'fused path: the five manual steps one SDPA call replaces (1/4, lines and step boxes) and the att it never holds (2/4); the fused note says so' },
  'depth-generation-deep': { when: s => s.temperature === 't0',
    objects: ['shape-topk', 'shape-softmax', 'shape-draw', 'shape-cat', 'probs', 'step-topk', 'step-softmax', 'step-draw', 'step-cat'],
    why: 'T = 0 (What-if): every step after ÷ T is invalid (lines and step boxes); the warning lines say what happens instead' },
  'depth-tokenization-deep': { when: s => s.meta === true && s.input === 'digits', objects: ['batch', 'wte', 'head'],
    why: '1/3, the digit prompt with meta.pkl: encode raises KeyError, so the batch, wte and lm_head step boxes never run (0.35); the not-reached line says so' },
  'depth-attention-overview': { when: (s, id) => Number(id.slice('tile-'.length)) > s.reader,
    objects: ['tile-1', 'tile-2', 'tile-3', 'tile-4', 'tile-5', 'tile-6', 'tile-7', 'tile-8'],
    why: 'a character after the one being read (0.3): the causal mask hides it from that reader, so it gets no bar; it reads at full strength once it is read, and the future note says why it is faded' },
};
const exemptRules = Object.entries(EXEMPT).flatMap(([id, rules]) => [rules].flat().map(rule => ({ id, ...rule })));
const isExempt = (sceneId, objectId, inputs) => exemptRules.some(r => r.id === sceneId && r.objects.includes(objectId) && r.when(inputs, objectId));

test('every glyph on the scene surface clears 4.5:1 at rest, its object opacity composited, on every card in both themes', t => {
  const failures = new Map(), exempted = new Set();
  for (const [board, make] of Object.entries(BOARDS)) {
    for (const block of make().filter(b => b.scene)) {
      const scene = block.scene;
      const defaults = Object.fromEntries((scene.inputs || []).map(d => [d.name, d.default]));
      const states = [{}, ...(BOARD_REVIEW_STATES[board]?.[scene.id] || [])];
      for (const d of scene.inputs || []) for (const value of domainOf(d, scene.exampleData).slice(0, 40)) states.push({ [d.name]: value });
      for (const state of states) {
        const inputs = { ...defaults, ...state };
        const { state: frame } = evaluateScene(structuredClone(scene), scene.duration, inputs);
        for (const object of frame.objects.filter(o => o.visible && o.opacity > 0)) {
          for (const ink of surfaceInks(object)) {
            for (const theme of THEMES) {
              const surface = token(theme, '--viz-surface');
              const ratio = contrast(over(hexOf(theme, ink), object.opacity * 100, surface), rgb(surface));
              if (ratio >= 4.5) continue;
              if (isExempt(scene.id, object.id, inputs)) { exempted.add(`${scene.id} ${object.id}`); continue; }
              if (!failures.has(scene.id)) failures.set(scene.id, new Set());
              failures.get(scene.id).add(`${object.id} ${theme} ${ratio.toFixed(2)}:1 at opacity ${object.opacity}`);
            }
          }
        }
      }
    }
  }
  for (const { id, why } of exemptRules) t.diagnostic(`exempt (B), ${id}: ${why}`);
  const unexpected = [...failures].map(([id, hits]) => `${id}: ${[...hits].join('; ')}`);
  assert.deepEqual(unexpected, [], 'a glyph on the scene surface under 4.5:1 - raise its opacity, or its ink');
  for (const key of exempted) exemptedAnywhere.add(key);
});
const exemptedAnywhere = new Set();

// Every text glyph drawn over a filled shape, measured against the pixels the
// renderer composites there (AnimatedScene.jsx, mirrored below): a box's or
// circle's own label on its own fill, a cell numeral on its cell, a chip's
// token on its chip, and any glyph - a text line, a token or bar label, a
// caption, an equation - drawn over ANOTHER object's box, circle, cell, chip
// or bar. Each fill is its real composited look: its tier and state step
// (shapeStyle; heat for a heat cell), every object group's opacity, and the
// #animation-shadow a box or circle casts (--color-ink at 0.14 under the
// translucent fill - it moves a label on a 12% tint from 4.56 to 4.47:1 at
// 0.72). Every board, at rest, in every review state and input value, both
// themes. Only an EXEMPT (B) object in its listed state, or an UNPROVEN one
// below, may fall under 4.5:1; own labels are not skipped. A glyph on the
// bare surface is the test above's.
// ponytail: glyph extents are estimated (no DOM in node): sans text at 0.5 em
// per character (measured 0.41-0.59, median 0.47), monospace at 0.6, so a
// line whose last character or two runs onto a fill can go unmeasured. Grid
// emphasis scaling is not modelled. Swap in browser-measured boxes if a card
// ever puts text that close to a fill.
const SHADOW = 0.14;
const DRAWN_TEXT = ['text', 'equation', 'code'];
const NOT_A_SHAPE = [...DATA_TYPES, ...DRAWN_TEXT, 'arrow', 'line', 'image'];
// The renderer's ink for a glyph over another object's shape (scene-style.js
// inkOver). The fallback is a renderer without it: every glyph keeps its own.
const inkOver = style.inkOver ?? (ink => ink);
// Named, not fixed: an identity hue on a loud fill has no on-ink of its own
// (cellInk's ponytail, the UNPROVEN rule above). Only the IDENTITY benchmark
// draws one, and no lesson does.
const UNPROVEN_GLYPHS = { 'identity-check-strips': ['k', 'v'] };
const markedCell = (object, row, column, index) => {
  const at = object.cellHighlight;
  if (object.sweep != null && Math.floor(object.sweep * (object.values?.length || object.tokens?.length || 1)) === index) return true;
  if (at == null || typeof at === 'string') return false;
  if (Array.isArray(at)) return at.includes(index);
  if (typeof at === 'number') return at === index;
  return (at.row == null || at.row === row) && (at.col == null || at.col === column);
};
const rect = (xMin, yMin, w, h) => ({ xMin, yMin, xMax: xMin + w, yMax: yMin + h });
// The boxes and circles a later glyph can sit on: inkOver's `shapes`, built as
// AnimatedScene.jsx's Frame builds them.
const shapeOf = object => {
  if (NOT_A_SHAPE.includes(object.type) || !(object.opacity > 0)) return null;
  const { x, y } = centreOf(object), w = object.w || (object.type === 'circle' ? 60 : 0), h = object.type === 'circle' ? w : object.h || 0;
  const { onFill } = style.shapeStyle(object.role, { highlighted: object.highlighted }, undefined, object.identitySlot);
  return { ...rect(x - w / 2, y - h / 2, w, h), role: object.role, onFill };
};
// One object's drawing, in the renderer's order: regions (a fill: its rect,
// its fill, whether it casts the box shadow) and glyphs (its text, where its
// glyphs are, and the ink the renderer gives it).
function drawing(object, objects, shapesBefore) {
  const items = [];
  const role = object.role;
  const numeral = style.textStyle('annotation').fontSize;
  // `keep`: the renderer draws it in this ink wherever it lands - a shape's
  // own label, a cell's numeral or a chip's token on its own fill, a grid's
  // axis names. Anything else goes through inkOver at its estimateTextBox,
  // the box the renderer asks with.
  const glyph = (text, { x, y, fontSize, anchor = 'start', baseline = 'auto', mono = false }, ink, keep = false) => {
    text = String(text ?? '');
    if (!text.trim()) return;
    const est = estimateTextBox({ text, x, y, fontSize, anchor, baseline });
    const width = (est.xMax - est.xMin) * (mono ? 1 : 0.5 / 0.6);
    const xMin = anchor === 'end' ? est.xMax - width : anchor === 'middle' ? (est.xMin + est.xMax - width) / 2 : est.xMin;
    items.push({ glyph: text, box: { xMin, xMax: xMin + width, yMin: est.yMin, yMax: est.yMax }, ink: keep ? ink : inkOver(ink, shapesBefore, est) });
  };
  const region = (box, fill, shadow = false) => items.push({ region: true, box, fill, shadow });
  if (DATA_TYPES.includes(object.type)) {
    if (object.label) {
      const at = labelAt(object, { above: true }, centreOf(object), objects);
      glyph(object.label, { x: at.x, y: at.y, fontSize: style.textStyle('caption').fontSize }, 'var(--color-ink-2)');
    }
    const mono = { fontSize: numeral, mono: true };
    if (object.type === 'grid' || object.type === 'strip') {
      const cell = object.cell || GEOMETRY.cellPitch;
      const columns = object.type === 'strip' ? (object.values?.length || 0) : (object.cols || 1);
      const rows = object.type === 'strip' ? 1 : (object.rows || 1);
      const mode = object.heat?.mode;
      // The numeral as drawn: formatted once, every cell at the size the longest fits.
      const texts = (object.values || []).map(v => (v == null ? '' : formatCell(v, object.numberFormat || undefined)));
      const size = cellNumeralSize(texts, cell, numeral);
      const domain = !mode ? null : object.valueScale === 'local'
        ? (object.values || []).reduce((r, v) => (v == null ? r : { min: Math.min(r.min, v), max: Math.max(r.max, v) }), { min: Infinity, max: -Infinity })
        : object.valueDomain;
      for (let row = 0; row < rows; row += 1) {
        for (let column = 0; column < columns; column += 1) {
          const index = row * columns + column, value = object.values?.[index];
          const lit = markedCell(object, row, column, index);
          const look = style.shapeStyle(role, mode && value == null ? { blocked: true }
            : object.cellHighlightKind === 'highlight' ? { highlighted: lit } : { selected: lit }, undefined, object.identitySlot);
          const heat = mode && value != null ? style.heatStyle(value, domain, mode) : null;
          const x = object.x + column * cell, y = object.y + row * cell;
          region(rect(x, y, cell, cell), heat ? `color-mix(in srgb, var(--viz-${heat.fillToken}) ${heat.mixPercent}%, transparent)` : look.fill);
          if (value != null && cell >= 22) glyph(texts[index], { x: x + cell / 2, y: y + cell / 2, anchor: 'middle', baseline: 'central', mono: true, fontSize: size },
            heat ? heat.inkToken : style.cellInk(role, lit, look.onFill), true);
        }
      }
      if (object.type === 'grid') {
        (object.rowLabels || []).forEach((text, row) => glyph(text, { x: object.x - ROW_LABEL_GAP, y: object.y + row * cell + cell / 2, anchor: 'end', baseline: 'central', ...mono }, 'var(--color-ink-2)', true));
        (object.columnLabels || []).forEach((text, column) => glyph(text, { x: object.x + column * cell + cell / 2, y: object.y - COLUMN_LABEL_GAP, anchor: 'middle', ...mono }, 'var(--color-ink-2)', true));
      }
    } else if (object.type === 'bars') {
      const values = object.values || [], pitch = object.cell ?? GEOMETRY.barWidth, height = object.h || GEOMETRY.barHeight;
      const peak = object.peak ?? Math.max(...values.map(v => Math.abs(v ?? 0)), 0.0001);
      values.forEach((value, index) => {
        const tall = value == null ? 0 : Math.min(height - 4, Math.max(1, (Math.abs(value) / peak) * (height - 4)));
        const lit = markedCell(object, 0, index, index) || (object.cellHighlight === 'max' && value != null && value === Math.max(...values.map(v => v ?? -Infinity)));
        region(rect(object.x + index * pitch + 2, object.y + height - tall, pitch - 4, tall), style.shapeStyle(role, { chosen: lit }, 'strong', object.identitySlot).fill);
        glyph(object.labels?.[index], { x: object.x + index * pitch + pitch / 2, y: object.y + height + 12, anchor: 'middle', ...mono }, lit ? 'var(--color-ink)' : 'var(--color-ink-2)');
      });
    } else {
      let offset = 0;
      (object.tokens || []).forEach((text, index) => {
        const width = CHIP_PAD * 2 + text.length * CHIP_CHAR, x = object.x + offset;
        offset += width + CHIP_GAP;
        const lit = markedCell(object, 0, index, index);
        const at = { x: x + width / 2, y: object.y + GEOMETRY.chipHeight / 2, anchor: 'middle', baseline: 'central', ...mono };
        if (object.tokenStyle === 'labels') return glyph(text, at, lit ? 'var(--color-ink)' : 'var(--color-ink-2)');
        const look = style.shapeStyle(role, { highlighted: lit }, undefined, object.identitySlot);
        region(rect(x, object.y, width, GEOMETRY.chipHeight), look.fill);
        glyph(text, at, look.onFill, true);
      });
    }
    return items;
  }
  if (object.type === 'equation') {
    // KaTeX in a foreignObject at the object's box; glyph width from the source with its commands stripped.
    const plain = object.label.replace(/\\[a-zA-Z]+|[{}^_\\]/g, '');
    const size = style.textStyle('equation').fontSize;
    const box = { xMin: object.x, yMin: object.y, xMax: object.x + Math.min(object.w ?? Infinity, plain.length * size * 0.5), yMax: object.y + Math.min(object.h ?? Infinity, size * 1.4) };
    const frame = rect(object.x, object.y, object.w || 0, object.h || 0);
    if (plain.trim()) items.push({ glyph: plain, box, ink: inkOver('var(--color-ink)', shapesBefore, frame) });
    return items;
  }
  const look = style.shapeStyle(role, { highlighted: object.highlighted }, undefined, object.identitySlot);
  const stroke = object.type === 'arrow' || object.type === 'line';
  const image = object.type === 'image';
  const text = DRAWN_TEXT.includes(object.type);
  const own = !text && !stroke && !image;
  const centre = centreOf(object);
  if (object.type === 'circle') {
    const r = (object.w || 60) / 2;
    region(rect(centre.x - r * 0.7, centre.y - r * 0.7, r * 1.4, r * 1.4), look.fill, true);
  } else if (own) region(rect(object.x, object.y, object.w || 0, object.h || 0), look.fill, true);
  const at = labelAt(object, { stroke, above: image, text }, centre, objects);
  const fontSize = style.textStyle(object.type === 'code' ? 'code' : object.type === 'text' ? object.typography : 'body').fontSize;
  const ink = object.type === 'text' ? textInk(role, object.typography, object.identitySlot) : text ? 'var(--color-ink-2)' : look.onFill;
  glyph(object.label, { x: at.x, y: at.y, fontSize, anchor: at.anchor, baseline: at.baseline, mono: object.type === 'code' || object.type === 'circle' }, ink, own);
  return items;
}
const paint = (theme, fill) => {
  const match = fill.match(/^color-mix\(in srgb, var\((--[\w-]+)\) (\d+)%, transparent\)$/) || fill.match(/^var\((--[\w-]+)\)$/);
  assert.ok(match || fill === 'transparent', `unrecognised fill ${fill}`);
  return match ? { rgb: rgb(token(theme, match[1])), alpha: match[2] ? Number(match[2]) / 100 : 1 } : { rgb: [0, 0, 0], alpha: 0 };
};
const inside = (box, x, y) => x >= box.xMin && x <= box.xMax && y >= box.yMin && y <= box.yMax;
// One object group's fills at (x, y), composited inside the group
// (premultiplied: the box shadow under its fill), then laid over a pixel at
// the group's opacity.
function layer(theme, items, x, y) {
  let colour = [0, 0, 0], alpha = 0;
  const shade = rgb(token(theme, '--color-ink'));
  for (const item of items.filter(r => r.region && inside(r.box, x, y))) {
    const { rgb: hue, alpha: p } = paint(theme, item.fill);
    const s = item.shadow ? SHADOW * p : 0;
    const a = p + s * (1 - p);
    colour = hue.map((h, i) => h * p + shade[i] * s * (1 - p) + (1 - a) * colour[i]);
    alpha = a + (1 - a) * alpha;
  }
  return { colour, alpha };
}
const lay = ({ colour, alpha }, opacity, pixel) => pixel.map((v, i) => opacity * colour[i] + (1 - opacity * alpha) * v);
// The glyph against the fill beside it, at the middle of each fill it covers
// by at least a quarter of its line height across and 40% down.
function glyphContrasts(theme, drawn, k, g) {
  const { object, items } = drawn[k], item = items[g];
  const size = Math.min(item.box.yMax - item.box.yMin, 20);
  const points = [];
  for (const { items: others } of drawn) {
    for (const r of others.filter(o => o.region)) {
      const xMin = Math.max(r.box.xMin, item.box.xMin), xMax = Math.min(r.box.xMax, item.box.xMax);
      const yMin = Math.max(r.box.yMin, item.box.yMin), yMax = Math.min(r.box.yMax, item.box.yMax);
      if (xMax - xMin >= size * 0.25 && yMax - yMin >= size * 0.4) points.push([(xMin + xMax) / 2, (yMin + yMax) / 2]);
    }
  }
  const surface = rgb(token(theme, '--viz-surface'));
  return points.map(([x, y]) => {
    const back = drawn.slice(0, k).reduce((pixel, d) => lay(layer(theme, d.items, x, y), d.object.opacity, pixel), surface);
    let bg = lay(layer(theme, items.slice(0, g), x, y), object.opacity, back);
    let fg = rgb(hexOf(theme, item.ink)).map((v, i) => object.opacity * v + (1 - object.opacity) * back[i]);
    for (const d of drawn.slice(k + 1)) {
      const over = layer(theme, d.items, x, y);
      [bg, fg] = [lay(over, d.object.opacity, bg), lay(over, d.object.opacity, fg)];
    }
    return contrast(fg, bg);
  });
}

test('every glyph over a filled shape - its own label included - clears 4.5:1 on the composited fill, on every card in both themes', t => {
  const failures = new Map(), exempted = new Set(), unproven = new Set();
  let measured = 0;
  for (const [board, make] of Object.entries(BOARDS)) {
    for (const block of make().filter(b => b.scene)) {
      const scene = block.scene;
      const defaults = Object.fromEntries((scene.inputs || []).map(d => [d.name, d.default]));
      const states = [{}, ...(BOARD_REVIEW_STATES[board]?.[scene.id] || [])];
      for (const d of scene.inputs || []) for (const value of domainOf(d, scene.exampleData).slice(0, 40)) states.push({ [d.name]: value });
      for (const state of states) {
        const inputs = { ...defaults, ...state };
        const { state: frame } = evaluateScene(structuredClone(scene), scene.duration, inputs);
        const objects = frame.objects.filter(o => o.visible);
        const shapes = objects.map(shapeOf);
        const drawn = objects.map((object, k) => ({ object, items: drawing(object, objects, shapes.slice(0, k).filter(Boolean)) }))
          .filter(({ object }) => object.opacity > 0);
        drawn.forEach(({ object, items }, k) => items.forEach((item, g) => {
          if (!item.glyph) return;
          for (const theme of THEMES) {
            const ratios = glyphContrasts(theme, drawn, k, g);
            measured += ratios.length;
            const ratio = Math.min(...ratios);
            if (!(ratio < 4.5)) continue;
            if (isExempt(scene.id, object.id, inputs)) { exempted.add(`${scene.id} ${object.id}`); continue; }
            if (UNPROVEN_GLYPHS[scene.id]?.includes(object.id)) { unproven.add(`${scene.id} ${object.id}`); continue; }
            // One line per object and theme: its worst glyph, and in how many states it fails.
            const key = `${scene.id} ${object.id} ${theme}`, hit = failures.get(key);
            if (!hit || ratio < hit.ratio) failures.set(key, { ratio, text: item.glyph, opacity: object.opacity, state, states: (hit?.states || 0) + 1 });
            else hit.states += 1;
          }
        }));
      }
    }
  }
  t.diagnostic(`${measured} glyph-over-fill points measured`);
  assert.ok(measured > 1000, `only ${measured} glyph-over-fill points - did the walk break?`);
  for (const key of exempted) exemptedAnywhere.add(key);
  const unexpected = [...failures].map(([key, hit]) => `${key} "${hit.text.trim().slice(0, 28)}" ${hit.ratio.toFixed(2)}:1`
    + `${hit.opacity < 1 ? ` at opacity ${hit.opacity}` : ''}, ${hit.states} state(s), e.g. ${JSON.stringify(hit.state)}`);
  assert.deepEqual(unexpected, [], 'a glyph over a filled shape under 4.5:1 - give it the fill\'s own ink, or raise its opacity');
  const stale = Object.entries(UNPROVEN_GLYPHS).flatMap(([id, ids]) => ids.map(object => `${id} ${object}`)).filter(key => !unproven.has(key));
  assert.deepEqual(stale, [], 'these now pass - drop them from UNPROVEN_GLYPHS');
  assert.match(renderer, /inkOver\(/, 'the renderer draws a glyph over another object\'s shape through inkOver');
});

test('every EXEMPT (B) object still falls under 4.5:1 in its listed state', () => {
  const stale = exemptRules.flatMap(({ id, objects }) => objects.map(object => `${id} ${object}`)).filter(key => !exemptedAnywhere.has(key));
  assert.deepEqual(stale, [], 'these no longer fail in their state - drop them from EXEMPT and the doc rule');
});

// Pass/fail feedback is learner-facing text on the practice panel's card
// (bg-white): its colour must be a theme token that flips in .dark - a fixed
// Tailwind palette shade (green-700, red-700) fell to 3.56:1 and 2.74:1 there.
test('practice pass/fail feedback clears 4.5:1 on the card in both themes', () => {
  const panel = readFileSync(`${here}SceneActivity.jsx`, 'utf8');
  const colours = panel.match(/data-activity-result=[\s\S]*?\$\{status\.result === 'passed' \? '(text-[\w-]+)' : '(text-[\w-]+)'\}/);
  assert.ok(colours, 'the graded feedback line no longer picks its colour from status.result - update this check');
  for (const cls of colours.slice(1)) {
    const name = `--color-${cls.slice('text-'.length)}`;
    assert.ok(declared(BLOCKS.light, name) && declared(BLOCKS.dark, name), `${cls} is not a theme token in index.css (light and .dark) - a fixed palette shade cannot flip in dark`);
    for (const theme of THEMES) {
      const ratio = contrast(rgb(token(theme, name)), rgb(token(theme, '--color-white')));
      assert.ok(ratio >= 4.5, `${theme} ${cls} on the card: ${ratio.toFixed(2)}:1`);
    }
  }
});

// The retired secondary grey (#787774, 4.32:1 on the scene surface) written
// as a literal never follows the token: every text fill says var(--color-ink-2),
// or its light value on a light-only island.
test('no component hard-codes the retired secondary grey', () => {
  const hits = jsxFiles.flatMap(file => readFileSync(file, 'utf8').split('\n')
    .map((line, i) => (/#787774/i.test(line) ? `${file.slice(here.length)}:${i + 1}` : null)).filter(Boolean));
  if (/--muted-foreground:\s*#787774/i.test(css)) hits.push('index.css --muted-foreground');
  assert.deepEqual(hits, [], 'use var(--color-ink-2) (or #63615d on a light-only island)');
});

// Tertiary ink (#9b9a97, 2.8:1) is for placeholders and disabled controls. A
// card's informational lines - provenance, credits, block labels, the
// selection line - are secondary text. The one tertiary use left on a card is
// an icon button that brightens on hover.
const CARD_FILES = ['AnimatedScene.jsx', 'SceneActivity.jsx', 'SceneControls.jsx', 'SourcesDisclosure.jsx', 'LearningBlocks.jsx'];
test('a card draws no line of text in tertiary ink', () => {
  const hits = [];
  for (const file of CARD_FILES) {
    const source = readFileSync(`${here}${file}`, 'utf8');
    for (const literal of source.matchAll(/(["'`])([^"'`]*\btext-ink-3\b[^"'`]*)\1/g)) {
      if (!/\bhover:text-ink\b/.test(literal[2])) hits.push(`${file}: "${literal[2]}"`);
    }
  }
  assert.deepEqual(hits, [], 'informational card text is secondary ink (text-ink-2)');
});

// Rabbit Holes are green (owner r29): the two hole tokens flip in .dark; a kept hole's text clears 4.5:1 on the card and
// a pending mark 3:1 (marks only, never text), in both themes; and every hole mark reads a token - no red hex is left on
// a portal tab or outline, the overview's holes or the map's markers (its delete buttons and its error stay red).
test('Rabbit Hole marks are the green hole tokens, readable in both themes', () => {
  for (const [name, bar] of [['--color-hole', 4.5], ['--color-hole-pending', 3]]) {
    assert.ok(declared(BLOCKS.light, name) && declared(BLOCKS.dark, name), `${name} is a theme token in index.css (light and .dark)`);
    for (const theme of THEMES) {
      const ratio = contrast(rgb(token(theme, name)), rgb(token(theme, '--color-white')));
      assert.ok(ratio >= bar, `${theme} ${name} on the card: ${ratio.toFixed(2)}:1`);
    }
  }
  for (const theme of THEMES) assert.notEqual(token(theme, '--color-hole'), token(theme, '--color-hole-pending'), `${theme}: pending is not kept`);
  const red = /#(b42318|912018|e5484d|fef3f2)/i;
  const reds = (file, only) => readFileSync(`${here}${file}`, 'utf8').split('\n')
    .map((line, i) => (red.test(line) && only(line) ? `${file}:${i + 1}` : null)).filter(Boolean);
  assert.deepEqual([
    ...reds('CanvasMinimap.jsx', () => true),
    ...reds('Dive.jsx', line => !/Trash2|role="alert"/.test(line)),
    ...reds('AdaptiveCanvas.jsx', line => /portal/.test(line)),
  ], [], 'hole marks use the hole tokens (text-hole, bg-hole, border-hole, outline-hole, fill-hole and their -pending forms)');
});
