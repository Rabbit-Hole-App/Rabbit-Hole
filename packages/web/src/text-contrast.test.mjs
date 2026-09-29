import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as style from './scene-style.js';
import { IDENTITY_SLOTS, ROLES, ROLE_FILL } from './scene-vocab.js';
import { BOARDS, BOARD_REVIEW_STATES } from './demo-scenes.js';
import { evaluateScene } from './scene-evaluate.js';

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
// takes the fill's own ink instead (inkOn: page ink on a tint, the role's
// on-token on a solid), exactly as a lit one does. Every step a numeral can
// sit on (rest, lit = highlighted, peak = selected), in the role's hue and
// every identity hue, is measured. No lesson draws numerals on a loud fill
// today (the one strip, observed, reads 8.48:1), so what fails is named as
// unproven - here, in cellInk's ponytail and in the doc rule - not fixed.
const UNPROVEN = (theme, role, slot, step) => slot != null // an identity hue on any loud fill
  || (theme === 'light' && role === 'success' && step === 'rest')
  || (theme === 'dark' && role === 'learner' && step !== 'rest');
const STEPS = { rest: {}, lit: { highlighted: true }, peak: { selected: true } };
test('an unlit cell numeral uses secondary ink only on a soft fill; on a loud fill its own ink passes on every step, or is named unproven', () => {
  assert.equal(typeof style.cellInk, 'function', 'scene-style.js exports no cellInk - the renderer still hard-codes secondary ink on every fill');
  for (const role of ROLES) {
    if (ROLE_FILL[role]) {
      assert.equal(style.cellInk(role, false), style.inkOn(role), `${role}: a ${ROLE_FILL[role]} fill carries its own ink`);
      assert.equal(style.cellInk(role, true), style.inkOn(role), role);
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
          const fill = fillOver(theme, style.shapeStyle(role, state, undefined, slot).fill, surface);
          const ratio = contrast(rgb(hexOf(theme, style.cellInk(role, step !== 'rest'))), fill);
          const name = `${theme} ${role}${slot ? `/${slot}` : ''} ${step} ${ratio.toFixed(2)}:1`;
          if (ratio < 4.5 && !UNPROVEN(theme, role, slot, step)) failures.push(name);
          if (ratio >= 4.5 && slot == null && UNPROVEN(theme, role, slot, step)) stale.push(name);
        }
      }
    }
  }
  assert.deepEqual(failures, [], 'a loud-fill numeral under 4.5:1 that nobody named');
  assert.deepEqual(stale, [], 'these now pass - drop them from UNPROVEN, cellInk\'s ponytail and the doc rule');
  assert.match(renderer, /const ink = heat \? heat\.inkToken : cellInk\(role, lit\);/, 'the grid/strip numeral ink goes through cellInk');
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
// characters (the unlit case - lit ones are page ink). Glyphs on a cell,
// chip or shape fill are proved at full strength by the fill checks above.
// ponytail: a dimmed shape's own label or numerals (drawn on its fill -
// depth-attention-overview's future tiles rest at 0.3) are not composited
// here; add the fill to this walk when that dim goes to the owner too.
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
// and on a listed object that no longer fails in its state.
const EXEMPT = {
  'depth-architecture-overview': { when: s => s.stage < 5, objects: ['loop-note'],
    why: 'stages 1-5: the loop is a stage not yet reached; its note reads at full strength on stage 6' },
  'depth-architecture-deep': { when: s => s.call === 'direct',
    objects: ['embed-shape', 'eq-embed', 'block-header', 'qkv-shape', 'att-shape', 'att-path', 'att-path-default', 'attnOut-shape', 'fc-shape',
      'mlpOut-shape', 'eq-att', 'eq-attn', 'eq-mlp', 'lnf-shape', 'head-shape', 'loss-shape', 'eq-logits'],
    why: 'model(idx) at T = 257 fails the assert: nothing below it runs, and the warning line says so' },
  'depth-attention-deep': { when: s => s.path === 'fused', objects: ['shape-scores', 'shape-scale', 'shape-mask', 'shape-softmax', 'shape-mix', 'att'],
    why: 'fused path: the five manual steps one SDPA call replaces (1/4) and the att it never holds (2/4); the fused note says so' },
  'depth-generation-deep': { when: s => s.temperature === 't0', objects: ['shape-topk', 'shape-softmax', 'shape-draw', 'shape-cat', 'probs'],
    why: 'T = 0 (What-if): every step after ÷ T is invalid; the warning lines say what happens instead' },
};

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
              const rule = EXEMPT[scene.id];
              if (rule?.objects.includes(object.id) && rule.when(inputs)) { exempted.add(`${scene.id} ${object.id}`); continue; }
              if (!failures.has(scene.id)) failures.set(scene.id, new Set());
              failures.get(scene.id).add(`${object.id} ${theme} ${ratio.toFixed(2)}:1 at opacity ${object.opacity}`);
            }
          }
        }
      }
    }
  }
  for (const [id, { why }] of Object.entries(EXEMPT)) t.diagnostic(`exempt (B), ${id}: ${why}`);
  const unexpected = [...failures].map(([id, hits]) => `${id}: ${[...hits].join('; ')}`);
  assert.deepEqual(unexpected, [], 'a glyph on the scene surface under 4.5:1 - raise its opacity, or its ink');
  const stale = Object.entries(EXEMPT).flatMap(([id, { objects }]) => objects.map(object => `${id} ${object}`)).filter(key => !exempted.has(key));
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
