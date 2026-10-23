import { useEffect, useId, useRef, useState } from 'react';
import { Check, Compass, Copy, X } from 'lucide-react';
import PeopleWithAccess from './comments/PeopleWithAccess.jsx';
import EmbedPanel from './EmbedPanel.jsx';
import { embedSources } from './embed-api.js';
import { MODES, PATCH, accessMode } from './home/project-access.js';
import { ExploreCommentSetting, ShareCommentSetting, useCommentSettings } from './comments/CommentSettings.jsx';

// The Share canvas dialog (owner brief 2026-10-22; docs/features/canvas-sharing.md, explore-publish.md, canvas-comments.md):
// three tabs - Share (who can open the link, invitations, comments), Explore (publication, independent of the link) and
// Embed. Shared canvases are view-only; editing someone else's canvas means forking. Opening the dialog or a tab changes
// nothing: every write is an explicit click on a control.
export function Switch({ on, label, disabled = false, onChange }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)}
      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-40 ${on ? 'bg-[#2383e2]' : 'bg-line-strong'}`}>
      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${on ? 'left-[18px]' : 'left-0.5'}`} />
    </button>
  );
}

// The dropdown's three options are the server's own fields (home/project-access.js MODES, PATCH, accessMode): shared, view
// (the link's token) and public_view. Invited people only is shared: false, which turns the link off; their invitations and
// the Explore publication are other rows the share route never touches.
const EXPLAIN = {
  invited: 'Only people you invite can open this canvas. The share link is off.',
  signin: 'Anyone with the link can view this canvas after signing in. They cannot edit it.',
  public: 'Anyone with the link can view this canvas without signing in. They cannot edit it.',
};
export { accessMode };

// A read-only URL on one line (the field scrolls, and the whole URL is its title) with a blue Copy link. Copied shows only
// after the clipboard accepted the text; when it refuses, the URL is selected and the message says how to copy it.
function CopyLink({ url, fieldLabel, fieldAttrs = {} }) {
  const [state, setState] = useState('idle');
  const input = useRef(null);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const copy = async () => {
    clearTimeout(timer.current);
    try { await navigator.clipboard.writeText(url); setState('copied'); } catch { input.current?.focus(); input.current?.select(); setState('failed'); }
    timer.current = setTimeout(() => setState('idle'), 2500);
  };
  return (
    <div className="mt-3">
      <div className="flex items-center gap-1.5">
        <input ref={input} readOnly value={url} title={url} aria-label={fieldLabel} onFocus={event => event.target.select()} {...fieldAttrs}
          className="h-8 min-w-0 flex-1 truncate rounded-md border border-line bg-hover/50 px-2 text-xs text-ink-2" />
        <button type="button" onClick={copy} className="flex h-8 shrink-0 items-center gap-1 rounded-md bg-primary-fill px-3 text-xs font-medium text-white hover:bg-primary-fill-hover">
          {state === 'copied' ? <Check size={13} /> : <Copy size={13} />}{state === 'copied' ? 'Copied' : 'Copy link'}
        </button>
      </div>
      {state === 'failed' && <p role="status" className="mt-1 text-xs text-red-700">Copy failed. The link is selected: press Ctrl+C or Cmd+C to copy it.</p>}
    </div>
  );
}

// Publish to Explore (docs/features/explore-publish.md): a separate, explicit owner action from sharing. Published, the
// canvas is public and live - its saved changes appear in the publication - until it is removed, which never touches
// the share link. Its own /e/ link, not a share link.
function ExploreTab({ published, token, busy, onPublish, cs }) {
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const url = token ? `${window.location.origin}/e/${token}` : '';
  const run = async publish => {
    setPending(true);
    try { await onPublish(publish); } finally { setPending(false); setConfirming(false); }
  };
  const disabled = busy || pending;
  return (
    <div data-explore-publish={published ? 'published' : 'private'} className="pt-3">
      {published ? (
        <>
          <div className="flex items-center gap-1.5 text-sm font-medium text-ink"><Compass size={14} className="shrink-0 text-ink-2" />Published on Explore</div>
          <p className="mt-1 text-xs text-ink-3">Anyone can find it and open it read-only, signed in or not. Your saved changes appear here automatically.</p>
          {token && <CopyLink url={url} fieldLabel="Explore link URL" />}
          <div className="mt-3"><ExploreCommentSetting cs={cs} /></div>
          <div className="border-t border-line pt-2.5">
            {confirming ? (
              <div role="group" aria-label="Remove from Explore">
                <p className="text-xs text-ink-2">Remove this canvas from Explore? Its Explore page and any embeds of it stop working. Your canvas and your share link are not changed.</p>
                <div className="mt-2 flex gap-2">
                  <button type="button" data-confirm-unpublish disabled={disabled} onClick={() => run(false)} className="h-7 rounded-md border border-line px-2.5 text-xs text-ink hover:bg-hover disabled:opacity-40">Remove from Explore</button>
                  <button type="button" disabled={pending} onClick={() => setConfirming(false)} className="h-7 rounded-md px-2.5 text-xs text-ink-2 hover:bg-hover disabled:opacity-40">Cancel</button>
                </div>
              </div>
            ) : (
              <button type="button" data-unpublish disabled={disabled} onClick={() => setConfirming(true)} className="h-7 rounded-md px-2 text-xs text-ink-2 hover:bg-hover hover:text-ink disabled:opacity-40">Remove from Explore</button>
            )}
          </div>
        </>
      ) : (
        <>
          <p className="text-xs text-ink-3">Anyone will be able to find this canvas in Explore and open it read-only. Your saved changes appear there automatically until you remove it. This is separate from your share link.</p>
          <button type="button" data-publish disabled={disabled} onClick={() => run(true)} className="mt-3 h-8 rounded-md bg-primary-fill px-3 text-xs font-medium text-white hover:bg-primary-fill-hover disabled:opacity-40">Publish to Explore</button>
        </>
      )}
      {pending && <p role="status" className="mt-2 text-xs text-ink-3">Saving</p>}
    </div>
  );
}

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

