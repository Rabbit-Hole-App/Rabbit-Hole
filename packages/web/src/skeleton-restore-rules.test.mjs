// Deleted chats and cards (owner 2026-11-07): deleting a chat drops the skeletons whose plan waited in it; a skeleton is never restored; a finished
// card restores from its saved copy with no model, job or executor call and nothing that starts again on mount; a removed roadmap card has a Restore
// and a missing source says so. Unit and source checks, no browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CHAT_DELETED_EVENT, announceChatDeleted, skeletonJobOf, skeletonThreadOf } from './explain-client.js';
import { openOutput, outputOf, restoreProblem, snapshotBlock } from './chat-output-refs.js';
import { withJob } from './animation3d/storage.js';

const read = name => readFileSync(new URL('./' + name, import.meta.url), 'utf8');
const waiting = (key, id, threadId, stage = 'awaiting_approval') => ({ id: 'card-' + id, type: 'animation', [key]: { id, stage, ...(threadId ? { threadId } : {}) } });

test('a skeleton knows the chat its plan waits in; a running, finished or thread-less card has none', () => {
  assert.equal(skeletonThreadOf(waiting('explainJob', 'j1', 'T1')), 'T1');
  assert.equal(skeletonThreadOf(waiting('animation3dJob', 'j2', 'T1')), 'T1');
  assert.equal(skeletonThreadOf(waiting('whiteboardJob', 'j3', 'T2')), 'T2');
  assert.equal(skeletonThreadOf(waiting('explainJob', 'j4', 'T1', 'generating')), null, 'a running job is never dropped by a chat delete');
  assert.equal(skeletonThreadOf(waiting('explainJob', 'j5', null)), null);
  assert.equal(skeletonThreadOf({ id: 'plain', type: 'markdown' }), null);
  assert.deepEqual(skeletonJobOf(waiting('whiteboardJob', 'j3', 'T2')), { command: 'whiteboard-video', id: 'j3' });
});

test('the animation card records its thread when its job is bound', () => {
  const block = withJob({ id: 'c' }, { job: { id: 'j', stage: 'awaiting_approval' }, boardId: 'b', requestId: 'r', sourceKey: 's', threadId: 'T9' });
  assert.equal(block.animation3dJob.threadId, 'T9');
  assert.equal(skeletonThreadOf(block), 'T9');
  assert.equal(withJob({ id: 'c' }, { job: { id: 'j', stage: 'x' }, boardId: 'b', requestId: 'r', sourceKey: 's' }).animation3dJob.threadId, undefined);
  assert.match(read('LearnPage.jsx'), /sourceKey: await requestRef\(body\.requestId, words\), threadId \}\)/);
});

test('deleting a chat announces it, and the canvas drops exactly that thread\'s waiting skeletons through the same cancel path', () => {
  const seen = [];
  const bus = new EventTarget();
  globalThis.window = bus;
  bus.addEventListener(CHAT_DELETED_EVENT, event => seen.push(event.detail.threadId));
  announceChatDeleted('T1');
  assert.deepEqual(seen, ['T1']);
  delete globalThis.window;
  const ask = read('ask.jsx'), threads = read('chat-threads.js'), canvas = read('AdaptiveCanvas.jsx'), page = read('LearnPage.jsx');
  assert.match(ask, /\/delete`, \{ method: 'POST' \}\);\s+announceChatDeleted\(t\.id\);/);
  assert.match(threads, /\/delete`, \{ method: 'POST' \}\);\s+announceChatDeleted\(threadId\);/);
  const body = canvas.slice(canvas.indexOf('dropThreadSkeletons: threadId =>'), canvas.indexOf('removeBlock: async id =>'));
  assert.match(body, /skeletonThreadOf\(block\) === threadId/, 'only this thread\'s waiting skeletons');
  assert.match(body, /snapshot\(\);[\s\S]*onSkeletonsDropped\?\.\(/, 'one undo step, and the page cancels each job');
  assert.match(body, /readOnlyRef\.current\) return 0/);
  assert.match(page, /addEventListener\(CHAT_DELETED_EVENT, dropFor\)/);
  assert.match(page, /dropThreadSkeletons\?\.\(event\.detail\?\.threadId\)/);
});

