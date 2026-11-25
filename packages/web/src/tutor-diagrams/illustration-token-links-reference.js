const sentence = ['the', 'cat', 'sat', 'on', 'the', 'mat'];

export const tokenLinksReferences = [
  {
    id: 'ml-self-attention-token-links',
    lessons: [],
    prompts: ['When the word sat attends to the sentence the cat sat on the mat, which words matter most?'],
    keywords: ['sat attends', 'self attention weights between words', 'attention weights between tokens', 'self attention token links'],
    useWhen: 'Show one query in unmasked self-attention with illustrative weights. Keep the same sentence in the source and target rows and distinguish repeated tokens by position. The query “sat” gives its largest weight, 0.45, to “cat”.',
    spec: {
      version: 1,
      diagram: {
        kind: 'token-links', title: 'How “sat” attends to the sentence',
        source: sentence, target: [...sentence],
        queries: [{ index: 2, weights: [0.05, 0.45, 0.15, 0.1, 0.05, 0.2] }],
        normalized: true,
        caption: 'Thicker, darker arrows carry more weight. In this unmasked example, the six weights from “sat” sum to 1.',
      },
    },
  },
];
