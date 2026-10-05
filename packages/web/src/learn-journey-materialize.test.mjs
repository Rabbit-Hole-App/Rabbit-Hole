// The current section's materializer (docs/features/adaptive-learning-path-v1-architecture.md §6.5, R5; LP1 Task 9):
// driven with a fake canvas that keeps a flow of blocks and records every call, and a fake post. No React, no network,
// no Send.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { materializeSection } from './learn-journey-materialize.js';
import { indexAfter } from './canvas-slots.js';
import { fixtureFor } from '../../control-plane/src/learn-journey-fixtures.js';

// The keyless stack's own outputs: an 8-section logistic regression path with section 1 current, and section 1's plan
// (three make: { text } steps).
const drafted = fixtureFor('journey_path', { topic: 'logistic regression' });
const registry = drafted.concepts_added;
const path = { ...drafted.path, version: 2, current_section_id: 's1', sections: drafted.path.sections.map(s => (s.id === 's1' ? { ...s, status: 'current' } : s)) };
const [section1, section2] = path.sections;
const plan = fixtureFor('journey_section', { path, section: section1, registry });
const others = path.sections.slice(1);

// Like the real canvas: a reserved slot only exists once the canvas has rendered (a tick later), so an insert `into` it
// before then lands elsewhere (`filled` false); `after` inserts follow the flow (indexAfter); blocks() is the flow.
// persist() (LP1 Task 15) records the flow it saved and answers the next of `saves` (a result, or a function giving
// one or a promise), else a saved board.
function fakeCanvas(seed = [], { saves = [] } = {}) {
  const calls = [], flow = seed.map(block => ({ ...block })), live = new Set(), persisted = [];
  let n = 0, slots = 0;
  return {
    calls, flow, persisted,
    persist: async () => {
      calls.push(['persist']);
      persisted.push(flow.map(block => block.id));
      const next = saves.shift();
      return typeof next === 'function' ? next() : next ?? { ok: true, local: true, remote: 'skipped' };
    },
    inserts: () => calls.filter(c => c[0] === 'insertBlock'),
    blocks: () => flow,
    reserve: slot => { const id = `slot:${++slots}`; calls.push(['reserve', slot]); setTimeout(() => live.add(id), 0); return id; },
    insertBlock: (block, options = {}) => {
      const id = `b${++n}`;
      calls.push(['insertBlock', block, options, id, options.into ? live.has(options.into) : null]);
      flow.splice(options.after ? indexAfter(flow, options.after) : flow.length, 0, { ...block, id });
      return id;
    },
    release: id => { calls.push(['release', id]); },
    showSection: id => { calls.push(['showSection', id]); },
  };
}
const journeyWith = (done = []) => ({ active_section_id: 's1', path, materialized: async (id, heading) => { done.push([id, heading]); } });
const planOf = steps => ({ ...plan, teaching_sequence: steps });
const claims = plan.teaching_sequence[0].claims;
const text = (step_id, body) => ({ step_id, role: 'explanation', make: { text: body }, claims });
const command = (step_id, cmd, request) => ({ step_id, role: 'interactive_visual', make: { command: cmd, request }, claims });
const tagged = (id, step_id, type = 'explanation') => ({ id, type, journey: { section_id: 's1', step_id, claims } });

