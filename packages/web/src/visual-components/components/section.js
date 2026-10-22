// Section: a titled frame around its children, which stack in a column.
import { labelWidth, lineFields, stackLines, wrapLabel } from '../label.js';
import { sides, textWidth } from '../text.js';

export default {
  name: 'section', version: 1, container: true,
  description: 'A titled frame grouping its children (components naming it as parent) in a column. Anchors: top, bottom, left, right.',
  params: { title: { type: 'label', required: true, maxLength: 120 } },
  hints: {
    padding: { type: 'number', unit: 'px', min: 16, max: 48, default: 24 },
    gap: { type: 'number', unit: 'px', min: 16, max: 96, default: 24 },
  },
  repairWritable: ['padding', 'gap'],
  anchors: ['top', 'bottom', 'left', 'right'],
  fixtures: ['pipeline'],
  compile({ params, hints, children }) {
    const inner = Math.max(160, ...children.map(child => child.w));
    const lines = wrapLabel(params.title, Math.max(inner, Math.min(labelWidth(params.title, 'heading'), 640)), 'heading');
    const { baselines, total } = stackLines(lines, 'heading');
    const w = Math.max(inner, ...lines.map(line => textWidth(line.plain, 'heading'))) + 2 * hints.padding;
    const objects = [{ id: 'frame', type: 'box', initialState: { x: 0, y: 0, w, h: 1, role: 'neutral' } }];
    lines.forEach((line, index) => objects.push({ id: `title${index}`, type: 'text', initialState: { ...lineFields(line, 'text'), x: hints.padding, y: Math.round(hints.padding + baselines[index]), typography: 'heading' } }));
    let y = hints.padding + total + hints.gap;
    const places = children.map(child => { const at = { x: hints.padding, y }; y += child.h + hints.gap; return at; });
    const h = y - hints.gap + hints.padding;
    objects[0].initialState.h = h;
    return { w, h, objects, places, anchors: sides(w, h) };
  },
};
