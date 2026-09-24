import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import fx from '../../fixtures/nanogpt-fixtures.generated.js';
import tok from '../fixtures/tokenization.generated.js';
import { assertCardGates, assertEvidence, assertSources, evaluated } from '../../card-gates.mjs';
import { sceneContentBounds, sceneLegibility } from '../../../scene-layout.js';
import { scene, sources, evidence, reviewStates } from './deep.js';
import * as guided from './guided.js';

const byId = (result, id) => result.state.objects.find(object => object.id === id);
const LABELS = /\b(beginner|intermediate|advanced|expert|newcomer|novice)s?\b/i;
// Independent oracles, plain JS from the config and prepare.py's printed list.
const CHARS = ['\n', ...' !$&\',-.3:;?ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'];
const { batch_size: B, block_size: T, n_embd: C, n_layer: L } = fx.config.shakespeareChar;
const GPT2 = 50257;
const PADDED = Math.ceil(GPT2 / 64) * 64;
// get_num_params with bias=False: per block c_attn (C, 3C) + attn c_proj (C, C) +
// c_fc (C, 4C) + mlp c_proj (4C, C) + ln_1, ln_2 (C each); then ln_f (C) and the
// tied wte/lm_head table (V, C); wpe excluded.
const params = V => L * (C * 3 * C + C * C + C * 4 * C + 4 * C * C + 2 * C) + C + V * C;
// Printed digit-grouped: "1,003,854" in text, "1{,}003{,}854" in KaTeX.
const g = n => n.toLocaleString('en-US');
const tg = n => g(n).replaceAll(',', '{,}');
const cardChars = scene_ => {
  const inputs = Object.fromEntries(scene_.inputs.map(d => [d.name, d.default]));
  return evaluated(scene_, inputs).state.objects.filter(o => o.visible && o.label && ['text', 'code'].includes(o.type)).reduce((n, o) => n + o.label.length, 0);
};

test('deep: every gate at every review state (all 6 configurations)', () => {
  assert.equal(reviewStates.length, 6);
  assert.deepEqual(new Set(reviewStates.map(s => `${s.meta}/${s.input}`)).size, 6);
  assertCardGates(scene, reviewStates);
});

test('deep: sources and evidence', () => {
  assertSources(sources, scene);
  assertEvidence(evidence);
  assert.equal(evidence.depth, 'Deep dive');
  for (const field of ['prerequisites', 'ladderRole']) assert.ok(String(evidence[field]).trim(), field);
});

test('deep: the ladder contract - equations, shapes, a branch control, an edge case, most code, text budget', () => {
  const [result] = assertCardGates(scene, [{ meta: true, input: 'train' }]);
  const shownLabels = result.state.objects.filter(o => o.visible && o.label);
  assert.ok(shownLabels.filter(o => o.type === 'equation').length >= 3);
  assert.ok((shownLabels.map(o => o.label).join(' ').match(/\([A-Z], [A-Z](, [A-Z])?\)/g) || []).length >= 3, 'named-dimension shapes');
  assert.ok(scene.inputs.some(d => d.type === 'bool'), 'implementation branch as a control');
  assert.match(byId(result, 'prerequisites').label, /^Builds on: Guided; matrix shapes \(B, T, C\)$/);
  assert.doesNotMatch(shownLabels.map(o => o.label).join('\n') + scene.title + JSON.stringify(scene.inputs), LABELS);
  const codeCount = list => list.filter(s => s.kind === 'code').length;
  assert.ok(codeCount(sources) > codeCount(guided.sources));
  assert.ok(cardChars(scene) <= 1.3 * cardChars(guided.scene), `deep ${cardChars(scene)} chars vs guided ${cardChars(guided.scene)}`);
  // Every step box is backed by the code that implements it.
  const cited = new Set(sources.filter(s => s.kind === 'code').map(s => `${s.path}:${s.lines[0]}`));
  const steps = {
    branch: ['train.py:137', 'train.py:149', 'model.py:111'],
    encode: ['data/shakespeare_char/prepare.py:29', 'data/shakespeare/prepare.py:19', 'sample.py:56'],
    batch: ['train.py:116', 'data/shakespeare_char/prepare.py:48', 'sample.py:80'],
    wte: ['model.py:127', 'model.py:177'],
    head: ['model.py:133', 'model.py:184'],
  };
  for (const [id, needs] of Object.entries(steps)) {
    assert.equal(byId(result, id).type, 'box');
    for (const need of needs) assert.ok(cited.has(need), `${id} step cites ${need}`);
  }
});

