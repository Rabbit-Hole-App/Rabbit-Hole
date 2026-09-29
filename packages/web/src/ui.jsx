import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { clsx as cn } from 'clsx';
import { Check, ChevronDown, ChevronRight, Clock, Copy as CopyIcon, File as FileIcon, Globe, Maximize2, Minimize2, Network, Play, TriangleAlert, Upload, X } from 'lucide-react';

export { cn };

// ─── The component kit. Pixel reference: design/components.html (read-only). ───
// Radius language (user rule): one template everywhere - buttons/controls
// RADIUS.control, popovers/menus RADIUS.popover, modal windows RADIUS.modal.
export const RADIUS = { control: 'rounded-lg', popover: 'rounded-md', modal: 'rounded-2xl' };
// Sizes: buttons/inputs/table rows 32px, small 28px, sidebar rows 28px, pills 20px.
// Radius 4px (rounded-sm), popovers 6px (rounded-md). Shadow only on popovers.

// Kind icon per app: Globe server, Play job, Clock scheduled job. 16px, stroke 1.5.
export const KindIcon = ({ kind, schedule, size = 16 }) => {
  const I = kind === 'repository' ? Network : kind === 'job' ? (schedule ? Clock : Play) : Globe;
  return <I size={size} strokeWidth={1.5} className="shrink-0 text-ink-2" />;
};

// Buttons - primary (accent), secondary (bordered), ghost (default for most actions), danger.
export function Button({ className, variant = 'ghost', size, ...props }) {
  return (
    <button
      className={cn(
        'inline-flex items-center gap-1.5 rounded-lg border-0 text-sm font-medium whitespace-nowrap transition-colors duration-100 select-none focus-visible:outline-2 focus-visible:outline-accent/35 disabled:cursor-default disabled:opacity-50',
        size === 'sm' ? 'h-7 px-2 text-[13px]' : 'h-8 px-3',
        variant === 'primary' && 'bg-accent text-white hover:bg-accent-hover',
        // "New token" template: visible as a button at rest - white, border, faint shadow
        variant === 'secondary' && 'border border-line-strong bg-white text-ink shadow-[0_1px_3px_rgba(0,0,0,0.12)] hover:bg-hover',
        // "Copy link" template: accent-tinted fill for feature CTAs that should not shout
        variant === 'soft' && 'bg-accent/10 text-accent hover:bg-accent/20',
        variant === 'ghost' && 'text-ink-2 hover:bg-hover hover:text-ink',
        variant === 'danger' && 'bg-danger text-white',
        // legacy alias used across the app for quiet blue text actions
        variant === 'accent' && 'font-medium text-accent hover:bg-accent/10',
        className,
      )}
      {...props}
    />
  );
}

// "Add members ▾" template: primary action with an attached chevron menu.
export function SplitButton({ children, onClick, menu, size, className }) {
  const [open, setOpen] = useState(false);
  return (
    <span className={cn('relative inline-flex', className)}>
      <Button variant="primary" size={size} onClick={onClick} className="rounded-r-none!">{children}</Button>
      <Button
        variant="primary"
        size={size}
        aria-label="More options"
        onClick={() => setOpen(!open)}
        className="rounded-l-none! border-l border-white/35 px-2!"
      >
        <ChevronDown size={14} strokeWidth={2} />
      </Button>
      <Menu open={open} onClose={() => setOpen(false)} className="top-9 right-0 w-48">{menu}</Menu>
    </span>
  );
}

// 28px square ghost icon button.
export function IconBtn({ className, ...props }) {
  return (
    <button
      className={cn('inline-flex h-7 w-7 items-center justify-center rounded-sm text-ink-2 transition-colors duration-100 hover:bg-hover hover:text-ink', className)}
      {...props}
    />
  );
}

// Input - bg-code at rest, border-strong + accent ring on focus. 32px.
export function Input({ className, ...props }) {
  return (
    <input
      className={cn(
        'h-8 w-full rounded-sm border border-transparent bg-code px-2 text-sm transition-[border-color,box-shadow] duration-100 outline-none placeholder:text-ink-3 focus:border-line-strong focus:bg-white focus:shadow-[0_0_0_2px_rgba(35,131,226,0.2)]',
        className,
      )}
      {...props}
    />
  );
}

