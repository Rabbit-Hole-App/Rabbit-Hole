import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import fx from '../../fixtures/nanogpt-fixtures.generated.js';
import { scene, sources, evidence, reviewStates } from './deep.js';
import * as guided from './guided.js';
import { assertCardGates, assertEvidence, assertSources, evaluated } from '../../card-gates.mjs';
import { sceneContentBounds, sceneLegibility } from '../../../scene-layout.js';
import { groupDigits } from '../../../scene-format.js';

const on = (objects, id) => objects.get(id).visible && objects.get(id).opacity > 0;
const shownText = (sc, inputs) => evaluated(sc, inputs).state.objects
  .filter(o => o.visible && o.opacity > 0 && o.label && ['text', 'code'].includes(o.type));
const A = fx.architecture;
const CALLS = ['train', 'generate', 'crop', 'direct'];
const PARTS = [0, 1, 2];
const ALL = PARTS.flatMap(part => CALLS.flatMap(call => [true, false].map(tied => ({ part, call, tied }))));
const STEPS = ['call', 'assert', 'embed', 'qkv', 'att', 'attnOut', 'fc', 'mlpOut', 'lnf', 'head', 'loss'];
const AFTER_ASSERT = STEPS.slice(2);
const PART_OF = Object.fromEntries(scene.objects.map(o => [o.id, o.part]));
// Every object as its own sub-card draws it (shared ones from 1/3), so a
// check can read any row at a call without naming the page it sits on.
const view = (inputs = {}, time) => new Map(PARTS.flatMap(part => evaluated(scene, { ...inputs, part }, time).state.objects
  .filter(o => (PART_OF[o.id] ?? 0) === part).map(o => [o.id, o])));
const shownAll = inputs => PARTS.flatMap(part => shownText(scene, { ...inputs, part }));

// Which sub-card each object belongs to; status and rule are on all three.
const rows = (...keys) => keys.flatMap(key => [`${key}-step`, `${key}-shape`, `${key}-numbers`]);
const LAYOUT = {
  0: ['question', 'prerequisites', ...rows('call', 'assert', 'embed'), 'eq-embed', 'edge'],
  1: ['question-block', 'from-embed', 'block-header', 'block-bracket', ...rows('qkv', 'att', 'attnOut', 'fc', 'mlpOut'), 'att-path', 'att-path-default', 'eq-att', 'eq-attn', 'eq-mlp'],
  2: ['question-head', 'from-block', ...rows('lnf', 'head', 'loss'), 'eq-logits', 'eq-loss', 'tie', 'cost-train', 'cost-gen', 'cost-gen-blocks'],
};
const SHARED = ['status', 'header-rule'];

// Independent oracle: what model.py does to the shapes at each call site.
// train.py:123-125 / :300: B = batch_size rows of block_size, targets given.
// sample.py:81 + generate(): one prompt (B = 1), cropped at model.py:314.
// A direct forward() call is not cropped and meets the assert at :173.
function forward(call) {
  const site = {
    train: { B: A.batch_size, T: A.block_size, targets: true, crop: false },
    generate: { B: 1, T: fx.crossEntropy.context.length, targets: false, crop: true },
    crop: { B: 1, T: A.block_size + 1, targets: false, crop: true },
    direct: { B: 1, T: A.block_size + 1, targets: false, crop: false },
  }[call];
  const T = site.crop && site.T > A.block_size ? A.block_size : site.T;
  const { B } = site, C = A.n_embd, nh = A.n_head, V = A.vocab_size;
  if (T > A.block_size) return { B, T, error: `Cannot forward sequence of length ${T}, block size is only ${A.block_size}` };
  return {
    B, T, call: [B, T], embed: [B, T, C], qkv: [B, nh, T, C / nh], att: [B, nh, T, T], attnOut: [B, T, C], fc: [B, T, 4 * C],
    mlpOut: [B, T, C], lnf: [B, T, C], head: site.targets ? [B, T, V] : [B, 1, V], lossRows: site.targets ? B * T : null,
  };
}
const tuple = shape => `(${shape.join(', ')})`;

