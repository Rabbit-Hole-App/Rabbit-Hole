import RoadmapInvitation from './RoadmapInvitation.jsx';
import RoadmapPlan from './RoadmapPlan.jsx';
import { NextStepIndicator, ProposalOverlay } from './NextStepPill.jsx';

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
  const c = roadmap.controller;
  return (
    <>
      {roadmap.pill && roadmap.showOverlay && <ProposalOverlay pill={roadmap.pill} position={roadmap.position} onAccept={() => c.acceptProposal()} onCancel={() => c.cancelProposal()} />}
      <NextStepIndicator indicator={roadmap.indicator} onGo={() => roadmap.go({ kind: 'proposal' })} />
    </>
  );
}
