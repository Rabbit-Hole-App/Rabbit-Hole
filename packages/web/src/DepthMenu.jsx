import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { COMPOSER_TOOL } from './ChatComposer.jsx';
import { cn } from './ui.jsx';
import { AUTO_SUGGEST_MODES, DEPTHS } from './learn-settings.js';

// Depth (Overview, Standard, Deep) and Auto-suggest in the Chat composer toolbar, beside the mode selector (Tutor ladder R2,
// decisions D11, D12, D22). One menu: Depth is this canvas's, Auto-suggest is the learner's on every canvas and is shown only in
// the modes that can suggest (Auto and Tutor), hidden in Ask. settings: useLearnSettings(); mode: the selected mode.
export default function DepthMenu({ settings, mode, disabled = false }) {
  const [open, setOpen] = useState(false);
  const box = useRef(null), button = useRef(null), items = useRef([]);
  useEffect(() => {
    if (!open) return;
    const away = event => { if (!box.current?.contains(event.target)) setOpen(false); };
    document.addEventListener('pointerdown', away, true);
    return () => document.removeEventListener('pointerdown', away, true);
  }, [open]);
  const at = Math.max(0, DEPTHS.findIndex(([id]) => id === settings.depth));
  const current = DEPTHS[at];
  const suggests = AUTO_SUGGEST_MODES.includes(mode);
  const failed = settings.status === 'error' || settings.saveStatus === 'error';
  const count = DEPTHS.length + (suggests ? 1 : 0);
  const show = () => { setOpen(true); requestAnimationFrame(() => items.current[at]?.focus()); };
  const close = () => { setOpen(false); button.current?.focus(); };
  const move = (event, to) => { event.preventDefault(); items.current[(to + count) % count]?.focus(); };
  const keys = event => {
    const index = items.current.indexOf(document.activeElement);
    if (event.key === 'ArrowDown') move(event, index + 1);
    else if (event.key === 'ArrowUp') move(event, index - 1);
    else if (event.key === 'Home') move(event, 0);
    else if (event.key === 'End') move(event, count - 1);
    // Escape closes this menu only and gives focus back to the button.
    else if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
    else if (event.key === 'Tab') setOpen(false);
  };
  return (
    <div ref={box} className="relative shrink-0" data-depth-menu>
      <button ref={button} type="button" aria-label="Depth" title={`Depth: ${current[1]}`} aria-haspopup="menu" aria-expanded={open} data-depth={current[0]} disabled={disabled}
        onMouseDown={event => event.preventDefault()} onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={event => { if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); show(); } }}
        className={cn(COMPOSER_TOOL, 'text-sm', open && 'bg-active text-ink')}>
        {current[1]}<ChevronDown size={14} aria-hidden="true" />
      </button>
      {open && (
        <div role="menu" aria-label="Depth" onKeyDown={keys} className="absolute bottom-full left-0 z-30 mb-1 w-72 rounded-md bg-white p-1 shadow-pop">
          {DEPTHS.map(([id, label, hint], index) => (
            <button key={id} ref={node => { items.current[index] = node; }} type="button" role="menuitemradio" aria-checked={id === settings.depth} tabIndex={-1} data-depth-option={id}
              onClick={() => { settings.set({ depth: id }); close(); }} className="flex w-full cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-left outline-none hover:bg-hover focus-visible:bg-hover">
              <span className="flex h-5 w-4 shrink-0 items-center justify-center">{id === settings.depth && <Check size={14} className="text-accent" />}</span>
              <span className="min-w-0"><span className="block text-sm text-ink">{label}</span><span className="block text-xs text-ink-3">{hint}</span></span>
            </button>
          ))}
          {suggests && (
            <div className="mt-1 border-t border-line pt-1">
              <button ref={node => { items.current[DEPTHS.length] = node; }} type="button" role="menuitemcheckbox" aria-checked={settings.autoSuggest} tabIndex={-1} data-auto-suggest={settings.autoSuggest ? 'on' : 'off'}
                title="Offer suggestions without being asked. Your questions are always answered." onClick={() => settings.set({ autoSuggest: !settings.autoSuggest })}
                className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left outline-none hover:bg-hover focus-visible:bg-hover">
                <span className="flex h-5 w-4 shrink-0 items-center justify-center">{settings.autoSuggest && <Check size={14} className="text-accent" />}</span>
                <span className="min-w-0"><span className="block text-sm text-ink">Auto-suggest</span><span className="block text-xs text-ink-3">Offer suggestions without being asked, on every canvas</span></span>
              </button>
            </div>
          )}
          {failed && (
            <p role="alert" data-depth-status="error" className="px-2 pb-1 pt-1.5 text-xs text-fail">
              {settings.status === 'error' ? 'Could not load your Depth setting.' : 'Not saved: this change applies in this tab only.'}{' '}
              <button type="button" onClick={settings.retry} className="cursor-pointer font-medium text-ink underline-offset-2 hover:underline">Retry</button>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