test('passes every card gate on every sub-card at every call site, tied and untied', () => {
  assertCardGates(scene, ALL);
});

test('three sub-cards paged in the card header: one object layout per part, status and rule shared', () => {
  const pager = scene.inputs[0];
  assert.deepEqual(pager, { name: 'part', type: 'index', label: 'Deep dive', of: 'parts', default: 0, presentation: 'pager' });
  assert.deepEqual(scene.exampleData.parts, ['Call site, assert, embedding', 'One Block, run n_layer times', 'ln_f, lm_head, the loss and two savings']);
  for (const part of PARTS) {
    assert.deepEqual(scene.objects.filter(o => o.part === part).map(o => o.id).sort(), [...LAYOUT[part]].sort(), `part ${part}`);
  }
  assert.deepEqual(scene.objects.filter(o => o.part === undefined).map(o => o.id), SHARED);
  // On screen: only the page's own objects and the shared ones.
  for (const inputs of ALL) {
    const shown = evaluated(scene, inputs).state.objects.filter(o => o.visible && o.opacity > 0).map(o => o.id);
    for (const id of shown) assert.ok(SHARED.includes(id) || LAYOUT[inputs.part].includes(id), `${JSON.stringify(inputs)}: ${id}`);
    for (const id of SHARED) assert.ok(shown.includes(id), `${JSON.stringify(inputs)}: ${id} shared`);
    assert.ok(shown.length <= 60, `${JSON.stringify(inputs)}: ${shown.length} objects`);
  }
});

test('each sub-card: question first, one step column, one formula block, Builds on only on 1/3', () => {
  for (const part of PARTS) {
    const shown = shownText(scene, { part });
    const top = shown.reduce((a, b) => (b.y < a.y ? b : a));
    assert.match(top.label, /\?$/, `part ${part}: the first line is a question`);
    assert.equal(top.id, LAYOUT[part][0]);
    assert.equal(shown.some(o => o.label.startsWith('Builds on:')), part === 0, `part ${part}: Builds on`);
    const own = scene.objects.filter(o => o.part === part);
    assert.equal(new Set(own.filter(o => o.type === 'box').map(o => o.initialState.x)).size, 1, `part ${part}: one step column`);
    // One formula block: the part's equations share a column and stack with no
    // more than 10 units between them (the attention card's rule).
    const equations = own.filter(o => o.type === 'equation').map(o => o.initialState).sort((a, b) => a.y - b.y);
    assert.equal(new Set(equations.map(eq => eq.x)).size, 1, `part ${part}: one formula column`);
    equations.slice(1).forEach((eq, i) => assert.ok(eq.y - (equations[i].y + equations[i].h) <= 10, `part ${part}: equations stack`));
    // No line of text reaches into the block (scene-layout's width estimate).
    const [blockTop, blockBottom, left] = [equations[0].y, equations.at(-1).y + equations.at(-1).h, equations[0].x];
    for (const call of CALLS) {
      for (const o of shownText(scene, { part, call })) {
        const size = o.typography === 'annotation' ? 13 : 15;
        if (o.y + 0.2 * 1.2 * size > blockTop && o.y - 0.8 * 1.2 * size < blockBottom) {
          assert.ok(o.x + o.label.length * size * 0.6 < left, `part ${part} ${call}: ${o.id} reaches into the formula block`);
        }
      }
    }
  }
});

