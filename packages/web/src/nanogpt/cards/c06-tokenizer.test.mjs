import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fx from '../fixtures/nanogpt-fixtures.generated.js';
import { assertCardGates, assertEvidence, assertSources, pinnedFile } from '../card-gates.mjs';
import { CHIP_CHAR, CHIP_GAP, CHIP_PAD } from '../../animation-scene.js';
import { sceneContentBounds } from '../../scene-layout.js';
import { scene, evidence, sources } from './c06-tokenizer.js';

const STATES = [{ tokenizer: 0 }, { tokenizer: 1 }];
const tk = fx.tokenizer;
const [char, bpe] = tk.tokenizers;
const byId = (result, id) => result.state.objects.find(object => object.id === id);

// Independent oracle for the character tokenizer: the full vocabulary that
// data/shakespeare_char/prepare.py prints for tinyshakespeare (its own
// comment, lines 64-65: a newline, then the rest), sorted as sorted(set(data)).
// The pinned-file test below rebuilds this from line 65 itself.
const CHARS = ['\n', ...' !$&\',-.3:;?ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'];
const unshow = token => token.replaceAll('␣', ' ');
const rowWidth = tokens => tokens.reduce((w, t) => w + CHIP_PAD * 2 + t.length * CHIP_CHAR + CHIP_GAP, 0) - CHIP_GAP;

test('c06: every gate passes at every preset', () => {
  assertCardGates(scene, STATES);
});

test('c06: picker names follow the fixture order', () => {
  scene.exampleData.presetNames.forEach((name, i) => assert.ok(tk.tokenizers[i].label.startsWith(name), `${name} vs ${tk.tokenizers[i].label}`));
});

test('c06: character IDs match prepare.py\'s sorted stoi, recomputed here', () => {
  assert.deepEqual([...CHARS].sort(), CHARS, 'oracle vocabulary is sorted like sorted(set(data))');
  assert.equal(CHARS.length, char.vocabSize);
  const stoi = new Map(CHARS.map((ch, i) => [ch, i]));
  assert.deepEqual([...tk.text].map(ch => stoi.get(ch)), char.ids);
  assert.equal(char.count, [...tk.text].length);
});

test('c06: both tokenizations cover exactly the same text', () => {
  for (const t of tk.tokenizers) {
    assert.equal(t.tokens.map(unshow).join(''), tk.text, t.id);
    assert.equal(t.ids.length, t.count, t.id);
    assert.equal(t.tokens.length, t.count, t.id);
    assert.ok(t.ids.every(id => Number.isInteger(id) && id >= 0 && id < t.vocabSize), `${t.id} IDs inside the vocabulary`);
  }
});