test('materializeSection: section 1 current - one heading in the painted slot, three blocks under it, nothing for any other section', async () => {
  const canvas = fakeCanvas([{ id: 'old', type: 'explanation' }]), done = [], posts = [];
  const out = await materializeSection({ canvas, journey: journeyWith(done), sectionPlan: plan, post: async (...a) => { posts.push(a); return {}; } });
  assert.equal(plan.teaching_sequence.length, 3);
  const inserts = canvas.inserts();
  assert.equal(inserts.length, 4);
  assert.deepEqual(canvas.calls[0], ['reserve', { label: 'Preparing section 1…' }]);
  const [heading, ...blocks] = inserts;
  assert.deepEqual(heading[1], { type: 'heading', level: 1, text: section1.title, done: false, journey_section_id: 's1' });
  assert.deepEqual(heading[2], { into: 'slot:1' });
  assert.equal(heading[4], true, 'one paint after reserve: the slot exists when the heading fills it');
  assert.deepEqual(blocks.map(b => b[1].type), ['explanation', 'explanation', 'explanation']);
  assert.ok(blocks.every(b => b[1].journey.section_id === section1.id));
  assert.deepEqual(blocks.map(b => b[1].journey.step_id), plan.teaching_sequence.map(s => s.step_id));
  assert.deepEqual(blocks.map(b => b[1].body), plan.teaching_sequence.map(s => s.make.text));
  assert.deepEqual(blocks.map(b => b[1].journey.claims), plan.teaching_sequence.map(s => s.claims));
  assert.deepEqual(blocks.map(b => b[2]), [{ after: 'b1' }, { after: 'b2' }, { after: 'b3' }], 'each step right after the one before');
  assert.deepEqual(canvas.flow.map(b => b.id), ['old', 'b1', 'b2', 'b3', 'b4']);
  const release = canvas.calls.findIndex(c => c[0] === 'release'), show = canvas.calls.findIndex(c => c[0] === 'showSection');
  assert.deepEqual(canvas.calls[release], ['release', 'slot:1']);
  assert.deepEqual(canvas.calls[show], ['showSection', 'b1'], 'the camera goes to the section start');
  assert.ok(show > canvas.calls.findLastIndex(c => c[0] === 'insertBlock'), 'after the last step');
  assert.equal(posts.length, 0, 'make: { text } steps make no request');
  assert.deepEqual(done, [['s1', 'b1']], 'section_materialized names the current section and its heading, once');
  assert.deepEqual(out, { heading_block_id: 'b1', block_ids: ['b2', 'b3', 'b4'], proposals: [] });
  const seen = JSON.stringify([canvas.calls, posts, done]);
  for (const s of others) {
    assert.doesNotMatch(seen, new RegExp(`"${s.id}"`), s.id);
    assert.ok(!seen.includes(s.title), s.title);
  }
});

test('materializeSection: a plan for section 2 while section 1 is current throws before touching the canvas', async () => {
  const canvas = fakeCanvas(), done = [];
  const wrong = fixtureFor('journey_section', { path, section: section2, registry });
  await assert.rejects(materializeSection({ canvas, journey: journeyWith(done), sectionPlan: wrong, post: async () => ({}) }), /current section/);
  await assert.rejects(materializeSection({ canvas, journey: { ...journeyWith(done), active_section_id: null }, sectionPlan: plan, post: async () => ({}) }));
  await assert.rejects(materializeSection({ canvas, journey: { ...journeyWith(done), path: { sections: others } }, sectionPlan: plan, post: async () => ({}) }), /no section s1/);
  assert.deepEqual(canvas.calls, []);
  assert.deepEqual(done, []);
});

test('materializeSection: a command step runs the / command route with a timeout; a paid proposal is reported with its place, never inserted', async () => {
  const canvas = fakeCanvas(), done = [], posts = [];
  const replies = [
    { result: 'artifact', primitive: 'interactive_graph', block: { type: 'graph', title: 'Sigmoid' } },
    { result: 'paid_proposal', primitive: 'maths_animation', message: 'This animation costs credits.', block: { type: 'mathAnimation', title: 'Saturation' } },
  ];
  const steps = [command('graph', 'graph', 'the sigmoid curve'), command('animate', 'animate', 'why the sigmoid saturates'), text('predict', 'What would you predict?')];
  const out = await materializeSection({ canvas, journey: journeyWith(done), sectionPlan: planOf(steps), post: async (...a) => { posts.push(a); return replies.shift(); } });
  assert.deepEqual(posts.map(p => p[0]), ['/api/learn/artifact', '/api/learn/artifact']);
  assert.deepEqual(posts[0][1], { command: 'graph', args: 'the sigmoid curve', context: `Journey section: ${section1.title}` });
  assert.ok(posts[0][2].signal instanceof AbortSignal, 'the request carries a timeout signal');
  const inserts = canvas.inserts();
  assert.deepEqual(inserts.map(i => i[1].type), ['heading', 'graph', 'explanation'], 'the proposal step inserts nothing');
  assert.deepEqual(inserts[1][1].journey, { section_id: 's1', step_id: 'graph', claims }, 'the returned block is stamped');
  assert.deepEqual(inserts[2][2], { after: 'b2' });
  assert.equal(out.proposals.length, 1);
  const [proposal] = out.proposals;
  assert.deepEqual([proposal.step_id, proposal.primitive, proposal.message, proposal.after], ['animate', 'maths_animation', 'This animation costs credits.', 'b2']);
  assert.deepEqual(proposal.block.journey, { section_id: 's1', step_id: 'animate', claims });
  assert.equal(out.failed_step, undefined);
  assert.deepEqual(done, [['s1', 'b1']], 'a paid step is optional: the section is still materialized');
});

