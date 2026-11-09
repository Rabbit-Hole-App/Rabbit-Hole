import { accepted, draft, firstMismatch, replacement, rotatedPair, turnedPair, unchangedPair } from './figure-gallery-supplement-data.js';

const spec = diagram => ({ version: 1, diagram });
const reference = (id, [prompt, ...paraphrases], keywords, useWhen, build) => ({
  id, lessons: [], prompts: [prompt], paraphrases, keywords, useWhen,
  spec: build('standard'),
  depths: { overview: { spec: build('overview') }, deep: { spec: build('deep') } },
});

function partialRotary(depth) {
  const brief = depth === 'overview';
  const tensor = (name, values, role) => ({ tensor: { name, rows: 1, columns: 2, dimensions: '1 × 2', values, role } });
  return spec({
    kind: 'transformation', title: 'Only part of the head carries the rotation',
    before: { label: 'Before the position rule', items: brief ? ['First pair', 'Second pair'] : [
      tensor('First pair', rotatedPair, 'input'), tensor('Second pair', unchangedPair, 'input'),
    ] },
    operation: 'Rotate the first pair and keep the second pair',
    after: { label: 'After the position rule', items: brief ? ['Turned pair', 'Same pair'] : [
      tensor('Turned pair', turnedPair, 'output'), tensor('Same pair', unchangedPair, 'input'),
    ] },
    caption: depth === 'deep'
      ? String.raw`This example uses $R_{\pi/2}[1,0]^\top=[0,1]^\top$. The second pair bypasses rotation. The head keeps all four entries.`
      : 'In each query or key, apply the position rule to one part. Carry the other part through unchanged.',
  });
}

function verifyDraft(depth) {
  const brief = depth === 'overview';
  return spec({
    kind: 'sequence', title: 'A verifier checks the draft in order',
    actors: [
      { id: 'd', label: brief ? 'Draft' : 'Draft stage' },
      { id: 'v', label: brief ? 'Check' : 'Verifier' },
      { id: 'p', label: 'Growing text' },
    ],
    messages: [
      { from: 'd', to: 'v', label: 'Propose “' + draft.join(' ') + '”' },
      { from: 'v', to: 'd', label: 'Keep “' + accepted.join(' ') + '”. Replace “' + draft[firstMismatch] + '” with “' + replacement + '”' },
      { from: 'd', to: 'p', label: 'Append “' + [...accepted, replacement].join(' ') + '”' },
    ],
    caption: depth === 'deep'
      ? String.raw`Greedy verification compares each draft word with $\arg\max_v p(v\mid\text{accepted prefix})$. Use the verifier’s word at the first mismatch.`
      : 'Keep the matching words from the start of the draft. Use the verifier’s word at the first disagreement.',
  });
}

export const figureGallerySupplementReferences = [
  reference('figure-partial-rotary-head-width', [
    'What does it mean to apply rotary position encoding to only part of a head?',
    'Which query and key coordinates change under partial rotary position encoding?',
    'Does partial RoPE rotate every value in a query or key?',
  ], ['rotary position encoding to only part of a head', 'change under partial rotary position encoding', 'partial rope rotate every value'],
  'Show two illustrative coordinate pairs in one query or key, and rotate only the first. Keep the second pair and the overall shape fixed.', partialRotary),
  reference('figure-speculative-prefix-verification', [
    'What happens when a speculative decoding verifier disagrees with the proposed words?',
    'What does the speculative decoder keep after a mismatch?',
    'Which drafted tokens survive greedy verification?',
  ], ['speculative decoding verifier disagrees', 'speculative decoder keep after a mismatch', 'drafted tokens survive greedy verification'],
  'Use a greedy toy example. Keep the matching prefix and append the verifier’s token at the first mismatch. The draft stage can use auxiliary heads or a separate model.', verifyDraft),
];