// Notion's hover affordance (the "⧉ OPEN" pill): bordered, tiny caps, one faint line shadow.
// Reveal on row hover with `opacity-0 group-hover:opacity-100`.
export function PillButton({ className, ...props }) {
  return (
    <button
      className={cn(
        'inline-flex h-6 items-center gap-1 rounded-sm border border-line bg-white px-1.5 text-[11px] font-medium tracking-wide text-ink-2 uppercase shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-colors duration-100 select-none hover:border-line-strong hover:bg-white hover:text-ink disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}

// Property pills - Notion's tag palette (design/notion.md §1).
export const TAG = {
  grey: ['#E3E2E0', '#32302C'],
  brown: ['#EEE0DA', '#442A1E'],
  orange: ['#FADEC9', '#49290E'],
  yellow: ['#FDECC8', '#402C1B'],
  green: ['#DBEDDB', '#1C3829'],
  blue: ['#D3E5EF', '#183347'],
  purple: ['#E8DEEE', '#412454'],
  pink: ['#F5E0E9', '#4C2337'],
  red: ['#FFE2DD', '#5D1715'],
};

export function Pill({ className, color = 'grey', children, ...props }) {
  const [bg, text] = TAG[color] || TAG.grey;
  return (
    <span
      style={{ background: bg, color: text }}
      className={cn('inline-flex h-5 items-center gap-1 rounded-sm px-1.5 text-xs leading-none font-medium whitespace-nowrap', className)}
      {...props}
    >
      {children}
    </span>
  );
}

// Status → tag color: running blue, finished green, failed red, skipped grey, queued yellow.
const STATUS_COLOR = { running: 'blue', finished: 'green', failed: 'red', skipped: 'grey', queued: 'yellow', stopped: 'grey' };
export const StatusPill = ({ status, className }) => (
  <Pill color={STATUS_COLOR[status] || 'grey'} className={className}>{status}</Pill>
);

// Avatar chips keep the tag palette hashed by email - a person keeps their color everywhere.
const AVATAR_BG = ['#D3E5EF', '#DBEDDB', '#FADEC9', '#E8DEEE', '#F5E0E9', '#FDECC8', '#EEE0DA'];
export function Avatar({ email, className }) {
  const i = [...email].reduce((h, c) => h + c.charCodeAt(0), 0) % AVATAR_BG.length;
  return (
    <span
      title={email}
      style={{ background: AVATAR_BG[i] }}
      className={cn('inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-ink uppercase ring-1 ring-white', className)}
    >
      {email[0]}
    </span>
  );
}

export const Tabs = TabsPrimitive.Root;
export function TabsList({ className, pill = false, ...props }) {
  // pill = segmented control: one outer pill track, the active segment fills dark
  return <TabsPrimitive.List className={cn(pill ? 'inline-flex w-max items-center gap-0.5 rounded-full border border-line bg-hover p-0.5' : 'flex gap-4 border-b border-line', className)} {...props} />;
}
export function TabsTrigger({ className, pill = false, ...props }) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        pill
          ? 'flex h-7 items-center rounded-full px-3.5 text-sm text-ink-2 transition-colors duration-100 hover:text-ink disabled:pointer-events-none disabled:opacity-40 data-[state=active]:bg-ink data-[state=active]:font-medium data-[state=active]:text-white'
          : cn(
              '-mb-px flex h-8 items-center border-b-2 border-transparent text-sm text-ink-2 transition-colors duration-100 hover:text-ink',
              'data-[state=active]:border-ink data-[state=active]:font-medium data-[state=active]:text-ink',
            ),
        className,
      )}
      {...props}
    />
  );
}
export const TabsContent = TabsPrimitive.Content;

// The product mark (E2: a small cloud, boxed) in currentColor - themes for free.
export function Mark({ size = 20, className }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} aria-label="small deploy">
      <rect x="2" y="2" width="28" height="28" rx="7" fill="none" stroke="currentColor" strokeWidth="2.5" />
      <path transform="translate(6.2 7) scale(0.83)" fill="currentColor" d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
    </svg>
  );
}

// Empty state - one quiet line, one ghost action. Nothing else.
export function EmptyState({ icon: Icon, children, action, className }) {
  return (
    <div className={cn('flex flex-col items-center gap-2 py-12 text-sm text-ink-2', className)}>
      {Icon && <Icon size={20} strokeWidth={1.5} />}
      <div>{children}</div>
      {action}
    </div>
  );
}

// Skeleton rows - bg-hover bars at real row height, no spinners on navigation.
export function SkeletonRows({ rows = 4, className }) {
  return (
    <div className={className} aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex h-8 items-center gap-3 border-b border-line px-2">
          <i className="block h-3 w-[22%] rounded-xs bg-hover" />
          <i className="block h-3 w-[10%] rounded-xs bg-hover" />
          <i className="block h-3 w-[14%] rounded-xs bg-hover" />
        </div>
      ))}
    </div>
  );
}

// ─── Toasts - bottom-left, dark, 3s. `toast('Copied')` from anywhere. ───
// A failure goes bottom-right instead and stays until dismissed, with a copy
// button: an error worth showing is an error worth pasting somewhere.
export function toast(message, options = {}) {
  window.dispatchEvent(new CustomEvent('small:toast', { detail: { message: String(message), ...options } }));
}

