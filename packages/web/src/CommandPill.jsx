import { X } from 'lucide-react';
import { SLASH, labelOf } from './agent/slash.js';
import { commandTone } from './CommandTone.jsx';
import { cn } from './ui.jsx';

// The chosen /command as a removable pill: ONE component for the canvas Chat composer and the Ctrl+K editor (Release B,
// lead contract B2). It shows the literal /name in the command's tint (CommandTone.jsx); a command with no tint stays
// neutral. The name, when onOpen is given, reopens the picker to swap it; the x calls onRemove, and the caller keeps the
// argument text, attachments and context - removing a command never clears anything else. Sizes come from the caller
// (className for the pill, removeClassName for the x), so each composer keeps its own height.
export default function CommandPill({ name, onOpen = null, onRemove, disabled = false, className = '', removeClassName = '' }) {
  const command = SLASH.find(entry => entry.name === name);
  const label = command ? labelOf(command) : name;
  const tone = commandTone(name);
  return (
    <span data-command-pill={name} data-command-tone={tone || undefined} className={cn('inline-flex shrink-0 items-center border', !tone && 'border-line bg-hover text-ink', className)}>
      {onOpen
        ? <button type="button" title="Change the command" disabled={disabled} onMouseDown={event => event.preventDefault()} onClick={onOpen} className="inline-flex cursor-pointer items-center gap-1 font-medium">/{name}</button>
        : <span className="inline-flex items-center gap-1 font-medium">/{name}</span>}
      <button type="button" aria-label={`Remove ${label}`} title={`Remove ${label}`} onMouseDown={event => event.preventDefault()} onClick={onRemove} disabled={disabled}
        className={cn('flex cursor-pointer items-center justify-center rounded-md text-ink-3 hover:bg-white hover:text-ink', removeClassName)}><X size={13} /></button>
    </span>
  );
}
