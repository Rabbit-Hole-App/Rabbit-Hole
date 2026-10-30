// The filled primary button's contrast (owner 2026-10-22, "contrast yes"): white text on its fill clears the 4.5:1
// small-text floor in both themes, at rest and hovered, while the accent blue itself (links, rings, shapes) is unchanged.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = name => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const css = read('index.css');
const darkStart = css.indexOf('.dark {');
const dark = css.slice(darkStart, css.indexOf('}', darkStart));
const light = css.slice(0, darkStart);
const declared = (block, name) => block.match(new RegExp(`^\\s*${name}\\s*:\\s*([^;]+);`, 'm'))?.[1].trim();
const token = (theme, name) => (theme === 'dark' && declared(dark, name)) || declared(light, name);
const lum = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
  .map(n => (n <= 0.03928 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4))
  .reduce((sum, n, i) => sum + n * [0.2126, 0.7152, 0.0722][i], 0);
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

test('the primary fill is #1b6fc2 with a darker hover; white text on it, and on the action Button, clears 4.5:1 in both themes', () => {
  for (const theme of ['light', 'dark']) {
    const fill = token(theme, '--color-primary-fill'), hover = token(theme, '--color-primary-fill-hover');
    assert.equal(fill, '#1b6fc2', theme);
    assert.ok(lum(hover) < lum(fill), `${theme}: the hover ${hover} is darker than the fill`);
    for (const [name, bg] of [['rest', fill], ['hover', hover]]) {
      const r = ratio('#ffffff', bg);
      console.log(`primary button ${theme} ${name}: white on ${bg} ${r.toFixed(2)}:1`);
      assert.ok(r >= 4.5, `${theme} ${name}: ${r.toFixed(2)}:1`);
    }
  }
  // The companion's action Button (Upload): --action-blue at rest, the primary's darker fill on hover.
  const action = read('ui.jsx').match(/variant === 'action' && '([^']+)'/)[1].split(' ');
  for (const cls of ['bg-(--action-blue)', 'text-white', 'hover:bg-primary-fill-hover']) assert.ok(action.includes(cls), cls);
  for (const theme of ['light', 'dark']) {
    for (const [name, bg] of [['rest', token(theme, '--action-blue')], ['hover', token(theme, '--color-primary-fill-hover')]]) {
      const r = ratio('#ffffff', bg);
      console.log(`action button ${theme} ${name}: white on ${bg} ${r.toFixed(2)}:1`);
      assert.ok(r >= 4.5, `action ${theme} ${name}: ${r.toFixed(2)}:1`);
    }
  }
  // Dark mode turns --color-white into the page surface; a class naming the fill re-pins it so text-white stays white.
  assert.match(css, /\.dark \[class\*='bg-primary-fill'\],[^{]*\{\n\s+--color-white: #ffffff;/);
});

test('the accent token is unchanged (#2383e2, not redefined in dark), and the primary Button uses the fill, not the accent', () => {
  assert.equal(declared(light, '--color-accent'), '#2383e2');
  assert.equal(declared(dark, '--color-accent'), undefined);
  assert.ok(ratio('#ffffff', '#2383e2') < 4.5, 'the reason for the dedicated fill: white on the accent is under 4.5:1');
  const button = read('ui.jsx').match(/variant === 'primary' && '([^']+)'/)[1].split(' ');
  for (const cls of ['bg-primary-fill', 'text-white', 'hover:bg-primary-fill-hover']) assert.ok(button.includes(cls), cls);
  assert.ok(!button.includes('bg-accent'), 'not the accent fill');
  // The focus ring stays on the shared Button base.
  assert.match(read('ui.jsx'), /'inline-flex items-center gap-1\.5 rounded-lg[^']*focus-visible:outline-2 focus-visible:outline-accent\/35/);
});

// The destination rows' Enter and Open (owner, Rabbit Hole and reference navigation design 2026-10-29): the primary fill and
// hover, white text, the shared focus and disabled treatments; at least 76x36 with a 6px radius and 12/16 medium text, 44px
// high on touch; the row 14/16 padded on the side surface under a 1px divider, hover on the hover surface.
test('Enter and Open are the primary button at the destination size; the row uses the shared surface tokens', () => {
  const row = read('DestinationRow.jsx');
  const action = row.match(/export const ACTION_CLASS = '([^']+)'/)[1].split(' ');
  for (const cls of ['bg-primary-fill', 'text-white', 'hover:bg-primary-fill-hover', 'min-h-9', 'min-w-[76px]', 'rounded-[6px]', 'text-xs', 'leading-4', 'font-medium',
    'focus-visible:outline-2', 'focus-visible:outline-accent/35', 'disabled:opacity-50', 'pointer-coarse:min-h-11']) assert.ok(action.includes(cls), cls);
  assert.ok(!action.includes('bg-accent'), 'not the accent fill');
  const rowClass = row.match(/export const ROW_CLASS = '([^']+)'/)[1].split(' ');
  for (const cls of ['border-t', 'border-line', 'bg-side', 'hover:bg-hover', 'px-4', 'py-3.5', 'gap-3']) assert.ok(rowClass.includes(cls), cls);
  assert.match(row, /text-\[11px\] leading-\[14px\] text-ink-2/, 'the relationship label');
  assert.match(row, /text-\[13px\] leading-\[18px\] font-medium/, 'the destination');
  assert.match(row, /<ArrowDownRight \{\.\.\.ICON\} \/>/); assert.match(row, /<ArrowRight \{\.\.\.ICON\} \/>/);
  assert.match(row, /const ICON = \{ size: 14, strokeWidth: 1\.8/);
  // Every Enter and Open on a card, a group and in Search uses it.
  for (const file of ['CanvasRefChips.jsx', 'CanvasRefCard.jsx', 'CanvasSearchPanel.jsx', 'AdaptiveCanvas.jsx']) assert.match(read(file), /from '\.\/DestinationRow\.jsx'/, file);
  for (const theme of ['light', 'dark']) for (const bg of [token(theme, '--color-primary-fill'), token(theme, '--color-primary-fill-hover')]) assert.ok(ratio('#ffffff', bg) >= 4.5, `${theme} ${bg}`);
});
