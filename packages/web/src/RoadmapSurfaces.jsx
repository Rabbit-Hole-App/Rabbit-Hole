import RoadmapInvitation from './RoadmapInvitation.jsx';
import RoadmapPlan from './RoadmapPlan.jsx';
import { useRef, useState } from 'react';
import { NextStepIndicator, ProposalOverlay } from './NextStepPill.jsx';
import { createDragStore, dragged } from './roadmap-proposal-context.js';

// The three places the roadmap shows, each fed by the object useRoadmap returns, so a page mounts each with one line:
//   RoadmapChat   above the Chat composer (invitation, state lines, a failed card's Retry/Replace/Omit)
//   RoadmapToc    at the top of the Table of contents tab (plan, steps, actions)
//   RoadmapCanvas over the canvas pane (the pending proposal overlay and the Next step ready indicator)
export function RoadmapChat({ roadmap }) {
  const c = roadmap.controller;
  return <RoadmapInvitation invitation={roadmap.invitation} lines={roadmap.lines} onExplain={() => c.explain()} onKeep={() => c.dismiss()}
    onAnswer={fields => c.answer(fields)} onRecover={(stepId, action) => c.recover(stepId, action)} onOffer={() => roadmap.editPlan()} />;
}
export function RoadmapToc({ roadmap }) {
  const c = roadmap.controller;
  return <RoadmapPlan toc={roadmap.toc} onAcceptPlan={() => c.acceptPlan()} onEdit={roadmap.editPlan} onProposeNext={() => c.proposeNext()} onEnd={() => c.end()}
    onRecover={(stepId, action) => c.recover(stepId, action)} onGo={roadmap.go} />;
}
export function RoadmapCanvas({ roadmap }) {
  const c = roadmap.controller, st = roadmap.state, pill = roadmap.pill;
  const store = useRef(null), [, tick] = useState(0);
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
      {pill && roadmap.showOverlay && <ProposalOverlay pill={pill} position={position} onAccept={() => c.acceptProposal()} onCancel={() => c.cancelProposal()} edit={edit} drag={startDrag} />}
      <NextStepIndicator indicator={roadmap.indicator} onGo={() => roadmap.go({ kind: 'proposal' })} />
    </>
  );
}
