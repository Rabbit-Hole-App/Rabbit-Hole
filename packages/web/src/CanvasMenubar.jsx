import { useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { Menu } from './ui.jsx';

// The canvas menubar. It sits in the page's control strip rather than floating
// over the surface: the lesson column is centred on the surface with a 24px
// floor, so a bar pinned to the canvas's top-left lands on the first block on a
// narrow window, and it would cover the gap rail, which draws at left 0.
//
// The first menu is called Import, not File. A closed label has to carry the
// noun someone is hunting for, and "import slides" is the thing they came for.
export default function CanvasMenubar({ menus, className = '' }) {
  const [open, setOpen] = useState(null);
  return (
    <div role="menubar" aria-label="Canvas menu" className={`flex items-center gap-0.5 ${className}`}>
      {menus.map(menu => (
        <div key={menu.title} className="relative">
          <button type="button" role="menuitem" aria-haspopup="menu" aria-expanded={open === menu.title}
            onClick={() => setOpen(previous => (previous === menu.title ? null : menu.title))}
            // Once one is open the others answer to hover, the way a menubar does.
            onPointerEnter={() => setOpen(previous => (previous ? menu.title : previous))}
            className={`flex h-8 items-center gap-1 rounded-lg px-2.5 text-sm whitespace-nowrap max-md:px-1.5 ${open === menu.title ? 'bg-hover text-ink' : 'text-ink-2 hover:bg-hover hover:text-ink'}`}>
            {menu.title}<ChevronDown size={13} strokeWidth={2} className="opacity-50 max-md:hidden" />
          </button>
          <Menu open={open === menu.title} onClose={() => setOpen(null)} className={`top-9 left-0 border border-line ${menu.panel ? 'w-auto!' : ''}`}>
            {menu.panel ? menu.panel(() => setOpen(null)) : menu.items.map((item, index) => (item.divider ? (
              <div key={`rule-${index}`} className="my-1 h-px bg-line" />
            ) : item.choice ? (
              // One row, one dropdown: a setting with several values rather than a row per value.
              <label key={item.label} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm text-ink hover:bg-hover">
                {item.icon && <item.icon size={15} strokeWidth={1.8} className="shrink-0 text-ink-2" />}
                <span className="flex-1 whitespace-nowrap">{item.label}</span>
                <select value={item.choice.value} onChange={event => { setOpen(null); item.choice.onChange(event.target.value); }}
                  className="h-7 cursor-pointer rounded-md border border-line bg-white px-1 text-xs text-ink outline-none focus:border-ink-3">
                  {item.choice.options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
            ) : (
              <button key={item.label} type="button" role="menuitem" disabled={item.disabled}
                aria-checked={item.checked === undefined ? undefined : !!item.checked}
                onClick={() => { setOpen(null); item.onSelect?.(); }}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-ink hover:bg-hover disabled:cursor-default disabled:text-ink-3 disabled:hover:bg-transparent">
                {/* An icon, when the row has one, leads; the tick then sits at
                    the end. Without icons the tick column is always reserved so
                    labels do not shuffle as things are switched on and off. */}
                {item.icon
                  ? <item.icon size={15} strokeWidth={1.8} className="shrink-0 text-ink-2" />
                  : <span className="flex w-4 shrink-0 justify-center text-accent">{item.checked ? <Check size={14} strokeWidth={2.5} /> : null}</span>}
                <span className="flex-1" style={item.size ? { fontSize: item.size, fontWeight: item.weight } : undefined}>{item.label}</span>
                {item.hint && <span className="shrink-0 text-xs text-ink-3">{item.hint}</span>}
                {item.icon && item.checked !== undefined && <span className="flex w-4 shrink-0 justify-center text-accent">{item.checked ? <Check size={14} strokeWidth={2.5} /> : null}</span>}
              </button>
            )))}
          </Menu>
        </div>
      ))}
    </div>
  );
}
