// An Explanation card's transient highlight (EXP-T27): the object the learner picked or the region outlined on it.
// It is view state, not content: clearing it never takes an undo step, and one card on a canvas holds it at a time.

export const holdsSceneHighlight = block => block?.type === 'animation' && !!(block.marked || block.selectedObject);

export const withoutSceneHighlight = block => ({ ...block, marked: null, selectedObject: null });

// Every card except those in `keep` lets go of its highlight. Untouched cards keep their identity, and with nothing
// to release the same array comes back, so a state setter bails out without a render or a save.
export function releaseSceneHighlights(blocks, keep = []) {
  let changed = false;
  const next = blocks.map(block => {
    if (!holdsSceneHighlight(block) || keep.includes(block.id)) return block;
    changed = true;
    return withoutSceneHighlight(block);
  });
  return changed ? next : blocks;
}

// Inputs whose Esc means nothing of their own: a slider or a toggle hands it on.
const KEYLESS_INPUTS = new Set(['range', 'checkbox', 'radio', 'button', 'submit', 'reset', 'color']);
const ESC_OWNERS = '[role="dialog"],[role="menu"],[data-chat-composer],[data-canvas-composer],[data-toc-composer],[data-comment-draft],[data-comments-panel],[data-rich-editor],[data-code-box-editor],[data-canvas-doc],[data-inline-ai],[data-equation-editor]';

// Esc belongs first to whatever already handled it, then to whatever holds the focus for typing: a field, an editor,
// the composer, a dialog or a menu. Only an Esc nothing else claimed clears a scene highlight.
export function escapeYields(event, active = globalThis.document?.activeElement) {
  if (event.defaultPrevented) return true;
  if (!active || active === active.ownerDocument?.body) return false;
  if (active.isContentEditable || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT') return true;
  if (active.tagName === 'INPUT' && !KEYLESS_INPUTS.has(String(active.type || 'text').toLowerCase())) return true;
  return !!active.closest?.(ESC_OWNERS);
}
