// SEL.01: the Chat's selection chips. A repository code selection renders with NO canvas selection (the released crash read
// selection.uploading for it), and only an area chip shows Uploading, only while its own upload runs. Real renderer (SSR), no browser.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const here = fileURLToPath(new URL('.', import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'selection-chips-'));
after(() => rmSync(tmp, { recursive: true, force: true }));
const outfile = join(tmp, 'bundle.cjs');
await esbuild.build({
  stdin: { contents: "export { default as ContextChips } from './ContextChips.jsx'; export { ChatWorkspace } from './chat-workspace.jsx'; export { createElement } from 'react'; export { renderToStaticMarkup } from 'react-dom/server';", resolveDir: here, loader: 'jsx' },
  bundle: true, outfile, format: 'cjs', platform: 'node', jsx: 'automatic', logLevel: 'silent',
  plugins: [{ name: 'asset-url-stub', setup(build) { build.onResolve({ filter: /[?](url|raw|worker)$/ }, args => ({ path: args.path, namespace: 'asset-stub' })); build.onLoad({ filter: /.*/, namespace: 'asset-stub' }, () => ({ contents: 'export default ""', loader: 'js' })); } }],
  loader: { '.css': 'empty', '.woff2': 'empty', '.woff': 'empty', '.ttf': 'empty', '.svg': 'empty', '.png': 'empty', '.wasm': 'empty', '.py': 'text', '.md': 'text', '.txt': 'text', '.html': 'text' },
});
const lib = createRequire(import.meta.url)(outfile);

const workspace = () => ({ context: { attached: [], items: [], detach() {} }, canvasOps: null, panels: {}, openSource() {}, composer: { text: '', focus() {} } });
const render = props => lib.renderToStaticMarkup(lib.createElement(lib.ChatWorkspace.Provider, { value: workspace() }, lib.createElement(lib.ContextChips, props)));
const codeRef = { sourceId: 'repo:code:1', kind: 'code', name: 'app.py', version: 'c1', range: { start: 3, end: 9 } };
const code = { temporary: [codeRef], left: [], selected: [codeRef], onRemove() {} };
const area = (extra = {}) => ({ id: 'area:1', kind: 'Area', title: 'Area 1', card: false, preview: 'data:image/png;base64,AAAA', onClear() {}, ...extra });

test('a repository code selection renders with no canvas selection (the released crash)', () => {
  const html = render({ selection: null, code });
  assert.match(html, /data-code-selection/);
  assert.match(html, /app\.py/);
  assert.doesNotMatch(html, /Uploading/);
});

test('a code chip beside an area that is uploading: the area says Uploading, the code chip still says selected', () => {
  const html = render({ selection: area({ uploading: true }), code });
  assert.equal((html.match(/data-area-uploading/g) || []).length, 1, 'only the area chip');
  const codeChip = html.slice(html.indexOf('data-code-selection'), html.indexOf('</li>', html.indexOf('data-code-selection')));
  assert.doesNotMatch(codeChip, /Uploading/);
  assert.match(codeChip, /selected/);
});

test('the area chip says Uploading until its own upload resolves, then selected', () => {
  assert.match(render({ selection: area({ uploading: true }) }), /data-area-uploading[^>]*>Uploading</);
  const done = render({ selection: area({ uploading: false, image: 'img-1' }) });
  assert.doesNotMatch(done, /Uploading/);
  assert.match(done, /· selected/);
});

test('a stale uploading flag on a non-area selection never shows Uploading', () => {
  assert.doesNotMatch(render({ selection: { id: 'card-1', kind: 'Card', title: 'Notes', card: true, onClear() {}, uploading: true } }), /Uploading/);
});

test('uploading is read only in the area chip renderer (source pin)', () => {
  const source = readFileSync(join(here, 'ContextChips.jsx'), 'utf8');
  const codeChip = source.slice(source.indexOf('const codeChip'), source.indexOf('// hideDocs'));
  assert.ok(!/uploading/.test(codeChip), 'the code chip does not read the area upload flag');
  assert.equal((source.match(/selection\.uploading/g) || []).length, 1);
});