export function Toasts() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    const on = (e) => {
      const id = Math.random();
      const { message, tone } = typeof e.detail === 'string' ? { message: e.detail } : e.detail;
      setItems((t) => [...t, { id, msg: message, tone }]);
      if (tone !== 'error') setTimeout(() => setItems((t) => t.filter((x) => x.id !== id)), 3000);
    };
    window.addEventListener('small:toast', on);
    return () => window.removeEventListener('small:toast', on);
  }, []);
  if (!items.length) return null;
  const drop = (id) => setItems((t) => t.filter((x) => x.id !== id));
  const notes = items.filter((t) => t.tone !== 'error');
  const errors = items.filter((t) => t.tone === 'error');
  // One bottom-right column (WP6 closeout, user 2026-09-29): errors above info, the two never overlapping, never
  // bottom-left. It clears the dev Agent Bar (--agent-bar-h, unset live) or, with no bar, the phone's safe area.
  return (
    <div className="fixed right-4 bottom-[max(calc(var(--agent-bar-h,0px)+1rem),calc(1rem+env(safe-area-inset-bottom)))] z-50 flex max-w-[min(24rem,calc(100vw-2rem))] flex-col items-end gap-2">
      {errors.map((t) => (
        <div key={t.id} data-toast-error className="flex items-start gap-2 rounded-lg border border-red-600/30 bg-ink px-3 py-2.5 text-sm text-white shadow-pop animate-[toast-in_150ms_ease-out]">
          <TriangleAlert size={15} className="mt-0.5 shrink-0 text-red-400" />
          <span className="min-w-0 flex-1 break-words">{t.msg}</span>
          <button type="button" data-toast-copy title="Copy this message" aria-label="Copy this message"
            onClick={() => { navigator.clipboard.writeText(t.msg); toast('Copied'); }}
            className="shrink-0 rounded p-1 text-white/70 hover:bg-white/10 hover:text-white"><CopyIcon size={14} /></button>
          <button type="button" data-toast-close title="Dismiss" aria-label="Dismiss"
            onClick={() => drop(t.id)}
            className="shrink-0 rounded p-1 text-white/70 hover:bg-white/10 hover:text-white"><X size={14} /></button>
        </div>
      ))}
      {notes.map((t) => (
        <div key={t.id} className="rounded-md bg-ink px-3 py-2.5 text-sm text-white shadow-pop animate-[toast-in_150ms_ease-out]">
          {t.msg}
        </div>
      ))}
    </div>
  );
}

// ─── SlidePanel - the Notion side peek. A real slide: mounted transform transition
// (200ms ease-out per notion.md), GPU-composited, animates in AND out. ───
export function useSidebarInset() {
  const read = () => Math.max(0, document.querySelector('[data-shell-sidebar]')?.getBoundingClientRect().right || 0);
  const [inset, setInset] = useState(read);
  useEffect(() => {
    const sidebar = document.querySelector('[data-shell-sidebar]');
    const update = () => setInset(read());
    const observer = new ResizeObserver(update);
    if (sidebar) observer.observe(sidebar);
    window.addEventListener('resize', update);
    update();
    return () => { observer.disconnect(); window.removeEventListener('resize', update); };
  }, []);
  return inset;
}

// Chat's existing page dimensions are shared by every enlarged view.
export function ExpandedPageFrame({ expanded = true, wide = false, children }) {
  return <div className={expanded
    ? `expanded-page-frame mx-auto flex h-full w-full ${wide ? 'max-w-[900px]' : 'max-w-[780px]'} min-h-0 flex-col px-6 py-6`
    : 'flex min-h-0 w-full flex-1 flex-col'}>{children}</div>;
}

export function PeekBreadcrumbs({ items }) {
  return <nav aria-label="Breadcrumb" className="flex shrink-0 flex-wrap items-center gap-1 pb-6 text-sm text-ink-2">
    {items.map((item, i) => <span key={i} className="inline-flex min-w-0 items-center gap-1">
      {i > 0 && <span aria-hidden="true">/</span>}
      {item.onClick ? <button className="rounded-sm px-1 py-0.5 hover:bg-hover hover:text-ink" onClick={item.onClick}>{item.label}</button>
        : <span className="truncate px-1" aria-current={i === items.length - 1 ? 'page' : undefined}>{item.label}</span>}
    </span>)}
  </nav>;
}

const MIN_PEEK_W = 380;

