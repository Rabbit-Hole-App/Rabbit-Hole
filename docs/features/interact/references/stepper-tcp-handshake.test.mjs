// Offline semantic checks for the documentation references. These do not prove
// browser rendering, live TCP behavior, or production family admission.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { buildScene, drawPicture } from './stepper-tcp-handshake.mjs';

const depths = ['brief', 'balanced', 'detailed'];
const wrap = (value, width = 22) => {
  const lines = []; let current = '';
  for (const word of value.split(/\s+/)) {
    if (current && `${current} ${word}`.length > width) { lines.push(current); current = ''; }
    current += `${current ? ' ' : ''}${word}`;
  }
  if (current) lines.push(current);
  return lines;
};

function picture(scene, variant, state, previous = []) {
  const calls = [], emit = (kind, id, ...args) => { calls.push({ kind, id, args }); return `[${kind}:${id}]`; };
  const R = {
    C: { muted: 'muted', ink: 'ink', blue: 'blue', warm: 'warm', green: 'green' },
    text: (...args) => emit('text', ...args), box: (...args) => emit('box', ...args),
    line: (...args) => emit('line', ...args), circle: (...args) => emit('circle', ...args),
    paragraph: (...args) => emit('paragraph', ...args),
    region: (id, frame, content, prior) => emit('region', id, frame.active.includes(id), content, prior),
  };
  const draw = runInNewContext(`(${drawPicture.toString()})`, { R });
  return { result: draw(state, variant, scene, previous), calls };
}

test('the three depths are serializable self-contained authored scenes with bounded state counts', () => {
  const isolated = runInNewContext(`(${buildScene.toString()})`);
  for (const depth of depths) {
    const scene = buildScene(depth);
    assert.deepEqual(JSON.parse(JSON.stringify(isolated(depth))), JSON.parse(JSON.stringify(scene)));
    assert.equal(scene.canonical, 'protocol-between-parties');
    assert.equal(scene.variants.length, depth === 'brief' ? 1 : 2);
    assert.deepEqual(scene.parameter, depth === 'brief' ? null : { label: 'Lose SYN-ACK', options: ['No', 'Yes'], default: 0 });
    for (const variant of scene.variants) {
      const count = variant.states.length;
      assert.ok(depth === 'brief' ? count === 3 : depth === 'balanced' ? count >= 4 && count <= 6 : count >= 6 && count <= 8);
      assert.equal(variant.states.at(-1).id, scene.aha.stateId);
    }
  }
  assert.throws(() => buildScene('unbounded'), RangeError);
});

test('every highlight, link and drawing region is declared; short words fit the shared shell', () => {
  for (const depth of depths) for (const variant of buildScene(depth).variants) {
    const scene = buildScene(depth), ids = new Set(variant.regions.map(region => region.id));
    assert.ok(ids.size >= 7 && ids.size <= 9);
    assert.equal(ids.size, variant.regions.length);
    for (const link of variant.links) { assert.ok(ids.has(link.from)); assert.ok(ids.has(link.to)); }
    for (const [index, state] of variant.states.entries()) {
      assert.ok(state.active.length > 0);
      for (const id of state.active) assert.ok(ids.has(id), `${state.id}: ${id}`);
      assert.ok(state.active.includes(state.calloutRegion), `${state.id}: callout targets one current region`);
      assert.ok(state.active.some(id => state.sentence.toLowerCase().includes(variant.regions.find(region => region.id === id).label.toLowerCase())));
      assert.ok(state.label.length <= 20, state.label);
      assert.ok(state.short.length <= 10, state.short);
      assert.ok(state.sentence.length <= 140);
      assert.ok(state.why.length <= 100);
      assert.ok(wrap(state.sentence).length + (depth === 'detailed' ? wrap(state.why).length : 0) <= 8, `${depth}/${state.id} callout reaches the readouts`);
      assert.equal(state.readouts.length, depth === 'brief' ? 0 : depth === 'balanced' ? 3 : 4);
      const drawn = picture(scene, variant, state, index ? variant.states[index - 1].active : []);
      assert.deepEqual(new Set(drawn.calls.filter(call => call.kind === 'region').map(call => call.id)), ids);
      assert.ok(drawn.result.anchor[0] >= 20 && drawn.result.anchor[0] <= 414);
      assert.ok(drawn.result.anchor[1] >= 40 && drawn.result.anchor[1] <= 280);
    }
  }
});

test('SYN occupies one sequence number; final pure ACK occupies none', () => {
  // Independently evaluate the authored initial sequence numbers rather than
  // deriving expected arithmetic from a displayed number or helper under test.
  const clientIsn = 100, serverIsn = 500;
  for (const depth of depths) for (const variant of buildScene(depth).variants) {
    const byId = Object.fromEntries(variant.regions.map(region => [region.id, region]));
    assert.equal(byId.client.initialSeq, clientIsn);
    assert.equal(byId.server.initialSeq, serverIsn);
    assert.equal(byId.syn.seq, clientIsn);
    assert.equal(byId.syn.ack, null);
    assert.equal(byId.syn.sequenceLength, 1);
    assert.equal(byId.synack.seq, serverIsn);
    assert.equal(byId.synack.ack, clientIsn + 1);
    assert.equal(byId.synack.sequenceLength, 1);
    assert.equal(byId.ack.seq, clientIsn + 1);
    assert.equal(byId.ack.ack, serverIsn + 1);
    assert.equal(byId.ack.sequenceLength, 0);
    for (const state of variant.states) {
      assert.equal(state.endpoints.client.nextSeq, clientIsn + Number(state.sent.includes('syn')));
      assert.equal(state.endpoints.server.nextSeq, serverIsn + Number(state.sent.includes('synack')));
      const values = Object.fromEntries(state.readouts.map(readout => [readout.id, readout.value]));
      if (depth !== 'brief') {
        assert.equal(values.seq, state.segment ? String(byId[state.segment].seq) : '—');
        assert.equal(values.ack, state.segment && byId[state.segment].ack !== null ? String(byId[state.segment].ack) : '—');
      }
      if (depth === 'detailed') {
        assert.equal(values.clientNext, String(state.endpoints.client.nextSeq));
        assert.equal(values.serverNext, String(state.endpoints.server.nextSeq));
      }
    }
  }
});