test('Deep dive ladder rung: equations, named shapes, a branch control, an edge case, a what-if', () => {
  assert.deepEqual(scene.inputs.map(input => input.type), ['index', 'choice', 'bool']);
  assert.deepEqual(scene.inputs[1].options.map(option => option.id), CALLS);
  const objects = view();
  const equations = scene.objects.filter(o => o.type === 'equation').filter(o => on(objects, o.id));
  assert.ok(equations.length >= 5, `${equations.length} equations shown`);
  for (const name of ['(B, T)', '(B, T, C)', '(B, nh, T, hs)', '(B, nh, T, T)', '(B, T, 4C)', '(B, T, V)']) {
    assert.ok(shownAll({}).some(o => o.label.includes(name)), `named shape ${name}`);
  }
  assert.ok(shownAll({ call: 'generate' }).some(o => o.label.includes('(B, 1, V)')));
  assert.equal(scene.objects[1].initialState.text, 'Builds on: Guided; tensor shapes and matrix products');
  for (const inputs of ALL) {
    assert.doesNotMatch(shownText(scene, inputs).map(o => o.label).join('\n'), /\b(beginner|intermediate|advanced|expert|newcomer)s?\b/i);
  }
});

test('2/3 bridges back to Guided: the Block header names the per-Block count Guided makes', () => {
  assert.equal(view().get('block-header').label, 'Block.forward, run n_layer = 6 times, each Block with its own weights (the 12C² + 2C counted in Guided):');
  assert.equal(guided.scene.objects.find(o => o.id === 'blocks-name').initialState.text, 'Blocks: n_layer × (12C² + 2C)');
});

test('the trace reads end to end: 2/3 and 3/3 open with the shape the page before hands over', () => {
  for (const call of ['train', 'generate', 'crop']) {
    const objects = view({ call });
    assert.equal(objects.get('from-embed').label, `From 1/3: x: (B, T, C) = ${objects.get('embed-numbers').label} enters the first Block.`);
    assert.equal(objects.get('from-block').label, `From 2/3: x: (B, T, C) = ${objects.get('mlpOut-numbers').label} leaves the last Block.`);
    for (const id of ['from-embed', 'from-block']) assert.equal(objects.get(id).role, 'neutral');
  }
  const direct = view({ call: 'direct' });
  assert.equal(direct.get('from-embed').label, 'From 1/3: model(idx) at T = 257 failed the assert, so no Block runs.');
  assert.equal(direct.get('from-block').label, 'From 1/3: model(idx) at T = 257 failed the assert, so nothing here runs.');
  for (const id of ['from-embed', 'from-block']) assert.equal(direct.get(id).role, 'warning');
});

test('every shape matches the forward-pass oracle at every call site', () => {
  for (const call of ['train', 'generate', 'crop']) {
    const want = forward(call);
    const objects = view({ call });
    for (const key of ['embed', 'qkv', 'att', 'attnOut', 'fc', 'mlpOut', 'lnf', 'head']) {
      assert.equal(objects.get(`${key}-numbers`).label, tuple(want[key]), `${call}: ${key}`);
      assert.ok(on(objects, `${key}-numbers`), `${call}: ${key} shown on its sub-card`);
    }
    assert.equal(objects.get('head-shape').label, want.head[1] === 1 ? 'logits: (B, 1, V)' : 'logits: (B, T, V)');
    assert.equal(on(objects, 'loss-numbers'), want.lossRows !== null, `${call}: loss numbers shown only with targets`);
    if (want.lossRows) assert.equal(objects.get('loss-numbers').label, `${groupDigits(want.lossRows)} rows of ${A.vocab_size}`);
    assert.equal(objects.get('assert-step').role, 'neutral');
    if (call !== 'crop') assert.equal(objects.get('call-numbers').label, tuple(want.call), `${call}: call`);
  }
  // The crop: a 257-character prompt reaches forward as T = block_size.
  assert.equal(forward('crop').T, A.block_size);
  const crop = view({ call: 'crop' });
  assert.equal(crop.get('assert-numbers').label, '256 ≤ 256 after the crop');
  assert.equal(crop.get('call-numbers').label, '(1, 257) → (1, 256)');
});

