// EXP-T18 critic calibration: seven labelled SYNTHETIC bad/corrected pairs (plan T18 list), each a small scene in the
// renderer's own format. Bad and corrected differ only in the seeded defect. Expected verdicts live in EXPECTED, which
// is never put into a review request; captures go to the critic under neutral shuffled ids (s01..s14), one explanation
// per request, so a pair's partner is never visible. Calibration only: never author examples, never unseen evaluation.
const box = (id, label, x, y, w, h, role = 'neutral') => ({ id, type: 'box', semanticId: id, initialState: { label, x, y, w, h, role } });
const text = (id, t, x, y, typography = 'body') => ({ id, type: 'text', semanticId: id, initialState: { text: t, x, y, typography } });
const arrow = (id, from, to, label, role = 'neutral') => ({ id, type: 'arrow', semanticId: id, initialState: { from, to, ...(label ? { label } : {}), role } });
const scene = (id, title, objects, width = 640, height = 320) => ({ id, title, width, height, duration: 1, objects, timeline: [] });

export const PAIRS = [
  {
    id: 'long-crossing-connector', defect: 'long crossing detail connector from a correct layer',
    request: 'Explain what happens inside the attention layer of a three-layer stack, with a detail panel.',
    bad: scene('p1', 'Inside the attention layer', [
      box('embed', 'Embedding', 32, 40, 168, 50), box('attn', 'Attention layer', 32, 130, 168, 50, 'input'), box('ffn', 'Feed-forward', 32, 220, 168, 50),
      box('norm', 'Normalise', 250, 150, 150, 50), box('detail', 'Detail: Q, K, V projections', 420, 250, 196, 50, 'output'),
      arrow('to-detail', { x: 200, y: 155 }, { x: 420, y: 275 }),
    ]),
    corrected: scene('p1', 'Inside the attention layer', [
      box('embed', 'Embedding', 32, 40, 168, 50), box('attn', 'Attention layer', 32, 130, 168, 50, 'input'), box('ffn', 'Feed-forward', 32, 220, 168, 50),
      box('norm', 'Normalise', 250, 220, 150, 50), box('detail', 'Detail: Q, K, V projections', 420, 130, 196, 50, 'output'),
      arrow('to-detail', { x: 200, y: 155 }, { x: 420, y: 155 }),
    ]),
  },
  {
    id: 'overlapping-badge', defect: 'overlapping badge',
    request: 'Explain that a mixture-of-experts layer has 16 experts and a router picks one.',
    bad: scene('p2', 'Router and experts', [
      box('router', 'Router', 40, 120, 140, 56, 'input'), box('e1', 'Expert 1', 300, 60, 180, 56), box('e16', 'Expert 16', 300, 190, 180, 56),
      box('badge', '16', 360, 200, 48, 36, 'output'), arrow('r1', { x: 180, y: 148 }, { x: 300, y: 88 }), arrow('r16', { x: 180, y: 148 }, { x: 300, y: 218 }),
    ]),
    corrected: scene('p2', 'Router and experts', [
      box('router', 'Router', 40, 120, 140, 56, 'input'), box('e1', 'Expert 1', 300, 60, 180, 56), box('e16', 'Expert 16', 300, 190, 180, 56),
      box('badge', '16', 500, 200, 48, 36, 'output'), arrow('r1', { x: 180, y: 148 }, { x: 300, y: 88 }), arrow('r16', { x: 180, y: 148 }, { x: 300, y: 218 }),
    ]),
  },
  {
    id: 'caption-over-arrow', defect: 'caption over arrow',
    request: 'Explain that tokens become embeddings before the first block.',
    bad: scene('p3', 'Tokens to embeddings', [
      box('tok', 'Tokens', 40, 130, 150, 56, 'input'), box('emb', 'Embeddings', 440, 130, 160, 56, 'output'),
      arrow('a', { x: 190, y: 158 }, { x: 440, y: 158 }), text('cap', 'lookup in the embedding table', 210, 162),
    ]),
    corrected: scene('p3', 'Tokens to embeddings', [
      box('tok', 'Tokens', 40, 130, 150, 56, 'input'), box('emb', 'Embeddings', 440, 130, 160, 56, 'output'),
      arrow('a', { x: 190, y: 158 }, { x: 440, y: 158 }), text('cap', 'lookup in the embedding table', 210, 130),
    ]),
  },
  {
    id: 'missing-arrow-glyph', defect: 'missing text arrow glyph',
    request: 'Explain that each query is compared with each key to produce a score.',
    bad: scene('p4', 'Query against key', [
      box('q', 'Query', 40, 60, 140, 56, 'input'), box('k', 'Key', 40, 180, 140, 56, 'input'), box('s', 'Score', 440, 120, 140, 56, 'output'),
      text('rule', 'Q  K gives one score', 220, 90), arrow('a', { x: 180, y: 148 }, { x: 440, y: 148 }),
    ]),
    corrected: scene('p4', 'Query against key', [
      box('q', 'Query', 40, 60, 140, 56, 'input'), box('k', 'Key', 40, 180, 140, 56, 'input'), box('s', 'Score', 440, 120, 140, 56, 'output'),
      text('rule', 'Q → K gives one score', 220, 90), arrow('a', { x: 180, y: 148 }, { x: 440, y: 148 }),
    ]),
  },
  {
    id: 'missing-greek-glyph', defect: 'missing Greek text glyph',
    request: 'Explain that the attention weight alpha scales each value before they are summed.',
    bad: scene('p5', 'Weighted values', [
      box('v', 'Value vector', 40, 120, 160, 56, 'input'), box('z', 'Weighted sum', 440, 120, 160, 56, 'output'),
      arrow('a', { x: 200, y: 148 }, { x: 440, y: 148 }), text('w', 'scaled by weight  = 0.3', 220, 110),
    ]),
    corrected: scene('p5', 'Weighted values', [
      box('v', 'Value vector', 40, 120, 160, 56, 'input'), box('z', 'Weighted sum', 440, 120, 160, 56, 'output'),
      arrow('a', { x: 200, y: 148 }, { x: 440, y: 148 }), text('w', 'scaled by weight α = 0.3', 220, 110),
    ]),
  },
  {
    id: 'crowded-arrow-label', defect: 'crowded arrow label',
    request: 'Explain that the encoder sends keys and values to the decoder.',
    bad: scene('p6', 'Encoder to decoder', [
      box('enc', 'Encoder', 40, 120, 150, 70, 'input'), box('dec', 'Decoder', 450, 120, 150, 70, 'output'),
      arrow('k', { x: 190, y: 148 }, { x: 450, y: 148 }, 'keys from every encoder position'), arrow('v', { x: 190, y: 160 }, { x: 450, y: 160 }, 'values from every encoder position'),
    ]),
    corrected: scene('p6', 'Encoder to decoder', [
      box('enc', 'Encoder', 40, 90, 150, 130, 'input'), box('dec', 'Decoder', 450, 90, 150, 130, 'output'),
      arrow('k', { x: 190, y: 120 }, { x: 450, y: 120 }, 'keys'), arrow('v', { x: 190, y: 190 }, { x: 450, y: 190 }, 'values'),
    ]),
  },
  {
    id: 'formula-touching-connector', defect: 'formula touching a connector',
    request: 'Explain the softmax that turns scores into weights.',
    bad: scene('p7', 'Scores to weights', [
      box('s', 'Scores', 40, 60, 150, 56, 'input'), box('w', 'Weights', 440, 60, 150, 56, 'output'),
      arrow('a', { x: 190, y: 88 }, { x: 440, y: 88 }),
      { id: 'eq', type: 'equation', semanticId: 'eq', initialState: { text: 'w_i = \\frac{e^{s_i}}{\\sum_j e^{s_j}}', x: 230, y: 70, w: 180, h: 70 } },
    ]),
    corrected: scene('p7', 'Scores to weights', [
      box('s', 'Scores', 40, 60, 150, 56, 'input'), box('w', 'Weights', 440, 60, 150, 56, 'output'),
      arrow('a', { x: 190, y: 88 }, { x: 440, y: 88 }),
      { id: 'eq', type: 'equation', semanticId: 'eq', initialState: { text: 'w_i = \\frac{e^{s_i}}{\\sum_j e^{s_j}}', x: 230, y: 160, w: 180, h: 70 } },
    ]),
  },
];

