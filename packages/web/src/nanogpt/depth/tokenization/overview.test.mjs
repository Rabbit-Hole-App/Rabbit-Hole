import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import fx from '../../fixtures/nanogpt-fixtures.generated.js';
import tok from '../fixtures/tokenization.generated.js';
import { assertCardGates, assertEvidence, assertSources } from '../../card-gates.mjs';
import { scene, sources, evidence, reviewStates } from './overview.js';

const [char, bpe] = fx.tokenizer.tokenizers;
const byId = (result, id) => result.state.objects.find(object => object.id === id);
const unshow = token => token.replace(/[␣•]/g, ' '); // fixture marks ␣, the card shows •
const shownText = result => result.state.objects.filter(o => o.visible && o.label && ['text', 'code', 'equation'].includes(o.type));
const LABELS = /\b(beginner|intermediate|advanced|expert|newcomer|novice)s?\b/i;
// Independent oracle: the vocabulary data/shakespeare_char/prepare.py prints
// for tinyshakespeare (its closing comment: a newline, then these).
const CHARS = ['\n', ...' !$&\',-.3:;?ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'];

test('overview: every gate at every review state (all configurations)', () => {
  assert.deepEqual(reviewStates, [{ pieces: 'letters' }, { pieces: 'words' }]);
  assertCardGates(scene, reviewStates);
});

test('overview: sources and evidence', () => {
  assertSources(sources, scene);
  assertEvidence(evidence);
  for (const field of ['depth', 'prerequisites', 'ladderRole']) assert.ok(String(evidence[field] || '').trim(), field);
  assert.equal(evidence.depth, 'Overview');
});