test('generate() never sends more than block_size positions into forward (model.py:314 crops first)', () => {
  const crop = view({ call: 'crop' });
  assert.equal(scene.inputs[1].options.find(option => option.id === 'crop').label, 'generate() crops a 257-character prompt');
  assert.equal(crop.get('call-step').label, 'generate(): idx[:, -256:]');
  assert.equal(crop.get('call-shape').label, 'idx → idx_cond: (B, T)');
  assert.match(view({ call: 'generate' }).get('edge').label, /up to 256\.$/);
  // 257 appears only as the prompt generate() received (1/3) and in the status line's model(idx) What-if.
  for (const call of ['generate', 'crop']) {
    for (const part of PARTS) {
      const ids = shownText(scene, { call, part }).filter(o => o.label.includes(String(A.block_size + 1))).map(o => o.id);
      assert.deepEqual(ids, call === 'crop' && part === 0 ? ['status', 'call-numbers'] : ['status'], `${call} part ${part}`);
    }
  }
});

test('edge case: forward() with T > block_size fails the assert and nothing below it runs, on any sub-card', () => {
  const want = forward('direct');
  assert.equal(want.error, 'Cannot forward sequence of length 257, block size is only 256');
  const objects = view({ call: 'direct' });
  assert.equal(objects.get('assert-step').role, 'warning');
  assert.equal(objects.get('assert-numbers').label, '257 > 256: AssertionError');
  assert.equal(objects.get('assert-numbers').role, 'warning');
  assert.equal(objects.get('edge').role, 'warning');
  assert.ok(objects.get('edge').label.includes(want.error));
  for (const key of AFTER_ASSERT) {
    assert.equal(objects.get(`${key}-step`).opacity, 0.3, `${key} dimmed`);
    assert.ok(!on(objects, `${key}-numbers`), `${key} has no numbers - it never ran`);
  }
  for (const id of ['cost-train', 'cost-gen', 'cost-gen-blocks', 'eq-loss']) assert.ok(!on(objects, id));
  // The replay stops at the assert: no later step is ever highlighted, on any page.
  for (const part of PARTS) {
    for (let t = 0; t <= scene.duration; t += 0.05) {
      const frame = new Map(evaluated(scene, { call: 'direct', part }, t).state.objects.map(o => [o.id, o]));
      for (const key of AFTER_ASSERT) assert.ok(!frame.get(`${key}-step`).highlighted, `part ${part}: ${key} highlighted at t=${t.toFixed(2)}`);
    }
  }
});

test('each sub-card replays its own steps in order when the call runs', () => {
  const pages = [STEPS.slice(0, 3), STEPS.slice(3, 8), STEPS.slice(8)];
  const firstLit = (inputs, key) => {
    for (let t = 0; t <= scene.duration + 1e-9; t += 0.05) {
      if (evaluated(scene, inputs, t).state.objects.find(o => o.id === `${key}-step`).highlighted) return t;
    }
    return Infinity;
  };
  for (const call of ['train', 'generate']) {
    pages.forEach((keys, part) => {
      assert.deepEqual(keys.map(key => PART_OF[`${key}-step`]), keys.map(() => part));
      const times = keys.map(key => firstLit({ call, part }, key));
      assert.ok(times[0] < 0.5, `${call} part ${part}: the walk starts with the page`);
      for (let i = 1; i < keys.length; i += 1) assert.ok(times[i - 1] < times[i], `${call}: ${keys[i - 1]} before ${keys[i]}`);
      assert.ok(times.every(Number.isFinite), `${call} part ${part}: every step lit`);
    });
  }
});

