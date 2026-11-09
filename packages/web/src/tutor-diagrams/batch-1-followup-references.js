const bTreeLeaves = [
  { id: 'low', label: '4, 12' },
  { id: 'mid', label: '27, 32' },
  { id: 'high', label: '48, 55' },
];

function bTree(title, caption, ranges, order, found) {
  return {
    version: 1,
    diagram: {
      kind: 'tree', title, layout: 'hierarchy', caption, highlightPath: ['root', 'mid'],
      nodes: [
        { id: 'root', label: '20, 40', detail: order },
        ...bTreeLeaves.map((leaf, index) => ({
          ...leaf, parent: 'root', edgeLabel: ranges[index], ...(leaf.id === 'mid' ? { detail: found } : {}),
        })),
      ],
    },
  };
}

const ranges = ['$k<20$', '$20<k<40$', '$k>40$'];

const factorialStages = [
  'Push the frame for factorial of 3',
  'Push the frame for factorial of 2',
  'Push the base case for factorial of 1',
  'Pop the frame for 1 and return 1',
  'Pop the frame for 2 and return 2',
  'Pop the frame for 3 and return 6',
];

function factorial(title, caption, details) {
  return {
    version: 1,
    diagram: {
      kind: 'layers', title, caption,
      layers: factorialStages.map((stage, index) => ({ label: (index + 1) + '. ' + stage, detail: details[index] })),
    },
  };
}

const growthCurves = [
  { plain: 'Same work', notation: '$O(1)$', work: () => 1 },
  { plain: 'Slow growth', notation: '$O(\\log n)$', work: n => 1 + Math.log2(n), endLabel: true },
  { plain: 'One pass', notation: '$O(n)$', work: n => n },
  { plain: 'All pairs', notation: '$O(n^2)$', work: n => n * n, endLabel: true },
  { plain: 'Sort-like growth', notation: '$O(n\\log n)$', work: n => n * (1 + Math.log2(n)) },
];

function growth(title, caption, { brief = false, detailed = false } = {}) {
  return {
    version: 1,
    diagram: {
      kind: 'coordinate-plot', title, caption,
      x: { label: brief ? 'Items' : 'Input size $n$', min: 1, max: 16 },
      y: { label: 'Example work', min: 1, max: 256, scale: 'log' },
      series: growthCurves.slice(0, detailed ? 5 : 4).map(({ plain, notation, work, endLabel }) => ({
        label: brief ? plain : notation, kind: 'line', ...(endLabel ? { endLabel } : {}),
        points: Array.from({ length: 16 }, (_, i) => ({ x: i + 1, y: Math.round(work(i + 1) * 100) / 100 })),
      })),
    },
  };
}

