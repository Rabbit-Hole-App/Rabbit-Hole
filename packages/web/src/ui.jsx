import { useEffect, useRef, useState } from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { clsx as cn } from 'clsx';
import { Clock, Globe, Play, X } from 'lucide-react';

export { cn };

// ─── The component kit. Pixel reference: design/components.html (read-only). ───
// Sizes: buttons/inputs/table rows 32px, small 28px, sidebar rows 28px, pills 20px.
// Radius 4px (rounded-sm), popovers 6px (rounded-md). Shadow only on popovers.

// Kind icon per app: Globe server, Play job, Clock scheduled job. 16px, stroke 1.5.
export const KindIcon = ({ kind, schedule, size = 16 }) => {
  const I = kind === 'job' ? (schedule ? Clock : Play) : Globe;
  return <I size={size} strokeWidth={1.5} className="shrink-0 text-ink-2" />;
};

// Buttons — primary (accent), secondary (bordered), ghost (default for most actions), danger.
export function Button({ className, variant = 'ghost', size, ...props }) {
  return (
    <button
      className={cn(
        'inline-flex items-center gap-1.5 rounded-sm border-0 text-sm font-medium whitespace-nowrap transition-colors duration-100 select-none focus-visible:outline-2 focus-visible:outline-accent/35 disabled:cursor-default disabled:opacity-50',
        size === 'sm' ? 'h-7 px-2 text-[13px]' : 'h-8 px-3',
        variant === 'primary' && 'bg-accent text-white hover:bg-accent-hover',
        variant === 'secondary' && 'border border-line text-ink hover:bg-hover',
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

// 28px square ghost icon button.
export function IconBtn({ className, ...props }) {
  return (
    <button
      className={cn('inline-flex h-7 w-7 items-center justify-center rounded-sm text-ink-2 transition-colors duration-100 hover:bg-hover hover:text-ink', className)}
      {...props}
    />
  );
}

// Input — bg-code at rest, border-strong + accent ring on focus. 32px.
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
        'inline-flex h-6 items-center gap-1 rounded-sm border border-line bg-white px-1.5 text-[11px] font-medium tracking-wide text-ink-2 uppercase shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-colors duration-100 select-none hover:bg-hover hover:text-ink disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}

// Property pills — Notion's tag palette (design/notion.md §1).
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

// Avatar chips keep the tag palette hashed by email — a person keeps their color everywhere.
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
export function TabsList({ className, ...props }) {
  return <TabsPrimitive.List className={cn('flex gap-4 border-b border-line', className)} {...props} />;
}
export function TabsTrigger({ className, ...props }) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        '-mb-px flex h-8 items-center border-b-2 border-transparent text-sm text-ink-2 transition-colors duration-100 hover:text-ink',
        'data-[state=active]:border-ink data-[state=active]:font-medium data-[state=active]:text-ink',
        className,
      )}
      {...props}
    />
  );
}
export const TabsContent = TabsPrimitive.Content;

// Empty state — one quiet line, one ghost action. Nothing else.
export function EmptyState({ icon: Icon, children, action, className }) {
  return (
    <div className={cn('flex flex-col items-center gap-2 py-12 text-sm text-ink-2', className)}>
      {Icon && <Icon size={20} strokeWidth={1.5} />}
      <div>{children}</div>
      {action}
    </div>
  );
}

// Skeleton rows — bg-hover bars at real row height, no spinners on navigation.
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

// ─── Toasts — bottom-left, dark, 3s. `toast('Copied')` from anywhere. ───
export function toast(message) {
  window.dispatchEvent(new CustomEvent('small:toast', { detail: message }));
}

export function Toasts() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    const on = (e) => {
      const id = Math.random();
      setItems((t) => [...t, { id, msg: e.detail }]);
      setTimeout(() => setItems((t) => t.filter((x) => x.id !== id)), 3000);
    };
    window.addEventListener('small:toast', on);
    return () => window.removeEventListener('small:toast', on);
  }, []);
  if (!items.length) return null;
  return (
    <div className="fixed bottom-4 left-4 z-50 flex flex-col gap-2">
      {items.map((t) => (
        <div key={t.id} className="rounded-md bg-ink px-3 py-2.5 text-sm text-white shadow-pop animate-[toast-in_150ms_ease-out]">
          {t.msg}
        </div>
      ))}
    </div>
  );
}

// ─── SlidePanel — the Notion side peek. A real slide: mounted transform transition
// (200ms ease-out per notion.md), GPU-composited, animates in AND out. ───
export function SlidePanel({ title, width = 560, onClose, children }) {
  const [shown, setShown] = useState(false);
  const closing = useRef(false);
  useEffect(() => {
    // double rAF so the initial off-screen frame paints before the transition starts
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)));
    return () => cancelAnimationFrame(raf);
  }, []);
  const close = () => {
    if (closing.current) return;
    closing.current = true;
    setShown(false);
    setTimeout(onClose, 220);
  };
  useEffect(() => {
    const esc = (e) => e.key === 'Escape' && close();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, []);
  return (
    <div
      role="dialog"
      aria-label={typeof title === 'string' ? title : undefined}
      style={{
        width,
        transform: shown ? 'translate3d(0,0,0)' : 'translate3d(102%,0,0)',
        transition: 'transform 220ms cubic-bezier(0.25,1,0.35,1)',
      }}
      className="fixed inset-y-0 right-0 z-30 flex max-w-full flex-col bg-white shadow-[-1px_0_0_#e9e9e7,-8px_0_24px_rgba(0,0,0,0.04)] will-change-transform"
    >
      <div className="flex shrink-0 items-center justify-between px-5 pt-4 pb-2">
        <div className="flex min-w-0 items-center gap-2 text-[15px] font-semibold">{title}</div>
        <IconBtn aria-label="Close" onClick={close}><X size={14} /></IconBtn>
      </div>
      {children}
    </div>
  );
}

// ─── ShareInput — every sharing field autocompletes from the org's people pool
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

// ─── ConfirmDialog — the one modal (Delete only, per notion.md §7): item name in
// the body, red primary button. ───
export function ConfirmDialog({ title, body, confirmLabel = 'Delete', onConfirm, onCancel }) {
  useEffect(() => {
    const esc = (e) => e.key === 'Escape' && onCancel();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, []);
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/20 animate-[fade-in_100ms_ease-out]" onMouseDown={onCancel}>
      <div className="mt-[26vh] w-96 max-w-[90vw] rounded-md bg-white p-4 shadow-pop" onMouseDown={(e) => e.stopPropagation()}>
        <div className="pb-1 text-sm font-semibold">{title}</div>
        <div className="pb-4 text-sm text-ink-2">{body}</div>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel}>Cancel</Button>
          <Button variant="danger" onClick={onConfirm}>{confirmLabel}</Button>
        </div>
      </div>
    </div>
  );
}

// ─── Menu — white popover, shadow-pop, 28px items. Closes on outside click. ───
export function Menu({ open, onClose, className, children }) {
  useEffect(() => {
    if (!open) return;
    const close = () => onClose();
    // defer so the opening click doesn't immediately close it
    const t = setTimeout(() => document.addEventListener('mousedown', close), 0);
    return () => { clearTimeout(t); document.removeEventListener('mousedown', close); };
  }, [open]);
  if (!open) return null;
  return (
    <div
      onMouseDown={(e) => e.stopPropagation()}
      className={cn('absolute z-20 w-60 rounded-md bg-white p-1 shadow-pop animate-[fade-in_100ms_ease-out]', className)}
    >
      {children}
    </div>
  );
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