test('the server cannot establish until the final ACK confirms its reply arrived', () => {
  for (const depth of depths) for (const variant of buildScene(depth).variants) {
    for (const state of variant.states) {
      if (state.ackSent) assert.ok(state.replyReceived, `${state.id}: an ACK cannot precede the reply`);
      assert.equal(state.sent.includes('ack'), state.ackSent);
      assert.equal(state.endpoints.server.state === 'ESTABLISHED', state.ackReceived);
      if (state.ackReceived) { assert.ok(state.ackSent); assert.ok(state.replyReceived); }
      if (depth === 'balanced') {
        const ready = Object.values(state.endpoints).filter(endpoint => endpoint.state === 'ESTABLISHED').length;
        assert.equal(state.readouts.find(readout => readout.id === 'ready').value, `${ready} of 2`);
      }
    }
    const final = variant.states.at(-1);
    assert.equal(final.endpoints.client.state, 'ESTABLISHED');
    assert.equal(final.endpoints.server.state, 'ESTABLISHED');
    assert.equal(final.ackReceived, true);
  }
});

test('losing the first reply changes the message outcome and requires a real retry before the ACK', () => {
  for (const depth of ['balanced', 'detailed']) {
    const scene = buildScene(depth), [normal, loss] = scene.variants;
    assert.equal(normal.lostReply, false); assert.equal(loss.lostReply, true);
    const lost = loss.states.find(state => state.id === 'reply-lost');
    const retry = loss.states.find(state => state.id === 'reply-retry');
    assert.equal(lost.replyReceived, false); assert.equal(lost.ackSent, false);
    assert.equal(lost.endpoints.client.state, 'SYN-SENT');
    assert.ok(retry.active.includes('retry'));
    assert.equal(retry.endpoints.server.nextSeq, lost.endpoints.server.nextSeq, 'retransmission reuses sequence space');
    const regions = Object.fromEntries(loss.regions.map(region => [region.id, region]));
    assert.equal(regions.retry.seq, regions.synack.seq);
    assert.equal(regions.retry.ack, regions.synack.ack);
    assert.equal(regions.retry.newSequenceSpace, 0);
    assert.ok(loss.states.findIndex(state => state.replyReceived) > loss.states.indexOf(retry));
    assert.ok(loss.states.findIndex(state => state.ackSent) > loss.states.indexOf(retry));
    assert.equal(normal.states.some(state => state.active.includes('retry')), false);
    const normalReply = normal.states.find(state => state.id === 'reply-sent');
    const a = picture(scene, normal, normalReply).calls;
    const b = picture(scene, loss, lost).calls;
    assert.equal(a.some(call => call.id === 'synack.lost'), false);
    assert.equal(b.some(call => call.id === 'synack.lost'), true);
    assert.notDeepEqual(a.find(call => call.id === 'synack.path').args[0], b.find(call => call.id === 'synack.path').args[0]);
    assert.match(scene.instructions, /order/);
    assert.match(scene.instructions, /timer/i);
  }
});

test('the diagram stays within its reserved picture area and keeps fixed actor/message positions', () => {
  for (const depth of depths) for (const variant of buildScene(depth).variants) {
    const scene = buildScene(depth), fixed = new Map();
    for (const [index, state] of variant.states.entries()) {
      const { calls } = picture(scene, variant, state, index ? variant.states[index - 1].active : []);
      for (const call of calls) {
        const { kind, id, args } = call;
        if (kind === 'box') { assert.ok(args[0] >= 20 && args[0] + args[2] <= 414); assert.ok(args[1] >= 40 && args[1] + args[3] <= 280); }
        if (kind === 'text') {
          assert.ok(args[0] >= 20 && args[0] <= 414); assert.ok(args[1] >= 40 && args[1] <= 280);
          const xy = args.slice(0, 2);
          if (fixed.has(id)) assert.deepEqual(xy, fixed.get(id), id); else fixed.set(id, xy);
        }
        if (kind === 'line') for (const [x, y] of args[0]) { assert.ok(x >= 20 && x <= 414, id); assert.ok(y >= 40 && y <= 280, id); }
      }
      const ghosts = calls.filter(call => call.id.endsWith('.previous'));
      assert.equal(ghosts.length > 0, depth !== 'brief' && index > 0);
      for (const ghost of ghosts) assert.equal(ghost.args[3], true, 'previous state uses a dashed outline, not motion');
    }
  }
});

test('the drawing never invents an undeclared region', () => {
  const scene = buildScene('balanced'), variant = scene.variants[0];
  for (const removed of variant.regions) {
    const subset = { ...variant, regions: variant.regions.filter(region => region.id !== removed.id) };
    const drawn = picture(scene, subset, variant.states[0]);
    assert.equal(drawn.calls.some(call => call.kind === 'region' && call.id === removed.id), false);
  }
});
