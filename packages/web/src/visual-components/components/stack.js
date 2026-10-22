// Stack: lays its child components out in a column or a row.
import { sides } from '../text.js';

export default {
  name: 'stack', version: 1, container: true,
  description: 'Places its children (components naming it as parent) in a column or a row. Anchors: top, bottom, left, right.',
  params: {},
  hints: {
    direction: { type: 'enum', values: ['column', 'row'], default: 'column' },
    gap: { type: 'number', unit: 'px', min: 16, max: 128, default: 32 },
    align: { type: 'enum', values: ['start', 'center'], default: 'start' },
  },
  repairWritable: ['direction', 'gap', 'align'],
  anchors: ['top', 'bottom', 'left', 'right'],
  fixtures: ['pipeline'],
  compile({ hints, children }) {
    const column = hints.direction === 'column';
    const cross = Math.max(0, ...children.map(child => (column ? child.w : child.h)));
    const places = [];
    let along = 0;
    for (const child of children) {
      const offset = hints.align === 'center' ? (cross - (column ? child.w : child.h)) / 2 : 0;
      places.push(column ? { x: offset, y: along } : { x: along, y: offset });
      along += (column ? child.h : child.w) + hints.gap;
    }
    const length = Math.max(0, along - hints.gap);
    const w = column ? cross : length, h = column ? length : cross;
    return { w, h, objects: [], places, anchors: sides(w, h) };
  },
};
