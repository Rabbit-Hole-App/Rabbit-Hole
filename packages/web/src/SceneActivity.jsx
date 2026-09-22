import { InputWidget } from './SceneControls.jsx';
import { applyCheck, applyNewAttempt, checkStatus, setActivityAnswer } from './scene-activity.js';

// The practice section of an interactive card (spec T09). Renders the
// authored task, the answer input (same widget registry as the experiment
// controls), Check, feedback and New attempt - all inside the card, next to
// the thing they grade. Attempt state lives on the block; this component
// only dispatches the generic reducer.

export default function SceneActivity({ block, onChange }) {
  const activity = block.activity;
  if (!activity) return null;
  const status = checkStatus(block);
  const submitted = status.state === 'submitted';
  const answerDeclaration = activity.answer ? { ...activity.answer, name: 'answer' } : null;
  return (
    <div data-scene-activity className="mt-2 shrink-0 rounded-lg border border-line bg-white px-3 py-2"
      onPointerDown={event => event.stopPropagation()}>
      <p className="text-xs font-semibold tracking-wide text-ink-2 uppercase">Practice</p>
      <p className="mt-1 text-sm text-ink">{activity.prompt}</p>
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
        {submitted && (
          <button type="button" data-activity-new onClick={() => onChange(applyNewAttempt(block))}
            className="flex h-8 items-center rounded-lg border border-line px-3 text-sm text-ink hover:bg-hover">
            New attempt
          </button>
        )}
      </div>
      {/* Feedback stays inside the card, near the task it grades. */}
      {status.state === 'not_ready' && <p data-activity-feedback className="mt-2 text-xs text-ink-2">{status.reason}</p>}
      {submitted && (
        <p data-activity-feedback data-activity-result={status.result}
          className={`mt-2 text-xs ${status.result === 'passed' ? 'text-green-700' : 'text-red-700'}`}>
          {status.result === 'passed' ? activity.feedbackPass : activity.feedbackFail}
        </p>
      )}
      {(block.attemptLog || []).length > 0 && (
        <p className="mt-1 text-[11px] tabular-nums text-ink-3">{block.attemptLog.length} committed attempt{block.attemptLog.length === 1 ? '' : 's'}</p>
      )}
    </div>
  );
}
