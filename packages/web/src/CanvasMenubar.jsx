import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, ChevronRight } from 'lucide-react';
import { Menu } from './ui.jsx';
import { menuIcon } from './menu-icon.js';

// The canvas menubar (owner brief 2026-10-22: Insert, Edit, Arrange, View). It sits in the page's control strip rather than
// floating over the surface: the lesson column is centred on the surface with a 24px floor, so a bar pinned to the canvas's
// top-left lands on the first block on a narrow window, and it would cover the gap rail, which draws at left 0.
//
// Menus follow the ARIA menubar pattern. Arrow Up and Down move through a menu, Right opens a submenu (Left or Escape closes it
// and returns to its row), Left and Right on a menu move to its neighbour, Escape closes and returns focus to the menu's button.
// A submenu is its own role="menu" opened by hover (mouse), click or touch, or the keyboard; it is never an inline accordion.

const ROW = 'group flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-ink hover:bg-hover focus-visible:bg-hover focus-visible:outline-none disabled:cursor-default disabled:text-ink-3 disabled:hover:bg-transparent max-md:py-2';
// The fixed-width column every row keeps, so labels line up whether or not a row has an icon.
const Lead = ({ icon, tick }) => (
  <span className="flex h-4 w-4 shrink-0 items-center justify-center text-ink-2 group-disabled:text-ink-3">
    {icon ? menuIcon(icon) : tick ? <Check size={16} strokeWidth={2} aria-hidden="true" className="text-accent" /> : null}
  </span>
);
const allOff = item => item.items.every(child => child.divider || child.disabled);

