import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { useChatWorkspace } from './chat-workspace.jsx';
import { COMPOSER_TOOL } from './ChatComposer.jsx';
import { cn } from './ui.jsx';

// The Auto / Ask / Tutor selector in the Chat composer toolbar (owner brief section 5), bound to
// useChatWorkspace().thread.mode. Interaction modes, never model names, and separate from the / command slot: a command
// never changes the mode and the mode never rewrites a command. Changing it keeps the draft, attachments and conversation.
export const MODES = [
  ['auto', 'Auto', 'Answers, or starts a syllabus when you ask for a course'],
  ['ask', 'Ask', 'Questions, explanations and your materials'],
  ['tutor', 'Tutor', 'Builds and refines a syllabus'],
];

export default function ModeSelector({ disabled = false }) {
  const chat = useChatWorkspace();
  const [open, setOpen] = useState(false);
  const box = useRef(null), button = useRef(null), items = useRef([]);
  // A press outside the selector closes it. Capture: the canvas stops its own pointer events. The button is inside, so a
  // second press on it toggles the menu closed instead of closing and reopening it.
  useEffect(() => {
    if (!open) return;
    const away = event => { if (!box.current?.contains(event.target)) setOpen(false); };
    document.addEventListener('pointerdown', away, true);
    return () => document.removeEventListener('pointerdown', away, true);
  }, [open]);
  if (!chat) return null;
  // The Table of contents has one mode (owner brief 2026-10-16 item 7): Tutor, shown, with no menu.
  if (chat.tocView) return <span data-chat-mode="tutor" data-toc-mode title="The table of contents is refined with the Tutor" className={cn(COMPOSER_TOOL, 'cursor-default text-sm hover:bg-transparent hover:text-ink-2')}>Tutor</span>;
  const { mode, setMode } = chat.thread;
  const current = Math.max(0, MODES.findIndex(([id]) => id === mode));
  const show = () => { setOpen(true); requestAnimationFrame(() => items.current[current]?.focus()); };
  const close = () => { setOpen(false); button.current?.focus(); };
  const pick = id => { setMode(id); setOpen(false); chat.composer.focus(); };
  const move = (event, to) => { event.preventDefault(); items.current[(to + MODES.length) % MODES.length]?.focus(); };
  const keys = event => {
    const at = items.current.indexOf(document.activeElement);
    if (event.key === 'ArrowDown') move(event, at + 1);
    else if (event.key === 'ArrowUp') move(event, at - 1);
    else if (event.key === 'Home') move(event, 0);
    else if (event.key === 'End') move(event, MODES.length - 1);
    // Escape closes this menu only (not the panel or the palette) and gives focus back to the button.
    else if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
    else if (event.key === 'Tab') setOpen(false);
  };
  return (
    <div ref={box} className="relative shrink-0">
      <button ref={button} type="button" aria-label="Mode" title={`Mode: ${MODES[current][1]}`} aria-haspopup="menu" aria-expanded={open} data-chat-mode={MODES[current][0]} disabled={disabled}
        onMouseDown={event => event.preventDefault()} onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={event => { if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); show(); } }}
        className={cn(COMPOSER_TOOL, 'text-sm', open && 'bg-active text-ink')}>
        {MODES[current][1]}<ChevronDown size={14} aria-hidden="true" />
      </button>
      {open && (
        <div role="menu" aria-label="Mode" onKeyDown={keys} className="absolute bottom-full left-0 z-30 mb-1 w-64 rounded-md bg-white p-1 shadow-pop">
          {MODES.map(([id, label, hint], index) => (
            <button key={id} ref={node => { items.current[index] = node; }} type="button" role="menuitemradio" aria-checked={id === mode} tabIndex={-1} data-chat-mode-option={id}
              onClick={() => pick(id)} className="flex w-full cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-left outline-none hover:bg-hover focus-visible:bg-hover">
              <span className="flex h-5 w-4 shrink-0 items-center justify-center">{id === mode && <Check size={14} className="text-accent" />}</span>
              <span className="min-w-0"><span className="block text-sm text-ink">{label}</span><span className="block text-xs text-ink-3">{hint}</span></span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
