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
