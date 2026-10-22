// The CAD card's details (cad-controls brief section 5): Design brief · Checks · Code · Revisions, one compact row of toggles
// (one section open at a time), so the model keeps its room.
// Readable values, never raw JSON. Checks are listed one by one as passed, failed or unchecked, apart from whether generation
// succeeded, and what was never assessed says so. Code is the saved Python, for the model's owner only: the file route
// refuses anyone else (learn-files.js), and this section is not offered to them. Revisions come from the server's accepted
// history (cad-jobs.js revisionEntry): parent and new revision, and the parameter changes of a rebuild.
import { Fragment, useEffect, useState } from 'react';
import { apiFetch } from './api.js';
import { cadArtifact } from './cad-client.js';
import { cadReadUrl } from './CadCard.jsx';
import { formatValue, PROVENANCE } from './cad-quick-edit.jsx';

const toggle = 'h-8 rounded-md px-1.5 text-xs font-medium text-ink-2 hover:bg-hover hover:text-ink aria-expanded:bg-active aria-expanded:text-ink focus-visible:outline-2 focus-visible:outline-accent';
const short = id => String(id || '').replace(/^cr_/, '').slice(0, 8) || '—';
const KIND = { bounds_mm: 'Overall size', volume_mm3: 'Volume', circular_diameter_mm: 'Hole or round diameter', solid_count: 'Solid count' };
const UNIT = { bounds_mm: 'mm', volume_mm3: 'mm³', circular_diameter_mm: 'mm' };
const EXPORTS = {
  step: 'STEP: the exact solid geometry (B-rep). No feature history or parameters.',
  glb: 'GLB: a triangle mesh for viewing. Approximate surfaces, no dimensions.',
  stl: 'STL: a triangle mesh for printing. Approximate surfaces, no units or colour.',
  '3mf': '3MF: a triangle mesh with units, for printing. No feature history.',
};
const NEVER = ['Fit with other parts', 'Strength', 'Interference', 'Manufacturability'];
export const cadChecks = validation => (Array.isArray(validation) ? validation : validation?.checks || []).filter(c => c && typeof c === 'object');

const List = ({ items, name, tone = '' }) => items?.length ? <ul data-cad-list={name} className={`list-disc pl-4 ${tone}`}>{items.map((item, i) => <li key={i}>{typeof item === 'string' ? item : JSON.stringify(item)}</li>)}</ul> : null;
const Label = ({ children }) => <p className="pt-0.5 text-[11px] font-semibold tracking-wide text-ink-3 uppercase">{children}</p>;

function Brief({ shown, job, block }) {
  const brief = job?.brief || {}, controls = shown?.controls, defs = controls?.definitions?.parameters || [];
  const legacy = !defs.length && shown?.parameters && typeof shown.parameters === 'object' ? Object.entries(shown.parameters) : [];
  const last = block.revisions?.at(-1);
  return <>
    <p data-cad-brief-object className="text-ink">{brief.object || (typeof block.briefSummary === 'string' && block.briefSummary) || shown?.title || 'No design brief was saved for this model.'}</p>
    {(defs.length > 0 || legacy.length > 0) && <>
      <Label>Current parameters (revision {short(shown?.revisionId)})</Label>
      {/* The values now, apart from the prompt shown under the card, which may describe an earlier revision. */}
      {last?.kind === 'parameters' && block.promptUsed && <p data-cad-prompt-older className="text-[11px] text-ink-3">The prompt under this card made an earlier revision; these values were changed after it.</p>}
      <dl data-cad-current-values className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-x-2 gap-y-0.5">
        {defs.map(p => {
          const value = p.role === 'computed' ? controls.computed?.[p.id] : controls.values?.[p.id], kind = p.role === 'computed' ? 'computed' : p.assumed ? 'assumed' : 'requested';
          return <div key={p.id} className="contents"><dt className="truncate">{p.label}</dt><dd className="text-right text-ink tabular-nums">{value == null ? 'Not reported' : formatValue(value, p.unit, p.precision)}</dd><dd className={kind === 'assumed' ? 'text-warn' : 'text-ink-3'}>{PROVENANCE[kind].label}</dd></div>;
        })}
        {legacy.map(([key, value]) => <div key={key} className="contents"><dt className="truncate">{key}</dt><dd className="text-right text-ink">{typeof value === 'object' ? JSON.stringify(value) : String(value)}</dd><dd className="text-ink-3">Saved</dd></div>)}
      </dl>
    </>}
    {brief.requirements?.length > 0 && <><Label>Your requirements</Label><List items={brief.requirements} name="requirements" /></>}
    {(shown?.assumptions || brief.assumptions)?.length > 0 && <><Label>Added assumptions</Label><List items={shown?.assumptions || brief.assumptions} name="assumptions" tone="rounded bg-warn/10 py-0.5 pr-1 text-warn" /></>}
    {brief.unsupported?.length > 0 && <><Label>Not supported or not verified</Label><List items={brief.unsupported} name="unsupported" /></>}
    {brief.contextUsed?.length > 0 && <><Label>Context used</Label><List items={brief.contextUsed} name="context" /></>}
  </>;
}

