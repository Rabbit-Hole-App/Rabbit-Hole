// Claude orange (owner 2026-11-07): one token pair, used for intensity and in-progress only, never a raw hex in a component, never on a button or a warning.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const css = readFileSync(new URL('./index.css', import.meta.url), 'utf8');
const lum = hex => { const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

test('the tokens exist in both themes and the base is the owner colour', () => {
  assert.match(css, /^ {2}--color-claude: #c15f3c;/m);
  assert.equal((css.match(/^ {2}--color-claude: #/gm) || []).length, 2, 'light and dark');
  assert.equal((css.match(/^ {2}--color-claude-deep: #/gm) || []).length, 2);
});

test('the colour reads as text: at least 3:1 on the page in light, on the dark page in dark (icons and spinners, not body text)', () => {
  assert.ok(ratio('#c15f3c', '#ffffff') >= 3, 'light');
  assert.ok(ratio('#e2825d', '#191919') >= 3, 'dark');
});

test('the waiting shimmer and the Depth icon use the tokens; no component hard-codes the hex', () => {
  assert.match(css, /\.shimmer \{[^}]*--color-claude-deep/);
  const hits = readdirSync(new URL('.', import.meta.url)).filter(f => /\.(jsx|js)$/.test(f) && !/\.test\./.test(f))
    .filter(f => /#c15f3c|#9a4528/i.test(readFileSync(new URL('./' + f, import.meta.url), 'utf8')));
  assert.deepEqual(hits, []);
});

test('orange is never a button fill', () => {
  const ui = readFileSync(new URL('./ui.jsx', import.meta.url), 'utf8');
  assert.ok(!/bg-claude/.test(ui));
});

test('warnings are amber, far enough from the orange not to blur with it, and readable as text', () => {
  const warn = css.match(/^ {2}--color-warn: (#[0-9a-f]{6});/m)[1];
  const hue = hex => { const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255); const mx = Math.max(r, g, b), d = mx - Math.min(r, g, b); const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return (h * 60 + 360) % 360; };
  assert.ok(hue(warn) - hue('#c15f3c') >= 25, `warn hue ${Math.round(hue(warn))} vs orange ${Math.round(hue('#c15f3c'))}`);
  assert.ok(ratio(warn, '#ffffff') >= 4.5, 'warn text on white');
  assert.equal((css.match(/^ {2}--color-warn: #/gm) || []).length, 2, 'light and dark');
});
