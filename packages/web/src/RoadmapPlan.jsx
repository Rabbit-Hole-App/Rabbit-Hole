import { DepthSlider } from './DepthMenu.jsx';
import { STRINGS } from './roadmap-strings.js';

// The roadmap draft inside its Tutor Chat message (UI.03, file 03-chat-roadmap.html): a bordered Roadmap parameters container (the learning
// capability, Scope, a direct Depth slider, the Roadmap mode) and a separate bordered Roadmap draft container with the ordered steps. Moved
// here from the ToC, which now shows only the accepted tree (UI.02). The decision actions (Accept roadmap / Edit roadmap) follow in the same
// message (RoadmapTranscript.jsx). draft: entriesOf's entry.draft; disabled: a stale draft or a revision being prepared; onDepth(id): the
// Depth change, a new draft revision. Explanations + practice is shown disabled with its reason until R9 ships (contracts.md 422).
const BOX = 'mt-3 rounded border border-line p-3 text-xs';
const SELECT = 'min-w-0 max-w-[74%] rounded border border-line-strong bg-white px-2 py-1 text-xs text-ink disabled:opacity-50';

export default function RoadmapPlan({ draft, disabled = false, onDepth }) {
  const source = draft.sourceName || '';
  const whole = (draft.scope?.kind || 'whole') === 'whole';
  return (
    <div data-roadmap-draft={draft.version}>
      <section data-roadmap-parameters aria-label={STRINGS.roadmapParameters} className={BOX}>
        <div className="text-[11px] text-ink-2">{STRINGS.roadmapParameters}</div>
        {draft.outcome && <p data-roadmap-outcome className="mt-2 mb-3.5 break-words text-[13px] leading-relaxed font-medium text-ink">{draft.outcome}</p>}
        <div className="mt-3 flex items-center justify-between gap-3">
          <label htmlFor={`roadmap-scope-${draft.version}`} className="text-ink-2">{STRINGS.scope}</label>
          <select id={`roadmap-scope-${draft.version}`} disabled={disabled} value={whole ? 'whole' : 'passage'} onChange={() => {}} className={SELECT}>
            <option value="whole">{STRINGS.fullContent(source)}</option>
            <option value="passage" disabled={whole}>{STRINGS.selectedPassage}</option>
          </select>
        </div>
        <DepthSlider id={`roadmap-depth-${draft.version}`} value={draft.depth} disabled={disabled} onChange={id => { if (id !== draft.depth) onDepth?.(id); }} />
        <div className="mt-3 flex items-center justify-between gap-3">
          <label htmlFor={`roadmap-mode-${draft.version}`} className="text-ink-2">{STRINGS.roadmapMode}</label>
          <select id={`roadmap-mode-${draft.version}`} disabled={disabled} value="explanations" onChange={() => {}} className={SELECT}>
            <option value="explanations">{STRINGS.modeExplanations}</option>
            <option value="practice" disabled>{`${STRINGS.modePractice} · ${STRINGS.practiceUnavailable}`}</option>
          </select>
        </div>
      </section>
      <section data-roadmap-steps aria-label={STRINGS.roadmapDraft} className={`${BOX} ${disabled ? 'opacity-45' : ''}`}>
        <div className="mb-3 text-[11px] font-medium text-ink-2">{STRINGS.roadmapDraft}</div>
        <ol className="m-0 list-none p-0">
          {draft.steps.map((step, index) => (
            <li key={`${index}:${step.title}`} className="mb-4 flex gap-3 last:mb-0">
              <span className="min-w-[17px] pt-px text-xs text-ink-2 tabular-nums">{index + 1}.</span>
              <div className="min-w-0">
                <div className="break-words text-[13px] leading-5 font-semibold text-ink">{step.title}</div>
                {step.goal && <div className="mt-[3px] mb-1 break-words text-xs leading-relaxed text-ink-2">{step.goal}</div>}
                {step.format && <div className="text-[10px] text-ink-3">{STRINGS.formatName[step.format] || step.format}</div>}
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
