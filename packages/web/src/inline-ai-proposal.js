// R5.02 pure parts of editing a pending roadmap proposal with Ctrl/Cmd+K: the discriminated target, the keyboard precedence while the editor is open,
// and when a preview is stale. No React, no fetch. The editor itself is a small box inside the proposal overlay (NextStepPill.jsx), not InlineAiEditor:
// a proposal is not a board block, so none of the board-edit transactions (applyTx, the paid-card Generate branch) can run for it.

// Not a saved-card lookup and not a fake board block: its own kind, frozen at the version the learner saw.
export const proposalTarget = view => (view?.proposal && view.roadmap
  ? Object.freeze({ kind: 'roadmap_proposal', roadmapId: view.roadmap.id, stepId: view.proposal.stepId, proposalId: view.proposal.id, proposalVersion: view.proposal.version }) : null);

export const sameTarget = (a, b) => !!a && !!b && a.kind === b.kind && a.proposalId === b.proposalId && a.proposalVersion === b.proposalVersion;

// A preview made for one proposal version is stale as soon as the server's view shows another (an Apply from this tab, an acceptance or an edit from
// another device, a Cancel). The view is the truth: the preview is dropped and the actual state is shown.
export const stalePreview = (draft, view) => !!draft && !(view?.proposal && view.proposal.id === draft.proposalId && view.proposal.version === draft.proposalVersion && view.proposal.state === 'pending');

// Opening: Ctrl/Cmd+K with the keyboard on the proposal (overlay focused or its Edit button). Never from the composer, a card widget or while another editor is open.
export function opensEditor(event, { onProposal, editorOpen, readOnly = false }) {
  return !!event && (event.key === 'k' || event.key === 'K') && (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && !event.repeat && !event.isComposing
    && !!onProposal && !editorOpen && !readOnly;
}

// Inside the open editor. Enter asks for a preview, Ctrl/Cmd+Enter applies an existing preview, Esc discards. IME composition and key repeat never act. Tab belongs to
// the editor while it is open: it never reaches step acceptance (roadmap-client.js tabAccepts refuses while the editor is open, and this reports 'keep').
export function editKey(event, { draft, busy = false, text = '' }) {
  if (!event || event.isComposing || event.keyCode === 229) return null;
  if (event.key === 'Escape') return 'discard';
  if (event.key === 'Tab') return 'keep';
  if (event.repeat || busy) return null;
  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) return draft ? 'apply' : null;
  if (event.key === 'Enter' && !event.shiftKey && !event.altKey) return text.trim() ? 'preview' : null;
  return null;
}
