import { useEffect, useRef, useState } from 'react';
import { Check, Copy, Eye, Globe } from 'lucide-react';

// The Share popover for a Learn board (docs/features/canvas-sharing.md): one
// switch shares or stops sharing; the view link can be public (no sign-in).
// Shared boards are view-only - editing someone else's board means forking.
function Switch({ on, label, disabled = false, onChange }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)}
      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-40 ${on ? 'bg-[#2383e2]' : 'bg-line-strong'}`}>
      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${on ? 'left-[18px]' : 'left-0.5'}`} />
    </button>
  );
}

function LinkRow({ Icon, title, detail, token, on, disabled, onToggle, children }) {
  const [copied, setCopied] = useState(false);
  const url = token ? `${window.location.origin}/b/${token}` : '';
  const copy = () => navigator.clipboard?.writeText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1400); });
  return (
    <div className="rounded-lg border border-line p-2.5">
      <div className="flex items-center gap-2">
        <Icon size={14} className="shrink-0 text-ink-2" />
        <div className="min-w-0 flex-1">
          <div className="text-sm text-ink">{title}</div>
          <div className="text-xs text-ink-3">{detail}</div>
        </div>
        <Switch on={on} label={title} disabled={disabled} onChange={onToggle} />
      </div>
      {on && token && (
        <div className="mt-2 flex items-center gap-1.5">
          <input readOnly value={url} aria-label={`${title} URL`} onFocus={event => event.target.select()}
            className="min-w-0 flex-1 rounded-md border border-line bg-hover/50 px-2 py-1 text-xs text-ink-2" />
          <button type="button" onClick={copy} aria-label={`Copy ${title.toLowerCase()}`}
            className={`flex h-7 items-center gap-1 rounded-md px-2 text-xs ${copied ? 'text-green-700' : 'text-ink-2 hover:bg-hover hover:text-ink'}`}>
            {copied ? <Check size={13} /> : <Copy size={13} />}{copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      )}
      {children}
    </div>
  );
}

export default function SharePanel({ sharing, busy, error, onChange, onClose }) {
  const panel = useRef(null);
  useEffect(() => {
    const away = event => { if (!panel.current?.contains(event.target) && !event.target.closest?.('[data-share-button]')) onClose(); };
    const escape = event => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('pointerdown', away, true);
    window.addEventListener('keydown', escape);
    return () => { window.removeEventListener('pointerdown', away, true); window.removeEventListener('keydown', escape); };
  }, [onClose]);
  const current = sharing || { shared: false, view: null, edit: null, public_view: false };
  const set = patch => onChange({ shared: current.shared, view: !!current.view, public_view: current.public_view, ...patch });
  return (
    <div ref={panel} role="dialog" aria-label="Share this board"
      className="absolute top-full right-0 z-50 mt-2 w-96 rounded-xl border border-line bg-white p-3 shadow-lg">
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <div className="text-sm font-semibold text-ink">Share this board</div>
          <div className="text-xs text-ink-3">{current.shared ? 'People with a link below can open it.' : 'Only you can see this board.'}</div>
        </div>
        <Switch on={current.shared} label="Share this board" disabled={busy}
          onChange={on => set(on ? { shared: true, view: true } : { shared: false })} />
      </div>
      {current.shared && (
        <div className="mt-3 space-y-2">
          <LinkRow Icon={Eye} title="View link" detail={current.public_view ? 'Anyone with the link can view, no sign-in' : 'People who sign in can view'}
            token={current.view} on={!!current.view} disabled={busy} onToggle={on => set({ view: on, public_view: on && current.public_view })}>
            {current.view && (
              <label className="mt-2 flex items-center gap-2 text-xs text-ink-2">
                <Globe size={13} className="shrink-0" />
                <span className="flex-1">Public: no sign-in needed to view</span>
                <Switch on={current.public_view} label="Public view link" disabled={busy} onChange={on => set({ public_view: on })} />
              </label>
            )}
          </LinkRow>
          <p className="px-0.5 text-[11px] leading-snug text-ink-3">
            Shared boards are view-only; people fork them to make their own editable copy. Turning the link off stops it working; turning it on again makes a new one.
          </p>
        </div>
      )}
      {error && <p role="alert" className="mt-2 text-xs text-red-700">{error}</p>}
    </div>
  );
}
