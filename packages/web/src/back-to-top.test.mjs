// Inside a Rabbit Hole, an icon-only back arrow left of the canvas title goes to the top surface (owner 2026-11-07). Markup and source checks, no browser.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const tmp = mkdtempSync(join(tmpdir(), 'back-top-'));
after(() => rmSync(tmp, { recursive: true, force: true }));
const outfile = join(tmp, 'bundle.cjs');
await esbuild.build({
  stdin: { contents: "export { BackToTop } from './Dive.jsx'; export { createElement } from 'react'; export { renderToStaticMarkup } from 'react-dom/server';", resolveDir: fileURLToPath(new URL('.', import.meta.url)), loader: 'jsx' },
  bundle: true, outfile, format: 'cjs', platform: 'node', jsx: 'automatic', logLevel: 'silent',
  plugins: [{ name: 'asset-url-stub', setup(build) { build.onResolve({ filter: /[?](url|raw|worker)$/ }, args => ({ path: args.path, namespace: 'asset-stub' })); build.onLoad({ filter: /.*/, namespace: 'asset-stub' }, () => ({ contents: 'export default ""', loader: 'js' })); } }],
  loader: { '.css': 'empty', '.woff2': 'empty', '.svg': 'empty', '.png': 'empty', '.wasm': 'empty', '.md': 'text', '.py': 'text', '.txt': 'text', '.html': 'text' },
});
const lib = createRequire(import.meta.url)(outfile);
const render = tree => lib.renderToStaticMarkup(lib.createElement(lib.BackToTop, { tree, climb: () => {} }));
const level = (app, title) => ({ app, board: 'main', title });

test('the arrow shows only inside a hole, labelled with the top surface title, icon only', () => {
  const markup = render({ path: [level('a', 'Physics'), level('b', 'Orbits'), level('c', 'Kepler')] });
  assert.match(markup, /aria-label="Back to Physics"/);
  assert.match(markup, /title="Back to Physics"/);
  assert.match(markup, /data-dive-top/);
  assert.match(markup, /lucide-arrow-left/);
  assert.ok(!/>Back to Physics</.test(markup), 'no visible text');
  assert.match(markup, /h-8 w-8 shrink-0/, '32 px and it never shrinks, so the title truncates instead');
});

test('nothing on the top surface or without a tree', () => {
  assert.equal(render({ path: [level('a', 'Physics')] }), '');
  assert.equal(render(null), '');
  assert.equal(render(undefined), '');
});

test('a click climbs to the root through the given climb (index 0)', () => {
  const calls = [];
  const element = lib.BackToTop({ tree: { path: [level('a', 'A'), level('b', 'B')] }, climb: index => calls.push(index) });
  element.props.onClick();
  assert.deepEqual(calls, [0]);
});

test('both pages mount it left of the title with their own climb', () => {
  const read = name => readFileSync(new URL('./' + name, import.meta.url), 'utf8');
  const learn = read('LearnPage.jsx'), shared = read('SharedBoardPage.jsx');
  assert.match(learn, /data-title-crumbs[^\n]*\n\s*<BackToTop tree=\{dive\.navigator\.tree\} climb=\{dive\.navigator\.climb\} \/>/);
  assert.match(shared, /SHARED_TITLE_ROW\}>\s*\n\s*\{holes && <BackToTop tree=\{holes\.tree\} climb=\{index => goTo\(holes\.tree\.path\[index\]\.href\)\} \/>\}/);
});