function Checks({ shown, job }) {
  const checks = cadChecks(shown?.validation), count = status => checks.filter(c => c.status === status).length;
  const built = !!cadArtifact(shown, 'step');
  return <>
    <p data-cad-generation={built ? 'built' : 'none'}>{built ? 'Generation: geometry was built and saved.' : 'Generation: no geometry has been saved yet.'}</p>
    <p data-cad-validation-summary>{checks.length ? `Geometric validation: ${count('passed')} passed, ${count('failed')} failed, ${count('unchecked')} unchecked.` : 'Geometric validation: no checks were recorded for this model.'}</p>
    {checks.length > 0 && <ul className="flex flex-col gap-0.5">{checks.map((c, i) => {
      const unit = UNIT[c.kind] || '', status = ['passed', 'failed'].includes(c.status) ? c.status : 'unchecked';
      return <li key={c.id || i} data-cad-check={c.id || i} data-check-status={status} className="flex flex-wrap gap-x-2">
        <span className={status === 'failed' ? 'font-medium text-fail' : status === 'passed' ? 'font-medium text-pass' : 'font-medium text-ink-3'}>{status === 'passed' ? 'Passed' : status === 'failed' ? 'Failed' : 'Unchecked'}</span>
        <span className="text-ink">{KIND[c.kind] || c.kind || c.id}{c.axis ? ` ${c.axis.toUpperCase()}` : ''}</span>
        {typeof c.expected === 'number' && <span>expected {formatValue(c.expected, unit)}{typeof c.tolerance === 'number' && c.tolerance > 0 ? ` ± ${formatValue(c.tolerance)}` : ''}</span>}
        {typeof c.actual === 'number' && <span>measured {formatValue(c.actual, unit)}</span>}
        {c.reason && <span>{c.reason}</span>}
      </li>;
    })}</ul>}
    <p className="text-[11px] text-ink-3">A passing size or volume check does not show that every hole, feature or relationship is right.</p>
    <Label>Not assessed</Label>
    <List items={[...NEVER.map(x => `${x}: not verified.`), ...(job?.limitations || []).map(String)]} name="unverified" />
    <Label>What each download keeps</Label>
    <List items={Object.keys(EXPORTS).filter(kind => cadArtifact(shown, kind) || ['stl', '3mf'].includes(kind)).map(kind => EXPORTS[kind])} name="exports" />
  </>;
}

