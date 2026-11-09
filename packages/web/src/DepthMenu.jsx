import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, SignalHigh, SignalLow, SignalMedium } from 'lucide-react';
import { COMPOSER_TOOL } from './ChatComposer.jsx';
import { cn } from './ui.jsx';
import { DEPTHS } from './learn-settings.js';

// Depth (Overview, Standard, Deep) in the Chat composer toolbar, beside the mode selector (Tutor ladder R2, decisions D11, D12).
// Depth is this canvas's. The Auto-suggest switch is its own control (AutoSuggestSwitch, use-learn-coaching.jsx), so only one
// control carries that name. settings: useLearnSettings().
// The Depth trigger is an icon, not a word (owner 2026-11-07): signal bars read as a scale, one, two or three bars, and the colour follows the level
// (one Claude-orange scale from the --color-claude tokens: a pale tint, the colour, then the deeper step). The shape carries the meaning, so colour is never the only cue; the name stays in the aria-label and tooltip.
export const LEVEL_MARK = { overview: [SignalLow, 'text-claude/45'], standard: [SignalMedium, 'text-claude'], deep: [SignalHigh, 'text-claude-deep'] };
export default function DepthMenu({ settings, disabled = false }) {
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
  const [LevelIcon, levelColor] = LEVEL_MARK[current[0]] || LEVEL_MARK.standard;
  const failed = settings.status === 'error' || settings.saveStatus === 'error';
  const count = DEPTHS.length;
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
      <button ref={button} type="button" aria-label={`Depth: ${current[1]}`} title={`Depth: ${current[1]}`} aria-haspopup="menu" aria-expanded={open} data-depth={current[0]} disabled={disabled}
        onMouseDown={event => event.preventDefault()} onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={event => { if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); show(); } }}
        className={cn(COMPOSER_TOOL, 'text-sm', open && 'bg-active text-ink')}>
        <LevelIcon size={17} strokeWidth={2} aria-hidden="true" className={levelColor} data-depth-icon={current[0]} /><ChevronDown size={12} aria-hidden="true" className="text-ink-3" />
      </button>
      {open && (
        <div role="menu" aria-label="Depth" onKeyDown={keys} className="absolute bottom-full left-0 z-30 mb-1 w-72 rounded-md bg-white p-1 shadow-pop">
          {DEPTHS.map(([id, label, hint], index) => (
            <button key={id} ref={node => { items.current[index] = node; }} type="button" role="menuitemradio" aria-checked={id === settings.depth} tabIndex={-1} data-depth-option={id}
              onClick={() => { settings.set({ depth: id }); close(); }} className="flex w-full cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-left outline-none hover:bg-hover focus-visible:bg-hover">
              <span className="flex h-5 w-4 shrink-0 items-center justify-center">{id === settings.depth && <Check size={14} className="text-accent" />}</span>
              {(() => { const [Mark, color] = LEVEL_MARK[id] || LEVEL_MARK.standard; return <Mark size={16} strokeWidth={2} aria-hidden="true" className={cn('mt-0.5 shrink-0', color)} />; })()}
              <span className="min-w-0"><span className="block text-sm text-ink">{label}</span><span className="block text-xs text-ink-3">{hint}</span></span>
            </button>
          ))}
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

// The same Depth as a direct three-position slider (UI.03, file 03): Overview / Standard / Deep, value 0-2, step 1. A native range input, so
// Arrow/Home/End move it and Tab leaves it normally. value: a depth id; onChange(id). The Chat roadmap parameters use it for one draft.
export function DepthSlider({ value, onChange, disabled = false, id = "roadmap-depth" }) {
  const at = Math.max(0, DEPTHS.findIndex(([id]) => id === value));
  return (
    <div data-depth-slider className="mt-3.5 mb-2.5">
      <div className="flex justify-between text-xs"><label htmlFor={id} className="text-ink-2">Depth</label><output htmlFor={id} className="text-ink">{DEPTHS[at][1]}</output></div>
      <input id={id} type="range" min={0} max={2} step={1} value={at} disabled={disabled} aria-valuetext={DEPTHS[at][1]}
        onChange={event => onChange(DEPTHS[Number(event.target.value)][0])} className="mt-[3px] h-5 w-full cursor-pointer accent-accent disabled:cursor-default disabled:opacity-50" />
      <div aria-hidden="true" className="flex justify-between text-[10px] leading-[14px] text-ink-3">{DEPTHS.map(([id, label], index) => <span key={id} className={index === at ? 'text-ink' : ''}>{label}</span>)}</div>
    </div>
  );
}
