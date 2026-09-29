import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import fx from '../fixtures/nanogpt-fixtures.generated.js';
import { scene, evidence, sources } from './c13-multi-head.js';
import { assertCardGates, assertEvidence, assertSources } from '../card-gates.mjs';
import { distributeRounding } from '../../scene-derive.js';

const STATES = [{ head: 0, query: 3 }, { head: 1, query: 3 }, { head: 2, query: 3 }, { head: 0, query: 1 }];
// Every head x query the pickers can reach - the four taught states plus the rest.
const ALL = [0, 1, 2].flatMap(head => [0, 1, 2, 3].map(query => ({ head, query })));
const byId = (result, id) => result.state.objects.find(object => object.id === id);
const close = (actual, expected, where, tol = 1e-9) => {
  assert.equal(actual.length, expected.length, where);
  actual.forEach((value, i) => {
    if (expected[i] === null) assert.equal(value, null, `${where}[${i}] should be masked`);
    else assert.ok(Math.abs(value - expected[i]) <= tol, `${where}[${i}]: ${value} vs ${expected[i]}`);
  });
};

// Independent oracle: NanoGPT's manual attention path for one head and one
// query row, in plain JS floats (model.py:67-71): (q @ k^T) * 1/sqrt(hs),
// future masked, softmax, att @ v.
function oracle(h, i) {
  const { Qs, Ks, Vs, hs } = scene.exampleData;
  const q = Qs[h][i];
  const scores = Ks[h].map((k, j) => (j <= i ? q.reduce((s, x, d) => s + x * k[d], 0) * (1 / Math.sqrt(hs)) : null));
  const kept = scores.filter(s => s !== null);
  const max = Math.max(...kept);
  const z = kept.reduce((s, x) => s + Math.exp(x - max), 0);
  const weights = scores.map(s => (s === null ? null : Math.exp(s - max) / z));
  const out = Vs[h][0].map((unused, d) => weights.reduce((s, w, j) => s + (w ?? 0) * Vs[h][j][d], 0));
  return { scores, weights, out };
}

test('c13-multi-head: question first, and every gate passes at every taught state (and every reachable one)', () => {
  assert.equal(scene.objects[0].semanticId, 'question');
  assert.ok(scene.objects[0].initialState.text.length <= 95);
  assertCardGates(scene, STATES);
  assertCardGates(scene, ALL);
});

test('toy config and data provenance hold', () => {
  const { tokens, nHead, hs, C, Qs, Ks, Vs } = scene.exampleData;
  assert.deepEqual(tokens, fx.tokenizer.tokenizers[1].tokens.slice(0, 4).map(t => t.replaceAll('␣', '•')));
  assert.equal(C, nHead * hs);
  assert.equal(scene.derived.scaledSel.args[1], 1 / Math.sqrt(hs), 'the literal multiplier is 1/sqrt(hs)');
  for (const m of [...Qs, ...Ks, ...Vs]) assert.ok(m.length === 4 && m.every(row => row.length === hs));
});

test('score row, weight row, head output and concat match the plain-JS oracle', () => {
  for (const inputs of ALL) {
    const [result] = assertCardGates(scene, [inputs]);
    const { head, query } = inputs;
    const where = JSON.stringify(inputs);
    const { scores, weights, out } = oracle(head, query);
    close(byId(result, 'scores-row').values, scores, `${where} scores`, 1e-3);
    close(byId(result, 'weights-row').values, weights, `${where} weights`, 1e-3);
    close(byId(result, 'head-output').values, out, `${where} head output`, 2e-3);
    const concat = [0, 1, 2].flatMap(h => oracle(h, query).out);
    close(byId(result, 'concat').values, concat, `${where} concat`, 2e-3);
    // The outlined slice IS the selected head's output, number for number.
    const slice = byId(result, 'concat').cellHighlight;
    assert.deepEqual(slice, [0, 1, 2, 3].map(d => head * scene.exampleData.hs + d));
    close(slice.map(i => byId(result, 'concat').values[i]), byId(result, 'head-output').values, `${where} slice`, 1e-3);
    // The named largest weight = the true argmax of the visible weights.
    const top = weights.reduce((best, w, j) => (w !== null && (best === null || w > weights[best]) ? j : best), null);
    assert.equal(result.derived.topAt, top, `${where} largest weight`);
    assert.ok(byId(result, 'top-note').label.includes(`"${scene.exampleData.tokens[top]}"`));
    // Displayed 2-decimal weights need no rounding redistribution: they are
    // the honest roundings of the true weights and sum to exactly 1.
    const shown = weights.filter(w => w !== null).map(w => Math.round(w * 100));
    assert.equal(shown.reduce((s, x) => s + x, 0), 100, `${where} shown weights sum to 1`);
    const displayed = distributeRounding(byId(result, 'weights-row').values, 2).filter(w => w !== null);
    close(displayed, shown.map(x => x / 100), `${where} displayed weights = honest rounding`);
    // Captions follow state.
    assert.ok(byId(result, 'inspecting').label.includes(`head ${head} at query "${scene.exampleData.tokens[query]}"`));
    assert.ok(byId(result, 'slice-note').label.includes(`head ${head}, entries ${head * 4 + 1}-${head * 4 + 4} of 12`));
    assert.ok(byId(result, 'tokens').cellHighlight === query);
  }
});