test('overview: the ladder contract - one discrete control, no equations, shapes or symbols of the deeper cards', () => {
  const controls = scene.inputs.filter(d => !d.hidden);
  assert.equal(controls.length, 1);
  assert.ok(['choice', 'bool'].includes(controls[0].type) || (controls[0].type === 'index' && controls[0].presentation !== 'slider'));
  for (const inputs of reviewStates) {
    const [result] = assertCardGates(scene, [inputs]);
    const shown = shownText(result);
    assert.equal(shown.filter(o => o.type === 'equation').length, 0);
    const all = shown.map(o => o.label).join('\n');
    assert.doesNotMatch(all, /\(\s*[A-Za-z]\w*\s*,/, 'no tensor shapes');
    assert.doesNotMatch(all, /\bID\b|vocab|=|→/, 'no IDs, vocab jargon or equations');
    assert.doesNotMatch(all + scene.title + controls[0].label + controls[0].options.map(o => o.label).join(' '), LABELS, 'never labels the learner');
    // The line under the question.
    const question = byId(result, 'question'), prereq = byId(result, 'prerequisites');
    assert.equal(prereq.label, 'No prerequisites.');
    assert.ok(prereq.y > question.y && shown.every(o => o === question || o.y >= prereq.y));
    // "word pieces" is glossed once, in plain words.
    assert.equal((all.match(/word pieces \(text chunks\)/g) || []).length, 1);
  }
});

test('overview: the pieces are the real split of the same line, re-joined exactly', () => {
  const results = assertCardGates(scene, reviewStates);
  const pieces = results.map(r => [...byId(r, 'pieces-1').tokens, ...byId(r, 'pieces-2').tokens]);
  assert.equal(pieces[0].map(unshow).join(''), fx.tokenizer.text);
  assert.equal(pieces[1].map(unshow).join(''), fx.tokenizer.text);
  assert.deepEqual(pieces[0].map(unshow), [...fx.tokenizer.text], 'letters: one piece per character');
  assert.equal(pieces[1].length, bpe.count);
  assert.equal(byId(results[1], 'pieces-2').tokens.length, 0, 'word pieces fit one line');
  assert.equal(byId(results[0], 'count').label, `${fx.tokenizer.text.length} pieces`);
  assert.equal(byId(results[1], 'count').label, `${bpe.tokens.length} pieces`);
  // Both chip lines fit the card.
  const width = tokens => tokens.reduce((w, t) => w + 32 + t.length * 9.5 + 8, 0) - 8;
  for (const r of results) for (const id of ['pieces-1', 'pieces-2']) assert.ok(40 + width(byId(r, id).tokens) <= scene.width - 8);
});

test('overview: set sizes, whole-play counts and the lit row follow the choice', () => {
  const [letters_, words] = assertCardGates(scene, reviewStates);
  assert.equal(CHARS.length, char.vocabSize);
  assert.deepEqual(tok.vocab, CHARS, 'generator list = prepare.py\'s printed list');
  assert.match(byId(letters_, 'kinds').label, new RegExp(`^from ${CHARS.length} kinds`));
  assert.match(byId(words, 'kinds').label, /^from 50,257 kinds/);
  // The 65 kinds, partitioned independently: 52 letters, space, new line, one digit, the rest punctuation.
  const letters = CHARS.filter(c => /[A-Za-z]/.test(c)), digits = CHARS.filter(c => /\d/.test(c));
  const punctuation = CHARS.filter(c => !/[A-Za-z\d \n]/.test(c));
  assert.deepEqual([letters.length, digits.length, punctuation.length], [52, 1, 10]);
  assert.equal(letters.length + 2 + digits.length + punctuation.length, CHARS.length);
  assert.equal(byId(letters_, 'kinds').label, 'from 65 kinds: letters, space, new line, punctuation, one digit');
  // In the default state the gloss comes before any other mention of word pieces.
  const gloss = byId(letters_, 'length-title');
  assert.match(gloss.label, /word pieces \(text chunks\)/);
  assert.ok(letters_.state.objects.filter(o => o.visible && o !== gloss && /word piece/i.test(o.label || '')).every(o => o.y > gloss.y));
  // The space note is true of each split: a space is its own character piece; a GPT-2 piece carries its leading space.
  assert.ok(char.tokens.filter(t => unshow(t) === ' ').length === [...fx.tokenizer.text].filter(c => c === ' ').length);
  assert.ok(bpe.tokens.slice(1).every(t => unshow(t).startsWith(' ') && !unshow(t).slice(1).includes(' ')));
  assert.equal(byId(letters_, 'space-key').label, '• marks a space: spaces are pieces too');
  assert.equal(byId(words, 'space-key').label, '• marks a space: a word piece carries the space before it');
  // The consequence line: block_size pieces in characters of the play - one per
  // character piece, the whole play's average per GPT-2 piece (rounded).
  const window = fx.config.shakespeareChar.block_size;
  assert.equal(window, 256);
  const span = Math.round(window * 1115394 / (301966 + 36059));
  assert.equal(span, 845);
  assert.equal(byId(letters_, 'window').label, `The model reads ${window} pieces at a time: ${window} characters of the play.`);
  assert.equal(byId(words, 'window').label, `The model reads ${window} pieces at a time: as word pieces, about ${span} characters.`);
  assert.equal(byId(letters_, 'line').label, `“${fx.tokenizer.text}…”`, 'the example is the start of a line');
  assert.equal(byId(letters_, 'whole').label, `The whole play: ${(1003854 + 111540).toLocaleString('en-US')} pieces.`);
  assert.equal(byId(words, 'whole').label, `The whole play: ${(301966 + 36059).toLocaleString('en-US')} pieces.`);
  assert.equal(tok.chars.total, fx.provenance.dataset.chars);
  // Bars: lengths proportional to the values; the chosen split's row is lit.
  for (const [result, lit] of [[letters_, 0], [words, 1]]) {
    for (const [id, values] of [['length', [29, 5]], ['kind', [65, 50257]]]) {
      const bars = [0, 1].map(i => byId(result, `${id}-bar-${i}`));
      assert.ok(Math.abs(bars[0].w / bars[1].w - values[0] / values[1]) < 1e-9, `${id} bar ratio`);
      assert.equal(byId(result, `${id}-value-${lit}`).role, 'input');
      assert.equal(byId(result, `${id}-value-${1 - lit}`).role, 'neutral');
      assert.equal(bars[lit].role, 'input');
      assert.equal(byId(result, `${id}-value-0`).label, values[0].toLocaleString('en-US'));
      assert.equal(byId(result, `${id}-value-1`).label, values[1].toLocaleString('en-US'));
    }
  }
});

// The example is the start of line 2 of the dataset, not the whole line - so
// the card quotes it with an ellipsis (read from generate_fixtures.py's cache).
const DATASET = join(tmpdir(), 'nanogpt-fixture-cache', fx.provenance.dataset.sha256);
test('overview: the example is the start of line 2 of Tiny Shakespeare', { skip: !existsSync(DATASET) && 'dataset cache not present' }, () => {
  const line2 = readFileSync(DATASET, 'utf8').split('\n')[1];
  assert.ok(line2.startsWith(fx.tokenizer.text) && line2.length > fx.tokenizer.text.length, line2);
});

const PINNED = process.env.NANOGPT_PINNED
  || 'C:/Users/cyudhist/AppData/Local/Temp/claude/C--Users-cyudhist-Desktop-workspace-small-deploy/a0a20b94-1113-4966-863f-feffed07c1b6/scratchpad/nanogpt-3adf61e';
test('overview: every cited range says what its note claims, at the pinned revision', { skip: !existsSync(PINNED) && 'pinned NanoGPT copy not present' }, () => {
  const lines = file => readFileSync(join(PINNED, file), 'utf8').split('\n').map(l => l.replace(/\r$/, ''));
  const range = (file, a, b) => lines(file).slice(a - 1, b).join('\n');
  const expect = {
    'data/shakespeare_char/prepare.py:23-35': [/chars = sorted\(list\(set\(data\)\)\)/, /vocab_size = len\(chars\)/, /return \[stoi\[c\] for c in s\]/],
    'data/shakespeare/prepare.py:19-22': [/enc = tiktoken\.get_encoding\("gpt2"\)/, /train_ids = enc\.encode_ordinary\(train_data\)/],
    'config/train_shakespeare_char.py:16-16': [/^dataset = 'shakespeare_char'$/],
    'config/train_shakespeare_char.py:19-19': [/^block_size = 256 # context of up to 256 previous characters$/],
  };
  const cited = sources.filter(s => s.kind === 'code').map(s => `${s.path}:${s.lines[0]}-${s.lines[1]}`);
  assert.deepEqual(cited.sort(), Object.keys(expect).sort());
  for (const [key, patterns] of Object.entries(expect)) {
    const [, file, a, b] = key.match(/^(.+):(\d+)-(\d+)$/);
    for (const pattern of patterns) assert.match(range(file, +a, +b), pattern, key);
  }
  // The oracle list and both whole-text sizes, as the prepare.py files print them.
  assert.deepEqual(['\n', ...lines('data/shakespeare_char/prepare.py')[64].slice(2)], CHARS);
  assert.match(lines('data/shakespeare_char/prepare.py')[66], /train has 1003854 tokens/);
  assert.match(lines('data/shakespeare_char/prepare.py')[67], /val has 111540 tokens/);
  assert.match(lines('data/shakespeare/prepare.py')[31], /train\.bin has 301,966 tokens/);
  assert.match(lines('data/shakespeare/prepare.py')[32], /val\.bin has 36,059 tokens/);
});
