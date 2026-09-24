import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import fx from '../../fixtures/nanogpt-fixtures.generated.js';
import { assertCardGates, assertEvidence, assertSources, evaluated } from '../../card-gates.mjs';
import { sceneContentBounds, sceneLegibility } from '../../../scene-layout.js';
import { scene, sources, evidence, reviewStates } from './guided.js';

const [char, bpe] = fx.tokenizer.tokenizers;
const TEXT = fx.tokenizer.text;
const byId = (result, id) => result.state.objects.find(object => object.id === id);
const shown = (result, id) => byId(result, id).visible;
const unshow = s => s.replace(/[␣•]/g, ' '); // fixture marks ␣, the card shows •
const LABELS = /\b(beginner|intermediate|advanced|expert|newcomer|novice)s?\b/i;
// Independent oracles: prepare.py's printed vocabulary (sorted(set(data))) and
// its stoi/itos, rebuilt here in plain JS.
const CHARS = ['\n', ...' !$&\',-.3:;?ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'];
const stoi = new Map(CHARS.map((c, i) => [c, i]));
const show = c => (c === ' ' ? '•' : c);
// Labels-style token widths (animation-scene.js CHIP_PAD 16, CHIP_CHAR 9.5, CHIP_GAP 8).
const startX = (tokens, k) => 40 + tokens.slice(0, k).reduce((x, t) => x + 32 + t.length * 9.5 + 8, 0);
const ALL = [...TEXT].flatMap((c, pos) => ['char', 'bpe'].map(split => ({ pos, split })));

test('guided: every gate at every review state, and at every one of the 58 configurations', () => {
  assert.ok(reviewStates.length >= 2 && reviewStates.length <= 6);
  assertCardGates(scene, reviewStates);
  assertCardGates(scene, ALL);
});

test('guided: sources and evidence', () => {
  assertSources(sources, scene);
  assertEvidence(evidence);
  assert.equal(evidence.depth, 'Guided');
  for (const field of ['prerequisites', 'ladderRole']) assert.ok(String(evidence[field]).trim(), field);
});

