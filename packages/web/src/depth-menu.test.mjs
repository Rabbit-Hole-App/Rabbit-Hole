// The Chat composer's Depth control shows an icon scale instead of a word (owner 2026-11-07): one, two or three signal bars, coloured by level; the popover
// menu stays. Markup only, no browser.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const tmp = mkdtempSync(join(tmpdir(), 'depth-menu-'));
after(() => rmSync(tmp, { recursive: true, force: true }));
const outfile = join(tmp, 'bundle.cjs');
await esbuild.build({
  stdin: { contents: "export { default as DepthMenu, LEVEL_MARK } from './DepthMenu.jsx'; export { createElement } from 'react'; export { renderToStaticMarkup } from 'react-dom/server';", resolveDir: fileURLToPath(new URL('.', import.meta.url)), loader: 'jsx' },
  bundle: true, outfile, format: 'cjs', platform: 'node', jsx: 'automatic', logLevel: 'silent',
  plugins: [{ name: 'asset-url-stub', setup(build) { build.onResolve({ filter: /[?](url|raw|worker)$/ }, args => ({ path: args.path, namespace: 'asset-stub' })); build.onLoad({ filter: /.*/, namespace: 'asset-stub' }, () => ({ contents: 'export default ""', loader: 'js' })); } }],
  loader: { '.css': 'empty', '.woff2': 'empty', '.woff': 'empty', '.ttf': 'empty', '.svg': 'empty', '.png': 'empty', '.wasm': 'empty', '.py': 'text', '.md': 'text', '.txt': 'text', '.html': 'text' },
});
const lib = createRequire(import.meta.url)(outfile);
const render = depth => lib.renderToStaticMarkup(lib.createElement(lib.DepthMenu, { settings: { depth, status: 'ready', saveStatus: 'ready', set() {}, retry() {} } }));

test('the trigger is an icon for each level, never the word; the name stays in the accessible name and tooltip', () => {
  const rows = [['brief', 'Brief', 'text-claude/45', 'lucide-signal-low'], ['balanced', 'Balanced', 'text-claude', 'lucide-signal-medium'], ['detailed', 'Detailed', 'text-claude-deep', 'lucide-signal-high']];
  const seen = new Set();
  for (const [id, label, color, shape] of rows) {
    const markup = render(id);
    assert.match(markup, new RegExp('aria-label="Depth: ' + label + '"'), id + ' aria-label');
    assert.match(markup, new RegExp('title="Depth: ' + label + '"'), id + ' tooltip');
    assert.ok(markup.includes('data-depth-icon="' + id + '"') && markup.includes(color), id + ' icon and colour');
    assert.ok(markup.includes(shape), id + ' uses its own bar count (' + shape + ')');
    assert.ok(!new RegExp('>' + label + '<').test(markup), id + ': the word is not drawn on the button');
    seen.add(markup.match(/lucide-signal-[a-z]+/)[0]);
  }
  assert.equal(seen.size, 3, 'three different shapes, so colour is never the only cue');
});

test('the menu keeps its three radio options with their words, hints and the same level marks', async () => {
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(new URL('./DepthMenu.jsx', import.meta.url), 'utf8');
  assert.ok(source.includes('role="menuitemradio"') && source.includes('data-depth-option={id}'));
  assert.ok(source.includes("LEVEL_MARK[id] || LEVEL_MARK.balanced"), 'each option shows its level mark');
  assert.deepEqual(Object.keys(lib.LEVEL_MARK), ['brief', 'balanced', 'detailed']);
});