export function SlidePanel({ title, width = 560, z = 30, onClose, children, expandable = false, breadcrumbs = [] }) {
  const [shown, setShown] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const expandedRef = useRef(false);
  expandedRef.current = expanded;
  const sidebarInset = useSidebarInset();
  const closing = useRef(false);
  // user-resized width, remembered per default size so 400-wide dialogs and
  // 560-wide peeks keep independent widths
  const widthKey = `small.peek-w.${width}`;
  const [userW, setUserW] = useState(() => Number(localStorage.getItem(widthKey)) || width);
  const [dragging, setDragging] = useState(false);
  const clampW = (w) => Math.min(Math.max(w, MIN_PEEK_W), Math.max(MIN_PEEK_W, window.innerWidth - sidebarInset - 80));
  const setWidth = (w) => {
    const c = clampW(w);
    setUserW(c);
    localStorage.setItem(widthKey, String(c));
  };
  const startDrag = (e) => {
    e.preventDefault();
    const startX = e.clientX, startW = userW;
    setDragging(true);
    const move = (ev) => setWidth(startW + (startX - ev.clientX));
    const up = () => {
      setDragging(false);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  useEffect(() => {
    // double rAF so the initial off-screen frame paints before the transition starts
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)));
    return () => cancelAnimationFrame(raf);
  }, []);
  const close = () => {
    if (closing.current) return;
    closing.current = true;
    setShown(false);
    setTimeout(onClose, 210);
  };
  useEffect(() => {
    const esc = (e) => { if (e.key === 'Escape') { if (expandedRef.current) setExpanded(false); else close(); } };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, []);
  // portal to <body>: a panel opened from INSIDE another panel must escape its
  // transformed ancestor (will-change made it the containing block, clipping the
  // nested peek) - portaled, the later panel simply covers the earlier one
  return createPortal(
    <div
      role="dialog"
      aria-label={typeof title === 'string' ? title : undefined}
      style={{
        width: expanded ? 'calc(100vw - ' + sidebarInset + 'px)' : clampW(userW),
        maxWidth: 'calc(100vw - ' + sidebarInset + 'px)',
        zIndex: z,
        transform: shown ? 'translate3d(0,0,0)' : 'translate3d(102%,0,0)',
        transition: 'transform 200ms cubic-bezier(0.25,1,0.35,1)', // one motion constant with the sidebar slide (Shell.jsx)
      }}
      className={cn('fixed inset-y-0 right-0 flex max-w-full flex-col overflow-x-clip bg-white will-change-transform', !expanded && 'border-l border-line')}
    >
      {!expanded && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize panel"
          tabIndex={0}
          onPointerDown={startDrag}
          onDoubleClick={() => setWidth(width)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft') { e.preventDefault(); setWidth(userW + 24); }
            if (e.key === 'ArrowRight') { e.preventDefault(); setWidth(userW - 24); }
          }}
          className={cn(
            'absolute inset-y-0 left-0 z-10 w-1.5 cursor-col-resize transition-colors hover:bg-line focus-visible:bg-line',
            dragging && 'bg-line',
          )}
        />
      )}
      <ExpandedPageFrame expanded={expanded}>
      {expanded && breadcrumbs.length > 0 && <PeekBreadcrumbs items={breadcrumbs} />}
      <div className={cn('flex h-11 shrink-0 items-center justify-between', !expanded && 'pr-3 pl-4')}>
        <div className="flex min-w-0 items-center gap-2 text-[15px] font-semibold">{title}</div>
        <div className="ml-2 flex shrink-0 gap-1">{expandable && <IconBtn aria-label={expanded ? 'Minimize' : 'Open as page'} title={expanded ? 'Minimize' : 'Open as page'} onClick={() => setExpanded(!expanded)}>{expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}</IconBtn>}<IconBtn aria-label="Close" onClick={close}><X size={14} /></IconBtn></div>
      </div>
      {children}
      </ExpandedPageFrame>
    </div>,
    document.body,
  );
}