// Mounted only while its section is open, so the source is read when the owner asks for it.
function Code({ shown }) {
  const source = cadArtifact(shown, 'source');
  const [text, setText] = useState(null), [problem, setProblem] = useState('');
  useEffect(() => {
    if (!source?.url) return undefined;
    let live = true; const abort = new AbortController();
    setText(null); setProblem('');
    apiFetch(cadReadUrl(source.url, { ownerRead: true }), { signal: abort.signal })
      .then(response => { if (!response.ok) throw Error(`The saved source could not be read (${response.status}).`); return response.text(); })
      .then(body => { if (live) setText(body); }, error => { if (live && error.name !== 'AbortError') setProblem(error.message); });
    return () => { live = false; abort.abort(); };
  }, [source?.url]);
  return <>
    <p className="text-[11px] text-ink-3">The saved Python that builds this revision. Only you can see it.</p>
    {!source ? <p>No source is saved for this revision.</p> : problem ? <p role="alert" className="text-fail">{problem}</p> : text == null ? <p>Loading the saved source</p>
      : <pre data-cad-source className="max-h-60 overflow-auto rounded-md border border-line bg-code p-2 font-mono text-[11px] leading-4 text-ink">{text}</pre>}
  </>;
}

function Revisions({ block, job, changes }) {
  const list = [...(block.revisions || [])].reverse();
  return <>
    {job?.rebuild && job.state !== 'cancelled' && job.revisionId !== block.revisionId && <p data-cad-revision="pending" className="text-ink">Not accepted: parameter change {changes.map(c => `${c.label} ${formatValue(c.from, c.unit)} → ${formatValue(c.to, c.unit)}`).join(', ')} (from {short(block.revisionId)}).</p>}
    {list.length ? <ol className="flex flex-col gap-1">{list.map(r => <li key={r.revisionId} data-cad-revision={r.revisionId} data-revision-kind={r.kind}>
      <span className="font-medium text-ink">{r.kind === 'parameters' ? 'Parameter edit' : r.kind === 'ai_edit' ? 'AI edit' : 'Generated'}</span>
      {' '}<span className="tabular-nums">{r.parentRevisionId ? `${short(r.parentRevisionId)} → ` : ''}{short(r.revisionId)}</span>
      {r.revisionId === block.revisionId && <span className="text-ink-3"> (current)</span>}
      {r.changes?.length > 0 && <span className="block">{r.changes.map(c => `${c.label} ${formatValue(c.from, c.unit)} → ${formatValue(c.to, c.unit)}`).join(', ')}{r.kind === 'parameters' ? '; prompt unchanged' : ''}</span>}
      {Number.isFinite(r.at) && <span className="block text-[11px] text-ink-3">{new Date(r.at).toLocaleString()}</span>}
    </li>)}</ol> : <p>No revision history was recorded for this model (made before revisions were kept).</p>}
  </>;
}

// owner: the person who may change this model (cadCanMutate); a shared or read-only viewer gets no Code toggle.
export function CadDetails({ block, job, shown, owner = false, changes = [] }) {
  const [open, setOpen] = useState(null), mine = owner ? job : null;
  const sections = [['brief', 'Design brief'], ['checks', 'Checks'], ...(owner ? [['code', 'Code']] : []), ['revisions', 'Revisions']];
  const body = { brief: <Brief shown={shown} job={mine} block={block} />, checks: <Checks shown={shown} job={mine} />, code: owner ? <Code shown={shown} /> : null, revisions: <Revisions block={block} job={mine} changes={changes} /> };
  return <div data-cad-details onPointerDown={event => event.stopPropagation()}>
    <div role="group" aria-label="Model details" className="flex flex-wrap items-center gap-0.5">
      {sections.map(([name, title], i) => <Fragment key={name}>{i > 0 && <span aria-hidden className="text-ink-3">·</span>}
        <button type="button" data-cad-section-toggle={name} aria-expanded={open === name} aria-controls={`cad-${block.id}-${name}`} onClick={() => setOpen(open === name ? null : name)} className={toggle}>{title}</button></Fragment>)}
    </div>
    {open && body[open] && <div id={`cad-${block.id}-${open}`} data-cad-section={open} className="flex flex-col gap-1.5 px-1 pb-2 pt-1 text-xs text-ink-2">{body[open]}</div>}
  </div>;
}
