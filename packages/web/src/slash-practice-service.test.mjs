// Owner 2026-11-05: View > Slash Commands' /practice example shows the CURRENT Practice card (attempts, Your answer and Tutor feedback),
// on a local canned store (slash-practice-service.js), never the legacy card. LearningBlocks is bundled with esbuild and rendered with
// react-dom/server; nothing is sent, saved, read or graded.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { practiceService } from './slash-practice-service.js';
import { PREVIEWS, previewBlock } from './slash-sheet.js';
import { serviceView } from './explain-back-view.js';

const dir = mkdtempSync(join(tmpdir(), 'slash-practice-')), outfile = join(dir, 'card.cjs');
await esbuild.build({
  stdin: { contents: "export { LearningBlockBody } from './LearningBlocks.jsx'; export { ExplainBackService } from './ExplainBackPanel.jsx'; export { createElement } from 'react'; export { renderToStaticMarkup } from 'react-dom/server';", resolveDir: fileURLToPath(new URL('.', import.meta.url)), loader: 'jsx' },
  bundle: true, outfile, format: 'cjs', platform: 'node', jsx: 'automatic', logLevel: 'error',
  loader: { '.png': 'empty', '.svg': 'empty', '.css': 'empty', '.wasm': 'empty', '.woff2': 'empty', '.ttf': 'empty' },
  plugins: [{ name: 'stubs', setup(build) {
    build.onResolve({ filter: /\?(url|raw|worker)$/ }, args => ({ path: args.path, namespace: 'asset' }));
    build.onLoad({ filter: /.*/, namespace: 'asset' }, () => ({ contents: 'export default ""' }));
  } }],
});
const B = createRequire(import.meta.url)(outfile);
rmSync(dir, { recursive: true, force: true });

const block = { id: 'slash-help-explainBack', dx: 0, dy: 0, ...previewBlock(PREVIEWS.practice) };
const render = service => B.renderToStaticMarkup(B.createElement(B.ExplainBackService.Provider, { value: service }, B.createElement(B.LearningBlockBody, { block, onChange() {}, onChangeQuiet() {}, appName: 'slash-help', selected: true })));

test('the preview gives the /practice example a local store, not null', () => {
  const stage = readFileSync(new URL('./SlashCommandPreview.jsx', import.meta.url), 'utf8');
  assert.match(stage, /<ExplainBackService\.Provider value=\{service\}>/);
  assert.doesNotMatch(stage, /ExplainBackService\.Provider value=\{null\}/);
  assert.match(stage, /practiceService\(\{ attempts, onChange: setAttempts, feedback: preview\.feedback \}\)/);
});

test('submit adds one reviewed attempt holding what was typed, with the canned feedback and no rating; nothing else is offered', async () => {
  let attempts = [];
  const service = practiceService({ attempts, onChange: next => { attempts = next; }, feedback: PREVIEWS.practice.feedback });
  assert.deepEqual(serviceView(service.card(block.id)).attempts, []);
  assert.equal(service.drafts ?? service.voice ?? service.recording ?? null, null, 'no draft, voice or recording store');
  await service.submit({ block, text: 'Air scatters blue light.' });
  const [attempt, ...rest] = serviceView(practiceService({ attempts, onChange() {}, feedback: PREVIEWS.practice.feedback }).card(block.id)).attempts;
  assert.equal(rest.length, 0);
  assert.deepEqual([attempt.number, attempt.status, attempt.answer.text, attempt.rating], [1, 'reviewed', 'Air scatters blue light.', null]);
  assert.equal(attempt.feedback.sections.revisit, PREVIEWS.practice.feedback.split('\n')[1]);
  assert.doesNotMatch(attempt.feedback.sections.revisit, /VERDICT/);
});

test('rendered: the current card with its answer field first, then the attempt and its Tutor feedback after Submit', async () => {
  const empty = render(practiceService({ attempts: [], onChange() {}, feedback: PREVIEWS.practice.feedback }));
  assert.match(empty, /data-eb-submit/, 'the answer field and Submit');
  let attempts = [];
  await practiceService({ attempts, onChange: next => { attempts = next; }, feedback: PREVIEWS.practice.feedback }).submit({ block, text: 'Air scatters blue light.' });
  const after = render(practiceService({ attempts, onChange() {}, feedback: PREVIEWS.practice.feedback }));
  assert.match(after, /Air scatters blue light\./);
  assert.match(after, /Attempt 1/);
  assert.match(after, /data-feedback-tab="answer"[^>]*>Your answer</);
  assert.match(after, /data-feedback-tab="feedback"[^>]*>Tutor feedback</, 'its feedback tab (the text is checked through serviceView above)');
  assert.doesNotMatch(after, /VERDICT/);
});