// onChange(patch): the share route's fields. onPublish(publish): Publish to Explore / Remove from Explore - only for a top-level canvas.
// `place`: where it sits - under the canvas top bar's Share button, or the Library's popup (LibraryViews.jsx).
// comments: { base } when the canvas has comments (docs/features/canvas-comments.md); the invitation list and both comment
// settings are the dialog's own rows. `title`: the canvas's own title under the heading.
// A project's window (owner brief 2026-10-22 items 4-5, home/CardMenu.jsx): `project` = { canvases: <the Canvases tab>, publicBlocked }.
// Its Share tab is the project link only (the Main canvas board's) and its Explore and Embed tabs are not shown: a project
// itself is never on Explore, only its canvases are, and the Canvases tab shows each one's own access and publication.
// `privateUrl`: the card's own address, offered as a private link only while the link is off (copying never turns it on).
export default function SharePanel({ sharing, busy, error, onChange, onPublish = null, onClose, place = 'absolute top-full right-0 mt-2', comments = null, title = '', project = null, privateUrl = '' }) {
  const panel = useRef(null);
  const accessSelect = useRef(null);
  const seq = useRef(0);
  const uid = useId();
  const [tab, setTab] = useState('share');
  const [pendingMode, setPendingMode] = useState(null);
  const [focusAccess, setFocusAccess] = useState(0);
  useEffect(() => {
    const away = event => { if (!panel.current?.contains(event.target) && !event.target.closest?.('[data-share-button]')) onClose(); };
    const escape = event => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('pointerdown', away, true);
    window.addEventListener('keydown', escape);
    return () => { window.removeEventListener('pointerdown', away, true); window.removeEventListener('keydown', escape); };
  }, [onClose]);
  // Focus goes to the dialog's selected tab on open, and back to what had it when the dialog closes.
  useEffect(() => {
    const before = document.activeElement;
    panel.current?.querySelector('[role="tab"][aria-selected="true"]')?.focus();
    return () => { const now = document.activeElement; if (before?.isConnected && (!now || now === document.body)) before.focus?.(); };
  }, []);
  useEffect(() => { if (focusAccess) accessSelect.current?.focus(); }, [focusAccess]);
  const current = sharing || { shared: false, view: null, edit: null, public_view: false };
  const mode = accessMode(current);
  const cs = useCommentSettings(comments?.base || null, !!current.published);
  const origin = window.location.origin;
  const shareUrl = mode === 'invited' ? '' : `${origin}/b/${current.view}`;
  const changeMode = async next => {
    if (next === mode) return;
    const mine = ++seq.current;
    setPendingMode(next);
    // The select shows the pending choice only while the save runs; after it, whatever the server last confirmed (sharing).
    try { await onChange(PATCH[next]); } finally { if (mine === seq.current) setPendingMode(null); }
  };
  const tabs = project ? [['share', 'Share'], ['canvases', 'Canvases']] : [['share', 'Share'], ...(onPublish ? [['explore', 'Explore']] : []), ['embed', 'Embed']];
  const onTabKeys = event => {
    const index = tabs.findIndex(([key]) => key === tab);
    const next = { ArrowRight: (index + 1) % tabs.length, ArrowLeft: (index + tabs.length - 1) % tabs.length, Home: 0, End: tabs.length - 1 }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    setTab(tabs[next][0]);
    document.getElementById(`${uid}-tab-${tabs[next][0]}`)?.focus();
  };
  // Tab stays inside the dialog.
  const trap = event => {
    if (event.key !== 'Tab') return;
    const items = [...panel.current.querySelectorAll(FOCUSABLE)].filter(item => item.getClientRects().length);
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if (event.shiftKey && (document.activeElement === first || !panel.current.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };
  // The Embed lane's own source list (embed-api.js); only the reason is this dialog's, since it knows why the link is not public.
  const sources = embedSources(current, origin).map(source => source.kind === 'shared' && !source.available
    ? { ...source, reason: mode === 'invited' ? 'Only invited people can open this canvas, so there is nothing to embed.' : 'Visitors must sign in to open this link, so it cannot be embedded publicly.' } : source);
  const panelProps = key => ({ role: 'tabpanel', id: `${uid}-panel-${key}`, 'aria-labelledby': `${uid}-tab-${key}`, hidden: tab !== key });
  return (
    <div ref={panel} role="dialog" aria-label={project ? 'Share project' : 'Share canvas'} onKeyDown={trap}
      className={`${place} z-50 w-[26rem] max-w-[calc(100vw-1rem)] max-h-[calc(100dvh-5rem)] overflow-y-auto rounded-xl border border-line bg-white p-3 shadow-lg max-sm:fixed max-sm:inset-x-2 max-sm:top-14 max-sm:mt-0 max-sm:w-auto max-sm:max-w-none`}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-ink">{project ? 'Share project' : 'Share canvas'}</h2>
          {title && <p className="truncate text-xs text-ink-3" title={title}>{title}</p>}
        </div>
        <button type="button" aria-label="Close" onClick={onClose} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-ink-3 hover:bg-hover hover:text-ink"><X size={14} /></button>
      </div>
      <div role="tablist" aria-label={project ? 'Share project' : 'Share canvas'} onKeyDown={onTabKeys} className="mt-2 flex gap-4 border-b border-line">
        {tabs.map(([key, label]) => (
          <button key={key} type="button" role="tab" id={`${uid}-tab-${key}`} aria-selected={tab === key} aria-controls={`${uid}-panel-${key}`} tabIndex={tab === key ? 0 : -1} onClick={() => setTab(key)}
            className={`-mb-px border-b-2 px-0.5 pb-1.5 text-sm ${tab === key ? 'border-ink text-ink' : 'border-transparent text-ink-3 hover:text-ink'}`}>{label}</button>
        ))}
      </div>
      <div {...panelProps('share')}>
        <div className="pt-3">
          <label htmlFor={`${uid}-access`} className="mb-1 block text-sm text-ink">Who can open this?</label>
          <select id={`${uid}-access`} ref={accessSelect} value={pendingMode ?? mode} disabled={busy || !!pendingMode} onChange={event => changeMode(event.target.value)}
            className="h-8 w-full rounded-md border border-line bg-white px-2 text-sm text-ink disabled:opacity-40">
            {MODES.map(([value, label]) => <option key={value} value={value} disabled={project?.publicBlocked && value === 'public'}>{label}</option>)}
          </select>
          <p className="mt-1.5 text-xs text-ink-3">{project ? EXPLAIN[mode].replace('this canvas', 'this project').replace('share link', 'project link') : EXPLAIN[mode]}</p>
          {pendingMode && <p role="status" className="text-xs text-ink-3">Saving</p>}
          {shareUrl && <CopyLink url={shareUrl} fieldLabel="Share link URL" />}
          {project && <p data-project-link-note className="mt-2 text-xs text-ink-3">This is the project link only. The project itself is never listed on Explore, and each canvas keeps its own access: see the Canvases tab.</p>}
          {project?.publicBlocked && <p className="mt-1 text-xs text-ink-3">Private repository: the link cannot be opened without signing in.</p>}
          {!shareUrl && privateUrl && (
            <div data-private-link>
              <CopyLink url={privateUrl} fieldLabel="Private link URL" />
              <p className="mt-1 text-xs text-ink-3">Private link: people you send it to cannot open it. Copying it does not share anything; choose who can open it above first.</p>
            </div>
          )}
        </div>
        {comments && <div className="mt-2"><PeopleWithAccess base={comments.base} /><ShareCommentSetting cs={cs} /></div>}
      </div>
      {tab === 'explore' && onPublish && <div {...panelProps('explore')}><ExploreTab published={!!current.published} token={current.publication} busy={busy} onPublish={onPublish} cs={cs} /></div>}
      {tab === 'canvases' && project && <div {...panelProps('canvases')}>{project.canvases}</div>}
      {tab === 'embed' && !project && <div {...panelProps('embed')}><EmbedPanel canvasTitle={title} sources={sources} onChangeAccess={() => { setTab('share'); setFocusAccess(count => count + 1); }} /></div>}
      {error && <p role="alert" className="mt-2 text-xs text-red-700">{error}</p>}
    </div>
  );
}
