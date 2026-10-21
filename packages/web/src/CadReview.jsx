// Review design (cad-controls brief section 4, decisions 6 and 7), in the confirmation area above the Chat composer: with the
// server's CAD_BRIEF_FIRST on, a /cad request first comes back as a brief to approve (job state awaiting_approval) and
// nothing is generated or built until Generate. The original request is shown exactly and never edited; the interpreted
// object, parameters, requirements, context, added assumptions (highlighted), missing information and unsupported
// requirements are listed. Edit details changes supported fields in place (the server revalidates, makes no model call and
// clears the approval); Generate approves this exact brief by its hash; Cancel ends the request without a call. The review
// is the job's own state, so it is back after a reload. The canvas owner only (canvasOps.cadReviews).
import { useEffect, useRef, useState } from 'react';
import { CircleAlert, FileCheck2 } from 'lucide-react';
import { Button } from './ui.jsx';
import { valueProblem } from './cad-parameters.js';
import { draftInput } from './cad-draft-store.js';
import { formatValue } from './cad-quick-edit.jsx';

const LIST_FIELDS = [['requirements', 'Your requirements'], ['contextUsed', 'Context used'], ['assumptions', 'Added assumptions'], ['missing', 'Missing information'], ['unsupported', 'Not supported or not verified']];
const EDITABLE = ['requirements', 'assumptions', 'missing', 'unsupported'];
const lines = text => text.split('\n').map(line => line.trim()).filter(Boolean);
const field = 'rounded-md border border-line bg-surface px-2 py-1 text-xs text-ink focus-visible:outline-2 focus-visible:outline-accent';

// The brief edit the server takes (cad-jobs.js action 'brief'): changed fields only; a parameter whose value the person set
// is no longer the brief's assumption.
export function briefEdit(brief, form) {
  const edit = {};
  if (form.object !== (brief.object || '')) edit.object = form.object;
  for (const key of EDITABLE) { const next = lines(form[key]); if (JSON.stringify(next) !== JSON.stringify(brief[key] || [])) edit[key] = next; }
  const controls = brief.controls;
  if (controls?.parameters?.some(p => p.role === 'input' && form.values[p.id] !== p.value)) {
    edit.controls = { ...controls, parameters: controls.parameters.map(({ assumed, ...p }) => (p.role !== 'input' ? { ...p, ...(assumed ? { assumed } : {}) }
      : form.values[p.id] === p.value ? { ...p, ...(assumed ? { assumed } : {}) } : { ...p, value: form.values[p.id] })) };
  }
  return edit;
}
const formOf = brief => ({ object: brief.object || '', ...Object.fromEntries(EDITABLE.map(key => [key, (brief[key] || []).join('\n')])),
  values: Object.fromEntries((brief.controls?.parameters || []).filter(p => p.role === 'input').map(p => [p.id, p.value])) });

