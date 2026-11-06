
// The roadmap's choice buttons, shared with its Chat transcript items (RoadmapTranscript.jsx).
export const PRIMARY = 'h-8 rounded-md bg-accent px-3 text-xs font-medium text-white outline-none hover:bg-accent/90 focus-visible:ring-2 focus-visible:ring-accent/60';
export const SECONDARY = 'h-8 rounded-md border border-line px-3 text-xs font-medium text-ink outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-accent/60';
export const ghost = 'h-7 rounded-md border border-line px-2.5 text-xs outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-accent/60';

// The right-side Chat strip for the roadmap: the two-choice invitation, then the state lines (planning, plan ready, paused,
// stopping point, checking, a focused question, an oversize-source limitation).
// Nothing here is saved in the chat thread: the server owns every line, so a reload or a second device shows the same.
// invitation: invitationOf (or null); lines: chatOf. Free typing stays in the composer below; the buttons are not required.
export default function RoadmapInvitation({ invitation, lines, onExplain, onKeep, onAnswer, onOffer, onChoose }) {
  if (!invitation && !lines.length) return null;
  return (
    <div data-roadmap-chat className="mb-2 flex flex-col gap-2">
      {invitation && (
        <section data-roadmap-invitation={invitation.id} aria-label="Explain on canvas" className="flex flex-col gap-2 rounded-md border border-line bg-white p-3">
          <p className="break-words text-sm text-ink">{invitation.text}</p>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" data-roadmap-explain onClick={onExplain} className={PRIMARY}>{invitation.choices[0].label}</button>
            <button type="button" data-roadmap-keep onClick={onKeep} className={SECONDARY}>{invitation.choices[1].label}</button>
          </div>
        </section>
      )}
      {lines.map(line => (
        <div key={line.id} data-roadmap-line={line.kind} className="rounded-md bg-hover/60 px-3 py-2 text-sm text-ink">
          {(
            <>
              {line.label && <p className="mb-0.5 text-xs font-medium text-ink-2">{line.label}</p>}
              <p className="break-words">{line.text}</p>
              {line.kind === 'question' && <div className="mt-1.5 flex flex-wrap gap-1.5">{line.options.map(option => <button key={option.id} type="button" data-roadmap-option={option.id} onClick={() => onAnswer({ optionId: option.id })} className={ghost}>{option.label}</button>)}</div>}
              {line.kind === 'coverage' && (
                <>
                  {line.notes.map(note => <p key={note} data-roadmap-coverage className="mt-1 break-words text-xs text-ink-2">{note}</p>)}
                  <div className="mt-1.5 flex flex-wrap gap-1.5">{line.choices.map(choice => <button key={`${choice.locationId}:${choice.part}`} type="button" data-roadmap-choice={`${choice.locationId}:${choice.part}`} onClick={() => onChoose?.(choice)} className={ghost}>{choice.label}</button>)}</div>
                </>
              )}
              {line.kind === 'limitation' && line.offers.length > 0 && <div className="mt-1.5 flex flex-wrap gap-1.5">{line.offers.map(offer => <button key={offer.kind} type="button" data-roadmap-offer={offer.kind} onClick={() => onOffer(offer)} className={ghost}>{offer.label}</button>)}</div>}
            </>
          )}
        </div>
      ))}
    </div>
  );
}
