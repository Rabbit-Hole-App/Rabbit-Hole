// A written /explain sent in the Chat (owner 2026-11-08): while its card is made, the canvas holds the card's skeleton and the Chat's
// line shows the same waiting row (spinner and shimmer); both come from the ONE canvas slot (chat-output-refs.js withSlotSink) and
// clear in the same call - the card filling the slot, or the slot released on a failure, whose words the Chat shows as before.
// runLearnCommand runs against a fake canvas; ChatMessages is bundled with esbuild and rendered with react-dom/server.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { runLearnCommand } from './learn-slash.js';
import { withCardSink, withSlotSink } from './chat-output-refs.js';

const dir = mkdtempSync(join(tmpdir(), 'chat-making-')), outfile = join(dir, 'bundle.cjs');
await esbuild.build({
  stdin: { contents: "export { ChatMessages } from './ChatMessages.jsx'; export { createElement } from 'react'; export { renderToStaticMarkup } from 'react-dom/server';", resolveDir: fileURLToPath(new URL('.', import.meta.url)), loader: 'jsx' },
  bundle: true, outfile, format: 'cjs', platform: 'node', jsx: 'automatic', logLevel: 'silent',
  plugins: [{ name: 'vite-url', setup(build) {
    build.onResolve({ filter: /\?url$/ }, args => ({ path: args.path, namespace: 'vite-url' }));
    build.onLoad({ filter: /.*/, namespace: 'vite-url' }, () => ({ contents: 'export default ""' }));
  } }], loader: { '.png': 'empty', '.svg': 'empty', '.css': 'empty' },
});
const B = createRequire(import.meta.url)(outfile);
rmSync(dir, { recursive: true, force: true });

// The Chat's line as ask.jsx recordCommand keeps it, and the canvas as LearnPage wraps it. log: what happened, in order.
function setup() {
  const log = [], slots = new Set();
  let line = { role: 'user', content: '/explain why the sky is blue', command: 'explanation', messageId: 'local-q-1', status: 'done', outputsKey: '1', outputs: [] };
  const canvas = {
    reserve: ({ label }) => { const id = `slot:${slots.size + 1}`; slots.add(id); log.push(`canvas reserve ${label}`); return id; },
    release: id => { if (slots.delete(id)) log.push('canvas release'); },
    insertBlock: (block, { into } = {}) => { slots.delete(into); log.push('canvas fill'); return 'card-1'; },
  };
  const onSlot = slot => { line = { ...line, making: slot?.label ?? null }; log.push(`chat ${slot ? slot.label : 'clear'} (slots ${slots.size})`); };
  const chat = () => B.renderToStaticMarkup(B.createElement(B.ChatMessages, { msgs: [line], setMsgs() {}, setFilePeek() {}, setRunPeek() {} }));
  let answer;
  const post = path => { log.push(`post ${path}`); return new Promise(resolve => { answer = resolve; }); };
  const run = runLearnCommand('/explain why the sky is blue', { app: 'demo', canvas: withCardSink(withSlotSink(canvas, onSlot), () => {}), post, openSearch() {} });
  return { log, slots, chat, run, answer: body => answer(body) };
}
const tick = () => new Promise(resolve => setImmediate(resolve));
const shimmer = /<span data-chat-making="" class="flex items-center gap-2 text-xs text-ink-2 mt-1"><svg[^>]*animate-spin text-claude[^>]*>.*?<\/svg><span class="shimmer">Creating \/explain<\/span><\/span>/;

test('while the artifact request is pending, the canvas holds the slot and the Chat line shows the same label shimmering', async () => {
  const { log, slots, chat } = setup();
  await tick();
  assert.equal(slots.size, 1, 'the canvas reservation exists');
  assert.deepEqual(log, ['canvas reserve Creating /explain', 'chat Creating /explain (slots 1)', 'post /api/learn/artifact']);
  assert.match(chat(), shimmer, 'the existing waiting row (Loader2 and .shimmer) under the line');
});

test('when it resolves, the card fills the slot and the Chat row clears in that same call, before the command answers', async () => {
  const { log, slots, chat, run, answer } = setup();
  await tick();
  answer({ result: 'artifact', primitive: 'explanation', block: { id: 'card-1', type: 'explanation', title: 'Blue sky' } });
  const out = await run;
  assert.deepEqual(log.slice(3), ['canvas fill', 'chat clear (slots 0)'], 'one call: fill, then the Chat row, with no slot left');
  assert.equal(slots.size, 0);
  assert.equal(out.notice, null, 'no "Added an explanation" notice (owner 2026-11-08): the card and its chip say it');
  assert.doesNotMatch(chat(), /shimmer|data-chat-making/);
});

test('on failure the slot is released and the Chat row clears with it; the Chat shows the failure words as before', async () => {
  const { log, slots, chat, run, answer } = setup();
  await tick();
  answer({ result: 'validation_error', primitive: 'explanation', error: 'The table had no rows.' });
  const out = await run;
  assert.deepEqual(log.slice(3), ['canvas release', 'chat clear (slots 0)']);
  assert.equal(slots.size, 0);
  assert.equal(out.notice.tone, 'error');
  assert.match(out.notice.text, /^An explanation could not be made: it failed its checks, so nothing was added\./);
  assert.doesNotMatch(chat(), /shimmer|data-chat-making/);
});

test('a request that throws releases the slot and clears the Chat row too', async () => {
  const log = [], slots = new Set();
  const canvas = { reserve: () => { slots.add('slot:1'); return 'slot:1'; }, release: id => slots.delete(id), insertBlock: () => 'card-1' };
  const onSlot = slot => log.push(slot ? 'set' : `clear (slots ${slots.size})`);
  await assert.rejects(runLearnCommand('/explain tides', { app: 'demo', canvas: withSlotSink(canvas, onSlot), post: async () => { throw Error('offline'); }, openSearch() {} }), /offline/);
  assert.deepEqual(log, ['set', 'clear (slots 0)']);
});
