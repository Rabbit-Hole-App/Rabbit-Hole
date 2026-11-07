// A running /animation scene stops from its Chat card (owner 2026-11-07): the Generate button turns into the red Stop, and Stop sends the job's own
// cancel action, the one the canvas card sends. Source and markup checks plus the status contract; the cancel itself is the control-plane test
// animation-job.test.js 'cancel' (stop is durable, no paid step after it). Whiteboard has no running stop: whiteboard-job.js cancel refuses after Generate.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { animationProposalStatus } from './animation3d/client.js';

const read = name => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

test('a running scene can be stopped from Chat; every other state cannot', () => {
  const at = (stage, extra = {}) => animationProposalStatus({ job: { stage, ...extra }, cardId: 'c1' });
  assert.equal(at('building').canStop, true);
  assert.equal(at('building').label, 'Making the scene');
  for (const stage of ['ready', 'failed', 'cancelled']) assert.equal(at(stage)?.canStop, false, stage);
  assert.equal(at('awaiting_approval', { choiceOpen: true }).canStop, false);
  assert.equal(animationProposalStatus({ job: null, unread: true }).canStop, false);
});

test('Chat wires the animation Stop to stopAnimation, names it a scene, and the page sends the job cancel without removing the card', () => {
  const chat = read('ChatMessages.jsx');
  assert.match(chat, /p\.command === 'animation' \? \(ops\?\.stopAnimation \? \(\) => ops\.stopAnimation\(p\) : null\)/);
  assert.match(chat, /p\.command === 'animation' \? 'scene' : 'video'/);
  const page = read('LearnPage.jsx');
  const stop = page.slice(page.indexOf('stopAnimation: async proposal'), page.indexOf('cancelExplain: async proposal'));
  assert.match(stop, /animationClient\(api, boardId\)\.action\(proposal\.input\.job, 'cancel'\)/);
  assert.match(stop, /ANIMATION_JOB_EVENT/);
  assert.doesNotMatch(stop, /removeBlock/, 'the canvas card stays and says Stopped');
});

test('the Chat status reads the job again when it is stopped from outside its poll', () => {
  const hook = read('animation3d/use-proposal-status.js');
  assert.match(hook, /addEventListener\(ANIMATION_JOB_EVENT, again\)/);
  assert.match(hook, /removeEventListener\(ANIMATION_JOB_EVENT, again\)/);
});