test('c06: displayed values follow the selected preset', () => {
  const results = STATES.map(inputs => assertCardGates(scene, [inputs])[0]);
  results.forEach((result, i) => {
    const t = tk.tokenizers[i];
    const tokRows = ['tokens-1', 'tokens-2'].map(id => byId(result, id).tokens);
    const idRows = ['ids-1', 'ids-2'].map(id => byId(result, id).tokens);
    // Rows read back to the fixture's tokens and exact integer IDs, in order.
    assert.deepEqual(tokRows.flat().map(s => s.trim()), t.tokens);
    assert.deepEqual(idRows.flat().map(s => Number(s.trim())), t.ids);
    assert.ok(idRows.flat().every(s => /^ *\d+ *$/.test(s)), 'IDs print as integers');
    // Token and ID share a column: same padded width, centred the same way.
    tokRows.forEach((row, line) => row.forEach((s, k) => assert.equal(s.length, idRows[line][k].length)));
    for (const row of [...tokRows, ...idRows]) assert.ok(32 + rowWidth(row) <= scene.width - 8, 'row fits the card');
    assert.equal(byId(result, 'readout').label, `${t.count} tokens  ·  vocabulary of ${t.vocabSize} possible token IDs`);
    assert.equal(byId(result, 'selected').label.startsWith(`Selected preset: ${t.label}`), true);
    assert.equal(byId(result, 'compare').label, `Same text: ${char.count} tokens (character-level) vs ${bpe.count} tokens (GPT-2 BPE)`);
    assert.equal(byId(result, 'vocab-rule').label, scene.exampleData.vocabRules[i]);
    assert.ok(byId(result, 'vocab-rule').label.includes(String(t.vocabSize)));
    assert.ok(byId(result, 'input-text').label.includes(tk.text));
    // The lower block starts below the last drawn line pair.
    const lastIds = byId(result, tokRows[1].length ? 'ids-2' : 'ids-1');
    assert.ok(byId(result, 'ids-seen').y > lastIds.y + 32, 'caption clears the rows');
  });
  assert.equal(byId(results[1], 'tokens-2').tokens.length, 0, 'BPE fits one line');
  // Switching presets must not re-zoom the card: the content-bounds fit is the same.
  const bounds = results.map(result => { const { contributors: _c, ...box } = sceneContentBounds(result.scene); return box; });
  assert.deepEqual(bounds[0], bounds[1]);
  assert.ok(byId(results[0], 'model-1').label.includes(`vocab_size = ${char.vocabSize} `));
  assert.equal(fx.architecture.vocab_size, char.vocabSize);
  const padded = Math.ceil(bpe.vocabSize / 64) * 64;
  assert.ok(byId(results[1], 'model-1').label.includes(`vocab_size = ${padded} (${bpe.vocabSize} padded`));
  assert.ok(tk.modelVocabNote.includes(`= ${padded}`));
  assert.ok(byId(results[1], 'model-2').label.endsWith(`vocab_size = ${bpe.vocabSize}.`));
  assert.ok(scene.objects[0].semanticId === 'question' && scene.objects[0].initialState.text.length <= 95);
});

test('c06: sources are well-formed and the card names their status', () => {
  assertSources(sources, scene);
  const cited = sources.filter(source => source.kind === 'code').map(source => `${source.path}:${source.lines.join('-')}`);
  for (const ref of ['data/shakespeare_char/prepare.py:24-33', 'data/shakespeare/prepare.py:20-21', 'train.py:137-144', 'train.py:153-155',
    'data/shakespeare_char/prepare.py:55-61', 'model.py:111-111', 'model.py:223-223', 'README.md:160-166', 'README.md:22-22']) {
    assert.ok(cited.includes(ref), `cites ${ref}`);
  }
  assert.deepEqual(sources.filter(source => source.kind === 'calculation').map(source => source.status), ['Calculated toy example']);
  assert.ok(sources.some(source => source.kind === 'doc' && source.title.includes(fx.provenance.tiktoken)), 'tiktoken pin');
  assert.ok(sources.some(source => source.kind === 'dataset' && source.sha256 === fx.provenance.dataset.sha256), 'dataset pin');
});

test('c06: evidence record is complete', () => {
  assertEvidence(evidence);
});

