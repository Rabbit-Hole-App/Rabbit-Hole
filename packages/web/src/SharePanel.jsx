import { useEffect, useRef, useState } from 'react';
import { Check, CircleAlert, Compass, Copy, Eye, FolderLock, Globe } from 'lucide-react';

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

// Publish to Explore (docs/features/explore-publish.md): a separate, explicit owner action from sharing. Published, the
// canvas is public and live - anyone finds it in Explore and opens it read-only, later edits included - until it is
// removed, which never touches the share links above. Its own /e/ link, not a share link.
function ExploreRow({ published, token, busy, onPublish }) {
  const [copied, setCopied] = useState(false);
  const url = token ? `${window.location.origin}/e/${token}` : '';
  const copy = () => navigator.clipboard?.writeText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1400); });
  return (
    <div data-explore-publish={published ? 'published' : 'private'} className="mt-3 rounded-lg border border-line p-2.5">
      <div className="flex items-start gap-2">
        <Compass size={14} className="mt-0.5 shrink-0 text-ink-2" />
        <div className="min-w-0 flex-1">
          <div className="text-sm text-ink">{published ? 'Published to Explore' : 'Publish to Explore'}</div>
          <div className="text-xs text-ink-3">{published
            ? 'Anyone can find it in Explore and open it read-only, signed in or not - including the edits you make now.'
            : 'Anyone will be able to find it in Explore and open it read-only - as it is now and with your later edits - until you remove it.'}</div>
        </div>
      </div>
      {published && token && (
        <div className="mt-2 flex items-center gap-1.5">
          <input readOnly value={url} aria-label="Explore link URL" onFocus={event => event.target.select()}
            className="min-w-0 flex-1 rounded-md border border-line bg-hover/50 px-2 py-1 text-xs text-ink-2" />
          <button type="button" onClick={copy} aria-label="Copy Explore link"
            className={`flex h-7 items-center gap-1 rounded-md px-2 text-xs ${copied ? 'text-green-700' : 'text-ink-2 hover:bg-hover hover:text-ink'}`}>
            {copied ? <Check size={13} /> : <Copy size={13} />}{copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      )}
      <div className="mt-2 flex justify-end">
        {published
          ? <button type="button" data-unpublish disabled={busy} onClick={() => onPublish(false)} className="h-7 rounded-md border border-line px-2.5 text-xs text-ink hover:bg-hover disabled:opacity-40">Remove from Explore</button>
          : <button type="button" data-publish disabled={busy} onClick={() => onPublish(true)} className="h-7 rounded-md bg-[#2383e2] px-2.5 text-xs font-medium text-white hover:bg-[#1f74c9] disabled:opacity-40">Publish to Explore</button>}
      </div>
    </div>
  );
}

// onRepository(allow): the owner's switch for a private repository's code on this link (docs/features/shared-canvas-ask.md).
// onPublish(publish): Publish to Explore / Remove from Explore - only for a top-level canvas.
export default function SharePanel({ sharing, busy, error, onChange, onRepository, onPublish = null, onClose }) {
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
          <div className="flex items-center gap-1.5 text-sm font-semibold text-ink">
            Share this board
            {/* The rules sit behind a ! so the panel stays short; hover or focus shows them. */}
            <span className="group relative flex">
              <button type="button" aria-label="How sharing works" aria-describedby="share-rules" className="flex text-ink-3 hover:text-ink">
                <CircleAlert size={14} strokeWidth={2} />
              </button>
              <span id="share-rules" role="tooltip"
                className="pointer-events-none absolute top-full left-1/2 z-10 mt-1.5 w-64 -translate-x-1/2 rounded-lg bg-ink px-2.5 py-2 text-[11px] leading-snug font-normal text-white opacity-0 shadow-md transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                Shared boards are view-only; people fork them to make their own editable copy. Turning the link off stops it working; turning it on again makes a new one.
              </span>
            </span>
          </div>
          <div className="text-xs text-ink-3">{current.shared ? 'People with a link below can open it.' : current.published ? 'No share link. It is published to Explore below.' : 'Only you can see this board.'}</div>
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
            {/* Only for a private repository of yours, off for every new link; the server keeps and enforces it. Off,
                viewers' questions use this canvas's cards, notes and sources only - never the repository's files. */}
            {current.view && current.repository?.private && (
              <label data-share-repository className="mt-2 flex items-start gap-2 text-xs text-ink-2">
                <FolderLock size={13} className="mt-0.5 shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block">Allow questions to use private repository code</span>
                  <span className="block break-words text-ink-3">Signed-in viewers' questions can use code from {current.repository.repo} at {current.repository.commit.slice(0, 7)}, the revision pinned for this link. Off: only this canvas's cards, notes and sources.</span>
                </span>
                <Switch on={current.repository.repo_access} label="Allow questions to use private repository code" disabled={busy} onChange={onRepository} />
              </label>
            )}
          </LinkRow>
        </div>
      )}
      {onPublish && <ExploreRow published={!!current.published} token={current.publication} busy={busy} onPublish={onPublish} />}
      {error && <p role="alert" className="mt-2 text-xs text-red-700">{error}</p>}
    </div>
  );
}