test('tradeoffs are live calculations that match the oracle', () => {
  const V = A.vocab_size, C = A.n_embd;
  const train = view({ call: 'train' }), gen = view({ call: 'generate' });
  assert.equal(evaluated(scene, { call: 'train' }).derived.nAll[0], A.batch_size * A.block_size * V);
  assert.equal(train.get('cost-train').label,
    `Training scores every position: 64 × 256 × 65 = ${groupDigits(64 * 256 * 65)} logits, each compared with its target.`);
  // NanoGPT has no KV cache: generate() reruns the whole sequence each step
  // (model.py:315), so projecting only the last position saves lm_head work only.
  const costGen = objects => `${objects.get('cost-gen').label} ${objects.get('cost-gen-blocks').label}`;
  assert.equal(costGen(gen), `Only the last position is scored: 1 × 1 × 65 = 65 logits, not ${12 * 65}; all 12 positions still run every Block.`);
  assert.equal(costGen(view({ call: 'crop' })),
    `Only the last position is scored: 1 × 1 × 65 = 65 logits, not ${groupDigits(256 * 65)}; all 256 positions still run every Block.`);
  assert.ok(!on(train, 'cost-gen') && !on(train, 'cost-gen-blocks') && !on(gen, 'cost-train'));
  assert.ok(on(gen, 'cost-gen') && on(gen, 'cost-gen-blocks') && on(train, 'cost-train'));
  // Tying: one V x C matrix; at train.py's defaults (V = 50304, C = 768) it is 38633472.
  const tied = train, untied = view({ call: 'train', tied: false });
  assert.equal(tied.get('tie').label, `Tying stores one matrix for wte and lm_head, saving V × C = ${groupDigits(V * C)} parameters; ${groupDigits(50304 * 768)} at V = 50,304, C = 768.`);
  assert.equal(untied.get('tie').label, `What-if untied: lm_head adds its own V × C = ${groupDigits(V * C)} parameters; ${groupDigits(50304 * 768)} at V = 50,304, C = 768.`);
  assert.match(tied.get('eq-logits').label, /W_\{te\}/);
  assert.match(untied.get('eq-logits').label, /W_\{lm\}/);
  // The logits equation follows the call too: every position with targets,
  // the last one (x[:, [-1], :]) without - the head shape beside it agrees.
  for (const inputs of ALL) {
    const objects = new Map(evaluated(scene, inputs).state.objects.map(o => [o.id, o]));
    const last = forward(inputs.call).head?.[1] === 1 || inputs.call === 'direct';
    const eq = objects.get('eq-logits').label;
    assert.equal(eq.includes('_{:,T-1}'), last, `${JSON.stringify(inputs)}: ${eq}`);
    assert.match(eq, inputs.tied ? /W_\{te\}/ : /W_\{lm\}/);
    if (inputs.call !== 'direct') assert.equal(objects.get('head-shape').label, last ? 'logits: (B, 1, V)' : 'logits: (B, T, V)');
  }
  assert.equal(evaluated(scene, {}).derived.hs[0], C / A.n_head);
});

test('the att equation is att itself (B, nh, T, T); y = att v sits on the c_proj row', () => {
  const objects = view();
  const att = objects.get('eq-att').label, out = objects.get('eq-attn').label;
  assert.equal(att, String.raw`\mathrm{softmax}(qk^\top/\sqrt{hs}+M)`);
  assert.equal(objects.get('att-shape').label, 'att: (B, nh, T, T)');
  assert.ok(out.startsWith(String.raw`y=\text{att}\,v,`), out);
  assert.equal(objects.get('attnOut-step').label, 'att @ v → c_proj, x + attn');
  assert.equal(objects.get('eq-embed').label, String.raw`x = W_{te}[\mathrm{idx}] + W_{pe}[0{:}T]`);
  assert.equal(objects.get('eq-mlp').label, String.raw`x \gets x+\text{mlp}(\text{LN}_2(x))`);
  // A slash, not an inline \frac, whose 1 and BT draw at about 10px.
  assert.equal(objects.get('eq-loss').label, String.raw`\ell=-(1/BT)\sum_{b,t}\ln p(Y_{bt})`);
  // The Block's lines follow their rows: y = att v on the c_proj row, the MLP
  // update on the ln_2 row it starts on, the att line right above them.
  const top = id => scene.objects.find(o => o.id === id).initialState.y;
  assert.equal(top('eq-attn'), top('attnOut-step') - 3);
  assert.equal(top('eq-mlp'), top('fc-step') - 3);
  assert.ok(top('eq-att') < top('eq-attn') && top('eq-att') >= top('att-step'));
});