test('materializeSection: a failed step stops there and keeps the blocks; run again, it resumes from the canvas at that step', async () => {
  const canvas = fakeCanvas(), done = [];
  let calls = 0;
  const steps = [text('frame', 'Where this fits.'), command('graph', 'graph', 'the sigmoid curve'), text('predict', 'What would you predict?')];
  const out = await materializeSection({ canvas, journey: journeyWith(done), sectionPlan: planOf(steps), post: async () => { calls += 1; throw new Error('HTTP 502'); } });
  assert.equal(calls, 1);
  assert.equal(out.failed_step, 'graph');
  assert.deepEqual(out.block_ids, ['b2']);
  assert.deepEqual(canvas.inserts().map(i => i[1].type), ['heading', 'explanation'], 'the later step is not run');
  assert.deepEqual(canvas.calls.at(-1), ['release', 'slot:1'], 'the slot is given up');
  assert.ok(!canvas.calls.some(c => c[0] === 'showSection'));
  assert.deepEqual(done, [], 'not materialized: the section is not complete');
  // A result that is not an artifact (a clarification, unsupported, an error) is a failed step too.
  const unsupported = await materializeSection({ canvas: fakeCanvas(), journey: journeyWith([]), sectionPlan: planOf(steps), post: async () => ({ result: 'unsupported', message: 'Not yet.' }) });
  assert.equal(unsupported.failed_step, 'graph');
  // Again on the same canvas: its stamped heading and step are reused, no slot, the rest lands under them.
  const resumed = await materializeSection({ canvas, journey: journeyWith(done), sectionPlan: planOf(steps), post: async () => ({ result: 'artifact', block: { type: 'graph', title: 'Sigmoid' } }) });
  assert.deepEqual(canvas.inserts().slice(2).map(i => [i[1].type, i[1].journey.step_id, i[2]]), [['graph', 'graph', { after: 'b2' }], ['explanation', 'predict', { after: 'b3' }]]);
  assert.equal(canvas.calls.filter(c => c[0] === 'reserve').length, 1);
  assert.deepEqual(resumed, { heading_block_id: 'b1', block_ids: ['b2', 'b3', 'b4'], proposals: [] });
  assert.deepEqual(done, [['s1', 'b1']]);
});