test('deep: V, padding and every product follow the branch, checked against plain-JS oracles', () => {
  for (const meta of [true, false]) {
    const [result] = assertCardGates(scene, [{ meta, input: 'train' }]);
    const V = meta ? CHARS.length : PADDED, tokV = meta ? CHARS.length : GPT2;
    const d = result.derived;
    assert.equal(d.V, V);
    assert.deepEqual(d.pad, [V - tokV]);
    assert.deepEqual(d.maxId, [tokV - 1]);
    assert.deepEqual(d.wte, [V * C]);
    assert.deepEqual(d.total, [params(V)]);
    assert.deepEqual(d.logits, [B * T * V]);
    // The padding's reason (model.py's comment) shows only when there is padding; V really is a multiple of 64.
    assert.equal(byId(result, 'branch-detail').label, `V = ${g(V)}: ${g(tokV)} token IDs + ${V - tokV} padding rows${meta ? '' : ' (multiple of 64, for efficiency)'}`);
    if (!meta) assert.equal(V % 64, 0);
    assert.equal(byId(result, 'eq-vocab').label, `V = ${tg(tokV)} + ${V - tokV} = ${tg(V)}`);
    assert.equal(byId(result, 'eq-wte').label, `|W_{te}| = V\\,C = ${tg(V)} \\cdot ${C} = ${tg(V * C)}`);
    assert.equal(byId(result, 'eq-params').label, `N = L\\,(12C^2 + 2C) + C + VC = ${tg(params(V))}`);
    assert.equal(byId(result, 'eq-uint16').label, `\\max x = ${tg(tokV - 1)} \\le 2^{16} - 1 = ${tg(2 ** 16 - 1)}`);
    assert.ok(tokV - 1 <= 2 ** 16 - 1);
    assert.equal(byId(result, 'wte').label, `wte: table (${V}, ${C})`);
    assert.equal(byId(result, 'batch-detail').label, `x: (B, T) = (${B}, ${T}), int64 read from uint16`);
    assert.equal(byId(result, 'wte-detail').label, `tok_emb = wte(x): (B, T, C) = (${B}, ${T}, ${C})`);
    assert.equal(byId(result, 'head-detail').label, `logits: (B, T, V) = (${B}, ${T}, ${V}) → ${g(B * T * V)} scores`);
    // Context: block_size IDs in characters; a GPT-2 ID averages total chars / total IDs.
    const perId = meta ? 1 : 1115394 / (301966 + 36059);
    assert.deepEqual(d.ctx, [Math.round(T * perId * 1000) / 1000]);
    const span = meta ? `${T}` : `≈${Math.round(T * perId)}`;
    assert.equal(span, meta ? '256' : '≈845');
    assert.equal(byId(result, 'tradeoff').label, `Tradeoff: block_size = ${T} IDs span ${span} characters (${meta ? '1' : '≈3.3'} per ID)`);
    // The bar: same scale in both branches, wte after blocks + ln_f, lengths proportional.
    const body = byId(result, 'param-body'), wte = byId(result, 'param-wte');
    assert.ok(Math.abs(wte.x - (body.x + body.w)) < 0.01);
    assert.ok(Math.abs(wte.w / body.w - (V * C) / (params(V) - V * C)) < 1e-3);
    assert.equal(byId(result, 'param-wte-label').label, `wte: ${g(V * C)} of ${g(params(V))}`);
    // The bar's N is the count NanoGPT reports (wpe left out of it, not out of training).
    assert.equal(byId(result, 'param-title').label, "N = NanoGPT's reported non-position-embedding parameter count (wpe still trains), 20 px per million");
    // No large number is printed without grouping (shape tuples excepted).
    const printed = result.state.objects.filter(o => o.visible && o.label && ['text', 'box'].includes(o.type)).map(o => o.label.replace(/\([^)]*\)/g, ''));
    assert.deepEqual(printed.filter(l => /\d{5,}/.test(l)), []);
  }
  // The shakespeare_char model's own count, as model.py would print it.
  assert.equal((params(CHARS.length) / 1e6).toFixed(2), '10.65');
  assert.ok(params(PADDED) - PADDED * C < PADDED * C, 'with GPT-2 IDs the table outweighs everything else');
});

