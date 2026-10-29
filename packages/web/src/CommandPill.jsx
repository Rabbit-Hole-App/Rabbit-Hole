import { X } from 'lucide-react';
import { commandLabel, typedOf } from './agent/slash.js';
import { commandTone } from './CommandTone.jsx';
import { cn } from './ui.jsx';

// The chosen /command as a removable pill: ONE component for the canvas Chat composer and the Ctrl+K editor (Release B,
// lead contract B2). It shows the command's canonical typed name without its slash (owner spec 2026-10-29: `explain`, `photos`,
// `image`, `3d`); the slash stays only in typed syntax. The x is named by the command's title (Remove Photo search). In the
// command's tint (CommandTone.jsx); a command with no tint (a saved message's removed one) stays neutral. The name, when onOpen is
// given, reopens the picker to swap it; the x calls onRemove, and the caller keeps the argument text, attachments and context -
// removing a command never clears anything else. Without onRemove (a sent Chat message, UI-16) it is read-only: no x and no action.
// Sizes come from the caller (className for the pill, removeClassName for the x), so each composer keeps its own height.
// text / ariaLabel: a read-only display may set the pill's words and name (the CAD confirmation shows `cad`, owner brief 2026-10-23).
export default function CommandPill({ name, text = null, ariaLabel = null, onOpen = null, onRemove = null, disabled = false, className = '', removeClassName = '' }) {
  const label = commandLabel(name);
  const shown = typedOf(name);
  const tone = commandTone(name);
  return (
    <span data-command-pill={name} data-command-tone={tone || undefined} {...(ariaLabel ? { role: 'img', 'aria-label': ariaLabel } : {})} className={cn('inline-flex shrink-0 items-center border', !tone && 'border-line bg-hover text-ink', className)}>
      {onOpen
        ? <button type="button" title="Change the command" disabled={disabled} onMouseDown={event => event.preventDefault()} onClick={onOpen} className="inline-flex cursor-pointer items-center gap-1 font-medium">{shown}</button>
        : <span className="inline-flex items-center gap-1 font-medium">{text ?? shown}</span>}
      {onRemove && <button type="button" aria-label={`Remove ${label}`} title={`Remove ${label}`} onMouseDown={event => event.preventDefault()} onClick={onRemove} disabled={disabled}
        className={cn('flex cursor-pointer items-center justify-center rounded-md text-ink-3 hover:bg-white hover:text-ink', removeClassName)}><X size={13} /></button>}
    </span>
  );
}