test('every step on the card has a code source', () => {
  const cited = new Set(sources.filter(s => s.kind === 'code').map(s => `${s.path}:${s.lines[0]}-${s.lines[1]}`));
  const STEP_SOURCES = {
    call: ['train.py:123-125', 'train.py:300-300', 'model.py:312-316', 'sample.py:81-81'],
    assert: ['model.py:170-173'], embed: ['model.py:174-179'], qkv: ['model.py:53-59', 'model.py:103-106'],
    att: ['model.py:61-71', 'model.py:44-50'], attnOut: ['model.py:72-75', 'model.py:103-106'], fc: ['model.py:82-92'],
    mlpOut: ['model.py:82-92', 'model.py:103-106'], lnf: ['model.py:182-182'], head: ['model.py:184-191', 'model.py:133-138'],
    loss: ['model.py:184-191'],
  };
  assert.deepEqual(Object.keys(STEP_SOURCES), STEPS);
  for (const [key, refs] of Object.entries(STEP_SOURCES)) for (const ref of refs) assert.ok(cited.has(ref), `${key}: cites ${ref}`);
});

test('the att row is marked as the manual path, and the flash branch is cited', () => {
  for (const inputs of ALL.filter(state => state.part === 1)) {
    const objects = new Map(evaluated(scene, inputs).state.objects.map(o => [o.id, o]));
    // No backend claim: scaled_dot_product_attention returns y, so the model never holds att.
    // Two lines, so it stays left of the formula block.
    assert.equal(`${objects.get('att-path').label} ${objects.get('att-path-default').label}`,
      '↑ manual path only: on the default path (scaled_dot_product_attention, PyTorch ≥ 2.0) the model never holds att.');
    for (const id of ['att-path', 'att-path-default']) assert.equal(objects.get(id).opacity, objects.get('att-step').opacity, `${id} dims with its row`);
  }
  const flash = sources.find(s => s.kind === 'code' && s.lines[0] === 44);
  assert.match(flash.note, /self\.flash = hasattr/);
});

test('structure, not prose: each sub-card\'s text stays within 1.3x the Guided card', () => {
  const chars = (sc, inputs = {}) => shownText(sc, { ...Object.fromEntries(sc.inputs.map(d => [d.name, d.default])), ...inputs })
    .reduce((n, o) => n + o.label.length, 0);
  for (const part of PARTS) assert.ok(chars(scene, { part }) <= 1.3 * chars(guided.scene), `part ${part}: deep ${chars(scene, { part })} vs guided ${chars(guided.scene)}`);
});

const PINNED = process.env.NANOGPT_PINNED
  || 'C:/Users/cyudhist/AppData/Local/Temp/claude/C--Users-cyudhist-Desktop-workspace-small-deploy/a0a20b94-1113-4966-863f-feffed07c1b6/scratchpad/nanogpt-3adf61e';
const lines = path => readFileSync(join(PINNED, path), 'utf8').split('\n');
test('the assert, the crop and the tie say what the card says', { skip: !existsSync(PINNED) && 'pinned NanoGPT copy not present' }, () => {
  const model = lines('model.py');
  assert.match(model[172], /assert t <= self\.config\.block_size, f"Cannot forward sequence of length \{t\}, block size is only \{self\.config\.block_size\}"/);
  assert.match(model[313], /idx\[:, -self\.config\.block_size:\]/);
  assert.match(model[137], /self\.transformer\.wte\.weight = self\.lm_head\.weight/);
  assert.match(model[44], /self\.flash = hasattr\(torch\.nn\.functional, 'scaled_dot_product_attention'\)/);
  assert.match(model[63], /is_causal=True/);
  assert.match(model[189], /logits = self\.lm_head\(x\[:, \[-1\], :\]\)/);
  assert.match(model[110], /vocab_size: int = 50304 /);
});