// Expected verdicts (calibration labels): the critic never receives these.
export const EXPECTED = Object.fromEntries(PAIRS.flatMap(p => [[`${p.id}:bad`, { visual: 'fail', semantic: 'pass' }], [`${p.id}:corrected`, { visual: 'pass', semantic: 'pass' }]]));

// Deterministic shuffle to neutral ids: [{ sid, key: 'pair:bad|corrected', pair, scene, request }].
export function neutralCaptures(seed = 22) {
  const items = PAIRS.flatMap(p => ['bad', 'corrected'].map(kind => ({ key: `${p.id}:${kind}`, pair: p.id, scene: p[kind], request: p.request })));
  let x = seed;
  const rand = () => ((x = (x * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  for (let i = items.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [items[i], items[j]] = [items[j], items[i]]; }
  return items.map((item, i) => ({ sid: `s${String(i + 1).padStart(2, '0')}`, ...item }));
}

// Score critic verdicts against EXPECTED: TP = bad flagged visual fail, miss = bad passed, FP = corrected flagged.
export function score(results) {
  const tally = { truePositives: 0, misses: 0, falsePositives: 0, trueNegatives: 0, bad: 0, corrected: 0, semanticFalseAlarms: 0 };
  for (const r of results) {
    const exp = EXPECTED[r.key];
    const flagged = r.visual === 'fail';
    if (exp.visual === 'fail') { tally.bad++; flagged ? tally.truePositives++ : tally.misses++; }
    else { tally.corrected++; flagged ? tally.falsePositives++ : tally.trueNegatives++; }
    if (r.semantic === 'fail') tally.semanticFalseAlarms++;
  }
  return tally;
}
