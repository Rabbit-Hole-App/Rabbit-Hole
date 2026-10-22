// Text measurement for compiled components, with the same estimate the layout
// lint and the renderer's label placement use (scene-layout.js
// estimateTextBox). Wrapping of authored labels lives in label.js.
import { estimateTextBox } from '../scene-layout.js';
import { textStyle } from '../scene-style.js';
import { ROLES, ROLE_FILL } from '../scene-vocab.js';

// Roles a component may give a box that holds wrapped text: neutral ink stays
// readable on soft and strong fills, not on the solid ones.
export const BOX_ROLES = ROLES.filter(role => ROLE_FILL[role] !== 'solid');

export const lineHeight = typography => Math.ceil(textStyle(typography).fontSize * 1.4);

export function textWidth(text, typography = 'body') {
  const box = estimateTextBox({ text, x: 0, y: 0, fontSize: textStyle(typography).fontSize, anchor: 'start', baseline: 'auto' });
  return Math.ceil(box.xMax - box.xMin);
}

export const sides = (w, h) => ({
  top: { x: w / 2, y: 0 }, bottom: { x: w / 2, y: h }, left: { x: 0, y: h / 2 }, right: { x: w, y: h / 2 },
});