test('deep: the sampling path - B = 1, prompt length T, last position only; the digit prompt breaks only the character encoder', () => {
  const [line, digits] = tok.prompts;
  const stoiEncode = s => { const out = []; for (const c of s) { if (!CHARS.includes(c)) return { error: c, at: out.length }; out.push(CHARS.indexOf(c)); } return { ids: out }; };
  assert.deepEqual(stoiEncode(line.text).ids, fx.tokenizer.tokenizers[0].ids);
  assert.deepEqual(stoiEncode(digits.text), { error: '1', at: 7 });
  assert.deepEqual(CHARS.filter(c => /\d/.test(c)), ['3']);
  for (const meta of [true, false]) {
    const V = meta ? CHARS.length : PADDED;
    const [lineR, digitsR] = assertCardGates(scene, [{ meta, input: 'line' }, { meta, input: 'digits' }]);
    const lineT = meta ? line.text.length : fx.tokenizer.tokenizers[1].ids.length;
    assert.equal(byId(lineR, 'batch-detail').label, `x: (B, T) = (1, ${lineT}) - the encoded prompt`);
    assert.equal(byId(lineR, 'head-detail').label, `logits: (B, 1, V) = (1, 1, ${V}) → ${g(V)} scores`);
    assert.equal(byId(lineR, 'head').label, 'lm_head: last position only');
    const hidden = ['batch-detail', 'wte-detail', 'head-detail'];
    if (meta) {
      assert.equal(byId(digitsR, 'encode-detail').label, `“${digits.text}” → KeyError: '1': the ${CHARS.length} characters have no “1”`);
      assert.equal(byId(digitsR, 'encode-detail').role, 'warning');
      assert.ok(byId(digitsR, 'not-reached').visible);
      for (const id of hidden) assert.ok(!byId(digitsR, id).visible, `${id} hidden when encode fails`);
      for (const id of ['batch', 'wte', 'head']) assert.equal(byId(digitsR, id).opacity, 0.35);
    } else {
      assert.equal(byId(digitsR, 'encode-detail').label, `“${digits.text}” → ${digits.bpe.ids.length} IDs: ${digits.bpe.ids.join(', ')}`);
      assert.equal(digits.bpe.tokens.join(''), digits.text, 'byte-level pieces cover the prompt');
      assert.ok(!byId(digitsR, 'not-reached').visible);
      for (const id of hidden) assert.ok(byId(digitsR, id).visible);
    }
  }
  // The edge-case line follows the state: invite, send to meta.pkl first, or point at the failure shown.
  const tryDigits = `Edge case to try: the digit prompt - the only digit among the ${CHARS.length} characters is 3.`;
  const tryMeta = 'Edge case to try: turn meta.pkl on, then pick the digit prompt.';
  const edges = {
    'true/train': tryDigits, 'true/line': tryDigits,
    'true/digits': `Edge case shown above: the only digit among the ${CHARS.length} characters is 3, so “1” has no ID.`,
    'false/train': tryMeta, 'false/line': tryMeta,
    'false/digits': `Edge case to try: turn meta.pkl on - the ${CHARS.length} characters have no “1”; byte pairs encode any text.`,
  };
  for (const [state, result] of reviewStates.map(s => [`${s.meta}/${s.input}`, evaluated(scene, s)])) assert.equal(byId(result, 'edge').label, edges[state], state);
  const [train] = assertCardGates(scene, [{ meta: true, input: 'train' }]);
  assert.equal(byId(train, 'encode-detail').label, `${g(Math.floor(1115394 * 0.9))} train IDs (first 90%), ${g(1115394 - Math.floor(1115394 * 0.9))} val (last 10%)`);
  const [trainBpe] = assertCardGates(scene, [{ meta: false, input: 'train' }]);
  assert.equal(byId(trainBpe, 'encode-detail').label, '301,966 train IDs (first 90%), 36,059 val (last 10%)');
});

