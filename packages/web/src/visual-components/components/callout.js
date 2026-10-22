// Callout: the takeaway or a caution, in a tinted box that wraps its text.
import { labelledBox } from '../label.js';
import { sides } from '../text.js';

// The takeaway is neutral: a role colour means something in the diagram and its legend (L4 review t11-r1: a green
// takeaway read as 'where the answer is made' beside a legend naming green). It stands out by its tone of voice and place.
const TONE = { note: 'neutral', key: 'neutral', caution: 'warning' };

export default {
  name: 'callout', version: 1,
  description: 'A takeaway (key), a side note (note) or a caution, as wrapped text in a tinted box. Anchors: top, bottom, left, right.',
  params: {
    text: { type: 'label', required: true, maxLength: 600 },
    tone: { type: 'enum', values: Object.keys(TONE), default: 'key' },
  },
  hints: { width: { type: 'number', unit: 'px', min: 200, max: 720, default: 480 } },
  repairWritable: ['width'],
  anchors: ['top', 'bottom', 'left', 'right'],
  fixtures: ['pipeline', 'pendulum-law'],
  compile({ params, hints }) {
    const box = labelledBox({ id: 'box', label: params.text, role: TONE[params.tone], minWidth: hints.width, maxWidth: hints.width, align: 'start' });
    return { ...box, anchors: sides(box.w, box.h) };
  },
};