test('guided: the ladder contract - 1-2 controls incl. a slider, a Builds-on line, no equations or shapes', () => {
  const controls = scene.inputs.filter(d => !d.hidden);
  assert.ok(controls.length >= 1 && controls.length <= 2);
  assert.ok(controls.some(d => d.presentation === 'slider'));
  for (const inputs of reviewStates) {
    const [result] = assertCardGates(scene, [inputs]);
    const labels = result.state.objects.filter(o => o.visible && o.label && ['text', 'equation'].includes(o.type));
    assert.equal(labels.filter(o => o.type === 'equation').length, 0);
    assert.doesNotMatch(labels.map(o => o.label).join('\n'), /\(\s*[A-Za-z]\w*\s*,\s*[A-Za-z]/, 'no tensor shapes');
    assert.doesNotMatch(labels.map(o => o.label).join('\n') + scene.title + JSON.stringify(scene.inputs), LABELS);
    assert.match(byId(result, 'prerequisites').label, /^Builds on: splitting text into pieces \(Overview\); sorting, and lookup in a table$/);
  }
});

test('guided: the live lookup finds every character\'s entry number, and decode returns it', () => {
  assert.equal(CHARS.length, char.vocabSize);
  for (const [pos, c] of [...TEXT].entries()) {
    const [result] = assertCardGates(scene, [{ pos, split: 'char' }]);
    const id = stoi.get(c);
    assert.equal(result.derived.id, id, `pos ${pos}`);
    assert.equal(id, char.ids[pos], 'oracle agrees with the fixture');
    assert.equal(byId(result, 'lookup-char').label, `Lookup: “${show(c)}” (code ${c.codePointAt(0)}) is entry ${id} of the sorted list → ID ${id}`);
    assert.equal(result.derived.code, c.codePointAt(0));
    assert.equal(byId(result, 'decode-char').label, `Decode: entry ${id} of the list is “${show(c)}” - the same character comes back`);
    assert.ok(shown(result, 'lookup-char') && !shown(result, 'lookup-bpe') && !shown(result, 'piece-bars'));
    // The found box sits on the entry in the 5 x 13 list; that row lights that column.
    const row = Math.floor(id / 13), col = id % 13;
    const entries = byId(result, `vocab-ch-${row}`).tokens;
    assert.equal(entries[col].trim(), show(CHARS[id]));
    assert.equal(byId(result, `vocab-rank-${row}`).tokens[col].trim(), String(id));
    assert.equal(byId(result, `vocab-ch-${row}`).cellHighlight, col);
    for (let r = 0; r < 5; r += 1) if (r !== row) assert.equal(byId(result, `vocab-ch-${r}`).cellHighlight, null);
    assert.equal(byId(result, 'found-box').x, startX(entries, col) - 4);
    // The list is quieted; the found entry is drawn again at full strength in place.
    for (let r = 0; r < 5; r += 1) for (const kind of ['ch', 'rank']) assert.ok(byId(result, `vocab-${kind}-${r}`).opacity < 1);
    const foundCh = byId(result, 'found-ch'), foundRank = byId(result, 'found-rank');
    assert.ok(foundCh.opacity === 1 && foundRank.opacity === 1);
    assert.deepEqual([foundCh.tokens[0].trim(), foundRank.tokens[0].trim()], [show(CHARS[id]), String(id)]);
    assert.deepEqual([foundCh.x, foundCh.y, foundRank.y], [startX(entries, col), byId(result, `vocab-ch-${row}`).y, byId(result, `vocab-rank-${row}`).y]);
    // The selected column in the encoded line holds this character over this ID.
    const line = pos < 15 ? 1 : 2, k = pos % 15;
    const toks = byId(result, `seq-tok-${line}`).tokens, ids = byId(result, `seq-id-${line}`).tokens;
    assert.equal(unshow(toks[k]).trim() || ' ', c === ' ' ? ' ' : c);
    assert.equal(Number(ids[k]), id);
    assert.equal(byId(result, 'sel-box').x, startX(toks, k) - 4);
  }
});

test('guided: the encoded line reads back to the text, and IDs stay below the list size', () => {
  const [charR, bpeR] = assertCardGates(scene, [{ pos: 0, split: 'char' }, { pos: 0, split: 'bpe' }]);
  const rows = (r, kind) => [1, 2].flatMap(n => byId(r, `seq-${kind}-${n}`).tokens);
  assert.deepEqual(rows(charR, 'tok').map(t => unshow(t).length === 2 ? unshow(t).trim() || ' ' : unshow(t)).join(''), TEXT);
  assert.deepEqual(rows(charR, 'id').map(Number), [...TEXT].map(c => stoi.get(c)));
  assert.ok(rows(charR, 'id').map(Number).every(id => id >= 0 && id <= CHARS.length - 1));
  assert.equal(rows(bpeR, 'tok').map(t => unshow(t).trim()).join(' '), TEXT);
  assert.deepEqual(rows(bpeR, 'id').map(Number), bpe.ids);
  // The ID row sits under its token row in both splits (it once overprinted in GPT-2 mode).
  for (const r of [charR, bpeR]) assert.equal(byId(r, 'seq-id-1').y, byId(r, 'seq-tok-1').y + 22);
  assert.ok(!byId(charR, 'spelled').visible && !byId(charR, 'char-box').visible);
  // Sorted by code: entry order is code order, so a larger code always means a larger ID.
  const codes = CHARS.map(c => c.codePointAt(0));
  assert.ok(codes.every((code, i) => i === 0 || code > codes[i - 1]));
  assert.match(byId(charR, 'vocab-title').label, /\(⏎ = new line; the one digit is 3\)$/);
  assert.deepEqual(CHARS.filter(c => /\d/.test(c)), ['3']);
  assert.match(byId(charR, 'range-char').label, new RegExp(`every ID is 0 to ${CHARS.length - 1}\\. .*capitals ${CHARS.indexOf('A')}-${CHARS.indexOf('Z')}, small letters ${CHARS.indexOf('a')}-${CHARS.indexOf('z')}\\.`));
});

test('guided: GPT-2 mode - the piece holding each character, its ID, the character inside it, and characters per ID', () => {
  // Oracle: walk the pieces' lengths to find the piece covering each position.
  const pieces = bpe.tokens.map(unshow);
  const holder = pos => { let end = 0; return pieces.findIndex(p => pos < (end += p.length)); };
  for (const [pos, c] of [...TEXT].entries()) {
    const [result] = assertCardGates(scene, [{ pos, split: 'bpe' }]);
    const k = holder(pos);
    assert.equal(result.derived.piece, k);
    assert.equal(byId(result, 'lookup-bpe').label, `Lookup: “${show(c)}” sits inside the piece “${bpe.tokens[k].replace("␣", "•")}” → ID ${bpe.ids[k]}`);
    assert.ok(unshow(bpe.tokens[k]).includes(c));
    // The piece is boxed under its bar (80 px pitch from x = 40), not lit: a lit bar drops below the baseline.
    assert.equal(byId(result, 'piece-box').x, 40 + k * 80 + 4);
    assert.ok(shown(result, 'piece-box'));
    assert.equal(byId(result, 'piece-bars').cellHighlight ?? null, null);
    assert.equal(byId(result, 'seq-tok-1').cellHighlight, k);
    assert.ok(!shown(result, 'lookup-char') && !shown(result, 'found-box') && !shown(result, 'vocab-ch-0') && !shown(result, 'found-ch'));
    // The piece spelled out under its column; the selected character lit and boxed.
    const offset = pos - pieces.slice(0, k).reduce((n, p) => n + p.length, 0);
    const spelled = byId(result, 'spelled');
    assert.ok(spelled.visible && shown(result, 'char-box'));
    assert.deepEqual(spelled.tokens.map(unshow), [...pieces[k]]);
    assert.equal(unshow(spelled.tokens[offset]), c);
    assert.equal(spelled.cellHighlight, offset);
    assert.equal(spelled.x, startX(byId(result, 'seq-tok-1').tokens, k));
    assert.equal(byId(result, 'char-box').x, spelled.x + offset * (32 + 9.5 + 8) - 4);
  }
  const [result] = assertCardGates(scene, [{ pos: 0, split: 'bpe' }]);
  const lengths = pieces.map(p => p.length);
  assert.equal(lengths.reduce((a, b) => a + b, 0), TEXT.length);
  assert.equal(result.derived.pieceTotal, TEXT.length);
  assert.deepEqual(byId(result, 'piece-bars').values, lengths);
  // Characters per ID: this line's 29 characters over its 5 IDs (the bars' mean),
  // and the whole play's characters over its GPT-2 IDs (both prepare.py sizes).
  assert.equal(TEXT.length / bpe.ids.length, 5.8);
  assert.deepEqual(result.derived.lineRate, [5.8]);
  assert.equal(byId(result, 'rate-line').label, `this line: ${TEXT.length} characters / ${bpe.ids.length} IDs = 5.8`);
  const playRate = Math.round((1115394 / (301966 + 36059)) * 1000) / 1000;
  assert.equal(playRate, 3.3);
  assert.deepEqual(result.derived.playRate, [playRate]);
  assert.equal(byId(result, 'rate-play').label, 'the whole play: 1,115,394 / 338,025 ≈ 3.3');
  // " any" comes first alphabetically yet has the larger ID (GPT-2 IDs are merge ranks).
  assert.ok(' any' < ' we' && bpe.ids[3] > bpe.ids[1]);
  assert.equal(byId(result, 'order').label, '“•any” comes first alphabetically, yet its ID is larger:');
  assert.equal(byId(result, 'order-2').label, `${bpe.ids[3]} > ${bpe.ids[1]}. GPT-2 numbers a piece by when its merge`);
  const merge = sources.find(s => s.kind === 'doc' && /merge ranks/.test(s.title));
  assert.equal(merge.url, 'https://github.com/openai/tiktoken/blob/0.14.0/tiktoken/load.py#L89-L144');
  assert.match(merge.note, new RegExp(`merge ${bpe.ids[1] - 256} .*merge ${bpe.ids[3] - 256},`));
  assert.equal(fx.provenance.tiktoken, '0.14.0');
  assert.equal(byId(result, 'range-bpe').label, `Every ID is 0 to ${(bpe.vocabSize - 1).toLocaleString('en-US')}: GPT-2's table has ${bpe.vocabSize.toLocaleString('en-US')} entries, the character list ${CHARS.length}.`);
});

// In the app the block is sized from the scene's static content (sizeFor ->
// sceneLegibility) and each state is fitted into it (sceneContentBounds). Every
// panel here is input-bound; equal bounds mean the card renders at scale 1 and
// never jumps when the slider or the tokenizer changes.
test('guided: the frame never refits and renders at scale 1', () => {
  const block = sceneLegibility(structuredClone(scene));
  assert.equal(block.scale, 1);
  for (const inputs of ALL) {
    const fitted = sceneContentBounds(evaluated(scene, inputs).scene);
    for (const edge of ['xMin', 'xMax', 'yMin', 'yMax']) assert.ok(Math.abs(fitted[edge] - block.bounds[edge]) < 0.5, `${JSON.stringify(inputs)} ${edge}`);
  }
  // The token rows (not counted by the fit) still sit inside the padded frame.
  const widest = Math.max(...ALL.slice(0, 2).map(inputs => { const r = evaluated(scene, inputs); return Math.max(...[1, 2].map(n => { const o = byId(r, `seq-tok-${n}`); return startX(o.tokens, o.tokens.length) - 8; })); }));
  assert.ok(widest <= block.bounds.xMax + 24, `token row ends at ${widest}`);
});

const PINNED = process.env.NANOGPT_PINNED
  || 'C:/Users/cyudhist/AppData/Local/Temp/claude/C--Users-cyudhist-Desktop-workspace-small-deploy/a0a20b94-1113-4966-863f-feffed07c1b6/scratchpad/nanogpt-3adf61e';
test('guided: every cited range says what its note claims, at the pinned revision', { skip: !existsSync(PINNED) && 'pinned NanoGPT copy not present' }, () => {
  const lines = file => readFileSync(join(PINNED, file), 'utf8').split('\n').map(l => l.replace(/\r$/, ''));
  const range = (file, a, b) => lines(file).slice(a - 1, b).join('\n');
  const expect = {
    'data/shakespeare_char/prepare.py:23-25': [/chars = sorted\(list\(set\(data\)\)\)/, /vocab_size = len\(chars\)/],
    'data/shakespeare_char/prepare.py:29-35': [/stoi = \{ ch:i for i,ch in enumerate\(chars\) \}/, /itos = \{ i:ch/, /def encode/, /def decode/],
    'data/shakespeare_char/prepare.py:64-66': [/^# all the unique characters:$/m, /^# vocab size: 65$/m],
    'data/shakespeare/prepare.py:19-22': [/enc = tiktoken\.get_encoding\("gpt2"\)/, /enc\.encode_ordinary\(train_data\)/],
  };
  const cited = sources.filter(s => s.kind === 'code').map(s => `${s.path}:${s.lines[0]}-${s.lines[1]}`);
  assert.deepEqual(cited.sort(), Object.keys(expect).sort());
  for (const [key, patterns] of Object.entries(expect)) {
    const [, file, a, b] = key.match(/^(.+):(\d+)-(\d+)$/);
    for (const pattern of patterns) assert.match(range(file, +a, +b), pattern, key);
  }
  assert.deepEqual(['\n', ...lines('data/shakespeare_char/prepare.py')[64].slice(2)], CHARS);
});
