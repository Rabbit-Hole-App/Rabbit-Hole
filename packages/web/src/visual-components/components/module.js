// Module: one named unit (a layer, a stage, a part of a machine) drawn as a
// box. Ports are its four sides.
import { labelledBox } from '../label.js';
import { BOX_ROLES, sides } from '../text.js';

export default {
  name: 'module', version: 1,
  description: 'One named unit drawn as a box; long names wrap inside it. Anchors: top, bottom, left, right.',
  params: {
    label: { type: 'label', required: true, maxLength: 200 },
    role: { type: 'enum', values: BOX_ROLES, default: 'neutral' },
  },
  hints: {
    width: { type: 'number', unit: 'px', min: 120, max: 480, default: 176 },
    maxWidth: { type: 'number', unit: 'px', min: 160, max: 640, default: 320 },
  },
  repairWritable: ['width', 'maxWidth'],
  anchors: ['top', 'bottom', 'left', 'right'],
  fixtures: ['pipeline'],
  compile({ params, hints }) {
    const box = labelledBox({ id: 'box', label: params.label, role: params.role, minWidth: hints.width, maxWidth: Math.max(hints.width, hints.maxWidth) });
    return { ...box, anchors: sides(box.w, box.h) };
  },
};
