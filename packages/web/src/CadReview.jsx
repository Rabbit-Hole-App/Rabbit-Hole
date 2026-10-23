// Review design (cad-controls brief section 4, decisions 6 and 7; UI-15.1), in the confirmation area above the Chat composer: with the
// server's CAD_BRIEF_FIRST on, a /cad request first comes back as a brief to approve (job state awaiting_approval) and
// nothing is generated or built until Generate. This file is the CAD adapter of the shared confirmation card (GenerationProposalCard,
// drawn from generation-confirmation-schema.js): cad-review-view.js turns the job's brief into the card's view and the card's edit
// into the job's brief edit. The original request is shown exactly and never edited; the interpreted object, parameters,
// requirements, context, added assumptions (highlighted), missing information and unsupported requirements are listed. Edit details
// changes supported fields in place (the server revalidates, makes no model call and clears the approval); Generate approves this
// exact brief by its hash; Cancel ends the request without a call. The consent before the paid brief is prepared stays the /cad
// PaidConfirm (LearnSlash.jsx). The review is the job's own state, so it is back after a reload. The canvas owner only
// (canvasOps.cadReviews).
import { useEffect, useRef, useState } from 'react';
import GenerationProposalCard from './GenerationProposalCard.jsx';
import { COST_NOTE, briefEditOf, cadAttrs, cadReviewView } from './cad-review-view.js';
import { draftInput } from './cad-draft-store.js';
import { formatValue } from './cad-quick-edit.jsx';

export { briefEdit } from './cad-review-view.js';

function Review({ block, ops }) {
  const [job, setJob] = useState(null), [busy, setBusy] = useState(false), [problem, setProblem] = useState('');
  const live = useRef(true);
  useEffect(() => () => { live.current = false; }, []);
  const load = () => ops.cadRead(block.jobId).then(result => { if (live.current) setJob(result.job); }, error => { if (live.current) setProblem(error.message); });
  useEffect(() => { load(); }, [block.jobId]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!job || job.state !== 'awaiting_approval') return problem ? <p role="alert" className="mb-1.5 text-xs text-fail">{problem}</p> : null;
  // -> true when the job took it; a refusal says why and a changed brief (another tab, a stale hash) is read again, so the person
  // sees the current one before deciding.
  const run = async (action, body) => {
    setBusy(true); setProblem('');
    try { const result = await ops.cadAction(block.jobId, action, body); if (live.current) setJob(result.job); return true; }
    catch (error) {
      if (!live.current) return false;
      setProblem(error.data?.code === 'reprepare_required' ? `${error.message} Cancel this review, then send a new /cad request.` : error.message);
      if (error.status === 409 && error.data?.code !== 'reprepare_required') load();
      return false;
    } finally { if (live.current) setBusy(false); }
  };
  const { view, groups, groupProblem, extraSections } = cadReviewView(job, { format: formatValue, parse: (def, text) => draftInput(def.type, text) });
  // The details form's Save: the brief edit the job takes, against the hash it was made from. A refusal keeps the form open.
  const save = async edit => {
    const brief = briefEditOf(job.brief || {}, edit);
    if (!Object.keys(brief).length) return;
    if (!await run('brief', { expectedBriefHash: job.briefHash, brief })) throw new Error('Not saved.');
  };
  return (
    <GenerationProposalCard view={view} groups={groups} groupProblem={groupProblem} extraSections={extraSections} settingsMode="form" eyebrow="Review design" requestLabel="Original request" note={COST_NOTE}
      attrs={cadAttrs(job)} compact isolate busy={busy} problem={problem ? { message: problem } : null}
      onSave={save} onGenerate={() => run('approve', { briefHash: job.briefHash })} onCancel={() => run('cancel')} />
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
