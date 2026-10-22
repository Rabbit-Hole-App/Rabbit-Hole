import { useEffect, useRef, useState } from 'react';
import { api } from './api.js';
import { explainClient, explainResultBlock, explainRunning, explainStage } from './explain-client.js';

// An Explanation card whose /explain v2 job is still working (EXP-T20 slice 1). It shows the server's stage and Stop; when
// the job is ready it becomes the explanation, on this card only (explainResultBlock). Polling observes, it never advances
// the job, and nothing here calls a model.
export default function ExplainPending({ block, onChange, onChangeQuiet, readOnly = false }) {
  const waiting = block.explainJob;
  const [job, setJob] = useState(null);
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);
  const latest = useRef(block);
  latest.current = block;
  const client = explainClient(api, waiting.boardId);
  const apply = data => {
    setJob(data.job);
    const next = data.block ? explainResultBlock(latest.current, data.job, data.block) : null;
    if (next) { onChange(next); return; }
    // The stage rides on the card quietly, so a reload shows where it was; it is not an undo step.
    if (data.job?.stage && data.job.stage !== latest.current.explainJob?.stage) (onChangeQuiet || onChange)({ ...latest.current, explainJob: { ...latest.current.explainJob, stage: data.job.stage } });
  };
  useEffect(() => {
    if (readOnly) return undefined;
    let live = true, timer;
    const poll = async () => {
      try {
        const data = await client.get(waiting.id);
        if (!live) return;
        setProblem('');
        apply(data);
        if (explainRunning(data.job)) timer = setTimeout(poll, 2000);
      } catch (error) { if (live) setProblem(error.message); }
    };
    poll();
    return () => { live = false; clearTimeout(timer); };
  }, [waiting.id, waiting.boardId, readOnly]); // eslint-disable-line react-hooks/exhaustive-deps
  const act = async (name, body) => {
    setBusy(true); setProblem('');
    try { apply(await client.action(waiting.id, name, body)); }
    catch (error) { setProblem(error.message); }
    finally { setBusy(false); }
  };
  const shown = job || { stage: waiting.stage, terminal: false };
  const running = explainRunning(shown);
  const retry = shown.recovery?.find(action => action === 'retry_render' || action === 'new_attempt');
  return (
    <div data-explain-pending={shown.stage} className="flex min-h-24 flex-1 flex-col items-start justify-center gap-2 rounded-lg border border-dashed border-line px-3 py-3">
      <p data-explain-stage aria-live="polite" className={`text-sm ${shown.stage === 'failed' ? 'text-red-700' : 'text-ink-2'}`}>{explainStage(shown)}</p>
      {problem && <p className="text-xs text-red-700">{problem}</p>}
      {!readOnly && (
        <div className="flex gap-1.5">
          {running && <button type="button" data-explain-stop disabled={busy} onClick={() => act('cancel')}
            className="flex h-8 items-center rounded-lg border border-line px-3 text-sm hover:bg-hover disabled:opacity-40">Stop</button>}
          {retry && <button type="button" data-explain-retry disabled={busy} onClick={() => act('retry', { expectedAttempt: shown.attempt })}
            className="flex h-8 items-center rounded-lg border border-line px-3 text-sm hover:bg-hover disabled:opacity-40">{retry === 'retry_render' ? 'Render again' : 'Try again'}</button>}
        </div>
      )}
    </div>
  );
}
