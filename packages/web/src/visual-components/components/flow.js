// Flow: an ordered sequence of steps joined by arrows. Each step is a
// module-like box; step anchors are step-0 .. step-(n-1) plus first and last.
import { labelledBox } from '../label.js';
import { BOX_ROLES, sides } from '../text.js';
import { validateLabelContent } from '../../explain-contract.js';

export default {
  name: 'flow', version: 1,
  description: 'An ordered sequence of 2 to 8 steps joined by arrows: steps [label or {label, role}]. Anchors: top, bottom, left, right, first, last, step-0 to step-7.',
  params: { steps: { type: 'list', required: true, min: 2, max: 8 } },
  hints: {
    direction: { type: 'enum', values: ['horizontal', 'vertical'], default: 'horizontal' },
    gap: { type: 'number', unit: 'px', min: 32, max: 128, default: 56 },
    nodeWidth: { type: 'number', unit: 'px', min: 120, max: 320, default: 176 },
  },
  repairWritable: ['direction', 'gap', 'nodeWidth'],
  anchors: ['top', 'bottom', 'left', 'right', 'first', 'last'],
  fixtures: ['pipeline'],
  compile({ params, hints }) {
    const horizontal = hints.direction === 'horizontal';
    const boxes = params.steps.map((step, index) => {
      const label = typeof step === 'object' && step && !Array.isArray(step) && 'label' in step ? step.label : step;
      const role = (typeof step === 'object' && step?.role) || 'neutral';
      if (!BOX_ROLES.includes(role)) throw new Error(`steps.${index}.role must be one of ${BOX_ROLES.join(', ')}`);
      if (!label) throw new Error(`steps.${index} needs a label`);
      return labelledBox({ id: `step${index}`, label: validateLabelContent(label), role, minWidth: hints.nodeWidth, maxWidth: hints.nodeWidth });
    });
    // One cross size for every step, so arrows run straight between centres.
    const cross = Math.max(...boxes.map(box => (horizontal ? box.h : box.w)));
    const objects = [], anchors = {}, frames = [];
    let along = 0;
    boxes.forEach((box, index) => {
      const x = horizontal ? along : (cross - box.w) / 2;
      const y = horizontal ? (cross - box.h) / 2 : along;
      for (const object of box.objects) objects.push({ ...object, initialState: { ...object.initialState, x: object.initialState.x + x, y: object.initialState.y + y } });
      frames.push({ x, y, w: box.w, h: box.h });
      anchors[`step-${index}`] = { x: x + box.w / 2, y: y + box.h / 2 };
      along += (horizontal ? box.w : box.h) + hints.gap;
    });
    frames.slice(1).forEach((frame, index) => {
      const prev = frames[index];
      const from = horizontal ? { x: prev.x + prev.w, y: cross / 2 } : { x: cross / 2, y: prev.y + prev.h };
      const to = horizontal ? { x: frame.x, y: cross / 2 } : { x: cross / 2, y: frame.y };
      objects.push({ id: `edge${index}`, type: 'arrow', initialState: { from, to } });
    });
    const w = horizontal ? along - hints.gap : cross;
    const h = horizontal ? cross : along - hints.gap;
    const first = frames[0], last = frames[frames.length - 1];
    return {
      w, h, objects,
      anchors: {
        ...sides(w, h), ...anchors,
        first: horizontal ? { x: first.x, y: cross / 2 } : { x: cross / 2, y: first.y },
        last: horizontal ? { x: last.x + last.w, y: cross / 2 } : { x: cross / 2, y: last.y + last.h },
      },
    };
  },
};
