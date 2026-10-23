// PaidConfirm (brief section 3, clarification 9; contract "PaidConfirm prompt"): the exact prompt it asks about, and Cancel /
// Generate drawn from semantic tokens that read in both themes. Rendered with react-dom/server after an esbuild bundle (as
// answer-footer.test.mjs does); the token pairs are resolved from index.css as text-contrast.test.mjs resolves them.
// The painted colours, hover/focus/pressed included, are checked in a browser by e2e/paid-confirm-theme-check.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const dir = mkdtempSync(join(tmpdir(), 'paid-confirm-')), outfile = join(dir, 'paid.cjs');
await esbuild.build({
  stdin: { contents: "export { default as PaidConfirm } from './PaidConfirm.jsx'; export { createElement } from 'react'; export { renderToStaticMarkup } from 'react-dom/server';", resolveDir: fileURLToPath(new URL('.', import.meta.url)), loader: 'jsx' },
  bundle: true, outfile, format: 'cjs', platform: 'node', jsx: 'automatic', logLevel: 'silent', loader: { '.png': 'empty', '.svg': 'empty', '.css': 'empty' },
});
const B = createRequire(import.meta.url)(outfile);
rmSync(dir, { recursive: true, force: true });
const render = props => B.renderToStaticMarkup(B.createElement(B.PaidConfirm, { onGenerate: () => {}, onCancel: () => {}, ...props }));
const classOf = (html, attr) => html.match(new RegExp(`<button[^>]*${attr}[^>]*>`))?.[0].match(/class="([^"]*)"/)?.[1].split(' ') || [];

test('a prompt is shown exactly, above the message; none without one', () => {
  const prompt = '/3d a 40 mm bracket\n  with <two> holes & "slots"';
  const html = render({ prompt, message: 'Generate this CAD model?' });
  const shown = html.match(/<p data-paid-prompt[^>]*>([\s\S]*?)<\/p>/);
  assert.ok(shown, 'data-paid-prompt is rendered');
  const text = shown[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, '&');
  assert.equal(text, prompt);
  assert.match(shown[0], /whitespace-pre-wrap/); // its line breaks and spaces survive
  assert.match(shown[0], /max-h-16[^"]*overflow-y-auto|overflow-y-auto[^"]*max-h-16/); // a long prompt scrolls in a bounded box
  assert.ok(html.indexOf('data-paid-prompt') < html.indexOf('Generate this CAD model?'));
  assert.doesNotMatch(render({}), /data-paid-prompt/);
  assert.doesNotMatch(render({ prompt: '' }), /data-paid-prompt/);
});

// Owner brief 2026-10-23: the CAD confirmation shows a compact `cad` pill and the prompt, not the printed /cad.
test('a /cad line shows as a display-only cad pill plus the prompt; the line is kept and nothing generates', () => {
  let generated = 0;
  const line = '/cad a 100 mm cube';
  const html = render({ prompt: line, message: 'Generate this CAD model?', onGenerate: () => { generated++; } });
  const pill = html.match(/<span data-command-pill="cad"[^>]*>([\s\S]*?)<\/span><\/span>/);
  assert.ok(pill, 'a cad pill is rendered');
  assert.match(pill[0], /aria-label="cad command"/);
  assert.equal(pill[1].replace(/<[^>]+>/g, ''), 'cad'); // lowercase, no slash, no brackets
  assert.match(html, /<span data-paid-prompt-text="true">a 100 mm cube<\/span>/);
  assert.ok(html.indexOf('data-command-pill') < html.indexOf('data-paid-prompt-text'), 'pill, then the prompt, inline');
  assert.doesNotMatch(html.replace(/<[^>]+>/g, ' '), /\/cad/); // no literal /cad visible
  assert.match(html, /data-paid-command="\/cad a 100 mm cube"/); // the command line is kept
  const promptBox = html.match(/<p data-paid-prompt[\s\S]*?<\/p>/)[0];
  assert.doesNotMatch(promptBox, /<button|tabindex|onclick/i); // display only: no action, no tab stop
  assert.equal(generated, 0);
  assert.equal(render({ prompt: '/cad' }).includes('data-command-pill'), false); // only a /cad line with a prompt
});

test('Cancel and Generate are the secondary and inverse Buttons: token classes, never white-on-something', () => {
  const html = render({});
  const cancel = classOf(html, 'data-paid-cancel'), generate = classOf(html, 'data-paid-generate');
  for (const name of ['bg-surface', 'text-ink', 'border-line-strong', 'hover:bg-hover', 'active:bg-active']) assert.ok(cancel.includes(name), `Cancel has ${name}`);
  for (const name of ['bg-ink', 'text-surface', 'hover:bg-ink/85', 'active:bg-ink/75']) assert.ok(generate.includes(name), `Generate has ${name}`);
  for (const button of [cancel, generate]) {
    assert.ok(button.some(name => name.startsWith('focus-visible:outline')), 'a visible keyboard focus');
    assert.ok(button.includes('disabled:opacity-50'), 'a disabled state');
    assert.ok(!button.some(name => /(^|:)(bg|text)-white\b/.test(name)), `${button.join(' ')}: --color-white is re-pinned inside blue fills in dark`);
  }
  for (const attr of ['data-paid-cancel', 'data-paid-generate']) // inside the composer's form, a click must not submit it
    assert.match(html.match(new RegExp(`<button[^>]*${attr}[^>]*>`))[0], /type="button"/);
});

// Tokens, light (:root / @theme) and dark (.dark), from index.css.
const css = readFileSync(new URL('./index.css', import.meta.url), 'utf8');
const darkStart = css.indexOf('.dark {');
const BLOCKS = { light: css.slice(0, darkStart), dark: css.slice(darkStart, css.indexOf('}', darkStart)) };
const declared = (block, name) => block.match(new RegExp(`^\\s*${name}\\s*:\\s*(#[0-9a-fA-F]{6})\\s*;`, 'm'))?.[1];
const token = (theme, name) => {
  const hex = (theme === 'dark' && declared(BLOCKS.dark, name)) || declared(BLOCKS.light, name);
  assert.ok(hex, `${name} is defined for ${theme}`);
  return [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
};
const over = (top, percent, under) => top.map((c, i) => c * percent / 100 + under[i] * (1 - percent / 100));
const luminance = channels => { const [r, g, b] = channels.map(c => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a, b) => { const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (high + 0.05) / (low + 0.05); };

test('--color-surface is defined in both themes, and every Cancel / Generate state clears 4.5:1 on the slash notice', () => {
  for (const theme of ['light', 'dark']) {
    const surface = token(theme, '--color-surface'), ink = token(theme, '--color-ink');
    const notice = over(token(theme, '--color-accent'), 7, surface); // LearnSlash's bg-accent/[0.07] over the page
    const pairs = {
      'Cancel at rest': [ink, surface], 'Cancel hovered': [ink, token(theme, '--color-hover')], 'Cancel pressed': [ink, token(theme, '--color-active')],
      'Generate at rest': [surface, ink], 'Generate hovered': [surface, over(ink, 85, notice)], 'Generate pressed': [surface, over(ink, 75, notice)],
      'the prompt': [ink, surface],
    };
    for (const [name, [text, fill]] of Object.entries(pairs)) assert.ok(contrast(text, fill) >= 4.5, `${theme}: ${name} ${contrast(text, fill).toFixed(2)}:1`);
    assert.ok(contrast(ink, surface) >= 3, `${theme}: Generate's fill stands apart from Cancel's`);
  }
});
