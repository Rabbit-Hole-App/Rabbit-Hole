// Go to plan (owner 2026-11-07): ONE icon-only template (GoToPlanButton.jsx) and ONE lookup (explain-client.js findPlanCard / revealPlan) serve every canvas skeleton: Explain,
// Animation, Whiteboard and the /cad brief. Markup and doubles only, no browser.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { parseHTML } from 'linkedom';

const dir = fileURLToPath(new URL('.', import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'go-to-plan-'));
after(() => rmSync(tmp, { recursive: true, force: true }));
const outfile = join(tmp, 'bundle.cjs');
await esbuild.build({
  stdin: { contents: "export { default as GoToPlanButton } from './GoToPlanButton.jsx'; export { findPlanCard, revealPlan, PLAN_GONE, PLAN_NOT_OPENED } from './explain-client.js'; export { createElement } from 'react'; export { renderToStaticMarkup } from 'react-dom/server';", resolveDir: dir, loader: 'jsx' },
  bundle: true, outfile, format: 'cjs', platform: 'node', jsx: 'automatic', logLevel: 'silent',
  plugins: [{ name: 'asset-url-stub', setup(build) { build.onResolve({ filter: /[?](url|raw|worker)$/ }, args => ({ path: args.path, namespace: 'asset-stub' })); build.onLoad({ filter: /.*/, namespace: 'asset-stub' }, () => ({ contents: 'export default ""', loader: 'js' })); } }],
  loader: { '.css': 'empty', '.woff2': 'empty', '.svg': 'empty', '.png': 'empty', '.wasm': 'empty', '.py': 'text', '.md': 'text', '.txt': 'text', '.html': 'text' },
});
const lib = createRequire(import.meta.url)(outfile);
const render = props => lib.renderToStaticMarkup(lib.createElement(lib.GoToPlanButton, props));

test('the template is an icon-only button that shows only while the plan awaits Generate', () => {
  const ok = render({ stage: 'awaiting_approval', threadId: '12', jobId: 'job-1', 'data-explain-go-to-plan': true });
  assert.match(ok, /aria-label="Go to plan"/);
  assert.match(ok, /title="Go to plan"/);
  assert.match(ok, /data-explain-go-to-plan/, 'the Explain selector rides through');
  assert.match(ok, /lucide-message-square-text/);
  assert.match(ok, /h-8 w-8/, '32 px square');
  assert.ok(!/>Go to plan</.test(ok), 'no visible text');
  for (const stage of ['planning', 'generating', 'rendering', 'ready', 'failed', 'cancelled', undefined]) assert.equal(render({ stage, threadId: '12', jobId: 'job-1' }), '', 'hidden at ' + stage);
  assert.equal(render({ stage: 'awaiting_approval', threadId: '12', jobId: 'job-1', readOnly: true }), '', 'a read-only canvas has no Go to plan');
  assert.equal(render({ stage: 'awaiting_approval', jobId: 'job-1' }), '', 'a thread plan needs its thread');
  assert.equal(render({ stage: 'awaiting_approval', threadId: '12' }), '', 'nothing to find without an id');
  assert.match(render({ stage: 'awaiting_approval', jobId: 'job-1', threadless: true }), /data-go-to-plan/, 'the /cad brief needs no thread');
  assert.match(render({ stage: 'awaiting_approval', threadId: '12', proposalId: 'p-1' }), /data-go-to-plan/, 'a proposal id is enough');
});

const chat = html => parseHTML('<html><body>' + html + '</body></html>').document;

test('the lookup finds the plan card by job id (Explain, Animation, Whiteboard), by the /cad review, or by proposal id; nothing matching is null', () => {
  const doc = chat('<section data-generation-proposal="explain" data-proposal-id="p-1" data-proposal-job="job-1"></section><section data-generation-proposal="animation" data-proposal-id="p-2" data-proposal-job="job-2"></section><div data-cad-review="cad-9"></div>');
  assert.equal(lib.findPlanCard(doc, { jobId: 'job-2' }).getAttribute('data-proposal-id'), 'p-2');
  assert.equal(lib.findPlanCard(doc, { proposalId: 'p-1' }).getAttribute('data-proposal-job'), 'job-1');
  assert.equal(lib.findPlanCard(doc, { jobId: 'cad-9' }).getAttribute('data-cad-review'), 'cad-9');
  assert.equal(lib.findPlanCard(doc, { jobId: 'nope' }), null);
  assert.equal(lib.findPlanCard(doc, {}), null);
  assert.equal(lib.findPlanCard(doc, { jobId: 'a"] , [x' }), null, 'a hostile id is quoted, not injected');
});

