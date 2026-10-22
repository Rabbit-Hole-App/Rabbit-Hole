// Flow: an ordered sequence of steps joined by arrows. Each step is a
// module-like box; step anchors are step-0 .. step-(n-1) plus first and last.
import { labelledBox } from '../label.js';
import { BOX_ROLES, sides } from '../text.js';
import { validateLabelContent } from '../../explain-contract.js';
import { lineFields, wrapLabel } from '../label.js';

const OFF_PATH = 0.3;

// cases: named paths through the steps; case picks one (default the first). -> its label and steps, or null without cases.
function readCase(params) {
  if (params.cases === undefined) {
    if (params.case !== undefined) throw new Error('case needs cases');
    return null;
  }
  const ids = new Set();
  for (const [index, item] of params.cases.entries()) {
    if (typeof item?.id !== 'string' || !/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(item.id) || ids.has(item.id)) throw new Error(`cases.${index}.id must be a unique stable id`);
    ids.add(item.id);
    if (typeof item.label !== 'string' || !item.label.trim() || item.label.length > 120) throw new Error(`cases.${index}.label must be text of at most 120 characters`);
    if (!Array.isArray(item.steps) || !item.steps.length || item.steps.some(step => !Number.isInteger(step) || step < 0 || step >= params.steps.length)) throw new Error(`cases.${index}.steps must list step indexes from 0 to ${params.steps.length - 1}`);
  }
  const chosen = params.cases.find(item => item.id === (params.case ?? params.cases[0].id));
  if (!chosen) throw new Error(`case "${params.case}" is not one of the cases`);
  const sorted = [...chosen.steps].sort((a, b) => a - b);
  return { label: chosen.label, has: step => chosen.steps.includes(step), skips: sorted.flatMap((step, at) => (at && step > sorted[at - 1] + 1 ? [`${sorted[at - 1]}-${step}`] : [])) };
}

export default {
  name: 'flow', version: 1,
  description: 'An ordered sequence of 2 to 8 steps joined by arrows: steps [label or {label, role}]. Optional cases [{id, label, steps: [indexes on that path]}] (2 to 6) and case (a case id, default the first): off-path steps and their arrows dim, the case label shows below. Control: case. Anchors: top, bottom, left, right, first, last, step-0 to step-7.',
  params: {
    steps: { type: 'list', required: true, min: 2, max: 8 },
    cases: { type: 'list', min: 2, max: 6 },
    case: { type: 'string', maxLength: 64 },
  },
  hints: {
    direction: { type: 'enum', values: ['horizontal', 'vertical'], default: 'horizontal' },
    gap: { type: 'number', unit: 'px', min: 32, max: 128, default: 56 },
    nodeWidth: { type: 'number', unit: 'px', min: 120, max: 320, default: 176 },
  },
  repairWritable: ['direction', 'gap', 'nodeWidth'],
  anchors: ['top', 'bottom', 'left', 'right', 'first', 'last'],
  fixtures: ['pipeline', 'cache-paths'],
  controls: {
    case: { param: 'case', label: 'Case', optionsFrom: 'cases', affects: 'the case caption, and the steps (and arrows) that are on one path and not the other' },
  },
  compile({ params, hints }) {
    const horizontal = hints.direction === 'horizontal';
    const chosen = readCase(params);
    const build = minHeight => params.steps.map((step, index) => {
      const label = typeof step === 'object' && step && !Array.isArray(step) && 'label' in step ? step.label : step;
      const role = (typeof step === 'object' && step?.role) || 'neutral';
      if (!BOX_ROLES.includes(role)) throw new Error(`steps.${index}.role must be one of ${BOX_ROLES.join(', ')}`);
      if (!label) throw new Error(`steps.${index} needs a label`);
      return labelledBox({ id: `step${index}`, label: validateLabelContent(label), role, minWidth: hints.nodeWidth, maxWidth: hints.nodeWidth, ...(minHeight ? { minHeight } : {}) });
    });
    // A row of steps shares one height, so a wrapped label does not leave one
    // box taller than its neighbours (render review, request-path-parts).
    let boxes = build();
    const tallest = Math.max(...boxes.map(box => box.h));
    if (horizontal && boxes.some(box => box.h !== tallest)) boxes = build(tallest);
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
      objects.push({ id: `edge${index}`, type: 'arrow', initialState: { from, to, ...(chosen ? { opacity: chosen.has(index) && chosen.has(index + 1) ? 1 : OFF_PATH } : {}) } });
    });
    if (chosen) {
      // Off the chosen path: dimmed, still readable, so the two paths can be compared. Every state sets opacity.
      for (const object of objects) {
        const step = /^step(\d+)/.exec(object.id);
        if (step) object.initialState = { ...object.initialState, opacity: chosen.has(Number(step[1])) ? 1 : OFF_PATH };
      }
    }
    const w = horizontal ? along - hints.gap : cross;
    const h = horizontal ? cross : along - hints.gap;
    let height = h;
    if (chosen) {
      // A case that skips steps goes round them: a route under the row from the step before the skip to the step after.
      // Every case's routes exist in every state (a control changes what shows, not which objects exist).
      // shortcut: routes only for a horizontal flow; a vertical one shows the skip by dimming alone. Add side routes if needed.
      const skips = horizontal ? [...new Set(params.cases.flatMap(item => [...item.steps].sort((a, b) => a - b).flatMap((step, at, list) => (at && step > list[at - 1] + 1 ? [`${list[at - 1]}-${step}`] : []))))] : [];
      skips.forEach((skip, lane) => {
        const [a, b] = skip.split('-').map(Number);
        const y = h + 20 + lane * 16, xa = frames[a].x + frames[a].w / 2, xb = frames[b].x + frames[b].w / 2;
        const opacity = chosen.skips.includes(skip) ? 1 : 0;
        objects.push(
          { id: `skip${lane}down`, type: 'line', initialState: { from: { x: xa, y: frames[a].y + frames[a].h }, to: { x: xa, y }, role: 'neutral', opacity } },
          { id: `skip${lane}across`, type: 'line', initialState: { from: { x: xa, y }, to: { x: xb, y }, role: 'neutral', opacity } },
          { id: `skip${lane}up`, type: 'arrow', initialState: { from: { x: xb, y }, to: { x: xb, y: frames[b].y + frames[b].h }, role: 'neutral', opacity } },
        );
      });
      const top = h + (skips.length ? 20 + (skips.length - 1) * 16 : 0);
      objects.push({ id: 'case', type: 'text', initialState: { ...lineFields(wrapLabel(chosen.label, Infinity)[0], 'text'), x: 0, y: top + 32, typography: 'body', role: 'output' } });
      height = top + 44;
    }
    const first = frames[0], last = frames[frames.length - 1];
    return {
      w, h: height, objects,
      anchors: {
        // left and right stay on the step row; bottom is under the case caption.
        ...sides(w, h), bottom: { x: w / 2, y: height }, ...anchors,
        first: horizontal ? { x: first.x, y: cross / 2 } : { x: cross / 2, y: first.y },
        last: horizontal ? { x: last.x + last.w, y: cross / 2 } : { x: cross / 2, y: last.y + last.h },
      },
    };
  },
};