test('every reachable state: captions match the computed row', () => {
  const tokens = scene.exampleData.tokens;
  const q0Rows = [];
  for (const inputs of ALL) {
    const [result] = assertCardGates(scene, [inputs]);
    const { head, query } = inputs;
    const where = JSON.stringify(inputs);
    const weights = byId(result, 'weights-row').values;
    const role = byId(result, 'role-note').label;
    const mask = byId(result, 'mask-note').label;
    // (1) The designed role is the live peak from the second token on.
    if (query > 0) assert.equal(result.derived.topAt, [query - 1, 0, query][head], `${where} designed peak`);
    // (2) Role captions: no role claim at the first token; the coincidence at the second.
    if (query === 0) {
      assert.doesNotMatch(role, /built to attend/, `${where} no role claim at the first token`);
      assert.match(role, /all 3 heads .* agree/);
      q0Rows.push(weights);
    } else if (query === 1 && head < 2) {
      assert.ok(role.includes(`both "${tokens[0]}"`) && tokens[result.derived.topAt] === tokens[0], where);
    } else {
      assert.ok(role.includes(['the previous token', 'the first token', 'the token itself'][head]), where);
    }
    // (3) "puts most of it": the largest visible weight is a majority.
    assert.ok(Math.max(...weights.filter(w => w !== null)) > 0.5, `${where} most of it`);
    // (4) Masked cells: 3 - query of them, in both rows, and the caption says so.
    const masked = weights.map(w => w === null);
    assert.equal(masked.filter(Boolean).length, 3 - query, `${where} masked count`);
    assert.deepEqual(byId(result, 'scores-row').values.map(v => v === null), masked);
    assert.ok(mask.startsWith(`Query "${tokens[query]}"`), where);
    if (query === 3) assert.match(mask, /every position is visible/);
    else assert.match(mask, /masked/);
    tokens.forEach((token, j) => {
      if (j === query || !mask.includes(`"${token}"`)) return;
      assert.equal(mask.includes(`"${token}" is masked`), j > query, `${where} "${token}" wording`);
    });
    // The drawn V row is the selected head's row at the largest weight.
    assert.deepEqual(byId(result, 'v-top').values, scene.exampleData.Vs[head][result.derived.topAt], `${where} V row`);
    assert.ok(byId(result, 'v-top-title').label.includes(`"${tokens[result.derived.topAt]}"`));
    assert.ok(byId(result, 'concat').label.includes(`query "${tokens[query]}"`));
  }
  // "and agree": at the first token every head's weight row is identical.
  q0Rows.forEach(row => assert.deepEqual(row, q0Rows[0]));
});

test('real sizes are bound from the fixture', () => {
  const [result] = assertCardGates(scene, [{}]);
  assert.ok(byId(result, 'config').label.includes(`n_head ${fx.architecture.n_head}, n_embd ${fx.architecture.n_embd}`));
});

test('the taught states show what the card claims', () => {
  const [h0, h1, h2, h0q1] = assertCardGates(scene, STATES);
  const tokens = scene.exampleData.tokens;
  const peak = result => result.derived.topAt;
  assert.equal(peak(h0), 2, 'head 0 at the last query: previous token');
  assert.equal(peak(h1), 0, 'head 1: first token');
  assert.equal(peak(h2), 3, 'head 2: the token itself');
  assert.equal(peak(h0q1), 0, 'head 0 at query 1: the previous token is the first one');
  for (const result of [h0, h1, h2]) assert.ok(byId(result, 'weights-row').values.every(v => v !== null), 'last query: nothing masked');
  assert.deepEqual(byId(h0q1, 'weights-row').values.map(v => v === null), [false, false, true, true], 'query 1: two future positions blank');
  assert.deepEqual(byId(h0q1, 'scores-row').values.map(v => v === null), [false, false, true, true]);
  // Weight mass moves with the head: every head's peak weight is a majority.
  for (const result of [h0, h1, h2]) assert.ok(Math.max(...byId(result, 'weights-row').values) > 0.5);
  // Changing the head alone never changes the concatenation (same query).
  assert.deepEqual(byId(h0, 'concat').values, byId(h1, 'concat').values);
  assert.deepEqual(byId(h1, 'concat').values, byId(h2, 'concat').values);
  assert.ok(byId(h0q1, 'mask-note').label.includes(`"${tokens[1]}"`));
});