// The cited lines, checked against the pinned NanoGPT files when they are cached.
const pinned = ['train.py', 'model.py', 'README.md', 'data/shakespeare_char/prepare.py', 'data/shakespeare/prepare.py'].every(path => pinnedFile(path));
test('c06: file:line citations match the pinned revision', { skip: !pinned && 'pinned NanoGPT cache not present (run generate_fixtures.py)' }, () => {
  const line = (file, n) => pinnedFile(file)[n - 1];
  const charPrep = 'data/shakespeare_char/prepare.py', bpePrep = 'data/shakespeare/prepare.py';
  // The source lines the card used to show, quoted verbatim in the entries that cite them.
  const note = (path, start) => sources.find(source => source.kind === 'code' && source.path === path && source.lines[0] === start).note;
  for (const n of [24, 30]) assert.ok(note(charPrep, 24).includes(`"${line(charPrep, n)}"`), `${charPrep}:${n} quoted`);
  for (const n of [20, 21]) assert.ok(note(bpePrep, 20).includes(`"${line(bpePrep, n).trim()}"`), `${bpePrep}:${n} quoted`);
  assert.ok(note('train.py', 137).includes(line('train.py', 143).trim()));
  assert.ok(note('train.py', 153).includes(line('train.py', 155).trim()));
  assert.ok(note(charPrep, 55).includes(line(charPrep, 56).trim()));
  assert.ok(note('model.py', 111).includes(line('model.py', 111).trim()));
  assert.ok(note('model.py', 223).includes(line('model.py', 223).trim()));
  assert.ok(note('README.md', 22).includes(line('README.md', 22).trim()));
  // The oracle vocabulary is prepare.py's own printed output (lines 64-66).
  assert.deepEqual(['\n', ...line(charPrep, 65).slice('# '.length)], CHARS);
  assert.equal(Number(line(charPrep, 66).match(/vocab size: (\d+)/)[1]), char.vocabSize);
  assert.match(line(charPrep, 25), /vocab_size = len\(chars\)/);
  assert.match(line(charPrep, 56), /'vocab_size': vocab_size/);
  assert.match(line(charPrep, 60), /meta\.pkl/);
  // Model side: meta.pkl read, the from-scratch fallback, the checkpoint route.
  assert.match(line('train.py', 137), /derive vocab_size from the dataset/);
  assert.match(line('train.py', 143), /meta_vocab_size = meta\['vocab_size'\]/);
  assert.match(line('train.py', 149), /if init_from == 'scratch':/);
  assert.match(line('train.py', 153), /if meta_vocab_size is None:/);
  const fallback = Number(line('train.py', 155).match(/else (\d+)$/)[1]);
  assert.match(line('train.py', 156), /GPTConfig\(\*\*model_args\)/);
  assert.match(line('train.py', 185), /GPT\.from_pretrained\(init_from/);
  const m111 = line('model.py', 111).match(/vocab_size: int = (\d+) # GPT-2 vocab_size of (\d+), padded up to nearest multiple of 64/);
  const m223 = line('model.py', 223).match(/config_args\['vocab_size'\] = (\d+)/);
  assert.equal(Number(m111[2]), bpe.vocabSize);
  assert.equal(Number(m223[1]), bpe.vocabSize);
  assert.equal(Number(m111[1]), Math.ceil(bpe.vocabSize / 64) * 64);
  assert.equal(fallback, Number(m111[1]));
  assert.ok(tk.modelVocabNote.includes(`= ${fallback}`));
  assert.match(line('README.md', 160), /data\/shakespeare`/);
  assert.match(line('README.md', 163), /config\/finetune_shakespeare\.py/);
  assert.match(line('README.md', 166), /initialize from a GPT2 checkpoint with `init_from`/);
  assert.match(line('README.md', 22), /pip install .*tiktoken(?![=<>])/);
  assert.ok(!/meta/.test(pinnedFile(bpePrep).join('\n')), 'data/shakespeare writes no meta.pkl');
});

// The GPT-2 side against tiktoken itself, when uv can run it offline.
test('c06: GPT-2 IDs match tiktoken at the pinned version', t => {
  const py = `import tiktoken,json;e=tiktoken.get_encoding("gpt2");ids=e.encode_ordinary(${JSON.stringify(tk.text)});print(json.dumps([ids,e.n_vocab,[e.decode([i]) for i in ids]]))`;
  const run = spawnSync('uv', ['run', '--offline', '--no-project', '--with', `tiktoken==${fx.provenance.tiktoken}`, 'python', '-c', py], { encoding: 'utf8', timeout: 60000 });
  if (run.status !== 0) return t.skip('uv/tiktoken unavailable offline');
  const [ids, nVocab, pieces] = JSON.parse(run.stdout.trim().split('\n').pop());
  assert.deepEqual(ids, bpe.ids);
  assert.equal(nVocab, bpe.vocabSize);
  assert.deepEqual(pieces, bpe.tokens.map(unshow));
});
