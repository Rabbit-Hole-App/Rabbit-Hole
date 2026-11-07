import RoadmapInvitation from './RoadmapInvitation.jsx';
import { useEffect, useRef, useState } from 'react';
import { ProposalOverlay } from './NextStepPill.jsx';
import { toast } from './ui.jsx';
import { failuresOf } from './roadmap-client.js';
import { createDragStore, dragged } from './roadmap-proposal-context.js';

// The three places the roadmap shows, each fed by the object useRoadmap returns, so a page mounts each with one line:
//   RoadmapChat   above the Chat composer (invitation and state lines)
//   RoadmapToc    at the top of the Table of contents tab (plan, steps, actions)
//   RoadmapCanvas over the canvas pane (the pending proposal overlay; a later offer's Next card | Cancel is the canvas's bottom pill, AdaptiveCanvas)
export function RoadmapChat({ roadmap }) {
  const c = roadmap.controller;
  return <RoadmapInvitation invitation={roadmap.invitation} lines={roadmap.lines} onExplain={() => c.explain()} onKeep={() => c.dismiss()}
    onAnswer={fields => c.answer(fields)} onOffer={() => roadmap.editPlan()} onChoose={choice => c.explainPart(choice)} />;
}
// UI.02: the ToC draws the accepted roadmap as rows of its own tree (TableOfContents roadmap prop); no Tutor panel above it in any flag or state.
// ponytail: kept as a null component until LearnPage stops passing it as `top` (chat-LearnPage patch), then delete it.
export function RoadmapToc() { return null; }
// hosted: the canvas really draws this proposal as its slot (AdaptiveCanvas SlotCard beside its source; the page learns it from the canvas), so the fixed overlay is
// not drawn: never both. A proposal the canvas cannot draw (a link, a source not measured yet, the editor open) keeps the overlay: never neither.
export function RoadmapCanvas({ roadmap, hosted = false }) {
  const c = roadmap.controller, st = roadmap.state, pill = roadmap.pill;
  const store = useRef(null), [, tick] = useState(0), told = useRef(new Set());
  // A withheld card is announced once per result through the app's existing error toast (ui.jsx), its message only (owner 2026-11-06: no Retry, Replace or Omit on explanation cards).
  const failures = failuresOf(st?.view);
  useEffect(() => {
    for (const item of failures) {
      if (told.current.has(item.resultId)) continue;
      told.current.add(item.resultId);
      toast(item.message, { tone: 'error' });
    }
  }, [failures.map(f => f.resultId).join(' ')]);
  store.current ||= createDragStore();
  const identity = pill && { proposalId: pill.proposalId, version: pill.version };
  if (identity) store.current.prune(identity);
  const position = identity ? dragged(roadmap.position, store.current.get(identity), roadmap.surface) : roadmap.position;
  // Moving the strip keeps a position for this proposal version only; it changes no content, version or request.
  const startDrag = event => {
    const from = { x: event.clientX, y: event.clientY }, base = store.current.get(identity);
    const move = e => { store.current.set(identity, { dx: base.dx + e.clientX - from.x, dy: base.dy + e.clientY - from.y }); tick(n => n + 1); };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };
  const edit = pill?.canEdit && { open: st.editing, draft: st.draft, busy: st.busy.length > 0, onOpen: () => c.openEditor(), onPreview: text => c.previewEdit(text), onApply: () => c.applyEdit(), onDiscard: () => c.closeEditor() };
  return (
    <>
      {pill && roadmap.showOverlay && !hosted && <ProposalOverlay pill={pill} position={position} onAccept={() => c.acceptProposal()} onCancel={() => c.cancelProposal()} edit={edit} drag={startDrag} />}
    </>
  );
}