// The sha256-pinned NanoGPT files generate_fixtures.py caches; the quote check
// is skipped where that cache is absent.
const cached = path => {
  const sha = fx.provenance.nanogpt.files[path];
  const file = join(tmpdir(), 'nanogpt-fixture-cache', sha);
  if (!existsSync(file)) return null;
  const bytes = readFileSync(file);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), sha, `${path} cache is not the pinned file`);
  return bytes.toString('utf8').split('\n');
};
const pinned = { 'model.py': cached('model.py'), 'config/train_shakespeare_char.py': cached('config/train_shakespeare_char.py') };

test('sources: provenance lives under the card, not on it', () => {
  assertSources(sources, scene);
  const at = (path, lines) => sources.find(s => s.kind === 'code' && s.path === path && s.lines.join('-') === lines.join('-'));
  for (const [path, lines, quotes] of [
    ['model.py', [56, 59], ['q, k, v  = self.c_attn(x).split(self.n_embd, dim=2)', 'q = q.view(B, T, self.n_head, C // self.n_head).transpose(1, 2) # (B, nh, T, hs)']],
    ['model.py', [66, 71], ['# manual implementation of attention', 'att = (q @ k.transpose(-2, -1)) * (1.0 / math.sqrt(k.size(-1)))', "att = att.masked_fill(self.bias[:,:,:T,:T] == 0, float('-inf'))",
      'att = F.softmax(att, dim=-1)', 'att = self.attn_dropout(att)', 'y = att @ v']],
    ['model.py', [72, 72], ['y = y.transpose(1, 2).contiguous().view(B, T, C) # re-assemble all head outputs side by side']],
    ['model.py', [75, 75], ['y = self.resid_dropout(self.c_proj(y))']],
    ['model.py', [35, 37], ['self.c_attn = nn.Linear(config.n_embd, 3 * config.n_embd, bias=config.bias)', 'self.c_proj = nn.Linear(config.n_embd, config.n_embd, bias=config.bias)']],
    ['model.py', [62, 64], ['torch.nn.functional.scaled_dot_product_attention(q, k, v, attn_mask=None, dropout_p=self.dropout if self.training else 0, is_causal=True)']],
    ['config/train_shakespeare_char.py', [23, 24], [`n_head = ${fx.architecture.n_head}`, `n_embd = ${fx.architecture.n_embd}`]],
  ]) {
    const entry = at(path, lines);
    assert.ok(entry, `cites ${path}:${lines.join('-')}`);
    const file = pinned[path]?.slice(lines[0] - 1, lines[1]).join('\n');
    for (const quoted of quotes) {
      assert.ok(entry.note.includes(`“${quoted}”`), `${path}:${lines.join('-')} quotes "${quoted}"`);
      if (file) assert.ok(file.includes(quoted), `${path}:${lines.join('-')} really says "${quoted}"`);
    }
  }
  if (pinned['model.py']) assert.match(pinned['model.py'][45 - 1], /self\.flash = hasattr\(torch\.nn\.functional, 'scaled_dot_product_attention'\)/);
  assert.deepEqual(sources.filter(s => s.kind === 'calculation').map(s => s.status), ['Calculated toy example', 'Live calculation']);
  assert.equal(sources.find(s => s.status === 'Calculated toy example').reproduce, undefined, 'authored here, not by the fixture generator');
  assert.ok(sources.some(s => s.kind === 'dataset'));
  // The card shows a prefix of the recorded encoding, and says who recorded it.
  const tok = sources.find(s => s.kind === 'doc' && s.title.startsWith('tiktoken'));
  assert.ok(tok.note.includes(`first 4 of the ${fx.tokenizer.tokenizers[1].count}`) && tok.note.includes('generate_fixtures.py'));
});

test('evidence record is complete', () => {
  assertEvidence(evidence);
  assert.equal(evidence.card, 'c13-multi-head');
  assert.match(evidence.sourceRevision, /3adf61e154c3fe3fca428ad6bc3818b27a3b8291/);
});
