// Ask about selection: the Capturing label shimmers on the canvas and a Capturing pill shows in the Chat composer while the picture is
// made (owner 2026-11-07). Markup and state only, no browser.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const here = fileURLToPath(new URL('.', import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'area-capturing-'));
after(() => rmSync(tmp, { recursive: true, force: true }));
const outfile = join(tmp, 'bundle.cjs');
await esbuild.build({
  stdin: { contents: "export * from './AreaCapturing.jsx'; export { createElement } from 'react'; export { renderToStaticMarkup } from 'react-dom/server';", resolveDir: here, loader: 'jsx' },
  bundle: true, outfile, format: 'cjs', platform: 'node', jsx: 'automatic', logLevel: 'silent',
});
const lib = createRequire(import.meta.url)(outfile);
const label = () => lib.renderToStaticMarkup(lib.createElement('svg', null, lib.createElement(lib.CapturingLabel, { x: 4, y: 9, size: 12 })));

test('the canvas label sweeps a gradient in Claude orange; the text stays Capturing', () => {
  const markup = label();
  assert.match(markup, /<text[^>]*data-area-capturing-label[^>]*fill="url\(#area-capturing-sweep\)"[^>]*>Capturing<\/text>/);
  assert.ok(markup.includes('<animate attributeName="x1"') && markup.includes('<animate attributeName="x2"'), 'the band moves');
  assert.ok(markup.includes('var(--color-claude)') && markup.includes('var(--color-claude-deep)'), 'the orange tokens');
  assert.ok(!markup.includes('#dc2626'), 'no longer the rectangle red');
});

test('under reduced motion the label is one static orange: no animation', () => {
  const saved = [globalThis.window, globalThis.document];
  globalThis.window = { matchMedia: () => ({ matches: true }) };
  globalThis.document = { documentElement: { hasAttribute: () => false } };
  try {
    const markup = label();
    assert.ok(!markup.includes('<animate'), 'no sweep');
    assert.match(markup, /fill="var\(--color-claude\)"/);
  } finally { [globalThis.window, globalThis.document] = saved; if (saved[0] === undefined) delete globalThis.window; if (saved[1] === undefined) delete globalThis.document; }
});

test('the Chat pill is a shimmering Capturing chip with no remove button; it follows a count of captures in flight', () => {
  const pill = lib.renderToStaticMarkup(lib.createElement(lib.CapturingPillView));
  assert.match(pill, /<li[^>]*data-area-capturing[^>]*>/);
  assert.ok(pill.includes('<span class="shimmer">Capturing</span>'));
  assert.ok(!pill.includes('<button'), 'the capture cannot be abandoned, so the pill has no x');
  let calls = 0;
  const stop = lib.subscribeAreaCapture(() => { calls++; });
  assert.equal(lib.areaCapturing(), false);
  lib.beginAreaCapture();
  lib.beginAreaCapture(); // a later crop starts before the first ends
  assert.equal(lib.areaCapturing(), true);
  lib.endAreaCapture();
  assert.equal(lib.areaCapturing(), true, 'one capture is still running');
  lib.endAreaCapture();
  assert.equal(lib.areaCapturing(), false, 'the pill goes when the last capture ends, picture or failure');
  lib.endAreaCapture();
  assert.equal(lib.areaCapturing(), false, 'an extra end never goes negative');
  assert.equal(calls, 5);
  stop();
});

test('the canvas begins before the picture is made and always ends (finally), and the composer mounts the pill', () => {
  const canvas = readFileSync(join(here, 'AdaptiveCanvas.jsx'), 'utf8');
  assert.match(canvas, /beginAreaCapture\(\); requestAnimationFrame\(\(\) => askArea\(rect\)\.finally\(\(\) => \{ endAreaCapture\(\); setAreaMarquee\(null\); \}\)\);/);
  assert.ok(canvas.includes('<CapturingLabel'));
  assert.ok(!/fill="#dc2626"[^>]*>Capturing/.test(canvas), 'no hand-drawn red Capturing text left');
  assert.ok(readFileSync(join(here, 'ContextChips.jsx'), 'utf8').includes('<AreaCapturingPill />'));
});