test('a skeleton or a job still attached is never restored, whatever its snapshot says', () => {
  const cases = [
    waiting('explainJob', 'j1', 'T1'), waiting('animation3dJob', 'j2', 'T1'), waiting('whiteboardJob', 'j3', 'T1'),
    waiting('explainJob', 'j4', 'T1', 'generating'),
    { id: 'cad-1', type: 'cad', jobId: 'job-1', status: 'awaiting_approval' },
  ];
  for (const block of cases) assert.ok(restoreProblem(outputOf(block)), JSON.stringify(Object.keys(block)));
});

const ops = () => {
  const calls = [], blocks = [];
  return { calls, blocks, hasBlock: id => blocks.some(block => block.id === id), locate: id => calls.push(['locate', id]), canEdit: () => true,
    cadPlacement: async (jobId, hidden) => { calls.push(['placement', jobId, hidden]); },
    restoreCard: block => { calls.push(['restore', block]); blocks.push(block); return block.id; } };
};

test('restoring a finished card of each paid type only puts the saved block back: no model, job or executor call, nothing that restarts on mount', async () => {
  const finished = [
    { id: 'i1', type: 'image', title: 'Photo', src: 'https://images.example/x.jpg', autoSearch: true },
    { id: 'v1', type: 'video', title: 'Clip', mode: 'generate', status: 'ready', src: '/x.mp4', confirmedStart: true },
    { id: 's1', type: 'scene', title: 'Scene', status: 'ready', src: '/s.mp4', confirmedStart: true },
    { id: 'a1', type: 'animation3d', title: 'Scene', animation3d: { ref: 'r', sim: {}, view: {} } },
    { id: 'e1', type: 'animation', title: 'Explained', scene: { v: 1 }, program: { v: 1 } },
    { id: 'c1', type: 'cad', jobId: 'job-1', status: 'ready', revisionId: 'r1', title: 'Plate' },
  ];
  const network = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (...args) => { network.push(args[0]); throw new Error('network is off'); };
  try {
    for (const block of finished) {
      const output = outputOf(block);
      assert.equal(restoreProblem(output), null, block.type + ' restores');
      const canvas = ops();
      assert.deepEqual(await openOutput(output, canvas, next => next()), { restored: block.id });
      const kinds = canvas.calls.map(call => call[0]);
      assert.deepEqual(kinds, block.type === 'cad' ? ['placement', 'restore', 'locate'] : ['restore', 'locate'], block.type + ': only the canvas is touched');
      const back = canvas.calls.find(call => call[0] === 'restore')[1];
      for (const field of ['confirmedStart', 'autoSearch', 'explainJob', 'animation3dJob', 'whiteboardJob']) assert.equal(back[field], undefined, block.type + ' carries no ' + field);
    }
    assert.equal(snapshotBlock({ id: 'x', confirmedStart: true, autoSearch: true }).confirmedStart, undefined);
  } finally { globalThis.fetch = realFetch; }
  assert.deepEqual(network, [], 'no request of any kind');
  // The only two things that start work when a card mounts are stripped from every saved copy.
  const mount = read('LearningBlocks.jsx');
  assert.match(mount, /if \(!block\.confirmedStart \|\| started\.current\) return;/);
  assert.match(mount, /if \(!block\.autoSearch\) return;/);
});

test('a removed roadmap row has a Restore; a missing source says so', () => {
  const toc = read('TableOfContents.jsx');
  assert.match(toc, /const restores = !!entry\.roadmap\?\.removed && !!entry\.roadmap\.resultId && !readOnly && !!roadmap\?\.restoreCard;/);
  assert.match(toc, /data-toc-restore-card aria-label=\{"Restore card for " \+ entry\.label\} title="Restore card"[\s\S]{0,260}<Undo2 size=\{14\} \/>/);
  assert.match(toc, /!linksCard && !restores\) return null/);
  assert.match(read('use-roadmap.js'), /else h\?\.notice\?\.\('The source file is not on this canvas\.'\)/);
  assert.match(read('LearnPage.jsx'), /notice: message => toast\(message\), focusBlock:/);
  assert.match(read('roadmap-client.js'), /resultId: removed && state\.view \? result\.id : null/); // only with a live view: the kept tree of a finished roadmap has nothing to restore into
});
