// The red Stop and danger Button (owner 2026-11-07): white text on the fill clears the 4.5:1 small-text floor in both themes, at rest and
// hovered (white on --color-danger #eb5757 was 3.5:1), and every running-state Stop is that one Button with the Square icon.
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

test('white on the danger fill and on its hover clears 4.5:1 in light and dark, and the hover is darker', () => {
  for (const theme of ['light', 'dark']) {
    const fill = token(theme, '--color-danger-fill'), hover = token(theme, '--color-danger-fill-hover');
    assert.match(fill, /^#[0-9a-f]{6}$/i, `${theme} fill`); assert.match(hover, /^#[0-9a-f]{6}$/i, `${theme} hover`);
    assert.ok(lum(hover) < lum(fill), `${theme}: the hover ${hover} is darker than the fill ${fill}`);
    for (const [name, bg] of [['rest', fill], ['hover', hover]]) assert.ok(ratio('#ffffff', bg) >= 4.5, `${theme} ${name} ${bg}: ${ratio('#ffffff', bg).toFixed(2)}:1`);
  }
  assert.ok(ratio('#ffffff', token('light', '--color-danger')) < 4.5, 'the plain danger red stays a text and border colour (it is under the floor as a fill)');
});

test('the danger Button uses the fill, a solid darker hover and press, and white text stays white on it in dark', () => {
  const ui = read('ui.jsx');
  assert.match(ui, /variant === 'danger' && 'bg-danger-fill text-white hover:bg-danger-fill-hover active:bg-danger-fill-hover'/);
  assert.match(css, /\.dark \[class\*='bg-danger'\][^{]*\{\n\s+--color-white: #ffffff;/);
});

test('every running-state Stop is the danger Button with the Square icon; no hand-drawn red Stop is left', () => {
  const stops = [
    ['GenerationProposalCard.jsx', /<Button ref=\{primary\} type="button" variant="danger" size="sm" data-proposal-stop[\s\S]{0,900}<Square size=\{14\}/],
    ['ExplainPending.jsx', /<Button type="button" variant="danger" data-explain-stop[\s\S]{0,120}<Square size=\{14\}/],
    ['Animation3DCard.jsx', /<Button type="button" variant="danger" data-animation-stop[\s\S]{0,120}<Square size=\{14\}/],
    ['LearningBlocks.jsx', /<Button ref=\{stopButton\} type="button" variant="danger" data-stop-video[\s\S]{0,120}<Square size=\{14\}/],
    ['CadCard.jsx', /<Button type="button" variant="danger" data-cad-action="cancel"[\s\S]{0,120}<Square size=\{14\}/],
  ];
  for (const [file, pattern] of stops) assert.match(read(file), pattern, file);
  for (const file of ['ExplainPending.jsx', 'Animation3DCard.jsx', 'LearningBlocks.jsx', 'CadCard.jsx']) assert.doesNotMatch(read(file), /<button[^>]*bg-danger/, `${file}: a hand-drawn red button`);
  // A paused CAD job waiting for an answer keeps its plain Cancel: it is not running, so there is nothing to stop.
  assert.match(read('CadCard.jsx'), /!running && state==='waiting_for_answer' && <button data-cad-action="cancel"/);
});

test('the Stops that end a model answer or job are red too: the composer and Ctrl+K round Stops, the voice Stop, and the source-adding Stop', () => {
  for (const [file, pattern] of [
    ['ChatComposer.jsx', /aria-label="Stop"[^>]*className=\{`[^`]*bg-danger-fill text-white hover:bg-danger-fill-hover[^`]*`\}>\s*<Square/],
    ['InlineAiEditor.jsx', /data-inline-stop[\s\S]{0,200}className="[^"]*bg-danger-fill text-white[^"]*"><Square/],
    ['VoiceMode.jsx', /<Button type="button" variant="danger" size="sm" aria-label=\{voice\.state === 'speaking' \? 'Stop speaking' : 'Stop the Tutor'\}[\s\S]{0,260}<Square/],
    ['agent/StartHost.jsx', /<Button size="sm" variant="danger" onClick=\{\(\) => startJob\.stop\(\)\}><Square/],
  ]) assert.match(read(file), pattern, file);
  // Recording stops (sketch, voice note) end a capture, not a generation: they keep the neutral control, and the run pill in the app list is not a model job.
  for (const file of ['SketchRecorder.jsx', 'VoiceNote.jsx']) assert.doesNotMatch(read(file), /bg-danger/, file);
});