// ─── ShareInput - every sharing field autocompletes from the org's people pool
// and #teams. Click or ↑/↓ + Enter picks; Enter with nothing highlighted submits
// the typed value through the surrounding <form>. ───
export function ShareInput({ value, onChange, onPick, people = [], teams = [], exclude = [], placeholder, autoFocus, className }) {
  const [hi, setHi] = useState(-1);
  const q = value.trim().toLowerCase();
  const ex = new Set(exclude.filter(Boolean).map((e) => String(e).toLowerCase()));
  const isTag = q.startsWith('#');
  const qq = isTag ? q.slice(1) : q;
  const items = q
    ? [
        ...(!isTag ? people.filter((e) => !ex.has(e.toLowerCase()) && e.toLowerCase().includes(qq)).map((e) => ({ email: e })) : []),
        ...teams.filter((t) => !ex.has(`#${t.name}`) && t.name.includes(qq)).map((t) => ({ team: t.name, count: t.members?.length })),
      ].slice(0, 5)
    : [];
  const pick = (it) => { setHi(-1); onPick(it); };
  return (
    <div className={cn('relative', className)}>
      <Input
        autoFocus={autoFocus}
        value={value}
        placeholder={placeholder}
        onChange={(e) => { onChange(e.target.value); setHi(-1); }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(h + 1, items.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(h - 1, -1)); }
          else if (e.key === 'Enter' && hi >= 0 && items[hi]) { e.preventDefault(); pick(items[hi]); }
        }}
      />
      {items.length > 0 && (
        <div className="absolute right-0 left-0 z-20 mt-1 rounded-md bg-white p-1 shadow-pop">
          {items.map((it, i) => (
            <button
              key={it.team ? `#${it.team}` : it.email}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); pick(it); }}
              className={cn('flex h-8 w-full items-center gap-2 rounded-sm px-2 text-left text-sm hover:bg-hover', i === hi && 'bg-hover')}
            >
              {it.team
                ? <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-hover">#</span>
                : <Avatar email={it.email} />}
              <span className="min-w-0 flex-1 truncate">{it.team ? `#${it.team}` : it.email}</span>
              {it.team && it.count != null && <span className="text-xs text-ink-2">{it.count} people</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── ConfirmDialog - the one modal (Delete only, per notion.md §7): item name in
// the body, red primary button. ───
export function ConfirmDialog({ title, body, confirmLabel = 'Delete', confirmVariant = 'danger', onConfirm, onCancel }) {
  useEffect(() => {
    const esc = (e) => e.key === 'Escape' && onCancel();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, []);
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/20 animate-[fade-in_100ms_ease-out]" onMouseDown={onCancel}>
      <div role="dialog" aria-modal="true" aria-label={title} className="mt-[26vh] w-96 max-w-[90vw] rounded-2xl bg-white p-4 shadow-pop" onMouseDown={(e) => e.stopPropagation()}>
        <div className="pb-1 text-sm font-semibold">{title}</div>
        <div className="pb-4 text-sm text-ink-2">{body}</div>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel}>Cancel</Button>
          <Button variant={confirmVariant} onClick={onConfirm}>{confirmLabel}</Button>
        </div>
      </div>
    </div>
  );
}

// ─── Menu - white popover, shadow-pop, 28px items. Closes on outside click. ───
export function Menu({ open, onClose, className, style, portal = false, children }) {
  const box = useRef(null);
  useEffect(() => {
    if (!open) return;
    // pointerdown in the capture phase, not mousedown: the canvas surface
    // preventDefaults its pointer presses (drawing, panning), which suppresses
    // the compatibility mousedown - a click on the canvas would never close
    // the menu. Capture also beats any stopPropagation between here and the
    // press; presses inside the menu are told apart by containment instead.
    const close = event => { if (event?.target && box.current?.contains(event.target)) return; onClose(); };
    // defer so the opening click doesn't immediately close it
    const t = setTimeout(() => document.addEventListener('pointerdown', close, true), 0);
    // a portaled menu is pinned to viewport coords - scrolling under it must close it
    if (portal) window.addEventListener('scroll', close, true);
    const escape = event => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', escape);
    return () => { clearTimeout(t); document.removeEventListener('pointerdown', close, true); window.removeEventListener('keydown', escape); if (portal) window.removeEventListener('scroll', close, true); };
  }, [open]);
  if (!open) return null;
  const node = (
    <div
      ref={box}
      onMouseDown={(e) => e.stopPropagation()}
      style={style}
      className={cn(portal ? 'fixed z-50' : 'absolute z-20', 'w-60 rounded-md bg-white p-1 shadow-pop animate-[fade-in_100ms_ease-out]', className)}
    >
      {children}
    </div>
  );
  // portal escapes overflow-hidden/auto ancestors (settings modal panes etc.)
  return portal ? createPortal(node, document.body) : node;
}

// ─── Form controls (design/components.html "Inputs"). One field row: label 200px,
// control 320px, help under in text-2. ───
export function Field({ label, help, error, children }) {
  return (
    <div className="grid grid-cols-[200px_320px] items-start gap-x-4 py-2 max-md:grid-cols-1 max-md:gap-y-1">
      <label className="pt-1.5 text-sm font-medium">{label}</label>
      <div>
        {children}
        {/* help may carry a long example uri - let it run past the 320px control
            column (page space to the right is empty) instead of folding into 3 lines */}
        {error ? <div className="mt-1 text-xs text-danger">{error}</div> : help ? <div className="mt-1 w-max max-w-xl text-xs break-words text-ink-2">{help}</div> : null}
      </div>
    </div>
  );
}

// 30×16 Notion toggle - accent when on, 12px knob.
export function Toggle({ on, onChange, ...props }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={!!on}
      onClick={() => onChange(!on)}
      className={cn('relative h-4 w-[30px] shrink-0 cursor-pointer rounded-full border-0 transition-colors duration-100', on ? 'bg-accent' : 'bg-[#E3E2E0]')}
      {...props}
    >
      <span className={cn('absolute top-0.5 left-0.5 block h-3 w-3 rounded-full bg-white transition-transform duration-100', on && 'translate-x-3.5')} />
    </button>
  );
}

// Slider - 2px track, accent fill, 16px white knob with pop shadow, 64px number field.
export function Slider({ min = 0, max = 1, step, value, onChange, inputProps }) {
  const track = useRef(null);
  const pct = Math.min(100, Math.max(0, ((Number(value) - min) / (max - min)) * 100 || 0));
  const fromX = (clientX) => {
    const r = track.current.getBoundingClientRect();
    let v = min + ((clientX - r.left) / r.width) * (max - min);
    const s = step || (max - min > 10 ? 1 : 0.05);
    v = Math.round(v / s) * s;
    return Math.min(max, Math.max(min, Number(v.toFixed(4))));
  };
  const drag = (e) => {
    e.preventDefault();
    onChange(fromX(e.clientX));
    const move = (ev) => onChange(fromX(ev.clientX));
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  return (
    <div className="flex h-8 items-center gap-3">
      <div ref={track} onPointerDown={drag} className="relative h-0.5 flex-1 cursor-pointer rounded-[1px] bg-line">
        <div className="absolute top-0 left-0 h-0.5 bg-accent" style={{ width: `${pct}%` }} />
        {/* literal white: bg-white remaps to the dark page surface in dark mode and the knob vanishes */}
        <div className="absolute -top-[7px] h-4 w-4 -translate-x-2 rounded-full bg-[#ffffff] shadow-pop" style={{ left: `${pct}%` }} />
      </div>
      <Input
        {...inputProps}
        // style width: the base Input carries w-full, and utility order (not class
        // order) would decide the conflict - inline wins deterministically
        style={{ width: 64, flex: 'none' }}
        className={cn('text-right tabular-nums', inputProps?.className)}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

// Select - input-styled trigger, chevron, shadow-pop option list; a search field
// tops the menu past ~6 options. Trigger toggles on mousedown so closing doesn't
// race Menu's outside-mousedown close into a reopen.
export function Select({ value, options = [], placeholder = 'Select…', onChange, ...props }) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState(null); // trigger position at open time (menu portals to body)
  const [q, setQ] = useState('');
  const shown = q.trim() ? options.filter((o) => String(o).toLowerCase().includes(q.trim().toLowerCase())) : options;
  return (
    <div className="relative">
      <button
        type="button"
          {...props}
          onMouseDown={(e) => { e.stopPropagation(); setRect(e.currentTarget.getBoundingClientRect()); setOpen(!open); setQ(''); }}
        className="flex h-8 w-full cursor-pointer items-center rounded-sm border border-transparent bg-code px-2 pr-7 text-left text-sm transition-[border-color,box-shadow] duration-100 outline-none focus:border-line-strong focus:bg-white focus:shadow-[0_0_0_2px_rgba(35,131,226,0.2)]"
      >
        <span className={cn('min-w-0 flex-1 truncate', value == null || value === '' ? 'text-ink-3' : undefined)}>{value == null || value === '' ? placeholder : String(value)}</span>
        <ChevronDown size={16} strokeWidth={1.5} className="pointer-events-none absolute right-2 text-ink-3" />
      </button>
      <Menu
        open={open}
        onClose={() => setOpen(false)}
        portal
        className="w-auto"
        style={rect ? { top: rect.bottom + 4, left: rect.left, minWidth: rect.width } : undefined}
      >
        {options.length > 6 && (
          <div className="p-1 pb-1.5"><Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="h-7" /></div>
        )}
        <div className="max-h-56 overflow-y-auto">
          {shown.map((o) => (
            <MenuItem key={String(o)} type="button" onClick={() => { onChange(o); setOpen(false); }}>
              <span className="flex w-full items-center">{String(o)}{String(o) === String(value) && <Check size={16} strokeWidth={1.5} className="ml-auto text-ink-2" />}</span>
            </MenuItem>
          ))}
        </div>
      </Menu>
    </div>
  );
}

// 14px square checkbox (the table .chk) - usable in checkbox groups too.
export function Chk({ on, className, ...props }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={!!on}
      className={cn(
        'inline-flex h-3.5 w-3.5 shrink-0 cursor-pointer items-center justify-center rounded-[3px] border transition-colors duration-100',
        on ? 'border-accent bg-accent text-white' : 'border-line-strong bg-white',
        className,
      )}
      {...props}
    >
      {on && <Check size={10} strokeWidth={2.5} />}
    </button>
  );
}

// Dropzone - dashed 80px empty state; filled: 40px solid row with name, size, remove.
export function Dropzone({ accept, file, onFile }) {
  const inp = useRef(null);
  const [over, setOver] = useState(false);
  if (file) {
    return (
      <div className="flex h-10 items-center justify-between rounded-sm border border-line-strong bg-code px-3 text-sm">
        <span className="flex min-w-0 items-center gap-1.5">
          <FileIcon size={16} strokeWidth={1.5} className="shrink-0 text-ink-2" />
          <span className="truncate">{file.name}</span>
          <span className="shrink-0 text-xs text-ink-2">{fmtBytes(file.size)}</span>
        </span>
        <IconBtn aria-label="Remove file" onClick={() => onFile(null)}><X size={14} /></IconBtn>
      </div>
    );
  }
  return (
    <div
      onClick={() => inp.current.click()}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); if (e.dataTransfer.files[0]) onFile(e.dataTransfer.files[0]); }}
      className={cn(
        'flex h-20 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-sm border border-dashed border-line-strong bg-code text-sm text-ink-2 transition-colors duration-100 hover:bg-hover',
        over && 'bg-hover',
      )}
    >
      <Upload size={16} strokeWidth={1.5} />
      Drop a file or click to browse
      <input ref={inp} type="file" accept={accept} className="hidden" onChange={(e) => e.target.files[0] && onFile(e.target.files[0])} />
    </div>
  );
}

