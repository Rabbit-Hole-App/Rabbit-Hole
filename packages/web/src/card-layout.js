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

// Capture the current outer box before an accepted rewrite, including default auto-sized cards.
// This is part of the edit transaction, so Undo restores both content and its previous sizing policy.
export function preserveCardEditLayout(block, box) {
 if (!supportsCardLayout(block) || block.cardLayout || !positive(box?.w) || !positive(box?.h)) return block;
 return { ...block, cardLayout: { mode: 'scrollable', scrollableSize: { w: box.w, h: box.h }, fullWidth: box.w, slot: { w: box.w, h: box.h } } };
}

// The corner handle's limits for a card that keeps its own w and h (CanvasNode), in one place so a committed size is clamped
// the way the drag was. `most`: a content-fitted card's natural height (naturalHeight), so neither the drag nor the commit
// sizes it taller than its content needs (FX-EB-10).
export const clampBox = (w, h, most = 1000) => ({ w: Math.min(1200, Math.max(280, w)), h: Math.min(Math.max(140, Math.min(1000, positive(most) ? most : 1000)), Math.max(140, h)) });
// FX-EB-10: a content-fitted card (BLOCK_TYPES fitContent: a text card) is never taller than its content. The height it would be
// held at (saved, dragged or its type's cap) is only a ceiling: its height follows the content as text wraps, feedback appears or
// a section opens, content above the ceiling scrolls inside, and a saved height above the content leaves no blank space.
export const fitFrame = (height, maxHeight, fit) => (fit ? { height: undefined, maxHeight: height ?? maxHeight } : { height, maxHeight });
// That card's natural height without the rows under its body (`extra`). It reads a card fitFrame leaves unstretched, so the
// card's own height is its content's (never a stretched flex box's), plus whatever its scroll body hides above the ceiling.
export function naturalHeight(card, extra = 0) {
 const body = card.querySelector('[data-scroll]');
 return card.offsetHeight - extra + (body ? Math.max(0, body.scrollHeight - body.clientHeight) : 0);
}
// A committed size or a report from inside a card patches the block as the canvas holds it now, never the copy a drag or a
// frame message started from: that copy replaced the whole block and put back whatever changed since (a resize reverted a
// notebook's newer save, a notebook save reverted the new size).
export const patchBlock = (blocks, id, patch) => blocks.map(block => block.id === id ? { ...block, ...patch } : block);