test('materializeSection: a heading stamped by an earlier visit is reused and only the missing steps are drawn, in place', async () => {
  const seed = [{ id: 'intro', type: 'explanation' }, { id: 'h-old', type: 'heading', level: 1, text: section1.title, journey_section_id: 's1' }, tagged('frame-old', 'frame'), { id: 'mine', type: 'sticky' }];
  const canvas = fakeCanvas(seed), done = [];
  const out = await materializeSection({ canvas, journey: journeyWith(done), sectionPlan: plan, post: async () => ({}) });
  assert.ok(!canvas.calls.some(c => c[0] === 'reserve'), 'no second heading, no slot');
  assert.deepEqual(canvas.inserts().map(i => [i[1].journey.step_id, i[2]]), [['explain', { after: 'frame-old' }], ['predict', { after: 'b1' }]]);
  assert.deepEqual(canvas.flow.map(b => b.id), ['intro', 'h-old', 'frame-old', 'b1', 'b2', 'mine']);
  assert.deepEqual(out, { heading_block_id: 'h-old', block_ids: ['frame-old', 'b1', 'b2'], proposals: [] });
  assert.deepEqual(done, [['s1', 'h-old']]);
  // Everything already drawn: nothing inserted, only recorded.
  const full = fakeCanvas([{ id: 'h', type: 'heading', journey_section_id: 's1' }, tagged('x', 'frame'), tagged('y', 'explain'), tagged('z', 'predict')]), recorded = [];
  await materializeSection({ canvas: full, journey: journeyWith(recorded), sectionPlan: plan, post: async () => ({}) });
  assert.deepEqual(full.inserts(), []);
  assert.deepEqual(recorded, [['s1', 'h']]);
  assert.deepEqual(full.calls.map(c => c[0]), ['showSection', 'persist'], 'the resumable path saves the board before it records (LP1 Task 15)');
});

// ---- Save before commit (architecture §6.5.5, LP1 Task 15, owner blocker): the section is recorded only once its board
// is saved ----
test('materializeSection: after the last step - paint, showSection, then persist(); section_materialized only once it resolves ok', async () => {
  let entered, settle;
  const inWindow = new Promise(resolve => { entered = resolve; }), gate = new Promise(resolve => { settle = resolve; });
  const canvas = fakeCanvas([], { saves: [() => { entered(); return gate; }] }), done = [];
  const run = materializeSection({ canvas, journey: journeyWith(done), sectionPlan: plan, post: async () => ({}) });
  await Promise.race([inWindow, run]);
  const at = name => canvas.calls.findIndex(c => c[0] === name);
  assert.ok(at('persist') > at('showSection') && at('showSection') > canvas.calls.findLastIndex(c => c[0] === 'insertBlock'), 'insert, show, then save');
  assert.deepEqual(canvas.persisted, [['b1', 'b2', 'b3', 'b4']], 'the save holds every inserted block');
  assert.deepEqual(done, [], 'nothing is recorded while the save is in flight');
  settle({ ok: true, local: true, remote: 'skipped' });
  const out = await run;
  assert.deepEqual(done, [['s1', 'b1']]);
  assert.deepEqual(out, { heading_block_id: 'b1', block_ids: ['b2', 'b3', 'b4'], proposals: [] });
});

test('materializeSection: a save that fails records nothing and reports the section unsaved, keeping every block', async () => {
  for (const failed of [{ ok: false, local: false, remote: 'skipped' }, { ok: false, local: true, remote: 'failed' }]) {
    const canvas = fakeCanvas([], { saves: [failed] }), done = [];
    const out = await materializeSection({ canvas, journey: journeyWith(done), sectionPlan: plan, post: async () => ({}) });
    assert.deepEqual(done, [], 'section_materialized is not posted');
    assert.deepEqual(out, { heading_block_id: 'b1', block_ids: ['b2', 'b3', 'b4'], proposals: [], unsaved: true });
    assert.equal(canvas.inserts().length, 4);
  }
});

// Final review B-C1: the learner leaves mid-section (Home, the sidebar, a Rabbit Hole remounting the page). The old
// canvas still answers insertBlock with an id (setBlocks on an unmounted canvas does nothing), blocks() is its last
// render and persist() saves that stale board and answers ok - yet the section is never recorded as built.
test('final review B-C1: an insert that never reaches the canvas fails the section as canvas - nothing is recorded, though the stale save answers ok', async () => {
  let alive = true, n = 0;
  const rendered = [];
  const canvas = {
    blocks: () => rendered, reserve: () => 'slot:1', release: () => {}, showSection: () => {},
    insertBlock: block => { const id = `b${++n}`; if (alive) rendered.push({ ...block, id }); return id; },
    persist: async () => ({ ok: true, local: true, remote: 'skipped' }),
  };
  const steps = [text('frame', 'x'), command('graph', 'graph', 'sigmoid'), command('code', 'code', 'fit')];
  const done = [];
  const post = async (_path, body) => { if (body.command === 'graph') alive = false; return { result: 'artifact', block: { type: body.command } }; };
  const out = await materializeSection({ canvas, journey: journeyWith(done), sectionPlan: planOf(steps), post });
  assert.deepEqual(rendered.map(b => b.type), ['heading', 'explanation'], 'the graph and code cards never reached the board');
  assert.equal(out.failed_step, 'canvas');
  assert.deepEqual(done, [], 'section_materialized is not posted');
});

