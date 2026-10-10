// The canvas title's Rabbit Holes menu (owner r35, docs/features/dive-v1.md "Title menu"): the chevron beside a canvas
// title, and the same rows as a group in a project's canvas switcher (RepositoryPage). The rows are dive.js holeRows.
// Its own small module, so the statically imported RepositoryPage takes these rows without the rest of Dive.jsx.
import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { Menu, MenuItem } from './ui.jsx';

// Arrow keys (and Home, End) move through a menu's rows; Enter clicks the focused row, Esc closes the menu (ui.jsx Menu).
export function menuKeys(event) {
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const rows = [...event.currentTarget.querySelectorAll('[role^="menuitem"]')], at = rows.indexOf(document.activeElement);
  rows[event.key === 'Home' ? 0 : event.key === 'End' ? rows.length - 1 : (at + (event.key === 'ArrowDown' ? 1 : rows.length - 1)) % rows.length]?.focus();
}

// The Rabbit Holes as menu rows (holeRows): one line each, indented by depth, the full title on hover, the level open
// now checked and bold. `indent` shifts them under a row above (the project canvas switcher's current canvas).
export function HoleRows({ rows, onPick, indent = 0 }) {
  return rows.map(row => <MenuItem key={row.app} role="menuitemradio" aria-checked={row.current} data-hole-option={row.app} data-depth={row.depth} title={row.title}
    onClick={() => onPick(row)} style={{ paddingLeft: 8 + (row.depth + indent) * 14 }} className={row.current ? 'font-semibold' : ''}>
    <span className="flex w-full min-w-0 items-center justify-between gap-2"><span data-hole-title className="min-w-0 truncate">{row.title}</span>{row.current && <Check size={14} strokeWidth={2} className="shrink-0" />}</span>
  </MenuItem>);
}

// The chevron beside a canvas title (owner r35), only where the canvas has kept Rabbit Holes: a menu of the whole hole
// tree, from the root down, opened at the chevron (a portaled Menu with an anchor, as the card menus are).
export function TitleHoles({ rows, onPick }) {
  const [menu, setMenu] = useState(null);
  const button = useRef(null), list = useRef(null), pressed = useRef(false);
  useEffect(() => { if (menu) (list.current?.querySelector('[aria-checked="true"]') || list.current?.querySelector('[role^="menuitem"]'))?.focus(); }, [menu]);
  // A press on the chevron closes the open menu (Menu's outside press) before its click lands: that click must not open it
  // again. The window's capture phase sees the press before Menu's document listener does.
  useEffect(() => {
    if (!menu) return undefined;
    const press = event => { pressed.current = !!button.current?.contains(event.target); };
    window.addEventListener('pointerdown', press, true);
    return () => window.removeEventListener('pointerdown', press, true);
  }, [menu]);
  if (rows.length < 2) return null;
  const close = () => setMenu(null);
  const open = () => {
    const box = button.current.getBoundingClientRect();
    setMenu({ anchor: button.current, top: box.bottom + 4, left: Math.max(8, Math.min(box.left - 8, window.innerWidth - 328)) });
  };
  return <>
    <button ref={button} type="button" data-title-holes aria-label="Rabbit Holes in this canvas" title="Rabbit Holes" aria-haspopup="menu" aria-expanded={!!menu}
      onClick={() => { if (pressed.current) pressed.current = false; else if (menu) setMenu(null); else open(); }}
      className={`flex h-8 w-6 shrink-0 items-center justify-center rounded-lg ${menu ? 'bg-hover text-ink' : 'text-ink-2 hover:bg-hover hover:text-ink'}`}><ChevronDown size={14} /></button>
    <Menu portal anchor={menu?.anchor} open={!!menu} onClose={close} style={{ top: menu?.top, left: menu?.left }} className="w-auto! min-w-56 max-w-80">
      <div ref={list} role="menu" aria-label="Rabbit Holes" data-title-holes-menu onKeyDown={event => { if (event.key === 'Escape') button.current?.focus(); menuKeys(event); }}>
        <div className="px-2 pt-2 pb-1 text-xs text-ink-3">Rabbit Holes</div>
        <HoleRows rows={rows} onPick={row => { setMenu(null); if (!row.current) onPick(row); }} />
      </div>
    </Menu>
  </>;
}