export const references = [
  {
    id: 'tree-btree-lookup',
    lessons: [],
    prompts: ['How does a database index speed up a query?'],
    paraphrases: [
      'How do I find a key in a B-tree?',
      'How does B-tree search pick which child to visit?',
      'Why is B-tree lookup faster than scanning every key?',
      'How can a database index avoid a full table scan?',
    ],
    keywords: ['b-tree', 'btree', 'b-tree lookup', 'b-tree search', 'find a key in a b-tree', 'order-4 b-tree',
      'database index speed up a query', 'database index avoid a full table scan'],
    useWhen: 'Use a two-level order-4 hierarchy with sorted keys in each node. Follow the middle branch to 32, between 20 and 40. Compare fixed-order lookup with a scan.',
    spec: bTree('B-tree lookup of 32',
      'A scan may read $N$ rows. A fixed-order B-tree visits $O(\\log N)$ nodes for a key lookup.',
      ranges, 'Order 4', 'Found 32'),
    depths: {
      overview: {
        spec: bTree('Finding 32 in a B-tree',
          'A scan may read every row. The index narrows the search to one group of keys at each level.',
          ['Below 20', 'Between 20 and 40', 'Above 40'], 'Up to 4 child groups', '32 is here'),
      },
      deep: {
        spec: bTree('Order-4 B-tree lookup of 32',
          'A scan may read $N$ rows. A fixed-order B-tree visits $O(\\log N)$ nodes and checks at most three keys per node.',
          ranges, 'Up to 3 keys and 4 children', 'Match $k=32$'),
      },
    },
  },
  {
    id: 'recursion-factorial-unwind',
    lessons: [],
    prompts: ['How does the call stack work during recursion?'],
    paraphrases: [
      'How does factorial of 3 make smaller calls and return 6?',
      'Trace factorial(3) and show the order its recursive calls return.',
      'How do the calls unwind in recursive factorial?',
      'What happens on the call stack when a function calls itself?',
    ],
    keywords: ['call stack work during recursion', 'call stack when a function calls itself',
      'factorial of 3', 'factorial 3', 'factorial recursion', 'recursive factorial', 'factorial base case'],
    useWhen: 'Show the calls from 3 to 2 to 1, then show the base case returning 1 and its callers returning 2 and 6. Keep the two orders distinct.',
    spec: factorial('Factorial of 3 calls down and returns up',
      'Push each call onto the stack. The base case returns 1, then each earlier frame pops as it finishes.', [
        'Wait for factorial of 2.',
        'Wait for factorial of 1.',
        'Base case. No smaller call.',
        'Send 1 back to the call for 2.',
        'Multiply $2\\times 1=2$ and send 2 back to the call for 3.',
        'Multiply $3\\times 2=6$ and return the final result.',
      ]),
    depths: {
      overview: {
        spec: factorial('How factorial of 3 returns 6',
          'Put each new call on top. Remove the top call when it returns, so the older calls finish in reverse order.', [
            'Ask for the answer for 2.',
            'Ask for the answer for 1.',
            'Base case. No more calls.',
            'The answer for 1 goes back to 2.',
            'Two times one gives two. Send it back to 3.',
            'Three times two gives six.',
          ]),
      },
      deep: {
        spec: factorial('Factorial of 3 on the call stack',
          'For $n>1$, $F(n)=nF(n-1)$. The base case $F(1)=1$ starts the returns in the reverse order of the calls.', [
            'Suspend $F(3)$ until $F(2)$ returns.',
            'Suspend $F(2)$ until $F(1)$ returns.',
            'Base case $F(1)=1$. No recursive call.',
            'Resume $F(2)$ with the value 1.',
            'Compute $F(2)=2\\times 1=2$ and resume $F(3)$.',
            'Compute $F(3)=3\\times 2=6$ and return to the caller.',
          ]),
      },
    },
  },
  {
    id: 'big-o-growth-rates',
    lessons: [],
    prompts: ['What is Big-O notation?'],
    paraphrases: [
      'What does big O tell me about how fast algorithms grow?',
      'Can you show the difference between constant, logarithmic, linear and quadratic growth?',
      'How do the common Big-O growth rates compare as input gets bigger?',
    ],
    keywords: ['big-o notation', 'big o growth rates', 'what does big o tell me',
      'how fast algorithms grow', 'constant logarithmic linear and quadratic growth'],
    useWhen: 'Compare representative work counts as input grows. Sample all curves at the same input sizes. Explain that Big-O gives an upper growth bound and these curves illustrate familiar growth classes.',
    spec: growth('Big-O growth rates', 'The log axis shows all four rates. The logarithmic curve uses $1+\\log_2 n$ to keep its first value positive.'),
    depths: {
      overview: {
        spec: growth('How work grows with input size',
          'The same task can grow slowly or quickly as items are added. The vertical scale uses ratios so the smaller curves stay visible.', { brief: true }),
      },
      deep: {
        spec: growth('Five common Big-O growth rates',
          'The log axis uses representative counts $1$, $L=1+\\log_2 n$, $n$, $n^2$, and $nL$. Big-O bounds growth up to constant factors.', { detailed: true }),
      },
    },
  },
];
