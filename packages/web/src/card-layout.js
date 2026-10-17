// World-space sizes. The slot is the original flex-column footprint, not the rendered full height.
// Keeping it fixed prevents layout changes from moving the card or its neighbours.
export const FULL_WIDTH = Object.freeze({ baseline: 320, preferred: 720, maximum: 1200 });
export const FULL_TYPES = new Set(['explanation', 'snippet', 'table', 'image']);
export const supportsCardLayout = block => FULL_TYPES.has(block?.type);
export const fullContent = block => supportsCardLayout(block) && block.cardLayout?.mode === 'full';
const positive = value => Number.isFinite(value) && value > 0;
export function widthLimits(minimum = FULL_WIDTH.baseline) {
 const min = Math.max(FULL_WIDTH.baseline, positive(minimum) ? minimum : 0);
 return { min, max: Math.max(FULL_WIDTH.maximum, min) };
}
export function fitWidth(width, limits = widthLimits()) { return Math.min(limits.max, Math.max(limits.min, positive(width) ? width : FULL_WIDTH.preferred)); }
export function switchCardLayout(block, mode, box, minimum) {
 if (!supportsCardLayout(block) || !['full','scrollable'].includes(mode)) return block;
 const old = block.cardLayout;
 if ((old?.mode || 'scrollable') === mode) return block;
 const current = { w: positive(box?.w) ? box.w : (block.w || FULL_WIDTH.preferred), h: positive(box?.h) ? box.h : (block.h || 420) };
 const slot = old?.slot || current;
 const scrollableSize = old?.mode === 'full' ? old.scrollableSize || slot : current;
 const fullWidth = positive(old?.fullWidth) ? old.fullWidth : fitWidth(current.w, widthLimits(minimum));
 return { ...block, cardLayout: { mode, scrollableSize: { ...scrollableSize }, fullWidth, slot: { ...slot } } };
}
export function resizeCardLayout(block, width, height, dx, minimum) {
 if (!block.cardLayout || !supportsCardLayout(block)) return block;
 const layout = block.cardLayout;
 if (layout.mode === 'full') return { ...block, dx: Number.isFinite(dx) ? dx : block.dx, cardLayout: { ...layout, fullWidth: fitWidth(width, widthLimits(minimum)) } };
 return { ...block, cardLayout: { ...layout, scrollableSize: { w: width, h: height } } };
}
// Measure only irreducible, readable elements. Wrappable prose/code and image pixel widths are not minima.
export function contentMinimum(element) {
 let min = FULL_WIDTH.baseline;
 for (const math of element.querySelectorAll('.katex-html')) {
  const bases = [...math.children].filter(node => node.classList.contains('base'));
  min = Math.max(min, bases.reduce((sum,node)=>sum+node.offsetWidth,0) + 40);
 }
 for (const table of element.querySelectorAll('table')) {
  const rows = [...table.rows], columns = Math.max(0,...rows.map(row=>row.cells.length));
  min = Math.max(min, columns * 96 + 40);
 }
 const context = element.ownerDocument.createElement('canvas').getContext('2d');
 for (const control of element.querySelectorAll('button,select')) {
  const style = getComputedStyle(control); context.font = style.font;
  const word = Math.max(0,...(control.textContent || '').split(/\s+/).map(text => context.measureText(text).width));
  min = Math.max(min, word + (parseFloat(style.paddingLeft)||0) + (parseFloat(style.paddingRight)||0) + 40);
 }
 return Math.ceil(min);
}