function Review({ block, ops }) {
  const [job, setJob] = useState(null), [form, setForm] = useState(null), [busy, setBusy] = useState(false), [problem, setProblem] = useState('');
  const live = useRef(true);
  useEffect(() => () => { live.current = false; }, []);
  const load = () => ops.cadRead(block.jobId).then(result => { if (live.current) setJob(result.job); }, error => { if (live.current) setProblem(error.message); });
  useEffect(() => { load(); }, [block.jobId]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!job || job.state !== 'awaiting_approval') return problem ? <p role="alert" className="mb-1.5 text-xs text-fail">{problem}</p> : null;
  const brief = job.brief || {}, inputs = (brief.controls?.parameters || []).filter(p => p.role === 'input');
  const run = async (action, body) => {
    setBusy(true); setProblem('');
    try { const result = await ops.cadAction(block.jobId, action, body); if (live.current) { setJob(result.job); setForm(null); } }
    catch (error) {
      if (!live.current) return;
      // A changed brief (another tab, a stale hash) is read again; the person sees the current one before deciding.
      setProblem(error.data?.code === 'reprepare_required' ? `${error.message} Cancel this review, then send a new /cad request.` : error.message);
      if (error.status === 409 && error.data?.code !== 'reprepare_required') load();
    } finally { if (live.current) setBusy(false); }
  };
  const problems = form ? inputs.map(p => ({ p, why: valueProblem(p, form.values[p.id]) })).filter(x => x.why) : [];
  const missing = brief.missing || [];
  return (
    <section data-cad-review={job.id} data-brief-hash={job.briefHash} aria-label="Review design" role="group" className="mb-1.5 flex max-h-[55vh] w-full flex-col gap-1.5 overflow-y-auto rounded-lg border border-accent/30 bg-accent/[0.07] px-3 py-2 text-sm" onPointerDown={event => event.stopPropagation()}>
      <header className="flex items-center gap-1.5"><FileCheck2 size={15} aria-hidden className="shrink-0 text-accent" /><h2 className="text-sm font-semibold text-ink">Review design</h2><span className="truncate text-xs text-ink-2">{brief.title || block.title}</span></header>
      <div><p className="text-[11px] font-semibold tracking-wide text-ink-3 uppercase">Original request</p>
        <p data-cad-review-request className="max-h-20 overflow-y-auto rounded-md border border-line bg-surface px-2 py-1 text-xs whitespace-pre-wrap break-words text-ink">{job.request}</p></div>
      {!form ? <>
        <div><p className="text-[11px] font-semibold tracking-wide text-ink-3 uppercase">Interpreted as</p><p data-cad-review-object className="text-xs text-ink">{brief.object || 'No interpretation was returned.'}</p></div>
        {inputs.length > 0 && <div><p className="text-[11px] font-semibold tracking-wide text-ink-3 uppercase">Parameters ({brief.units || 'units not set'})</p>
          <dl data-cad-review-parameters className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-x-2 text-xs">{inputs.map(p => <div key={p.id} className="contents" data-cad-review-param={p.id}>
            <dt className="truncate text-ink-2">{p.label}</dt><dd className="text-right text-ink tabular-nums">{formatValue(p.value, p.unit, p.precision)}</dd>
            <dd className={p.assumed ? 'font-medium text-warn' : 'text-ink-3'}>{p.assumed ? 'Assumed' : 'Requested'}</dd></div>)}</dl></div>}
        {LIST_FIELDS.map(([key, title]) => (brief[key] || []).length > 0 && <div key={key}><p className="text-[11px] font-semibold tracking-wide text-ink-3 uppercase">{title}</p>
          <ul data-cad-review-list={key} className={`list-disc pl-4 text-xs ${key === 'assumptions' ? 'rounded bg-warn/10 py-0.5 text-warn' : key === 'missing' ? 'text-fail' : 'text-ink'}`}>{brief[key].map((item, i) => <li key={i}>{item}</li>)}</ul></div>)}
        {missing.length > 0 && <p data-cad-review-blocked className="flex items-center gap-1 text-xs text-fail"><CircleAlert size={13} aria-hidden />Answer or remove the missing information (Edit details) before generating.</p>}
        <p data-cad-review-cost className="text-[11px] text-ink-2">Preparing this brief used one model call. Generate starts paid work under this request's existing allowance: source generation, a visual review, at most one repair, and executor time. Editing details makes no call.</p>
      </> : <>
        <label className="text-xs text-ink-2">Interpreted as<textarea data-cad-review-field="object" rows={2} value={form.object} onChange={event => setForm({ ...form, object: event.target.value })} className={`${field} mt-0.5 block w-full`} /></label>
        {inputs.length > 0 && <fieldset className="flex flex-col gap-1"><legend className="text-xs text-ink-2">Parameters ({brief.units})</legend>{inputs.map(p => {
          const id = `cad-review-${p.id}`, why = valueProblem(p, form.values[p.id]), value = form.values[p.id];
          return <div key={p.id} className="flex flex-wrap items-center gap-2 text-xs"><label htmlFor={id} className="min-w-0 flex-1 truncate text-ink">{p.label}</label>
            {p.type === 'choice' ? <select id={id} data-cad-review-value={p.id} value={value} onChange={event => setForm({ ...form, values: { ...form.values, [p.id]: event.target.value } })} className={`${field} w-auto`}>{p.choices.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}</select>
              : p.type === 'boolean' ? <input id={id} data-cad-review-value={p.id} type="checkbox" role="switch" checked={value === true} onChange={event => setForm({ ...form, values: { ...form.values, [p.id]: event.target.checked } })} />
              : <input id={id} data-cad-review-value={p.id} type="number" step={p.type === 'count' ? 1 : p.step ?? 'any'} min={p.min} max={p.max} value={value ?? ''} aria-invalid={why ? true : undefined}
                  onChange={event => setForm({ ...form, values: { ...form.values, [p.id]: draftInput(p.type, event.target.value) } })} className={`${field} w-24 text-right ${why ? 'border-fail' : ''}`} />}
            <span className="w-6 text-ink-2">{p.unit || ''}</span>
            {why && <span role="alert" className="w-full text-fail">{p.label} {why}.</span>}</div>;
        })}</fieldset>}
        {EDITABLE.map(key => <label key={key} className="text-xs text-ink-2">{LIST_FIELDS.find(([k]) => k === key)[1]} (one per line)<textarea data-cad-review-field={key} rows={Math.min(4, Math.max(2, form[key].split('\n').length))} value={form[key]} onChange={event => setForm({ ...form, [key]: event.target.value })} className={`${field} mt-0.5 block w-full`} /></label>)}
        <p className="text-[11px] text-ink-2">Saving checks these details again without a model call; you then approve the changed brief. Changing the request, its context, units or the parameter list needs a new request.</p>
      </>}
      {problem && <p role="alert" data-cad-review-problem className="text-xs text-fail">{problem}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        {!form ? <>
          <Button type="button" variant="secondary" size="sm" data-cad-review-cancel disabled={busy} onClick={() => run('cancel')}>Cancel</Button>
          <Button type="button" variant="secondary" size="sm" data-cad-review-edit disabled={busy} onClick={() => { setProblem(''); setForm(formOf(brief)); }}>Edit details</Button>
          <Button type="button" variant="inverse" size="sm" data-cad-review-generate disabled={busy || missing.length > 0} onClick={() => run('approve', { briefHash: job.briefHash })}>Generate</Button>
        </> : <>
          <Button type="button" variant="secondary" size="sm" data-cad-review-discard-edit disabled={busy} onClick={() => { setProblem(''); setForm(null); }}>Discard edits</Button>
          <Button type="button" variant="inverse" size="sm" data-cad-review-save disabled={busy || problems.length > 0} onClick={() => { const brief2 = briefEdit(brief, form); if (!Object.keys(brief2).length) { setForm(null); return; } run('brief', { expectedBriefHash: job.briefHash, brief: brief2 }); }}>Save details</Button>
        </>}
      </div>
    </section>
  );
}

// ops: the Chat's canvasOps (LearnPage): cadReviews() lists this canvas's CAD cards awaiting approval (owner only), cadRead
// and cadAction reach their jobs and put the answer back on the card.
export function CadReview({ ops }) {
  const [cards, setCards] = useState([]);
  useEffect(() => {
    if (!ops?.cadReviews) return undefined;
    const look = () => setCards(previous => { const next = ops.cadReviews(); return JSON.stringify(next.map(b => b.jobId)) === JSON.stringify(previous.map(b => b.jobId)) ? previous : next; });
    look(); const timer = setInterval(look, 1500);
    return () => clearInterval(timer);
  }, [ops]);
  return cards.map(block => <Review key={block.jobId} block={block} ops={ops} />);
}