const card = () => { const calls = []; return { calls, root: { querySelector: () => ({ scrollIntoView: options => calls.push(options) }) } }; };

test('revealPlan (a): another chat is open, so the plan thread opens, then the card is scrolled to', async () => {
  const { calls, root } = card(), opened = [];
  const result = await lib.revealPlan({ threadId: '7', jobId: 'job-1' }, { currentId: '99', open: async id => { opened.push(id); }, root, delay: 0 });
  assert.equal(result, 'found'); assert.deepEqual(opened, ['7']); assert.equal(calls.length, 1);
});

test('revealPlan: the plan thread is already open, so it is not reopened', async () => {
  const { root } = card(); let opened = 0;
  assert.equal(await lib.revealPlan({ threadId: '7', jobId: 'job-1' }, { currentId: '7', open: async () => { opened++; }, root, delay: 0 }), 'found');
  assert.equal(opened, 0);
});

test('revealPlan (b): the chat was deleted (404) is thread-missing with no scroll; another failure is failed', async () => {
  const { calls, root } = card();
  assert.equal(await lib.revealPlan({ threadId: '7', jobId: 'job-1' }, { currentId: null, open: async () => { throw Object.assign(new Error('no such thread'), { status: 404 }); }, root, delay: 0 }), 'thread-missing');
  assert.equal(await lib.revealPlan({ threadId: '7', jobId: 'job-1' }, { currentId: null, open: async () => { throw new Error('offline'); }, root, delay: 0 }), 'failed');
  assert.equal(calls.length, 0);
});

test('revealPlan (b): the thread opens but the plan card is not in it, so card-missing after the retries', async () => {
  let looks = 0;
  const counted = { querySelector: () => { looks++; return null; } };
  assert.equal(await lib.revealPlan({ threadId: '7', jobId: 'job-1' }, { currentId: '7', open: async () => {}, root: counted, delay: 0, tries: 3 }), 'card-missing');
  assert.equal(looks, 3);
});

test('revealPlan (c): a card drawn after the thread loads is still found', async () => {
  let n = 0; const calls = [];
  const root = { querySelector: () => (++n < 4 ? null : { scrollIntoView: options => calls.push(options) }) };
  assert.equal(await lib.revealPlan({ threadId: '7', jobId: 'job-1' }, { currentId: '7', open: async () => {}, root, delay: 0 }), 'found');
  assert.equal(calls[0].block, 'nearest');
});

test('the Chat workspace toasts a plan that is gone and a chat that would not open', () => {
  const source = readFileSync(join(dir, 'chat-workspace.jsx'), 'utf8');
  assert.match(source, /revealPlan\(detail/);
  assert.match(source, /'thread-missing' \|\| result === 'card-missing'\) toast\(PLAN_GONE\)/);
  assert.match(source, /result === 'failed'\) toast\(PLAN_NOT_OPENED\)/);
  assert.equal(lib.PLAN_GONE, 'That plan is no longer in a chat.');
});

test('every skeleton uses the template: no card draws its own Go to plan or sends the event itself', () => {
  const offenders = [], users = ['ExplainPending.jsx', 'Animation3DCard.jsx', 'WhiteboardVideoCard.jsx', 'CadCard.jsx'];
  for (const file of readdirSync(dir).filter(f => /\.(jsx|js)$/.test(f) && !/\.test\./.test(f) && f !== 'GoToPlanButton.jsx' && f !== 'explain-client.js')) {
    const text = readFileSync(join(dir, file), 'utf8');
    if (/>\s*Go to plan\s*</.test(text) || /showPlanInChat\s*\(/.test(text)) offenders.push(file);
  }
  assert.deepEqual(offenders, []);
  for (const file of users) assert.match(readFileSync(join(dir, file), 'utf8'), /<GoToPlanButton /, file + ' uses the template');
  assert.match(readFileSync(join(dir, 'ExplainPending.jsx'), 'utf8'), /<GoToPlanButton [^>]*data-explain-go-to-plan/);
});
