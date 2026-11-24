// The segmented step bar of a pending card (owner, 2026-11-24: moved unchanged out of Animation3DCard.jsx so the /interactive pending card, ExplainPending.jsx, reuses it; never a second bar).
// prefix: the data-attribute prefix of the card that uses it (the Animation card passes animation, so its attributes stay data-animation-progress*); label: the progressbar's aria-label.
// Four segments after Generate: done are filled, the current one pulses (motion-safe), the rest are empty. A correction restarts at
// Build and says "Correcting"; there are no percentages or time guesses.
export default function StageProgress({ progress: { steps, current, correcting }, stage, prefix, label }) {
  return (
    <div className="flex w-full max-w-[260px] flex-col gap-1.5">
      <p {...{ [`data-${prefix}-progress-label`]: true }} className="text-xs text-ink-3">{correcting ? 'Correcting' : `Step ${current + 1} of ${steps.length}`}</p>
      <div {...{ [`data-${prefix}-progress`]: true }} role="progressbar" aria-label={label} aria-valuemin={1} aria-valuemax={steps.length} aria-valuenow={current + 1}
        aria-valuetext={correcting ? `Correcting: ${stage}` : `Step ${current + 1} of ${steps.length}, ${steps[current]}: ${stage}`} className="flex gap-1">
        {steps.map((name, index) => {
          const state = index < current ? 'done' : index === current ? 'current' : 'todo';
          return (
            <div key={name} className="flex flex-1 flex-col gap-1">
              <span {...{ [`data-${prefix}-progress-step`]: state }} data-step-name={name}
                className={`h-1.5 rounded-full ${state === 'done' ? 'bg-ink' : state === 'current' ? 'bg-accent motion-safe:animate-pulse' : 'bg-line-strong'}`} />
              <span aria-hidden className={`text-[11px] ${state === 'todo' ? 'text-ink-3' : 'text-ink-2'}`}>{name}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