// The block is sized from the static content (sizeFor -> sceneLegibility); the
// step boxes, details and bar are input-bound, so every state must fit the same frame.
test('deep: the frame never refits and renders at scale 1', () => {
  const block = sceneLegibility(structuredClone(scene));
  assert.equal(block.scale, 1);
  for (const inputs of reviewStates) {
    const fitted = sceneContentBounds(evaluated(scene, inputs).scene);
    for (const edge of ['xMin', 'xMax', 'yMin', 'yMax']) assert.ok(Math.abs(fitted[edge] - block.bounds[edge]) < 0.5, `${JSON.stringify(inputs)} ${edge}`);
  }
});

const PINNED = process.env.NANOGPT_PINNED
  || 'C:/Users/cyudhist/AppData/Local/Temp/claude/C--Users-cyudhist-Desktop-workspace-small-deploy/a0a20b94-1113-4966-863f-feffed07c1b6/scratchpad/nanogpt-3adf61e';
test('deep: every cited range says what its note claims, at the pinned revision', { skip: !existsSync(PINNED) && 'pinned NanoGPT copy not present' }, () => {
  const lines = file => readFileSync(join(PINNED, file), 'utf8').split('\n').map(l => l.replace(/\r$/, ''));
  const range = (file, a, b) => lines(file).slice(a - 1, b).join('\n');
  const expect = {
    'train.py:137-144': [/derive vocab_size from the dataset/, /if os\.path\.exists\(meta_path\):/, /meta_vocab_size = meta\['vocab_size'\]/],
    'train.py:149-156': [/if init_from == 'scratch':/, /model_args\['vocab_size'\] = meta_vocab_size if meta_vocab_size is not None else 50304/, /GPTConfig\(\*\*model_args\)/],
    'model.py:111-111': [/vocab_size: int = 50304 # GPT-2 vocab_size of 50257, padded up to nearest multiple of 64 for efficiency/],
    'data/shakespeare_char/prepare.py:29-35': [/stoi = \{ ch:i for i,ch in enumerate\(chars\) \}/, /return \[stoi\[c\] for c in s\]/],
    'data/shakespeare/prepare.py:19-22': [/tiktoken\.get_encoding\("gpt2"\)/, /encode_ordinary\(train_data\)/],
    'sample.py:56-74': [/meta pickle/, /encode = lambda s: \[stoi\[c\] for c in s\]/, /encode = lambda s: enc\.encode\(s, allowed_special=\{"<\|endoftext\|>"\}\)/],
    'data/shakespeare_char/prepare.py:37-40': [/train_data = data\[:int\(n\*0\.9\)\]/, /val_data = data\[int\(n\*0\.9\):\]/],
    'data/shakespeare_char/prepare.py:48-52': [/dtype=np\.uint16/, /train\.bin/],
    'data/shakespeare/prepare.py:26-30': [/dtype=np\.uint16/, /val\.bin/],
    'train.py:116-125': [/def get_batch\(split\):/, /dtype=np\.uint16/, /astype\(np\.int64\)/, /data\[i\+1:i\+1\+block_size\]/],
    'sample.py:80-81': [/start_ids = encode\(start\)/, /\[None, \.\.\.\]/],
    'model.py:127-127': [/^ +wte = nn\.Embedding\(config\.vocab_size, config\.n_embd\)/],
    'model.py:177-177': [/tok_emb = self\.transformer\.wte\(idx\) # token embeddings of shape \(b, t, n_embd\)/],
    'model.py:133-133': [/self\.lm_head = nn\.Linear\(config\.n_embd, config\.vocab_size, bias=False\)/],
    'model.py:138-138': [/self\.transformer\.wte\.weight = self\.lm_head\.weight/],
    'model.py:184-191': [/if targets is not None:/, /logits = self\.lm_head\(x\)/, /logits = self\.lm_head\(x\[:, \[-1\], :\]\)/],
    'model.py:147-160': [/print\("number of parameters: %\.2fM" % \(self\.get_num_params\(\)\/1e6,\)\)/, /def get_num_params\(self, non_embedding=True\):/, /n_params -= self\.transformer\.wpe\.weight\.numel\(\)/],
    'model.py:35-37': [/c_attn = nn\.Linear\(config\.n_embd, 3 \* config\.n_embd, bias=config\.bias\)/, /c_proj = nn\.Linear\(config\.n_embd, config\.n_embd, bias=config\.bias\)/],
    'model.py:82-84': [/c_fc {4}= nn\.Linear\(config\.n_embd, 4 \* config\.n_embd, bias=config\.bias\)/, /c_proj {2}= nn\.Linear\(4 \* config\.n_embd, config\.n_embd, bias=config\.bias\)/],
    'model.py:96-101': [/ln_1 = LayerNorm\(config\.n_embd, bias=config\.bias\)/, /ln_2 = LayerNorm/, /self\.attn = /, /self\.mlp = /],
    'model.py:21-24': [/self\.weight = nn\.Parameter\(torch\.ones\(ndim\)\)/, /if bias else None/],
    'model.py:131-131': [/ln_f = LayerNorm\(config\.n_embd, bias=config\.bias\)/],
    'config/train_shakespeare_char.py:18-24': [/batch_size = 64/, /block_size = 256/, /n_layer = 6/, /n_head = 6/, /n_embd = 384/],
  };
  const cited = sources.filter(s => s.kind === 'code').map(s => `${s.path}:${s.lines[0]}-${s.lines[1]}`);
  assert.deepEqual([...cited].sort(), Object.keys(expect).sort());
  for (const [key, patterns] of Object.entries(expect)) {
    const [, file, a, b] = key.match(/^(.+):(\d+)-(\d+)$/);
    for (const pattern of patterns) assert.match(range(file, +a, +b), pattern, key);
  }
  // bias=False in this config, so the count above has no bias terms.
  assert.match(lines('train.py').join('\n'), /^bias = False/m);
  assert.equal(fx.config.shakespeareChar.bias, false);
  // The one-prompt batch and last-position generation the card states.
  assert.match(lines('model.py')[315], /logits, _ = self\(idx_cond\)/);
});

// The generator reproduces its output byte for byte (needs uv + tiktoken offline).
test('deep: gen_tokenization.py --check reproduces the fixture', t => {
  const script = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'gen_tokenization.py');
  const run = spawnSync('uv', ['run', '--offline', '--no-project', '--with', `tiktoken==${fx.provenance.tiktoken}`, 'python', script, '--check'], { encoding: 'utf8', timeout: 120000 });
  if (run.error || /offline|No solution|network/i.test(run.stderr || '') && run.status !== 0) return t.skip('uv/tiktoken unavailable offline');
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /matches a fresh regeneration/);
});
