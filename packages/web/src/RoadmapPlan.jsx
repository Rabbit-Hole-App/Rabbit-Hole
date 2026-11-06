import { STRINGS } from './roadmap-strings.js';

const button = 'h-8 rounded-md border border-line px-3 text-xs font-medium text-ink outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-accent/60';

// The roadmap in the ToC (tocOf): outcome, assumptions, scope settings, steps with navigation, stopping point and the actions.
// Rendered above the plain headings, which stay. Edit plan goes to the ToC conversation (onEdit); a step navigates only when
// something exists to navigate to. The practice setting is read-only text (Explanations only until R9).
export default function RoadmapPlan({ toc, onAcceptPlan, onEdit, onProposeNext, onEnd, onGo }) {
  if (!toc) return null;
  return (
    <section data-roadmap-plan aria-label={STRINGS.roadmap} className="mb-6 flex flex-col gap-3 border-b border-line pb-4">
      <h3 className="text-xs font-medium text-ink-2">{STRINGS.roadmap}</h3>
      {toc.outcome && <p data-roadmap-outcome className="break-words text-sm font-medium text-ink">{toc.outcome}</p>}
      <p data-roadmap-settings className="text-xs text-ink-2">{STRINGS.depth}: {toc.depth} · {toc.practice}</p>
      {toc.assumptions.length > 0 && (
        <div><h4 className="mb-1 text-xs font-medium text-ink-2">{STRINGS.assumptions}</h4>
          <ul className="list-disc space-y-0.5 pl-4 text-[13px] text-ink-2">{toc.assumptions.map(text => <li key={text} className="break-words">{text}</li>)}</ul></div>
      )}
      {toc.steps.length > 0 && (
        <div><h4 className="mb-1 text-xs font-medium text-ink-2">{STRINGS.steps}</h4>
          <ol className="space-y-2">{toc.steps.map(step => (
            <li key={step.id} data-roadmap-step={step.id} data-state={step.state} className="text-sm">
              {step.nav
                ? <button type="button" data-roadmap-go={step.nav.kind} onClick={() => onGo(step.nav)} className="text-left break-words text-ink outline-none hover:text-accent focus-visible:ring-2 focus-visible:ring-accent/60"><span className="text-ink-2 tabular-nums">{step.position}.</span> {step.title}</button>
                : <span className="break-words text-ink"><span className="text-ink-2 tabular-nums">{step.position}.</span> {step.title}</span>}
              <div className="text-xs text-ink-3">{step.status}{step.removed ? ` · ${STRINGS.cardRemoved}` : ''}</div>
            </li>
          ))}</ol></div>
      )}
      {toc.stoppingPoint && <div><h4 className="mb-1 text-xs font-medium text-ink-2">{STRINGS.stoppingPoint}</h4><p className="break-words text-[13px] text-ink-2">{toc.stoppingPoint}</p></div>}
      <div className="flex flex-wrap gap-1.5">
        {toc.actions.acceptPlan && <button type="button" data-roadmap-accept-plan disabled={toc.actions.acceptPlan.busy} aria-busy={toc.actions.acceptPlan.busy || undefined} onClick={onAcceptPlan} className="h-8 rounded-md bg-accent px-3 text-xs font-medium text-white outline-none hover:bg-accent/90 focus-visible:ring-2 focus-visible:ring-accent/60 disabled:opacity-60">{toc.actions.acceptPlan.busy ? STRINGS.accepting : STRINGS.acceptPlan}</button>}
        {toc.actions.editPlan && <button type="button" data-roadmap-edit-plan onClick={onEdit} className={button}>{STRINGS.editPlan}</button>}
        {toc.actions.proposeNext && <button type="button" data-roadmap-propose-next onClick={onProposeNext} className={button}>{STRINGS.proposeNext}</button>}
        {toc.actions.end && <button type="button" data-roadmap-end onClick={onEnd} className={button}>{STRINGS.end}</button>}
      </div>
    </section>
  );
}
