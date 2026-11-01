// The /animation review card's short summary (owner, 2026-10-31): what the learner can change or do, where it starts, the one caveat
// that keeps expectations honest, and the rest of the assumptions and limitations behind collapsed sections. Drawn from the signed
// proposal only (input.scene, the server's planScene; assumptions and limitations, the proposal's lists), for any scene and
// experience: nothing here knows a subject, a parameter name or a prompt. The full plan stays signed behind it for Generate.

// A unit after a number: "5 m", but "20°" and "50%".
const unit = u => (!u ? '' : /^[°%]/.test(u) ? u : ` ${u}`);
const or = items => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} or ${items.at(-1)}`);
const optionLabel = (p, value) => p.options?.find(o => o.value === value)?.label ?? String(value);

// What a parameter lets the learner choose: "String length: 0.1–5 m", "Gravity: Earth, Moon or Mars", "Show forces: on or off".
export function parameterRange(p) {
  if (p.type === 'number') return `${p.label}: ${p.min}–${p.max}${unit(p.unit)}`;
  if (p.type === 'select') return `${p.label}: ${or((p.options || []).map(o => o.label))}`;
  return `${p.label}: on or off`;
}
// Where a parameter starts: "1 m", "Earth", "Show forces off".
export function parameterStart(p) {
  if (p.type === 'number') return `${p.default}${unit(p.unit)}`;
  if (p.type === 'select') return optionLabel(p, p.default);
  return `${p.label} ${p.default ? 'on' : 'off'}`;
}

// -> the summary's parts; an empty part is not drawn. null for a proposal made before the server sent its scene.
export function planSummary(proposal) {
  const scene = proposal?.input?.scene;
  if (!scene) return null;
  const parameters = scene.parameters || [], interactions = scene.interactions || [], notices = scene.notices || [];
  const game = proposal.settings?.experience === 'game';
  // A game's actions are how it is played; otherwise the parameters say what changes, and actions show only where there are none.
  const actions = game ? { title: 'How to play', items: interactions } : !parameters.length ? { title: 'What you can do', items: interactions } : null;
  const [caveat, ...assumptions] = proposal.assumptions || [];
  return {
    changes: parameters.map(parameterRange),
    starts: parameters.length ? parameters.map(parameterStart).join(' · ') : null,
    actions: actions?.items.length ? actions : null,
    notices,
    caveat: caveat || null,
    assumptions,
    limitations: (proposal.limitations || []).filter(l => !notices.includes(l)),
  };
}

function Disclosure({ name, title, items }) {
  if (!items.length) return null;
  return (
    <details data-plan-disclosure={name} className="group text-xs">
      <summary className="cursor-pointer text-ink-2 select-none hover:text-ink">{title}</summary>
      <ul className="mt-1 list-disc pl-4 text-ink">{items.map((item, i) => <li key={i}>{item}</li>)}</ul>
    </details>
  );
}

const heading = 'text-[11px] font-semibold tracking-wide text-ink-3 uppercase';
export default function PlanSummary({ summary }) {
  if (!summary) return null;
  return (
    <div data-plan-summary className="flex flex-col gap-2">
      {summary.changes.length > 0 && (
        <div data-plan-changes>
          <p className={heading}>What you can change</p>
          <ul className="list-disc pl-4 text-xs text-ink">{summary.changes.map((line, i) => <li key={i}>{line}</li>)}</ul>
          {summary.starts && <p data-plan-starts className="mt-1 text-xs text-ink-2">Starts at <span className="font-medium text-ink">{summary.starts}</span>.</p>}
        </div>
      )}
      {summary.actions && (
        <div data-plan-actions>
          <p className={heading}>{summary.actions.title}</p>
          <ul className="list-disc pl-4 text-xs text-ink">{summary.actions.items.map((line, i) => <li key={i}>{line}</li>)}</ul>
        </div>
      )}
      {summary.notices.length > 0 && <ul data-plan-notices className="flex flex-col gap-0.5 text-xs text-warn">{summary.notices.map((n, i) => <li key={i}>{n}</li>)}</ul>}
      {summary.caveat && <p data-plan-caveat className="text-xs text-ink-2 italic">{summary.caveat}</p>}
      <Disclosure name="assumptions" title="Model assumptions" items={summary.assumptions} />
      <Disclosure name="limitations" title="Limitations" items={summary.limitations} />
    </div>
  );
}
