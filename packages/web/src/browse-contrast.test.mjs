import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Owner brief 2026-10-23 (card contrast): on the browse pages (Home, Library, Explore) white cards no longer blend into
// the page. Scoped tokens in index.css carry it - --color-line, which also draws unrelated dividers, is not darkened - and
// .dark restores today's values exactly.
const here = fileURLToPath(new URL('.', import.meta.url));
const read = (f) => readFileSync(`${here}${f}`, 'utf8');
const css = read('index.css');
const darkStart = css.indexOf('.dark {');
const BLOCKS = { light: css.slice(0, darkStart), dark: css.slice(darkStart, css.indexOf('}', darkStart)) };
const declared = (block, name) => block.match(new RegExp(`^\\s*${name}\\s*:\\s*([^;]+);`, 'm'))?.[1].trim();
// .dark sits on the same <html> as :root, so a name .dark leaves alone keeps its light value.
const value = (theme, name) => (theme === 'dark' && declared(BLOCKS.dark, name)) || declared(BLOCKS.light, name);
const hex = (theme, name) => {
  const v = value(theme, name);
  assert.ok(v, `${name} is declared (${theme})`);
  const ref = v.match(/^var\((--[\w-]+)\)$/);
  if (ref) return hex(theme, ref[1]);
  assert.match(v, /^#[0-9a-f]{6}$/i, `${name} (${theme}) is a hex colour`);
  return v.toLowerCase();
};
const lum = (h) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const ratio = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
const WHITE = '#ffffff';

test('light: the page is a subtle grey and the card edge is a clear neutral against it', () => {
  assert.equal(hex('light', '--browse-bg'), '#f5f6f8');
  assert.ok(ratio(hex('light', '--card-border'), hex('light', '--browse-bg')) >= 1.5, 'card edge on the page is at least 1.5:1');
  assert.ok(ratio(hex('light', '--card-border'), WHITE) >= 1.5, 'card edge on the white card is at least 1.5:1');
  assert.ok(ratio(hex('light', '--card-border-hover'), WHITE) > ratio(hex('light', '--card-border'), WHITE), 'hover never weakens the edge');
});

test('light: thumbnail edge and page dots are quieter than the card edge', () => {
  const edge = ratio(hex('light', '--card-border'), WHITE);
  assert.ok(ratio(hex('light', '--thumb-border'), WHITE) < edge, 'thumbnail edge is lighter than the card edge');
  assert.ok(ratio(hex('light', '--dots'), hex('light', '--browse-bg')) < ratio(hex('light', '--card-border'), hex('light', '--browse-bg')), 'dots are lighter than the card edge');
});

test('light: the shadow is a hairline, not an elevation', () => {
  const m = value('light', '--card-shadow').match(/^0 (\d+)px (\d+)px rgba\(\d+, \d+, \d+, ([\d.]+)\)$/);
  assert.ok(m, 'one small offset shadow');
  assert.ok(Number(m[1]) <= 2 && Number(m[2]) <= 4 && Number(m[3]) <= 0.08, `shadow ${m[0]} stays subtle`);
});

test('light: secondary text clears 4.5:1 on the white card and on the page', () => {
  const meta = hex('light', '--browse-meta');
  assert.equal(meta, hex('light', '--color-ink-2'), 'it reuses the readable secondary-text token');
  assert.ok(ratio(meta, WHITE) >= 4.5, `on white ${ratio(meta, WHITE).toFixed(2)}`);
  assert.ok(ratio(meta, hex('light', '--browse-bg')) >= 4.5, `on the page ${ratio(meta, hex('light', '--browse-bg')).toFixed(2)}`);
});

test('the unrelated line tokens are not darkened', () => {
  assert.equal(declared(BLOCKS.light, '--color-line'), '#e9e9e7');
  assert.equal(declared(BLOCKS.light, '--color-line-strong'), '#d3d1cb');
  assert.equal(declared(BLOCKS.light, '--color-ink-3'), '#9b9a97');
});

test('dark: every browse token equals what the pages drew before', () => {
  assert.equal(value('dark', '--browse-bg'), 'transparent', 'the page keeps the body surface');
  assert.equal(hex('dark', '--card-border'), '#2f2f2f');
  assert.equal(hex('dark', '--card-border-hover'), '#4a4a4a');
  assert.equal(value('dark', '--card-shadow'), 'none');
  assert.equal(hex('dark', '--thumb-border'), '#2f2f2f');
  assert.equal(hex('dark', '--dots'), '#2f2f2f');
  assert.equal(hex('dark', '--browse-meta'), '#6f6f6f', 'times keep the dark tertiary ink');
});

test('the learning card and the browse pages use the tokens; no other page does', () => {
  const card = read('home/LearningCard.jsx');
  assert.match(card, /rounded-lg border border-line bg-white p-4 browse-card /, 'the card is opaque white with the browse edge');
  assert.match(card, /border-\(color:--thumb-border\)/);
  assert.equal((card.match(/text-\(color:--browse-meta\)/g) || []).length, 2, 'the note and the footer (Updated, canvases)');
  assert.match(read('home/Provenance.jsx'), /text-xs text-\(color:--browse-meta\)"><GitFork/);
  assert.match(css, /\.browse-card \{\s*border-color: var\(--card-border\);\s*box-shadow: var\(--card-shadow\);/);
  assert.match(css, /:where\(\.browse-card\)\.lift-card:hover \{\s*border-color: var\(--card-border-hover\);/, 'hover keeps a visible edge without outranking the focus ring');
  assert.match(css, /\.browse-page \{\s*background-color: var\(--browse-bg\);\s*background-image: radial-gradient\(var\(--dots\) 1px, transparent 1px\);/);
  assert.ok(css.indexOf(':where(.browse-card)') < css.indexOf('.select-card:focus-within'), 'the focus ring still follows the hover edge');
  const users = readdirSync(here, { recursive: true }).filter((f) => /\.jsx$/.test(f) && /browse-page/.test(read(f))).map((f) => f.replace(/\\/g, '/')).sort();
  assert.deepEqual(users, ['App.jsx', 'Home.jsx'], 'Library, Home and Explore only - not the canvas, Learn or shared pages');
});
