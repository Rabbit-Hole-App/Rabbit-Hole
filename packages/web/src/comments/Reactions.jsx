import { useEffect, useState } from 'react';
import { SmilePlus } from 'lucide-react';
import { REACTIONS, REACTION_NAMES } from './comment-reactions.js';
import { when } from './comments-api.js';

// A comment's reactions (docs/features/canvas-comments.md section 13): the chips that exist, each a toggle of the reader's own,
// and a picker of the fixed set for whoever may react. Counts only; nobody is named.
const nameOf = emoji => REACTION_NAMES[REACTIONS.indexOf(emoji)] || 'Reaction';
export function Reactions({ message, client, act }) {
  const [picking, setPicking] = useState(false);
  const chips = message.reactions || [];
  if (!chips.length && !message.can.react) return null;
  const toggle = (emoji, on) => { setPicking(false); act(() => client.react(message.id, emoji, on)); };
  return (
    <div data-reactions className="relative mt-1 flex flex-wrap items-center gap-1">
      {chips.map(chip => (
        <button key={chip.emoji} type="button" data-reaction={chip.emoji} aria-pressed={chip.mine} aria-label={`${nameOf(chip.emoji)}, ${chip.count}`} disabled={!message.can.react}
          onClick={() => toggle(chip.emoji, !chip.mine)}
          className={`flex h-6 items-center gap-1 rounded-full border px-2 text-xs tabular-nums ${chip.mine ? 'border-accent bg-accent/10 text-ink' : 'border-line text-ink-2 hover:bg-hover'} disabled:opacity-60`}>
          <span aria-hidden>{chip.emoji}</span>{chip.count}
        </button>
      ))}
      {message.can.react && (
        <button type="button" data-add-reaction aria-label="Add reaction" aria-expanded={picking} onClick={() => setPicking(open => !open)}
          className="flex h-6 w-6 items-center justify-center rounded-full text-ink-3 hover:bg-hover hover:text-ink aria-expanded:bg-hover"><SmilePlus size={14} aria-hidden /></button>
      )}
      {picking && (
        <span role="menu" aria-label="Reactions" className="absolute top-7 left-0 z-10 flex gap-0.5 rounded-md border border-line bg-white p-1 shadow-pop">
          {REACTIONS.map(emoji => {
            const mine = chips.some(chip => chip.emoji === emoji && chip.mine);
            return <button key={emoji} type="button" role="menuitemcheckbox" aria-checked={mine} aria-label={nameOf(emoji)} onClick={() => toggle(emoji, !mine)} className="flex h-7 w-7 items-center justify-center rounded text-base hover:bg-hover aria-checked:bg-accent/10"><span aria-hidden>{emoji}</span></button>;
          })}
        </span>
      )}
    </div>
  );
}

// "edited" opens what the edits replaced, for the two who may see it (can.history: the author and the canvas owner).
export function EditedMark({ message, client }) {
  const [open, setOpen] = useState(false);
  const [edits, setEdits] = useState(null);
  const [failed, setFailed] = useState(null);
  useEffect(() => {
    if (!open) return;
    let live = true;
    client.history(message.id).then(answer => { if (live) { setEdits(answer.edits); setFailed(null); } }, error => { if (live) setFailed(error.data?.error || error.message); });
    return () => { live = false; };
  }, [open, message.id, client]);
  if (!message.can.history) return <span className="shrink-0 text-ink-3">· edited</span>;
  return (
    <span className="relative shrink-0">
      <button type="button" data-edit-history aria-expanded={open} onClick={() => setOpen(value => !value)} className="text-ink-3 underline-offset-2 hover:text-ink hover:underline">· edited</button>
      {open && (
        <span role="dialog" aria-label="Earlier versions" data-edit-history-list className="absolute top-5 left-0 z-10 block max-h-60 w-64 overflow-y-auto rounded-md border border-line bg-white p-2 text-left shadow-pop">
          {failed ? <span className="text-xs text-red-700">{failed}</span> : !edits ? <span className="text-xs text-ink-3">Loading</span> : edits.length === 0 ? <span className="text-xs text-ink-3">No earlier versions.</span>
            : edits.map((edit, index) => <span key={index} className="mb-2 block last:mb-0"><span className="block text-[11px] text-ink-3">Replaced {when(edit.replaced_at)}</span><span className="block text-xs break-words whitespace-pre-wrap text-ink">{edit.body}</span></span>)}
        </span>
      )}
    </span>
  );
}
