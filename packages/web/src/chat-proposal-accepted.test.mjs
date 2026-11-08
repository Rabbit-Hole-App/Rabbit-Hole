// A review card leaves the Chat once its Generate is admitted (owner 2026-11-08, seen on "Review graph"): the learner's line and the chip
// to the made card stay; a failed Generate keeps the card to press again; a reload never brings an accepted card back (the proposal's
// server state, meta.proposalState.used). One rule for every review card (generation-proposal-chat.js proposalAccepted, ChatMessage,
// ProposalSlot). ChatMessages and ProposalSlot are bundled with esbuild and rendered with react-dom/server; a fake canvas ops stands in.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { proposalAccepted } from './generation-proposal-chat.js';

const dir = mkdtempSync(join(tmpdir(), 'chat-proposal-accepted-')), outfile = join(dir, 'bundle.cjs');
await esbuild.build({
  stdin: { contents: "export { ChatMessages, ProposalSlot } from './ChatMessages.jsx'; export { ChatWorkspace } from './chat-workspace.jsx'; export { createElement } from 'react'; export { renderToStaticMarkup } from 'react-dom/server';", resolveDir: fileURLToPath(new URL('.', import.meta.url)), loader: 'jsx' },
  bundle: true, outfile, format: 'cjs', platform: 'node', jsx: 'automatic', logLevel: 'silent',
  plugins: [{ name: 'vite-url', setup(build) {
    build.onResolve({ filter: /\?url$/ }, args => ({ path: args.path, namespace: 'vite-url' }));
    build.onLoad({ filter: /.*/, namespace: 'vite-url' }, () => ({ contents: 'export default ""' }));
  } }], loader: { '.png': 'empty', '.svg': 'empty', '.css': 'empty' },
});
const B = createRequire(import.meta.url)(outfile);
rmSync(dir, { recursive: true, force: true });

const soon = Math.floor(Date.now() / 1000) + 3600;
const proposal = (over = {}) => ({ proposal_id: 'gp-0123456789abcdef', version: 1, command: 'graph', title: 'Sagitta error vs. polygon edge count', description: 'How the error shrinks as edges are added.',
  input: { request: '/graph sagitta error', app: 'canvas-1' }, settings: {}, expires_at: soon, ...over });
const chip = { v: 1, cardId: 'card-9', kind: 'graph', title: 'Sagitta error vs. polygon edge count', jobId: null, thumb: null, startedAt: null, snapshot: { v: 1, block: { id: 'card-9', type: 'graph', title: 'Sagitta error vs. polygon edge count' } } };
const line = (over = {}) => ({ role: 'user', content: '/graph sagitta error', command: 'graph', messageId: '700', status: 'done', outputs: [], ...over });
const review = (p, over = {}) => ({ role: 'assistant', messageId: '701', status: 'done', content: '', meta: { proposal: p, actions: [], followUps: [] }, ...over });
const ops = (over = {}) => ({ proposalMade: () => false, proposalCard: () => null, block: id => (id === 'card-9' ? chip.snapshot.block : null), workspace: () => ({ loaded: true }), locate: () => {}, hasBlock: () => true, ...over });
const transcript = (msgs, canvasOps = ops()) => B.renderToStaticMarkup(B.createElement(B.ChatWorkspace.Provider, { value: { canvas: 'canvas-1', thread: { id: 't1' }, canvasOps } },
  B.createElement(B.ChatMessages, { msgs, learnChat: true, busy: false, setInput() {}, inputRef: { current: null }, setMsgs() {}, setFilePeek() {}, setRunPeek() {} })));

test('a review card waiting for Generate is in the Chat', () => {
  const html = transcript([line(), review(proposal())]);
  assert.match(html, /data-generation-proposal="graph"/);
});

test('accepted: the review card is removed; the learner\'s line and the result chip to the canvas card stay', () => {
  const html = transcript([line({ outputs: [chip] }), review(proposal(), { accepted: true })]);
  assert.doesNotMatch(html, /data-generation-proposal/);
  assert.doesNotMatch(html, /Added to the canvas/);
  assert.match(html, /data-user-turn[^>]*>.*sagitta error/);
  assert.match(html, /data-chat-output="card-9"[^>]*>.*Sagitta error vs\. polygon edge count.*Graph/);
  assert.doesNotMatch(html, /data-answer/, 'no empty answer frame or footer for a message that was only the card');
});

test('a reload keeps it removed: the proposal\'s server state says this version was used', () => {
  const p = proposal({ version: 2 });
  const root = review(proposal(), { messageId: '690', meta: { proposal: proposal(), proposalState: { version: 2, sig: 's', used: { version: 2, key: 'k' } }, actions: [], followUps: [] } });
  const reloaded = [line({ outputs: [chip] }), root, review(p)];
  assert.equal(proposalAccepted(reloaded[2], reloaded), true);
  assert.equal(proposalAccepted(reloaded[1], reloaded), false, 'the older revision was not the one used');
  assert.equal(proposalAccepted(review(proposal(), { meta: { proposal: proposal(), proposalUsed: { version: 1 } } }), []), false, 'a legacy flag on another message only counts in the list');
  const motion = proposal({ command: 'motion' }), used = { proposal: motion, proposalState: { version: 1, sig: 's', used: { version: 1, key: 'k' } }, actions: [], followUps: [] };
  assert.equal(proposalAccepted(review(motion, { meta: used, accepted: true }), [review(motion, { meta: used })]), false, '/motion keeps its card: its job status and Stop live there');
  const html = transcript(reloaded);
  assert.equal((html.match(/data-generation-proposal=/g) || []).length, 1, 'only the superseded revision\'s card, never the used one');
  assert.doesNotMatch(html, /data-proposal-version="2"/);
  assert.match(html, /data-chat-output="card-9"/);
  assert.equal(proposalAccepted(review(proposal(), { meta: { proposal: proposal(), proposalState: { version: 1, sig: 's', used: null } } }), [review(proposal(), { meta: { proposal: proposal(), proposalState: { version: 1, sig: 's', used: null } } })]), false, 'given back after a failure: shown');
});

// ProposalSlot inside a Chat workspace; its card element is returned so Generate can be pressed. setMsgs is recorded.
const press = async (generateMaterial) => {
  const p = proposal(), msgs = [line(), review(p)], marks = [];
  const setMsgs = update => marks.push(update(msgs)[1]);
  let tree = null;
  const Probe = () => { tree = B.ProposalSlot({ m: msgs[1], i: 1, msgs, setMsgs, ops: ops({ generateMaterial }) }); return tree; };
  B.renderToStaticMarkup(B.createElement(B.ChatWorkspace.Provider, { value: { canvas: 'canvas-1', thread: { id: 't1' } } }, B.createElement(Probe)));
  tree.props.children[0].props.onGenerate();
  await new Promise(resolve => setImmediate(resolve));
  return marks;
};

test('Generate admitted marks the message accepted (the card leaves); a failed Generate marks nothing (the card stays to retry)', async () => {
  const ok = await press(async () => ({ blockId: 'card-9' }));
  assert.ok(ok.some(m => m?.accepted === true), 'accepted once the card is made');
  const failed = await press(async () => { throw Object.assign(Error('The graph could not be made. Press Generate to try again.'), { status: 502 }); });
  assert.ok(!failed.some(m => m?.accepted), 'a failure keeps the review card');
  const html = transcript([line(), review(proposal())]);
  assert.match(html, /data-generation-proposal="graph"/);
});
