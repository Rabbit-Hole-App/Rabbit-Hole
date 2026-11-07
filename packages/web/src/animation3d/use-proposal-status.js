// The job behind an approved /animation plan, read for its status line in Chat (polled while it runs; a Chat message may outlive its
// card). A temporary read failure keeps polling (client.js pollRetryDelay); unmounting or another job ends the old polling.
import { useEffect, useState } from 'react';
import { ANIMATION_JOB_EVENT, animationProposalStatus, animationRunning, pollRetryDelay } from './client.js';

export function useAnimationProposal(p, made, ops) {
  const [read, setRead] = useState({ job: null, unread: false, id: null });
  const id = p.command === 'animation' && made && ops?.readAnimationJob ? p.input?.job : null;
  useEffect(() => {
    if (!id) return undefined;
    let live = true, timer, failures = 0;
    setRead({ job: null, unread: false, id });
    const poll = async () => {
      try { const job = await ops.readAnimationJob(p); if (!live) return; failures = 0; setRead({ job, unread: false, id }); if (animationRunning(job)) timer = setTimeout(poll, 4000); }
      catch (error) {
        if (!live) return;
        setRead(current => ({ ...current, unread: !current.job }));
        const delay = pollRetryDelay(error, ++failures);
        if (delay !== null) timer = setTimeout(poll, delay);
      }
    };
    poll();
    // Stop (or any action from outside this card) moved the job: read it again, so the card says Stopped at once.
    const again = event => { if (event.detail?.jobId === id) { clearTimeout(timer); poll(); } };
    window.addEventListener(ANIMATION_JOB_EVENT, again);
    return () => { live = false; clearTimeout(timer); window.removeEventListener(ANIMATION_JOB_EVENT, again); };
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!id) return null;
  // The render before the effect runs on a new job still holds the old job's read.
  const shown = read.id === id ? read : { job: null, unread: false };
  return animationProposalStatus({ job: shown.job, unread: shown.unread, cardId: shown.job?.cardId ?? null, onCanvas: !shown.job?.cardId || ops.hasCard?.(shown.job.cardId) !== false });
}
