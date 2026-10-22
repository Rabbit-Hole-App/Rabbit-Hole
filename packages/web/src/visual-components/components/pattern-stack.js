// Pattern stack (EXP-T06): one full period of a repeating group, drawn once
// in detail, with condensed copies behind it and a caption saying how many
// times it repeats and on what evidence. The structure comes from the
// pattern and the count, never from what the thing is called.
import { validateLabelContent } from '../../explain-contract.js';
import { chainSequential, stackSilhouettes } from '../../scene-repeat.js';
import { labelWidth, labelledBox, lineFields, wrapLabel } from '../label.js';
import { BOX_ROLES, lineHeight, sides } from '../text.js';

const PAD = 16, TITLE_GAP = 12, CAPTION_GAP = 16, GHOST_STEP = 8;

// counts: one number, or the same number as stated by one or more evidence
// records. Same record twice is one source; different records that agree
// are a cross-check; different values are a conflict, shown, never resolved.
function readCount(params, bound) {
  if ((params.count === undefined) === (params.countSources === undefined)) throw new Error('give exactly one of count or countSources');
  if (params.count !== undefined) return { value: params.count, sources: 0, conflict: null };
  const raw = params.countSources;
  for (const [index, item] of raw.entries()) {
    if (!Number.isInteger(item?.value) || item.value < 1 || item.value > 1024) throw new Error(`countSources.${index}.value must be a whole number from 1 to 1024`);
    if (typeof item.evidence !== 'string' || !bound.includes(item.evidence)) throw new Error(`countSources.${index}.evidence must name one of this component's evidence records`);
  }
  const values = [...new Set(raw.map(item => item.value))];
  const sources = new Set(raw.map(item => item.evidence)).size;
  if (values.length > 1) return { value: null, sources, conflict: raw.map(item => `${item.value} (${item.evidence})`).join(' or ') };
  return { value: values[0], sources, conflict: null };
}

export default {
  name: 'pattern-stack', version: 1,
  description: 'One period of a repeating group (pattern: 1 to 6 entries) drawn in full with condensed copies behind it. count, or countSources [{value, evidence}], gives periods, or entries when countOf is "entries" (a multiple of the pattern). Disagreeing sources show as a conflict. Anchors: sides, in, out, entry-0 to entry-5.',
  params: {
    title: { type: 'label', required: true, maxLength: 120 },
    pattern: { type: 'list', required: true, min: 1, max: 6 },
    count: { type: 'int', min: 1, max: 1024 },
    countSources: { type: 'list', min: 1, max: 4 },
    countOf: { type: 'enum', values: ['periods', 'entries'], default: 'periods' },
  },
  hints: {
    nodeWidth: { type: 'number', unit: 'px', min: 120, max: 320, default: 200 },
    gap: { type: 'number', unit: 'px', min: 24, max: 96, default: 32 },
    ghosts: { type: 'number', unit: 'count', min: 1, max: 4, default: 3 },
  },
  repairWritable: ['nodeWidth', 'gap', 'ghosts'],
  anchors: ['top', 'bottom', 'left', 'right', 'in', 'out'],
  fixtures: ['decoder-stack', 'hybrid-attention', 'rinse-cycles'],
  compile({ params, hints, evidence = [] }) {
    const count = readCount(params, evidence);
    const period = params.pattern.length;
    if (count.value !== null && params.countOf === 'entries' && count.value % period) {
      throw new Error(`count ${count.value} entries is not a whole number of ${period}-entry periods: the pattern or the count is wrong`);
    }
    const periods = count.value === null ? null : params.countOf === 'entries' ? count.value / period : count.value;

    // The unit: its title, then each pattern entry chained top to bottom.
    const title = validateLabelContent(params.title);
    const titleH = lineHeight('heading');
    const boxes = params.pattern.map((entry, index) => {
      const label = entry && typeof entry === 'object' && 'label' in entry ? entry.label : entry;
      const role = (entry && typeof entry === 'object' && entry.role) || 'neutral';
      if (!BOX_ROLES.includes(role)) throw new Error(`pattern.${index}.role must be one of ${BOX_ROLES.join(', ')}`);
      if (!label) throw new Error(`pattern.${index} needs a label`);
      return labelledBox({ id: `entry${index}`, label: validateLabelContent(label), role, minWidth: hints.nodeWidth, maxWidth: hints.nodeWidth });
    });
    const inner = Math.max(hints.nodeWidth, ...boxes.map(box => box.w), labelWidth(title, 'heading'));
    const frameW = inner + 2 * PAD;
    const ghostRoom = Math.min(hints.ghosts, periods === null ? hints.ghosts : periods - 1) * GHOST_STEP;
    const top = ghostRoom; // condensed copies peek out above and to the right
    const objects = [], anchors = {}, ports = [];
    let y = top + PAD + titleH + TITLE_GAP;
    boxes.forEach((box, index) => {
      const x = PAD + (inner - box.w) / 2;
      for (const object of box.objects) objects.push({ ...object, initialState: { ...object.initialState, x: object.initialState.x + x, y: object.initialState.y + y } });
      anchors[`entry-${index}`] = { x: x + box.w, y: y + box.h / 2 };
      ports.push({ in: { x: x + box.w / 2, y }, out: { x: x + box.w / 2, y: y + box.h } });
      y += box.h + hints.gap;
    });
    const frameH = y - hints.gap + PAD - top;
    const frame = { id: 'frame', type: 'box', initialState: { x: 0, y: top, w: frameW, h: frameH, role: 'neutral' } };
    // Ghosts first so the full unit draws over them.
    const ghostCount = periods === null ? hints.ghosts + 1 : Math.min(periods, hints.ghosts + 1);
    const ghosts = stackSilhouettes({ unitBox: { x: 0, y: top, w: frameW, h: frameH }, count: ghostCount, idPrefix: 'ghost' }).objects.filter(object => object.type === 'box');
    const titleText = { id: 'title', type: 'text', initialState: { ...lineFields(wrapLabel(title, Infinity, 'heading')[0], 'text'), x: PAD, y: top + PAD + Math.round(titleH * 0.75), typography: 'heading' } };

    // The caption says how many and on what evidence; a conflict is a warning.
    const repeat = periods === null ? `repeats ${count.conflict} times: the sources disagree`
      : `× ${periods}${params.countOf === 'entries' ? ` (${count.value} entries)` : ''}`;
    const basis = periods === null ? null : count.sources === 0 ? null : count.sources === 1 ? 'count from one source' : `count cross-checked by ${count.sources} sources`;
    const right = frameW + ghostRoom + CAPTION_GAP;
    const captions = [{ id: 'count', type: 'text', initialState: { text: repeat, x: right, y: top + frameH / 2, typography: 'caption', ...(periods === null ? { role: 'warning' } : {}) } }];
    if (basis) captions.push({ id: 'basis', type: 'text', initialState: { text: basis, x: right, y: top + frameH / 2 + lineHeight('caption'), typography: 'annotation' } });
    const captionW = Math.max(...captions.map(caption => labelWidth(caption.initialState.text, caption.initialState.typography)));

    const w = right + captionW, h = top + frameH;
    return {
      w, h,
      objects: [...ghosts, frame, titleText, ...objects, ...chainSequential(ports, { idPrefix: 'step' }), ...captions],
      anchors: { ...sides(w, h), ...anchors, in: ports[0].in, out: ports[ports.length - 1].out },
      diagnostics: periods === null ? [{ code: 'source-conflict', message: `count ${count.conflict}` }] : [],
    };
  },
};