function MenuPanel({ items, label, nested = false, focusFirst = false, onDone, onEscape, onSides }) {
  const panel = useRef(null);
  const [sub, setSub] = useState(null);
  const [subByKey, setSubByKey] = useState(false);
  const rows = () => [...panel.current.querySelectorAll('[data-menu-item]')].filter(node => node.closest('[role="menu"]') === panel.current && !node.disabled);
  useEffect(() => { if (focusFirst) rows()[0]?.focus({ preventScroll: true }); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const closeSub = () => {
    const parent = [...panel.current.querySelectorAll('[data-submenu]')].find(node => node.dataset.menuItem === sub);
    setSub(null);
    parent?.focus();
  };
  const onKeyDown = event => {
    if (event.target.closest('[role="menu"]') !== panel.current) return;
    const field = event.target.tagName === 'SELECT';
    const list = rows(), at = list.indexOf(event.target);
    const go = to => { event.preventDefault(); list[(to + list.length) % list.length]?.focus({ preventScroll: true }); };
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onEscape(); return; }
    if (event.key === 'Tab') { onDone(); return; }
    if (field) return; // the Page guides selector keeps its own arrow keys
    if (event.key === 'ArrowDown') go(at + 1);
    else if (event.key === 'ArrowUp') go(at < 0 ? list.length - 1 : at - 1);
    else if (event.key === 'Home') go(0);
    else if (event.key === 'End') go(list.length - 1);
    else if (event.key === 'ArrowRight') {
      if (event.target.dataset.submenu !== undefined) { event.preventDefault(); setSubByKey(true); setSub(event.target.dataset.menuItem); } else if (!nested) { event.preventDefault(); onSides(1); }
    } else if (event.key === 'ArrowLeft') { event.preventDefault(); if (nested) onEscape(); else onSides(-1); }
  };
  // Only a mouse opens a submenu by hovering; touch opens it with the press, so a tap never opens then closes it.
  const hover = item => event => { if (event.pointerType === 'mouse') setSub(item.items ? item.label : null); };
  return (
    <div ref={panel} role="menu" aria-label={label} onKeyDown={onKeyDown}>
      {items.map((item, index) => {
        if (item.divider) return <div key={`rule-${index}`} role="separator" className="my-1 h-px bg-line" />;
        if (item.choice) {
          // One row, one dropdown: a setting with several values rather than a row per value.
          return (
            <label key={item.label} onPointerEnter={hover(item)} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm text-ink hover:bg-hover max-md:py-2">
              <Lead />
              <span className="flex-1 whitespace-nowrap">{item.label}</span>
              <select data-menu-item value={item.choice.value} onChange={event => { onDone(); item.choice.onChange(event.target.value); }}
                className="h-7 cursor-pointer rounded-md border border-line bg-white px-1 text-xs text-ink outline-none focus:border-ink-3">
                {item.choice.options.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
              </select>
            </label>
          );
        }
        if (item.items) {
          const open = sub === item.label;
          return (
            <div key={item.label} className="relative">
              <button type="button" role="menuitem" data-menu-item={item.label} data-submenu aria-haspopup="menu" aria-expanded={open} disabled={allOff(item)}
                onPointerEnter={hover(item)}
                onClick={event => { setSubByKey(event.detail === 0); setSub(item.label); }}
                className={`${ROW} ${open ? 'bg-hover' : ''}`}>
                <Lead icon={item.icon} />
                <span className="flex-1 whitespace-nowrap">{item.label}</span>
                <ChevronRight size={14} strokeWidth={1.75} aria-hidden="true" className="shrink-0 text-ink-3" />
              </button>
              {open && (
                <div className="absolute top-0 left-full z-30 ml-1 w-52 rounded-md border border-line bg-white p-1 shadow-pop max-md:top-full max-md:left-3 max-md:ml-0">
                  <MenuPanel items={item.items} label={item.label} nested focusFirst={subByKey} onDone={onDone} onEscape={closeSub} onSides={() => {}} />
                </div>
              )}
            </div>
          );
        }
        const kind = item.check !== undefined ? 'menuitemcheckbox' : item.radio !== undefined ? 'menuitemradio' : 'menuitem';
        const on = kind === 'menuitemcheckbox' ? item.check : kind === 'menuitemradio' ? item.radio : undefined;
        return (
          <button key={item.label} type="button" role={kind} data-menu-item={item.label} disabled={item.disabled} aria-checked={on === undefined ? undefined : !!on}
            onPointerEnter={hover(item)}
            // A check row flips in place and the menu stays open, so the canvas reflows beside it; anything else closes the menu.
            onClick={() => { if (kind === 'menuitemcheckbox') { item.onToggle(!item.check); return; } onDone(); item.onSelect?.(); }}
            className={ROW}>
            {/* An icon, when the row has one, leads, and a check then sits at the end; a row without one shows its check
                or selection in the leading column. */}
            <Lead icon={item.icon} tick={on} />
            <span className="flex-1 whitespace-nowrap">{item.label}</span>
            {item.hint && <span className="shrink-0 pl-3 text-xs text-ink-3">{item.hint}</span>}
            {item.icon && on !== undefined && <span className="flex w-4 shrink-0 justify-center text-accent">{on ? <Check size={16} strokeWidth={2} aria-hidden="true" /> : null}</span>}
          </button>
        );
      })}
    </div>
  );
}

export default function CanvasMenubar({ menus, className = '' }) {
  const [open, setOpen] = useState(null);
  const [byKey, setByKey] = useState(false);
  const buttons = useRef({});
  const show = (title, keyboard) => { setByKey(keyboard); setOpen(title); };
  // Right and Left go to the neighbouring menu, wrapping at the ends: its button takes focus and, when a menu was open, it opens.
  const beside = (title, step, opened) => {
    const at = menus.findIndex(menu => menu.title === title), next = menus[(at + step + menus.length) % menus.length].title;
    buttons.current[next]?.focus();
    if (opened) show(next, true);
  };
  return (
    <div role="menubar" aria-label="Canvas menu" className={`flex items-center gap-0.5 ${className}`}>
      {menus.map(menu => (
        <div key={menu.title} className="relative">
          <button type="button" role="menuitem" aria-haspopup="menu" aria-expanded={open === menu.title}
            ref={node => { buttons.current[menu.title] = node; }}
            onClick={event => (open === menu.title ? setOpen(null) : show(menu.title, event.detail === 0))}
            onKeyDown={event => {
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); show(menu.title, true); }
              else if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') { event.preventDefault(); beside(menu.title, event.key === 'ArrowRight' ? 1 : -1, open); }
            }}
            // Once one is open the others answer to hover, the way a menubar does.
            onPointerEnter={event => { if (event.pointerType === "mouse") { setByKey(false); setOpen(previous => (previous ? menu.title : previous)); } }}
            className={`flex h-8 items-center gap-1 rounded-lg px-2.5 text-sm whitespace-nowrap max-md:px-1.5 ${open === menu.title ? 'bg-hover text-ink' : 'text-ink-2 hover:bg-hover hover:text-ink'}`}>
            {menu.title}<ChevronDown size={13} strokeWidth={2} aria-hidden="true" className="opacity-50 max-md:hidden" />
          </button>
          <Menu open={open === menu.title} onClose={() => setOpen(null)} className="top-9 left-0 border border-line">
            <MenuPanel items={menu.items} label={menu.title} focusFirst={byKey} onDone={() => setOpen(null)}
              onEscape={() => { setOpen(null); buttons.current[menu.title]?.focus(); }} onSides={step => beside(menu.title, step, true)} />
          </Menu>
        </div>
      ))}
    </div>
  );
}
