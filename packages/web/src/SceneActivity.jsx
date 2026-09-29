import { useEffect, useRef } from 'react';
import { InputWidget } from './SceneControls.jsx';
import { applyCheck, applyNewAttempt, checkStatus, enterPractice, isPracticing, leavePractice, setActivityAnswer } from './scene-activity.js';
import { describeInputForLearner } from './scene-inputs.js';

// The practice section of an interactive card (spec T09), with ONE truth at
// a time: in Explore the task sits collapsed behind a Start practice button;
// entering Practice applies and locks the task's declared state (the
// reducers own that), and only then do the answer input, Check and feedback
// exist on screen. Leaving practice returns to free exploration.

export default function SceneActivity({ block, onChange, onHeight = null }) {
  const activity = block.activity;
  const practicing = !!activity && isPracticing(block);
  // The card grows by this section's height (collapsed or open, plus its
  // mt-2) instead of squeezing the frame, which would shrink the scene's
  // text and cell numbers below the legibility floors while practising.
  const root = useRef(null);
  useEffect(() => {
    if (!onHeight || !root.current) return undefined;
    const observer = new ResizeObserver(() => onHeight(root.current ? root.current.offsetHeight + 8 : 0));
    observer.observe(root.current);
    return () => { observer.disconnect(); onHeight(0); };
  }, [onHeight, practicing]);
  if (!activity) return null;
  if (!practicing) {
    const attempts = (block.attemptLog || []).length;
    return (
      <div ref={root} data-scene-activity data-practice-mode="explore" className="mt-2 flex shrink-0 items-center gap-3 rounded-lg border border-line bg-white px-3 py-2"
        onPointerDown={event => event.stopPropagation()}>
        <p className="text-xs font-semibold tracking-wide text-ink-2 uppercase">Practice</p>
        <button type="button" data-practice-start onClick={() => onChange(enterPractice(block))}
          className="flex h-8 items-center rounded-lg bg-ink px-3.5 text-sm font-medium text-white">
          Start practice
        </button>
        {attempts > 0 && <span data-activity-attempts className="text-sm tabular-nums text-ink-2">{attempts} committed attempt{attempts === 1 ? '' : 's'}</span>}
      </div>
    );
  }
  const status = checkStatus(block);
  const submitted = status.state === 'submitted';
  const answerDeclaration = activity.answer ? { ...activity.answer, name: 'answer' } : null;
  const attempts = (block.attemptLog || []).length;
  return (
    <div ref={root} data-scene-activity data-practice-mode="practice" className="mt-2 shrink-0 rounded-lg border border-line bg-white px-3 py-2"
      onPointerDown={event => event.stopPropagation()}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold tracking-wide text-ink-2 uppercase">Practice</p>
        <button type="button" data-practice-leave onClick={() => onChange(leavePractice(block))}
          className="flex h-7 items-center rounded-lg px-2 text-xs text-ink-2 hover:bg-hover hover:text-ink">
          Back to explore
        </button>
      </div>
      <p className="mt-1 text-sm text-ink">{activity.prompt}</p>
      {/* The declared practice state, in the same words the locked controls
          use (describeInputForLearner) - generated from the task's own
          fixedInputs against the scene's input declarations. While practising
          these inputs are LOCKED to exactly this, so this line and the
          diagram cannot disagree. */}
      {activity.fixedInputs && (
        <p data-practice-setup className="mt-1 text-xs text-ink-2">
          Locked by this task — {Object.entries(activity.fixedInputs).map(([name, value]) => {
            const declaration = (block.scene?.inputs || []).find(input => input.name === name);
            return declaration ? describeInputForLearner(declaration, value, block.scene?.exampleData) : `${name} = ${JSON.stringify(value)}`;
          }).join(' · ')}
        </p>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
        {/* No default-answer fallback: an untouched task shows NO pick, so
            the not-ready state is honest and nothing pre-selects a winner. */}
        {answerDeclaration && (
          <InputWidget declaration={answerDeclaration} value={block.activityAnswer ?? null}
            data={activity.answerData || block.scene?.exampleData} disabled={submitted}
            onInput={(name, value) => onChange(setActivityAnswer(block, value))} />
        )}
        {!submitted && (
          <button type="button" data-activity-check disabled={status.state !== 'ready'}
            title={status.state === 'not_ready' ? status.reason : undefined}
            onClick={() => onChange(applyCheck(block))}
            className="flex h-8 items-center rounded-lg bg-ink px-3.5 text-sm font-medium text-white disabled:opacity-40">
            {activity.checkLabel || 'Check'}
          </button>
        )}
      </div>
      {/* Feedback stays inside the card, near the task it grades, at the
          answer's own 14px. */}
      {status.state === 'not_ready' && <p data-activity-feedback className="mt-2 text-sm text-ink-2">{status.reason}</p>}
      {submitted && (
        <p data-activity-feedback data-activity-result={status.result}
          className={`mt-2 text-sm ${status.result === 'passed' ? 'text-pass' : 'text-fail'}`}>
          {status.result === 'passed' ? activity.feedbackPass : activity.feedbackFail}
        </p>
      )}
      {/* Attempt history and New attempt: their own row under the feedback,
          a quiet text action - in the answer row it read as one more option. */}
      {attempts > 0 && (
        <div className="mt-1 flex items-center justify-between gap-3">
          <p data-activity-attempts className="text-sm tabular-nums text-ink-2">{attempts} committed attempt{attempts === 1 ? '' : 's'}</p>
          {submitted && (
            <button type="button" data-activity-new onClick={() => onChange(applyNewAttempt(block))}
              className="flex h-7 items-center rounded-lg px-2 text-sm font-medium text-ink hover:bg-hover">
              New attempt
            </button>
          )}
        </div>
      )}
    </div>
  );
}