// Review round 2: a section id is only unique within its journey (the fixtures use s1, s2 every time), so the stamps
// carry the journey id, and an archived journey's blocks are never resumed as a new journey's section.
test('materializeSection: blocks stamped for another journey with the same section id are not reused - a fresh section is drawn and stamped with this journey', async () => {
  const old = [{ id: 'h-old', type: 'heading', level: 1, journey_section_id: 's1', journey_id: 'j-old' }, { ...tagged('f-old', 'frame'), journey: { ...tagged('f-old', 'frame').journey, journey_id: 'j-old' } }];
  const canvas = fakeCanvas(old), done = [];
  const out = await materializeSection({ canvas, journey: { ...journeyWith(done), id: 'j-new' }, sectionPlan: plan, post: async () => ({}) });
  const inserts = canvas.inserts();
  assert.equal(inserts.length, 4, 'a new heading and every step');
  assert.deepEqual(inserts[0][1], { type: 'heading', level: 1, text: section1.title, done: false, journey_section_id: 's1', journey_id: 'j-new' });
  assert.ok(inserts.slice(1).every(i => i[1].journey.journey_id === 'j-new' && i[1].journey.section_id === 's1'));
  assert.deepEqual(done, [['s1', 'b1']], 'the new heading is recorded, never h-old');
  assert.equal(out.heading_block_id, 'b1');
  // The same journey's own stamps are resumed as before.
  const again = fakeCanvas(canvas.flow), recorded = [];
  await materializeSection({ canvas: again, journey: { ...journeyWith(recorded), id: 'j-new' }, sectionPlan: plan, post: async () => ({}) });
  assert.deepEqual(again.inserts(), []);
  assert.deepEqual(recorded, [['s1', 'b1']]);
});

test('materializeSection: an artifact request that hangs times out as a failed step', async () => {
  const hang = (_path, _body, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason)));
  const out = await materializeSection({ canvas: fakeCanvas(), journey: journeyWith(), sectionPlan: planOf([command('graph', 'graph', 'x'), text('predict', 'y')]), post: hang, timeoutMs: 10 });
  assert.equal(out.failed_step, 'graph');
});

test('materializeSection: progress names each step of the section', async () => {
  const seen = [];
  await materializeSection({ canvas: fakeCanvas(), journey: journeyWith(), sectionPlan: plan, post: async () => ({}), onProgress: p => seen.push(p) });
  assert.deepEqual(seen, [{ step: 1, of: 3 }, { step: 2, of: 3 }, { step: 3, of: 3 }]);
});

test('indexAfter: right after the named block in the flow; the end when it has gone', () => {
  const blocks = ['a', 'b', 'c'].map(id => ({ id }));
  assert.equal(indexAfter(blocks, 'a'), 1);
  assert.equal(indexAfter(blocks, 'b'), 2);
  assert.equal(indexAfter(blocks, 'c'), 3);
  assert.equal(indexAfter(blocks, 'gone'), 3);
  assert.equal(indexAfter([], 'a'), 0);
});

