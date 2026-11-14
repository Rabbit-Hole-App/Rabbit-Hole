import { writeSubject, isMain } from './before-after-reference-kit.mjs';

export function tokenizationModel(depth = 'brief') {
  const sentences = ['unhelpful cats.', 'cats nap.'];
  // These are declared toy vocabularies, not any model's token IDs. IDs are
  // zero-based array positions. Continuation markers are not source characters.
  const vocabularies = [['[UNK]', 'unhelpful', 'cats', 'nap', '.'], ['[UNK]', 'un', '##help', '##ful', 'cats', 'nap', '.']];
  const controls = [{ id: 'sentence', kind: 'choice', label: 'Sentence', options: sentences, default: 0, wide: true }, ...(depth === 'brief' ? [] : [{ id: 'mode', kind: 'choice', label: 'Toy tokenizer', options: ['Word', 'Subword'], default: 1 }]), ...(depth === 'detailed' ? [{ id: 'selected', kind: 'range', label: 'Marked token', min: 1, max: tokenize(sentences[0], 1).length, step: 1, default: 1 }] : [])];
  function tokenize(text, mode = 1, vocabulary = vocabularies[mode]) {
    const tokens = [], vocabularySet = new Set(vocabulary);
    for (const match of text.matchAll(/[a-z]+|[^\sA-Za-z]/g)) {
      const word = match[0], start = match.index;
      if (mode === 0 || !/^[a-z]+$/.test(word)) {
        const piece = vocabularySet.has(word) ? word : '[UNK]';
        tokens.push({ piece, id: vocabulary.indexOf(piece), start, end: start + word.length });
        continue;
      }
      const pieces = []; let offset = 0;
      while (offset < word.length) {
        let end = word.length, found = null;
        for (; end > offset; end--) {
          const piece = (offset ? '##' : '') + word.slice(offset, end);
          if (vocabularySet.has(piece)) { found = piece; break; }
        }
        if (found === null) { pieces.length = 0; pieces.push({ piece: '[UNK]', id: vocabulary.indexOf('[UNK]'), start, end: start + word.length }); break; }
        pieces.push({ piece: found, id: vocabulary.indexOf(found), start: start + offset, end: start + end }); offset = end;
      }
      tokens.push(...pieces);
    }
    return tokens;
  }
  const defaults = () => ({ sentence: 0, mode: 1, selected: 1 });
  const bounded = (value, min, max, fallback) => Math.max(min, Math.min(max, Math.round(Number.isFinite(Number(value)) ? Number(value) : fallback)));
  const normalize = (p = {}) => {
    const sentence = bounded(p.sentence, 0, sentences.length - 1, 0), mode = depth === 'brief' ? 1 : bounded(p.mode, 0, vocabularies.length - 1, 1);
    const count = tokenize(sentences[sentence], mode).length;
    return { sentence, mode, selected: depth === 'detailed' ? bounded(p.selected, 1, count, 1) : 1 };
  };
  const evaluate = p => {
    p = normalize(p);
    const text = sentences[p.sentence], tokens = tokenize(text, p.mode), vocabulary = vocabularies[p.mode];
    const coveredCharacters = tokens.reduce((sum, token) => sum + token.end - token.start, 0), skippedSpaces = text.length - coveredCharacters;
    return { text, tokens, vocabulary, selected: p.selected, marked: tokens[p.selected - 1], sourceCharacters: text.length, coveredCharacters, skippedSpaces,
      controlMax: { selected: tokens.length }, state: p.mode === 0 ? 'Toy word tokenizer' : 'Toy greedy subword tokenizer',
      description: `Before: the literal sentence ${text} After: ${tokens.length} tokens from the declared toy ${p.mode === 0 ? 'word' : 'subword'} vocabulary. The source has ${text.length} characters; ${skippedSpaces} space is omitted. Punctuation is kept. Marked token ${p.selected} is ${tokens[p.selected - 1].piece}, vocabulary ID ${tokens[p.selected - 1].id}, covering characters ${tokens[p.selected - 1].start} up to but excluding ${tokens[p.selected - 1].end}. These ASCII examples use character offsets; the continuation prefix is notation, not source text.` };
  };
  const controlValue = (id, p, frame) => `${p.selected} of ${frame.tokens.length}`;
  return { depth, sentences, vocabularies, controls, tokenize, defaults, normalize, evaluate, controlValue };
}

