import { useEffect, useRef, useState } from 'react';
import { api } from './api.js';
import { applyExplainEdit, discardExplainEdit, explainClient, explainRunning, explainStage } from './explain-client.js';

// A same-card Edit in progress or waiting (EXP-T20 slice 2, plan section 1.3): the job's stage, then the validated candidate
// beside the accepted explanation (Current / Proposed) with Apply changes and Discard. Apply is one undoable change of this
// card, refused when the card moved on since the edit started; Discard leaves it exactly as it was. No model call here.
export default function ExplainEditBar({ block, onChange, onChangeQuiet, onPreview }) {
  const editing = block.explainEdit;
  const [job, setJob] = useState(null);
  const [candidate, setCandidate] = useState(null);
  const [problem, setProblem] = useState('');
  const [proposed, setProposed] = useState(false);
  const latest = useRef(block);
  latest.current = block;
  const client = explainClient(api, editing.boardId);
  useEffect(() => {
    let live = true, timer;
    const poll = async () => {
      try {
        const data = await client.get(editing.id);
        if (!live) return;
        setJob(data.job);
        setCandidate(data.block || null);
        if (data.job?.stage && data.job.stage !== latest.current.explainEdit?.stage) (onChangeQuiet || onChange)({ ...latest.current, explainEdit: { ...latest.current.explainEdit, stage: data.job.stage } });
        if (explainRunning(data.job)) timer = setTimeout(poll, 2000);
      } catch (error) { if (live) setProblem(error.message); }
    };
    poll();
    return () => { live = false; clearTimeout(timer); };
  }, [editing.id, editing.boardId]); // eslint-disable-line react-hooks/exhaustive-deps
  // What the card draws: the accepted explanation, or the candidate while Proposed is chosen. Never saved.
  useEffect(() => { onPreview?.(proposed && candidate ? candidate : null); return () => onPreview?.(null); }, [proposed, candidate]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = job || { stage: editing.stage, terminal: false };
  const apply = () => {
    const out = applyExplainEdit(latest.current, job, candidate);
    if (!out.ok) { setProblem(out.reason); return; }
    onChange(out.block);
  };
  const discard = async () => {
    if (explainRunning(shown)) { try { await client.action(editing.id, 'cancel'); } catch { /* the edit is dropped from the card either way */ } }
    onChange(discardExplainEdit(latest.current));
  };
  const ready = shown.stage === 'ready' && candidate;
  const button = 'flex h-7 items-center rounded-lg border border-line px-2.5 text-xs hover:bg-hover';
  return (
    <div data-explain-edit={shown.stage} className="mb-2 flex shrink-0 flex-wrap items-center gap-1.5 rounded-lg border border-dashed border-line px-2 py-1.5">
      <span className="min-w-0 flex-1 truncate text-xs text-ink-2" title={editing.instruction}>
        {ready ? `Proposed edit: ${editing.instruction}` : `Edit: ${explainStage(shown)}`}
      </span>
      {ready && (
        <span role="group" aria-label="Show" className="flex gap-1">
          <button type="button" data-explain-show="current" aria-pressed={!proposed} onClick={() => setProposed(false)} className={button}>Current</button>
          <button type="button" data-explain-show="proposed" aria-pressed={proposed} onClick={() => setProposed(true)} className={button}>Proposed</button>
        </span>
      )}
      {ready && <button type="button" data-explain-apply onClick={apply} className="flex h-7 items-center rounded-lg border border-ink bg-ink px-2.5 text-xs text-white hover:opacity-90">Apply changes</button>}
      <button type="button" data-explain-discard onClick={discard} className={button}>Discard</button>
      {problem && <p data-explain-edit-problem className="w-full text-xs text-red-700">{problem}</p>}
    </div>
  );
}