test('AdaptiveCanvas.jsx: insertBlock takes `after` (indexAfter, ignoring the view) and keeps insertAtView for everything else', () => {
  const src = readFileSync(new URL('./AdaptiveCanvas.jsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  assert.match(src, /insertBlock: \(block, \{ into = null, after = null \} = \{\}\) => \{/);
  assert.match(src, /if \(after == null\) return insertAtView\(added, into\);/);
  assert.match(src, /indexAfter\(previous, after\)/);
  // Final review B-C1: once unmounted, an insert draws nothing and answers null (a run still holding this canvasApi).
  assert.match(src, /const alive = useRef\(true\);\n\s+useEffect\(\(\) => \{ alive\.current = true; return \(\) => \{ alive\.current = false; \}; \}, \[\]\);/);
  assert.match(src, /insertBlock: \(block, \{ into = null, after = null \} = \{\}\) => \{\n\s+if \(!alive\.current\) return null;/);
});

test('AdaptiveCanvas.jsx: persist() saves the board read through refs (canvas-persist.js); the debounced save is unchanged (LP1 Task 15)', () => {
  const src = readFileSync(new URL('./AdaptiveCanvas.jsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  assert.match(src, /boardRef\.current = \{ strokes, shapes, items, links, blocks, groups, areas \};/);
  // Final review B-C1: an unmounted canvas saves nothing (its stale board would overwrite the new canvas's copy).
  assert.match(src, /persist: \(\) => \(alive\.current \? persistBoard\(\{ state: boardRef\.current, storageKey, storage: \(\) => localStorage, onSave: onSaveRef\.current \}\) : Promise\.resolve\(\{ ok: false \}\)\),/);
  // The debounced save: same key, shape, stripping, 400 ms, and onSave only after the first (loaded) run.
  assert.match(src, /const light = lightBlocks\(blocks\);/);
  assert.match(src, /const state = \{ strokes, shapes, items, links, blocks: light, groups, areas \};\n\s+if \(storageKey\) \{ try \{ localStorage\.setItem\(storageKey, JSON\.stringify\(state\)\); \} catch \{ \/\* full or blocked storage loses drawings only \*\/ \} \}\n\s+if \(!loaded\) onSaveRef\.current\?\.\(state\);\n\s+\}, 400\);/);
});

test('LearnPage.jsx: pushBoard has an awaitable immediate variant for persist() - ok, failed, or skipped when not shared; the debounced push stays (LP1 Task 15)', () => {
  const page = readFileSync(new URL('./LearnPage.jsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  assert.match(page, /const pushBoard = useCallback\(\(_state, \{ now = false \} = \{\}\) => \{/);
  // Review round 1: an immediate push on a board whose sharing is unknown (its GET pending or failed) is not a save.
  assert.match(page, /const how = sharingOf\(sharingRef\.current\);\n\s+if \(how !== 'shared'\) return now && how === 'unknown' \? 'failed' : 'skipped';/);
  // C-15a: every PUT, immediate or debounced, goes through one serial queue and reads boardVersion inside it.
  assert.match(page, /const \[pushQueue\] = useState\(serial\);/);
  assert.match(page, /const put = \(\) => pushQueue\(async \(\) => \{\n\s+try \{\n\s+const data = await api\(boardPath, \{ method: 'PUT', body: JSON\.stringify\(\{ state: boardSnapshot\(\), version: boardVersion\.current \}\) \}\);/);
  assert.match(page, /return 'ok';\n\s+\} catch \(error\) \{\n\s+if \(error\.status === 409\) toast\(/);
  assert.match(page, /return 'failed';/);
  assert.match(page, /if \(now\) return put\(\);\n\s+pushTimer\.current = setTimeout\(put, 1500\);/);
  assert.match(page, /onSave=\{pushBoard\}/);
  // Review round 2: turning sharing on PUTs through the same queue, so it never races a queued board push; every board
  // PUT in the page is one of these two.
  assert.match(page, /await pushQueue\(async \(\) => \{\n\s+const saved = await api\(boardPath, \{ method: 'PUT', body: JSON\.stringify\(\{ state: boardSnapshot\(\), version: boardVersion\.current \}\) \}\);\n\s+boardVersion\.current = saved\.version;/);
  assert.equal((page.match(/method: 'PUT', body: JSON\.stringify\(\{ state: boardSnapshot\(\)/g) || []).length, 2);
});