export function tokenizationScene(depth) {
  return { prompt: 'How does a sentence become tokens?', title: 'One sentence, smaller pieces.',
    concept: depth === 'brief' ? 'A tokenizer splits text into vocabulary pieces. This toy uses smaller parts inside a word; ## marks a continuation. Spaces separate tokens, and punctuation stays.' : depth === 'balanced' ? 'The toy word tokenizer keeps whole words. The subword tokenizer repeatedly takes the longest vocabulary match. Its ## marks a continuation; spaces separate tokens.' : 'Toy subwords take the longest match; ## marks a continuation. IDs are vocabulary positions from zero. Character spans include their start and exclude their end.',
    instructions: depth === 'brief' ? 'Choose a Sentence. Match the warm source letters to the warm token chip.' : depth === 'balanced' ? 'Choose a Sentence, then switch Word and Subword. Compare segmentation and token count.' : 'Choose a Sentence and Toy tokenizer. Move Marked token to inspect its letters, ID and character span.',
    heading: 'Text before and after tokenization', height: depth === 'detailed' ? 380 : 350 };
}

export function drawTokenization(frame, model, scene) {
  const detailed = scene.depth === 'detailed', panelHeight = detailed ? 248 : 230;
  let svg = R.panel('before', 20, panelHeight, 'Before · source text');
  svg += R.text('source.literal', 38, 91, frame.text, { size: 23, weight: 500 });
  svg += R.text('source.mapping.label', 36, 131, 'Characters of the source', { size: 13, color: R.C.muted });
  [...frame.text].forEach((character, index) => {
    const x = 36 + index * 16, selected = index >= frame.marked.start && index < frame.marked.end;
    svg += `<g id="source.character.${index}" data-offset="${index}" data-selected="${selected}">` + R.box(`source.character.${index}.box`, x, 144, 16, 29, selected, selected ? 'decision' : 'plain') + R.text(`source.character.${index}.letter`, x + 8, 164, character, { anchor: 'middle', size: 14 }) + '</g>';
  });
  svg += R.text('source.spaces.note', 36, 203, 'Spaces separate tokens.', { size: 13, color: R.C.muted });
  svg += R.text('source.punctuation.note', 36, 225, 'Punctuation stays in the sequence.', { size: 13, color: R.C.muted }) + '</g>';
  svg += R.panel('after', 340, panelHeight, 'After · toy token sequence');
  let chipX = 356, chipY = 73;
  const chipHeight = detailed ? 71 : 44, gap = 8, rowGap = detailed ? 13 : 15;
  frame.tokens.forEach((token, index) => {
    const width = Math.max(detailed ? 68 : 37, token.piece.length * 8 + 22);
    if (chipX + width > 604) { chipX = 356; chipY += chipHeight + rowGap; }
    const selected = index === frame.selected - 1;
    svg += `<g id="token.${index + 1}" data-start="${token.start}" data-end="${token.end}" data-vocabulary-id="${token.id}" data-selected="${selected}">` + R.box(`token.${index + 1}.box`, chipX, chipY, width, chipHeight, selected, selected ? 'decision' : 'process');
    svg += R.text(`token.${index + 1}.piece`, chipX + width / 2, chipY + (detailed ? 23 : 28), token.piece, { size: 15, weight: 600, anchor: 'middle', color: selected ? R.C.warm : '#375d92' });
    if (detailed) {
      svg += R.text(`token.${index + 1}.id`, chipX + width / 2, chipY + 44, `ID ${token.id}`, { size: 13, anchor: 'middle', color: R.C.muted });
      svg += R.text(`token.${index + 1}.span`, chipX + width / 2, chipY + 63, `[${token.start}, ${token.end})`, { size: 13, anchor: 'middle', color: R.C.muted });
    }
    svg += '</g>'; chipX += width + gap;
  });
  if (!detailed) {
    svg += R.box('callout.token.box', 356, 198, 248, 31, false, 'plain');
    svg += R.text('callout.token.label', 480, 219, 'Warm span → warm token', { anchor: 'middle', size: 14, color: R.C.warm });
  }
  svg += '</g>' + R.line('comparison.transform', [[307, 123], [332, 123]], true, true);
  const readoutY = detailed ? 292 : 284;
  svg += R.line('readouts.rule', [[20, readoutY - 22], [620, readoutY - 22]]);
  svg += R.readout('characters', 24, readoutY, 'Source characters', String(frame.sourceCharacters));
  svg += R.readout('tokens', 242, readoutY, 'Tokens', String(frame.tokens.length));
  svg += R.readout('spaces', 440, readoutY, 'Omitted spaces', String(frame.skippedSpaces));
  if (detailed) {
    svg += R.text('vocabulary.label', 24, 346, 'Toy vocabulary · positions start at zero', { size: 13, color: R.C.muted });
    svg += R.text('vocabulary.pieces', 24, 370, frame.vocabulary.join('  |  '), { size: 14 });
  } else svg += R.text('toy.note', 24, 338, 'Tokens come from the selected toy vocabulary.', { size: 13, color: R.C.muted });
  return svg;
}

if (isMain(import.meta.url)) writeSubject('tokenization', tokenizationModel, tokenizationScene, drawTokenization);
