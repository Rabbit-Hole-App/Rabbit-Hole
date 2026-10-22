// Attention fan-out (EXP-T07): which query heads share which key/value
// heads. The variant is a claim about the counts, so it is checked against
// them: a picture of grouped-query attention with counts that cannot group
// is refused, not drawn plausibly. Larger counts compact into group boxes
// and a stated remainder instead of hundreds of lines.
import { sides, textWidth } from '../text.js';

const QW = 64, QH = 40, KH = 48, GAP = 8, GROUP_GAP = 32, DROP = 72, CAPTION_GAP = 32;

const VARIANTS = {
  'multi-head': (q, kv) => (kv === q ? null : `multi-head attention gives every query head its own key/value head, so kvHeads must equal queryHeads (${q}), not ${kv}`),
  'multi-query': (q, kv) => (kv === 1 && q > 1 ? null : `multi-query attention shares one key/value head across 2 or more query heads, so kvHeads must be 1 and queryHeads more than 1 (got ${q} and ${kv})`),
  'grouped-query': (q, kv) => (kv > 1 && kv < q && q % kv === 0 ? null
    : `grouped-query attention splits queryHeads into kvHeads equal groups of 2 or more: ${q} query heads cannot be grouped onto ${kv} key/value heads`),
};

export default {
  name: 'attention-fanout', version: 1,
  description: 'Which query heads share which key/value heads. variant multi-head (kv = q), multi-query (kv = 1) or grouped-query (q divisible by kv, 1 < kv < q); counts up to 128. Large counts compact into group boxes. Anchors: sides, kv-0.., group-0.. for drawn groups.',
  params: {
    variant: { type: 'enum', values: Object.keys(VARIANTS), required: true },
    queryHeads: { type: 'int', min: 1, max: 128, required: true },
    kvHeads: { type: 'int', min: 1, max: 128, required: true },
  },
  hints: {
    maxDrawn: { type: 'number', unit: 'count', min: 4, max: 16, default: 8 },
  },
  repairWritable: ['maxDrawn'],
  anchors: ['top', 'bottom', 'left', 'right'],
  fixtures: ['gqa-32-to-8', 'mqa', 'mha'],
  compile({ params, hints }) {
    const q = params.queryHeads, kv = params.kvHeads;
    const problem = VARIANTS[params.variant](q, kv);
    if (problem) throw new Error(problem);
    const size = q / kv;
    // Each query head drawn on its own only while the whole picture stays
    // small; otherwise one box per group names its range of heads.
    const individual = q <= hints.maxDrawn;
    const drawnGroups = kv <= hints.maxDrawn ? kv : hints.maxDrawn - 1;
    const objects = [], anchors = {};
    let x = 0;
    for (let g = 0; g < drawnGroups; g++) {
      const first = g * size + 1, last = (g + 1) * size;
      const queries = individual ? Array.from({ length: size }, (_, i) => ({ label: `Q${first + i}`, w: QW }))
        : [{ label: size === 1 ? `Q${first}` : `Q${first}–${last}`, w: Math.max(QW, textWidth(`Q${first}–${last}`) + 24) }];
      const groupW = queries.reduce((sum, item) => sum + item.w, 0) + GAP * (queries.length - 1);
      const kvLabel = `K/V${kv === 1 ? '' : ` ${g + 1}`}`;
      const kvW = Math.max(QW, textWidth(kvLabel) + 24);
      const width = Math.max(groupW, kvW);
      const kvBox = { x: x + (width - kvW) / 2, y: 0, w: kvW, h: KH };
      objects.push({ id: `kv${g}`, type: 'box', initialState: { label: kvLabel, ...kvBox, role: 'input' } });
      anchors[`kv-${g}`] = { x: kvBox.x + kvW / 2, y: 0 };
      let qx = x + (width - groupW) / 2;
      queries.forEach((item, i) => {
        objects.push({ id: `q${g}-${i}`, type: 'box', initialState: { label: item.label, x: qx, y: KH + DROP, w: item.w, h: QH, role: 'output' } });
        objects.push({ id: `route${g}-${i}`, type: 'line', initialState: { from: { x: kvBox.x + kvW / 2, y: KH }, to: { x: qx + item.w / 2, y: KH + DROP }, role: 'neutral' } });
        qx += item.w + GAP;
      });
      anchors[`group-${g}`] = { x: x + width / 2, y: KH + DROP + QH };
      x += width + GROUP_GAP;
    }
    const remaining = kv - drawnGroups;
    if (remaining) {
      const text = `plus ${remaining} more group${remaining === 1 ? '' : 's'} of the same shape`;
      objects.push({ id: 'rest', type: 'text', initialState: { text, x, y: KH + DROP / 2 + 5, typography: 'caption' } });
      x += textWidth(text, 'caption') + GROUP_GAP;
    }
    const caption = params.variant === 'multi-head' ? `each of the ${q} query heads has its own key/value head`
      : params.variant === 'multi-query' ? `all ${q} query heads share one key/value head`
        : `${q} query heads share ${kv} key/value heads, ${size} per group`;
    const captionY = KH + DROP + QH + CAPTION_GAP;
    objects.push({ id: 'caption', type: 'text', initialState: { text: caption, x: 0, y: captionY, typography: 'caption' } });
    const w = Math.max(x - GROUP_GAP, textWidth(caption, 'caption')), h = captionY + 8;
    return { w, h, objects, anchors: { ...sides(w, h), ...anchors } };
  },
};