// Code block - bg-code, mono 13px, pre; Copy appears top-right on hover.
// scrollRef reaches the <pre> (the real scroll container) for live-tail autoscroll.
export function CodeBlock({ className, scrollRef, children }) {
  const pre = useRef(null);
  const setRef = (el) => { pre.current = el; if (scrollRef) scrollRef.current = el; };
  return (
    <div className="group relative">
      <pre ref={setRef} className={cn('overflow-x-auto rounded-sm bg-code p-4 font-mono text-[13px] leading-normal whitespace-pre text-ink', className)}>{children}</pre>
      <IconBtn
        aria-label="Copy"
        className="absolute top-2 right-2 bg-code opacity-0 group-hover:opacity-100"
        onClick={() => { navigator.clipboard.writeText(pre.current?.innerText || ''); toast('Copied'); }}
      >
        <CopyIcon size={14} strokeWidth={1.5} />
      </IconBtn>
    </div>
  );
}

export function fmtBytes(n) {
  if (n == null) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function MenuItem({ icon: Icon, className, children, ...props }) {
  return (
    <button
      className={cn('flex h-7 w-full items-center gap-2 rounded-sm px-2 text-left text-sm text-ink hover:bg-hover', className)}
      {...props}
    >
      {Icon && <Icon size={16} strokeWidth={1.5} className="shrink-0 text-ink-2" />}
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </button>
  );
}

// the product mark (favicon set) as an inline icon; brand rule: never lucide Sparkles
export const AppIcon = ({ size = 15, className }) => (
  <img src="/icon-32.png" alt="" width={size} height={size} className={className} />
);

// Pointer-based column-header drag: horizontal only, live reorder, and a FLIP
// slide so headers visibly glide into place. th elements need data-col.
// Returns { down, dragCol, squelch } - wire down(key) to onPointerDown and skip
// the click menu when squelch.current is true.
export function useHeaderDrag(moveCol) {
  const dragRef = useRef(null);
  const squelch = useRef(false);
  const [dragCol, setDragCol] = useState(null);
  const down = (k) => (e) => {
    if (e.button !== 0) return;
    if (e.target.dataset?.resize) return; // resize handles keep their own drag
    const row = e.currentTarget.parentElement;
    const grab = () => {
      const r = {};
      [...row.children].forEach((c) => { if (c.dataset.col) r[c.dataset.col] = c.getBoundingClientRect(); });
      return r;
    };
    const startRects = grab();
    dragRef.current = {
      key: k, startX: e.clientX, moved: false, rects: startRects, last: null,
      grabOff: e.clientX - (startRects[k]?.left ?? e.clientX), // pointer offset inside the header
      layoutLeft: startRects[k]?.left ?? 0, // the header's untransformed x
      lastX: e.clientX,
    };
    const dragged = () => [...row.children].find((c) => c.dataset.col === k);
    const move = (ev) => {
      const d = dragRef.current;
      if (!d) return;
      d.lastX = ev.clientX;
      if (!d.moved && Math.abs(ev.clientX - d.startX) < 5) return;
      if (!d.moved) { d.moved = true; setDragCol(d.key); document.body.style.cursor = 'grabbing'; }
      // the grabbed header follows the pointer 1:1; neighbours FLIP around it
      const el = dragged();
      if (el) {
        el.style.transform = `translateX(${(ev.clientX - d.grabOff) - d.layoutLeft}px)`;
        el.style.zIndex = 20;
      }
      // insertion point = position among the OTHER columns' centers - stable
      // thresholds (no ping-pong) and the extremes are reachable
      const others = Object.entries(d.rects).filter(([k2]) => k2 !== d.key).sort((a, b) => a[1].left - b[1].left);
      const idx = others.findIndex(([, r]) => ev.clientX < r.left + r.width / 2);
      const place = idx === -1 ? `after:${others[others.length - 1][0]}` : `before:${others[idx][0]}`;
      if (place !== d.place) {
        if (d.place !== undefined) {
          const [mode, key] = place.split(':');
          const before = d.rects;
          moveCol(d.key, key, mode === 'after');
          requestAnimationFrame(() => {
            const dd = dragRef.current;
            if (!dd) return;
            const el2 = dragged();
            if (el2) {
              // re-anchor the grabbed header to its new layout slot, keep it under the pointer
              el2.style.transform = '';
              dd.layoutLeft = el2.getBoundingClientRect().left;
              el2.style.transform = `translateX(${(dd.lastX - dd.grabOff) - dd.layoutLeft}px)`;
              el2.style.zIndex = 20;
            }
            [...row.children].forEach((c) => {
              const ck = c.dataset.col;
              if (!ck || ck === dd.key || !before[ck]) return;
              const dx = before[ck].left - c.getBoundingClientRect().left;
              if (dx) c.animate([{ transform: `translateX(${dx}px)` }, { transform: 'translateX(0)' }], { duration: 180, easing: 'cubic-bezier(0.2, 0, 0, 1)' });
            });
            dd.rects = grab();
          });
        }
        d.place = place;
      }
    };
    const up = () => {
      const d = dragRef.current;
      dragRef.current = null;
      setDragCol(null);
      document.body.style.cursor = '';
      const el = d && [...row.children].find((c) => c.dataset.col === d.key);
      if (el) {
        // settle: glide from wherever the pointer left it back into the slot
        const from = el.style.transform;
        el.style.transform = '';
        el.style.zIndex = '';
        if (from) el.animate([{ transform: from }, { transform: 'translateX(0)' }], { duration: 160, easing: 'ease-out' });
      }
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (d?.moved) squelch.current = true;
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  return { down, dragCol, squelch };
}

// Shared settings layout: description at left, action aligned at right.
export function SettingsRow({ title, desc, children }) {
  return (
    <div className="flex items-center justify-between gap-8 py-3">
      <div>
        <div className="text-sm">{title}</div>
        {desc && <div className="pt-0.5 text-xs text-ink-2">{desc}</div>}
      </div>
      {children && <div className="shrink-0">{children}</div>}
    </div>
  );
}

// Hover/focus tooltip, Notion-style inverted chrome: bold label line, plain info under it.
export function Tip({ label, info, children }) {
  return (
    <span className="group/tip relative inline-flex min-w-0">
      {children}
      <span role="tooltip" className="pointer-events-none absolute top-full left-1/2 z-50 mt-1.5 hidden w-max max-w-60 -translate-x-1/2 flex-col rounded-md bg-ink px-2.5 py-1.5 text-left whitespace-normal shadow-pop group-hover/tip:flex group-focus-within/tip:flex">
        <span className="text-xs font-semibold text-white">{label}</span>
        {info && <span className="pt-0.5 text-xs font-normal text-white/75">{info}</span>}
      </span>
    </span>
  );
}

// Notion-style submenu row: hover (or click) opens a flyout to the right.
export function SubMenu({ icon: Icon, label, hint, open, onOpen, children, width = 'w-52' }) {
  return (
    <div className="relative" onMouseEnter={onOpen}>
      <button className="flex h-7 w-full items-center gap-2 rounded-sm px-2 text-left text-sm text-ink hover:bg-hover" onClick={onOpen}>
        {Icon && <Icon size={16} strokeWidth={1.5} className="shrink-0 text-ink-2" />}
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {hint && <span className="shrink-0 text-xs text-ink-3">{hint}</span>}
        <ChevronRight size={14} strokeWidth={1.5} className="shrink-0 text-ink-3" />
      </button>
      {open && (
        <div className={cn('absolute top-0 left-full z-30 ml-1 rounded-md bg-white p-1 shadow-pop', width)} onMouseDown={(e) => e.stopPropagation()}>
          {children}
        </div>
      )}
    </div>
  );
}

// Search-as-you-type value list for filter flyouts - never dumps hundreds of rows.
export function ValuePicker({ values, label = (v) => String(v), onPick }) {
  const [q, setQ] = useState('');
  const shown = values.filter((v) => String(label(v)).toLowerCase().includes(q.toLowerCase())).slice(0, 10);
  return (
    <>
      {values.length > 6 && (
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search values…"
          onMouseDown={(e) => e.stopPropagation()}
          className="mb-1 h-7 w-full rounded-sm bg-code px-2 text-sm outline-none"
        />
      )}
      {shown.map((v) => (
        <MenuItem key={String(v)} onClick={(e) => { e.stopPropagation(); onPick(v); }}>{label(v)}</MenuItem>
      ))}
      {shown.length === 0 && <div className="px-2 py-1 text-xs text-ink-3">No matches</div>}
      {values.length > 10 && shown.length >= 10 && <div className="px-2 py-1 text-xs text-ink-3">{values.length} values, type to narrow</div>}
    </>
  );
}
