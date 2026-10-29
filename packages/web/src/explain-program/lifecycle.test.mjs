// Task 10.1: three program cards against the shared two-Worker budget (host.js), through the cards' own frame schedulers
// (playback.js). The guest runs in the real packaged QuickJS engine behind a Worker-shaped stand-in, as in host.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProgramHost, liveRuntimeCount, programStamps } from './host.js';
import { loadEngine, runProgram } from './runtime.js';
import { LIMITS } from './limits.js';
import { sealProgram } from './contract.js';
import { growthFixture } from './fixtures.js';
import { createFrameScheduler } from './playback.js';

const engine = loadEngine();
const GUEST_LIMITS = { ...LIMITS, interruptMs: 150 }; // test-only, as host.test.mjs: a loaded machine must not turn a valid run into an overrun
const alive = new Set();
let started = 0;
class StandIn {
  constructor() { this.terminated = false; alive.add(this); started++; engine.then(() => this.emit({ ready: true, bootMs: 1 })); }
  emit(data) { setTimeout(() => !this.terminated && this.onmessage?.({ data }), 0); }
  postMessage({ id, source, request }) { engine.then(e => this.emit({ id, ...runProgram(e, { source, request }, GUEST_LIMITS) })); }
  terminate() { this.terminated = true; alive.delete(this); }
}
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

test('three playing cards share two Workers; a card closed while it waits for a slot leaves nothing behind', async () => {
  const sealed = await sealProgram({ manifest: growthFixture.manifest, source: growthFixture.source }, await programStamps());
  assert.equal(sealed.ok, true, sealed.issue);
  let peak = 0, requestId = 0;
  const watch = setInterval(() => { peak = Math.max(peak, alive.size, liveRuntimeCount()); }, 1);
  const cards = [0, 1, 2].map(() => {
    const host = createProgramHost({ artifact: sealed.value, createWorker: () => new StandIn() });
    const card = { host, drawn: [], failed: [], asked: 0, settled: 0 };
    card.scheduler = createFrameScheduler({
      evaluate: job => { card.asked++; return host.evaluate({ requestId: `r${++requestId}`, inputs: job.inputs, time: job.time, seed: 1, state: null }).finally(() => { card.settled++; }); },
      show: (_, job) => card.drawn.push(job.time),
      fail: error => card.failed.push(error),
    });
    return card;
  });
  const inputs = { rate: 5, years: 10, mode: 'compound' };
  // All three play: each asks for a new moment every tick, faster than the evaluations answer.
  for (let tick = 0; tick < 60; tick++) {
    for (const card of cards) card.scheduler.want({ key: 'k', time: (tick % 40) / 10, inputs });
    await flush();
  }
  // The third card closes (deleted, navigated away) while the other two keep playing.
  cards[2].scheduler.dispose();
  cards[2].host.dispose('card closed');
  for (let tick = 0; tick < 40; tick++) {
    for (const card of cards.slice(0, 2)) card.scheduler.want({ key: 'k', time: tick / 10, inputs });
    await flush();
  }
  for (let i = 0; i < 200 && cards.slice(0, 2).some(card => card.drawn.at(-1) !== 3.9); i++) await new Promise(resolve => setTimeout(resolve, 5));
  clearInterval(watch);
  assert.ok(peak <= LIMITS.activeRuntimes, `peak live Workers ${peak}`);
  for (const [i, card] of cards.entries()) {
    assert.deepEqual(card.failed, [], `card ${i} failed`);
    assert.ok(card.drawn.length > 0, `card ${i} drew`);
    // The scheduler keeps one request per card in flight, so asked frames never pile up behind a busy budget.
    assert.ok(card.asked - card.settled <= 1, `card ${i}: ${card.asked - card.settled} requests outstanding`);
  }
  for (const card of cards.slice(0, 2)) assert.equal(card.drawn.at(-1), 3.9, 'each remaining card settles on its last wanted moment');
  cards.slice(0, 2).forEach(card => { card.scheduler.dispose(); card.host.dispose('card closed'); });
  await flush();
  assert.equal(liveRuntimeCount(), 0);
  assert.equal(alive.size, 0, 'every started Worker was terminated');
  console.log(`three cards: peak ${peak} live Workers, ${started} Worker starts, ${cards.map(card => card.drawn.length).join('/')} frames drawn`);
});