test('sources: well-formed, pinned, every status labelled, quotes verbatim', () => {
  assertSources(sources, scene);
  assert.deepEqual(sources.filter(s => s.kind === 'calculation').map(s => s.status).sort(), ['Live calculation', 'Source value', 'What-if']);
  if (!existsSync(PINNED)) return;
  for (const { path, lines: [start, end], note } of sources.filter(source => source.kind === 'code')) {
    const cited = lines(path).slice(start - 1, end).join('\n');
    const quotes = [...note.matchAll(/"([^"]+)"/g)].map(match => match[1]);
    assert.ok(quotes.length, `${path}:${start}: note quotes the source`);
    for (const quote of quotes) assert.ok(cited.includes(quote), `${path}:${start}-${end} contains "${quote}"`);
  }
});

test('evidence record is complete, depth-labelled and pinned', () => {
  assertEvidence(evidence);
  assert.equal(evidence.depth, 'Deep dive');
  assert.equal(evidence.prerequisites, scene.objects[1].initialState.text);
  assert.equal(evidence.sourceRevision, `karpathy/nanoGPT@${fx.provenance.nanogpt.commit}`);
  assert.equal(scene.objects[0].initialState.text, evidence.learningQuestion);
  assert.equal(scene.objects[0].part, 0);
  assert.ok(evidence.learningQuestion.length <= 95);
});

test('review states: every sub-card, each approved (call, tied) state once, all gates green', () => {
  // The six approved states first, then the calls on the sub-cards they also change.
  assert.equal(reviewStates.length, 9);
  assert.deepEqual([...new Set(reviewStates.map(state => state.part))], PARTS);
  const approved = ['train', 'generate', 'crop', 'direct'].map(call => `${call}/true`).concat(['train/false', 'generate/false']);
  assert.deepEqual(reviewStates.slice(0, 6).map(state => `${state.call}/${state.tied}`).sort(), approved.sort());
  // Each state sits on a page its call or switch changes: crop and the assert
  // on 1/3, untied on 3/3 - and 3/3 is also reviewed tied (the tie line, W_te).
  for (const { part, call, tied } of reviewStates.slice(0, 6)) {
    if (['crop', 'direct'].includes(call)) assert.equal(part, 0, call);
    if (!tied) assert.equal(part, 2, 'untied');
  }
  assert.ok(reviewStates.some(state => state.part === 2 && state.tied), '3/3 reviewed tied');
  assertCardGates(scene, reviewStates);
});

// In the app the block is sized from the scene's static content
// (LearningBlocks sizeFor -> sceneLegibility) and each state is fitted into it
// (AnimatedScene -> sceneContentBounds); equal bounds mean the card never
// refits between states or sub-cards and renders at scale 1.
test('the frame never refits: every state on every sub-card has the bounds the block is sized from', () => {
  const legibility = sceneLegibility(structuredClone(scene));
  assert.equal(legibility.scale, 1);
  const block = legibility.bounds;
  assert.ok(block.yMax - block.yMin <= 800 && block.xMax - block.xMin <= 1060, 'fits the viewport at scale 1');
  for (const inputs of ALL) {
    const fitted = sceneContentBounds(evaluated(scene, inputs).scene);
    for (const edge of ['xMin', 'xMax', 'yMin', 'yMax']) {
      assert.ok(Math.abs(fitted[edge] - block[edge]) < 0.5, `${JSON.stringify(inputs)} ${edge}: ${fitted[edge]} vs ${block[edge]}`);
    }
  }
});
