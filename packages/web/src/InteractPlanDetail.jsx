import { MdInline } from './Md.jsx';
import { Disclosure, heading } from './animation3d/PlanSummary.jsx';

// The plan detail of a "Review scene plan" card (interact.md INT-03-C03/C04), drawn into the existing GenerationProposalCard through its
// summary slot, with the same headings, lists and disclosures as the /animation plan summary (animation3d/PlanSummary.jsx). The card
// itself draws the exact Title and the concise card description; this adds the full Story (normal expansion, scrolling when long), the
// scene design, Mode, Controls with exact labels, units and defaults, and the supporting panels. detail: planDetail(plan).
const list = 'list-disc pl-4 text-xs text-ink';

export default function InteractPlanDetail({ detail }) {
  if (!detail) return null;
  const { story, scene, mode, controls, supports } = detail;
  return (
    <div data-interact-plan-detail className="flex flex-col gap-2">
      <details open data-plan-disclosure="story" className="group text-xs">
        <summary className="cursor-pointer text-ink-2 select-none hover:text-ink">Full Story</summary>
        <div data-plan-story className="mt-1 max-h-72 overflow-y-auto text-xs leading-relaxed whitespace-pre-line text-ink"><MdInline text={story} mathOnly /></div>
      </details>
      <div data-plan-scene>
        <p className={heading}>Scene</p>
        <p className="text-xs text-ink"><MdInline text={scene.description} mathOnly /></p>
        {scene.observations.length > 0 && <ul className={list}>{scene.observations.map((line, i) => <li key={i}><MdInline text={line} mathOnly /></li>)}</ul>}
      </div>
      {supports.length > 0 && (
        <div data-plan-supports>
          <p className={heading}>Supporting panels, above the scene</p>
          <ul className={list}>{supports.map((panel, i) => <li key={i}><span className="font-medium">{panel.title}</span>: <MdInline text={panel.description} mathOnly /></li>)}</ul>
        </div>
      )}
      <div data-plan-mode>
        <p className={heading}>Mode</p>
        <p className="text-xs text-ink"><span className="font-medium">{mode.label}</span>. <MdInline text={mode.initialState} mathOnly /></p>
        {mode.timeline && (
          <p data-plan-timeline className="text-xs text-ink-2">
            {mode.timeline.label}{mode.timeline.range ? `: ${mode.timeline.range}` : ''}{mode.timeline.marks.length > 0 ? `. Marks: ${mode.timeline.marks.join(', ')}` : ''}
          </p>
        )}
      </div>
      <div data-plan-controls>
        <p className={heading}>Controls</p>
        {controls.length === 0
          ? <p className="text-xs text-ink-2">None</p>
          : <ul className={list}>{controls.map(control => <li key={control.id} data-plan-control={control.id}><span className="font-medium">{control.label}</span>: <MdInline text={control.detail} mathOnly /></li>)}</ul>}
      </div>
      <Disclosure name="assumptions" title="Model assumptions" items={detail.assumptions} />
      <Disclosure name="limitations" title="Limitations" items={detail.limitations} />
    </div>
  );
}
