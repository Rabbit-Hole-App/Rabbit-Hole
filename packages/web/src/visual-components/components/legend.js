// Legend: what each colour means, one swatch and name per role in use.
import { labelWidth, lineFields, wrapLabel } from '../label.js';
import { BOX_ROLES, sides } from '../text.js';
import { validateLabelContent } from '../../explain-contract.js';

const SWATCH = 16, GAP = 8, ROW = 28;

export default {
  name: 'legend', version: 1,
  description: 'Names what each role colour means: entries [{label, role}], 1 to 8. Anchors: top, bottom, left, right.',
  params: { entries: { type: 'list', required: true, min: 1, max: 8 } },
  hints: {
    direction: { type: 'enum', values: ['row', 'column'], default: 'row' },
    spacing: { type: 'number', unit: 'px', min: 16, max: 64, default: 24 },
  },
  repairWritable: ['direction', 'spacing'],
  anchors: ['top', 'bottom', 'left', 'right'],
  fixtures: ['pipeline'],
  compile({ params, hints }) {
    const objects = [];
    let x = 0, y = 0, w = 0;
    params.entries.forEach((entry, index) => {
      const role = entry?.role ?? 'neutral';
      if (!BOX_ROLES.includes(role)) throw new Error(`entries.${index}.role must be one of ${BOX_ROLES.join(', ')}`);
      if (!entry?.label) throw new Error(`entries.${index} needs a label`);
      const label = validateLabelContent(entry.label);
      const width = SWATCH + GAP + labelWidth(label, 'annotation');
      objects.push({ id: `swatch${index}`, type: 'box', initialState: { x, y: y + (ROW - SWATCH) / 2, w: SWATCH, h: SWATCH, role } });
      objects.push({ id: `name${index}`, type: 'text', initialState: { ...lineFields(wrapLabel(label, Infinity, 'annotation')[0], 'text'), x: x + SWATCH + GAP, y: y + ROW / 2 + 5, typography: 'annotation' } });
      w = Math.max(w, x + width);
      if (hints.direction === 'row') x += width + hints.spacing; else y += ROW;
    });
    const h = hints.direction === 'row' ? ROW : y;
    return { w, h, objects, anchors: sides(w, h) };
  },
};
