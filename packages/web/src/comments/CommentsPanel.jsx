import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, Globe, MoreHorizontal, Users } from 'lucide-react';
import ChatComposer from '../ChatComposer.jsx';
import { Button } from '../ui.jsx';
import { anchorText } from './anchors.js';
import { BODY_MAX, COUNTER_FROM, commentsApi, displayName, failureText, freshDraft, loadDraft, mentionsIn, saveDraft, sendDraft, when } from './comments-api.js';

// The right panel's Comments view (docs/features/canvas-comments.md section 5): the thread list, one thread, or a
// new-thread draft from Add comment. `base` picks the route family; the panel is the same on both. Every message shows
// its author's name and avatar; nothing here ever holds an email or an account id.
const AVATAR_BG = ['#D3E5EF', '#DBEDDB', '#FADEC9', '#E8DEEE', '#F5E0E9', '#FDECC8', '#EEE0DA'];
export function CommentAvatar({ author, size = 'h-6 w-6' }) {
  const label = displayName(author);
  if (author?.avatar_url) return <img src={author.avatar_url} alt="" title={label} className={`${size} shrink-0 rounded-full object-cover ring-1 ring-white`} />;
  const seed = author?.handle || author?.name || '?';
  const tone = AVATAR_BG[[...seed].reduce((sum, char) => sum + char.charCodeAt(0), 0) % AVATAR_BG.length];
  return <span title={label} style={{ background: tone }} className={`${size} inline-flex shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-ink uppercase ring-1 ring-white`}>{label.replace('@', '')[0]}</span>;
}

const Audience = ({ audience }) => (
  <span data-comment-audience={audience} className="inline-flex items-center gap-1 text-[11px] text-ink-2">
    {audience === 'public' ? <Globe size={11} aria-hidden /> : <Users size={11} aria-hidden />}{audience === 'public' ? 'Public' : 'Members only'}
  </span>
);

const storage = () => sessionStorage;
const POLL_MS = 30_000;

export default function CommentsPanel({ base, hidden, draftAnchor = null, onDraftDone, selected = null, onSelect, onThreads, objectLive = () => true, onFocusAnchor }) {
  const client = useMemo(() => commentsApi(base), [base]);
  const [about, setAbout] = useState(null);
  const [status, setStatus] = useState('open');
  const [audience, setAudience] = useState('all');
  const [list, setList] = useState(null);
  const [failed, setFailed] = useState(null);
  const refresh = useCallback(async () => {
    try {
      const [info, page] = await Promise.all([client.about(), client.threads(status, audience)]);
      setAbout(info); setList(page); setFailed(null);
    } catch (error) { setFailed(error.status === 404 ? "This canvas isn't available to you." : error.message); }
  }, [client, status, audience]);
  useEffect(() => { refresh(); }, [refresh]);
  // Freshness (Q16): every 30 s while the panel shows and the tab is visible, and on focus.
  useEffect(() => {
    if (hidden) return undefined;
    const tick = () => { if (document.visibilityState === 'visible') refresh(); };
    const timer = setInterval(tick, POLL_MS);
    window.addEventListener('focus', tick);
    return () => { clearInterval(timer); window.removeEventListener('focus', tick); };
  }, [hidden, refresh]);
  useEffect(() => { onThreads?.(list?.threads || []); }, [list, onThreads]);

  const body = failed ? <p className="text-sm text-ink-2">{failed}</p>
    : !about || !list ? <p className="text-sm text-ink-2">Loading comments…</p>
    : draftAnchor ? <NewThread client={client} about={about} anchor={draftAnchor} live={objectLive(draftAnchor)} onCancel={() => onDraftDone?.(null)}
        onPosted={thread => { onDraftDone?.(thread.id); refresh(); }} />
    : selected ? <ThreadView key={selected} client={client} about={about} id={selected} objectLive={objectLive} onFocusAnchor={onFocusAnchor} onBack={() => onSelect?.(null)} onChange={refresh} />
    : <ThreadList list={list} about={about} status={status} setStatus={setStatus} audience={audience} setAudience={setAudience} objectLive={objectLive} onOpen={id => onSelect?.(id)} />;
  return <div role="tabpanel" aria-label="Comments" data-comments-panel className={`${hidden ? 'hidden' : 'flex'} min-h-0 flex-1 flex-col`}>{body}</div>;
}

function ThreadList({ list, about, status, setStatus, audience, setAudience, objectLive, onOpen }) {
  return (
    <>
      <div className="mb-2 flex items-center justify-between gap-2">
        {list.has_public && about.role !== 'viewer' ? (
          <div role="group" aria-label="Audience" className="flex items-center gap-0.5 rounded-lg border border-line p-0.5 text-xs">
            {[['all', 'All'], ['members', 'Members only'], ['public', 'Public']].map(([value, label]) => (
              <button key={value} type="button" aria-pressed={audience === value} onClick={() => setAudience(value)}
                className={`rounded-md px-2 py-1 ${audience === value ? 'bg-hover text-ink' : 'text-ink-2 hover:text-ink'}`}>{label}</button>
            ))}
          </div>
        ) : <span />}
        <select aria-label="Status" value={status} onChange={event => setStatus(event.target.value)} className="h-7 rounded-md border border-line bg-white px-1.5 text-xs text-ink-2">
          <option value="open">Open</option><option value="resolved">Resolved</option><option value="all">All</option>
        </select>
      </div>
      {!about.comments_enabled && about.role !== 'owner' && <p className="mb-2 rounded-md bg-hover px-2 py-1.5 text-xs text-ink-2">Comments are turned off for this canvas.</p>}
      {list.threads.length === 0 && (
        <p className="mt-2 text-sm text-ink-2">{status === 'open' ? 'No open comments. Right-click a card or the canvas and choose Add comment.' : 'No comments here.'}</p>
      )}
      <ol data-comment-threads className="-mx-2 min-h-0 flex-1 space-y-0.5 overflow-y-auto">
        {list.threads.map(thread => (
          <li key={thread.id}>
            <button type="button" data-comment-thread={thread.id} onClick={() => onOpen(thread.id)} className="flex w-full gap-2 rounded-lg px-2 py-2 text-left hover:bg-hover">
              <CommentAvatar author={thread.author} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 text-xs">
                  <span className="truncate font-medium text-ink">{displayName(thread.author)}</span>
                  <span className="shrink-0 text-ink-3">{when(thread.last_activity_at)}</span>
                  {thread.unread && <span data-comment-unread aria-label="Unread" className="ml-auto h-2 w-2 shrink-0 rounded-full bg-accent" />}
                </span>
                <span className="flex items-center gap-1.5"><Audience audience={thread.audience} />{thread.hidden_from_public && <span className="text-[11px] text-ink-3">· Hidden from the published page</span>}</span>
                <span className="block truncate text-[11px] text-ink-3">{anchorText(thread.anchor, objectLive(thread.anchor))}</span>
                <span className="block truncate text-sm text-ink">{thread.preview ?? 'This comment was deleted'}</span>
                {thread.replies > 0 && <span className="text-xs text-ink-2">{thread.replies} {thread.replies === 1 ? 'reply' : 'replies'}</span>}
              </span>
            </button>
          </li>
        ))}
      </ol>
    </>
  );
}

// Who may post here, else the one line saying why not (section 11). Signed out, it is the way in, back to this page.
const SIGN_IN = 'Sign in to comment.';
function blockedLine(about, can) {
  if (can) return null;
  if (!about.signed_in) return SIGN_IN;
  if (!about.comments_enabled && about.role !== 'owner') return 'Comments are turned off for this canvas.';
  if (about.can.blocked) return "You can't comment publicly on this canvas. You can still read its public comments.";
  if (about.public_mode === 'closed') return 'Comments are closed. Existing comments stay visible.';
  return "You can't comment here.";
}

function NewThread({ client, about, anchor, live, onCancel, onPosted }) {
  const fixed = about.role === 'viewer' ? 'public' : null;
  const [audience, setAudience] = useState(fixed || 'members');
  const canPost = audience === 'public' ? about.can.post_public : about.can.post;
  return (
    <div data-comment-draft className="flex min-h-0 flex-1 flex-col">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink">New comment</h2>
        <Button size="sm" onClick={onCancel}>Cancel</Button>
      </div>
      <p className="mb-2 truncate text-xs text-ink-2">{anchorText(anchor, live)}</p>
      <div data-visible-to className="mb-2 flex items-center gap-2 text-xs text-ink-2">
        <span>Visible to</span>
        {fixed || !about.can.post_public ? <Audience audience={fixed || 'members'} /> : (
          <div role="radiogroup" aria-label="Visible to" className="flex gap-0.5 rounded-lg border border-line p-0.5">
            {['members', 'public'].map(value => (
              <button key={value} type="button" role="radio" aria-checked={audience === value} onClick={() => setAudience(value)}
                className={`rounded-md px-2 py-0.5 ${audience === value ? 'bg-hover text-ink' : 'hover:text-ink'}`}><Audience audience={value} /></button>
            ))}
          </div>
        )}
      </div>
      <CommentComposer people={q => client.people(q, { audience })} storeKey={`${client.base}:new:${JSON.stringify(anchor)}`} autoFocus placeholder="Add a comment" blocked={blockedLine(about, canPost)}
        onSend={draft => sendDraft(id => client.start({ id, anchor, audience, body: draft.body, mentions: mentionsIn(draft.body) }), draft).then(made => onPosted(made.thread))} />
    </div>
  );
}

function ThreadView({ client, about, id, objectLive, onFocusAnchor, onBack, onChange }) {
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(null);
  const load = useCallback(async () => {
    try { setData(await client.thread(id)); setFailed(null); } catch (error) { setFailed(error.status === 404 ? "This thread isn't available." : error.message); }
  }, [client, id]);
  useEffect(() => { load(); client.read(id).then(onChange, () => {}); }, [load]); // eslint-disable-line react-hooks/exhaustive-deps
  const act = async run => { try { await run(); } catch (error) { setFailed(error.message); } await load(); onChange(); };
  if (failed && !data) return <div><BackButton onBack={onBack} /><p className="text-sm text-ink-2">{failed}</p></div>;
  if (!data) return <p className="text-sm text-ink-2">Loading…</p>;
  const { thread, messages } = data;
  const live = objectLive(thread.anchor);
  return (
    <div data-comment-thread-view={thread.id} className="flex min-h-0 flex-1 flex-col">
      <div className="mb-2 flex items-center justify-between gap-2">
        <BackButton onBack={onBack} />
        {thread.can.resolve && (
          <Button size="sm" variant="secondary" onClick={() => act(() => client.resolve(thread.id, thread.status === 'resolved'))}>{thread.status === 'resolved' ? 'Reopen' : 'Resolve'}</Button>
        )}
      </div>
      <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <Audience audience={thread.audience} />
        {thread.status === 'resolved' && <span className="text-[11px] text-ink-3">· Resolved</span>}
        <button type="button" disabled={!live} onClick={() => onFocusAnchor?.(thread.anchor)} className="min-w-0 truncate text-left text-xs text-ink-2 hover:text-ink disabled:cursor-default disabled:hover:text-ink-2">{anchorText(thread.anchor, live)}</button>
      </div>
      {failed && <p role="alert" className="mb-2 text-xs text-red-700">{failed}</p>}
      <ol data-comment-messages className="-mx-2 mb-2 min-h-0 flex-1 space-y-1 overflow-y-auto">
        {messages.map(message => <Message key={message.id} message={message} audience={thread.audience} owner={about.role === 'owner'} client={client} act={act} />)}
      </ol>
      <p className="mb-1 text-[11px] text-ink-3">Replying in {thread.audience === 'public' ? 'Public' : 'Members only'}</p>
      <CommentComposer people={q => client.people(q, { thread: thread.id })} storeKey={`${id}`} placeholder="Reply" blocked={blockedLine(about, thread.can.reply)}
        onSend={draft => sendDraft(cid => client.reply(thread.id, { id: cid, body: draft.body, mentions: mentionsIn(draft.body) }), draft).then(() => { load(); onChange(); })} />
    </div>
  );
}

const BackButton = ({ onBack }) => (
  <button type="button" onClick={onBack} className="flex items-center gap-0.5 text-xs text-ink-2 hover:text-ink"><ChevronLeft size={14} aria-hidden />All comments</button>
);

function Message({ message, audience, owner, client, act }) {
  const [menu, setMenu] = useState(false);
  const [editing, setEditing] = useState(null);
  const [confirm, setConfirm] = useState(false);
  const canBlock = owner && audience === 'public' && !message.mine && !message.deleted;
  const rows = [
    message.can.edit && ['Edit', () => setEditing(message.segments.map(s => s.text ?? `@${s.mention.handle}`).join(''))],
    message.can.delete && [confirm ? 'Confirm delete' : message.mine ? 'Delete' : 'Remove comment', () => (confirm ? act(() => client.remove(message.id)) : setConfirm(true)), true],
    canBlock && [`Block ${message.author.handle ? `@${message.author.handle}` : displayName(message.author)}`, () => act(() => client.block(message.id))],
  ].filter(Boolean);
  return (
    <li data-comment-message={message.id} className="group flex gap-2 rounded-lg px-2 py-1.5 hover:bg-hover/60">
      <CommentAvatar author={message.author} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-xs">
          <span className="truncate font-medium text-ink">{displayName(message.author)}</span>
          {message.author.name && message.author.handle && <span className="truncate text-ink-3">@{message.author.handle}</span>}
          <span className="shrink-0 text-ink-3">{when(message.created_at)}{message.edited ? ' · edited' : ''}</span>
          {rows.length > 0 && (
            <span className="relative ml-auto">
              <button type="button" aria-label="Comment actions" aria-expanded={menu} onClick={() => { setMenu(open => !open); setConfirm(false); }}
                className="flex h-5 w-5 items-center justify-center rounded text-ink-3 opacity-0 group-hover:opacity-100 hover:bg-white hover:text-ink focus-visible:opacity-100 aria-expanded:opacity-100"><MoreHorizontal size={14} aria-hidden /></button>
              {menu && (
                <span role="menu" className="absolute top-6 right-0 z-10 w-40 rounded-md border border-line bg-white p-1 shadow-pop">
                  {rows.map(([label, run, keepOpen]) => (
                    <button key={label} type="button" role="menuitem" onClick={() => { if (!keepOpen || confirm) setMenu(false); run(); }}
                      className="block w-full rounded px-2 py-1 text-left text-xs text-ink hover:bg-hover">{label}</button>
                  ))}
                </span>
              )}
            </span>
          )}
        </div>
        {message.deleted ? <p className="text-sm text-ink-3 italic">{message.deleted === 'owner' ? 'Removed by the owner' : 'This comment was deleted'}</p>
          : editing !== null ? (
            <div className="mt-1">
              <textarea aria-label="Edit comment" value={editing} onChange={event => setEditing(event.target.value)} rows={2} className="w-full resize-y rounded-md border border-line px-2 py-1 text-sm outline-none focus:border-line-strong" />
              <div className="flex justify-end gap-1">
                <Button size="sm" onClick={() => setEditing(null)}>Cancel</Button>
                <Button size="sm" variant="primary" disabled={!editing.trim() || editing.length > BODY_MAX} onClick={() => act(() => client.edit(message.id, editing)).then(() => setEditing(null))}>Save</Button>
              </div>
            </div>
          ) : <p className="text-sm break-words whitespace-pre-wrap text-ink">{message.segments.map((segment, index) => (segment.mention ? <span key={index} data-mention title={segment.mention.name || undefined} className="rounded bg-accent/10 px-0.5 font-medium text-accent">@{segment.mention.handle}</span> : <span key={index}>{segment.text}</span>))}</p>}
      </div>
    </li>
  );
}

// @ suggestions (section 5, Mentions): the audience's people whose handle or name starts with what follows @, avatar,
// name and @handle, never an email. Enter, Tab or a click inserts @handle; Escape closes. A typed handle outside the set
// stays plain text: the server decides.
function useMentionMenu(people, input, body, setBody) {
  const [query, setQuery] = useState(null);
  const [found, setFound] = useState([]);
  const [active, setActive] = useState(0);
  const update = () => requestAnimationFrame(() => {
    const field = input.current;
    if (!field) return;
    const before = field.value.slice(0, field.selectionStart);
    const typed = before.match(/(^|\s)@([A-Za-z0-9_]{0,40})$/);
    setQuery(typed ? { at: before.length - typed[2].length - 1, text: typed[2] } : null);
  });
  useEffect(() => {
    if (!query || !people) { setFound([]); return undefined; }
    let live = true;
    const timer = setTimeout(() => people(query.text).then(answer => { if (live) { setFound(answer.people || []); setActive(0); } }, () => {}), 150);
    return () => { live = false; clearTimeout(timer); };
  }, [query?.at, query?.text]); // eslint-disable-line react-hooks/exhaustive-deps
  const choose = who => {
    const caret = query.at + who.handle.length + 2;
    setBody(`${body.slice(0, query.at)}@${who.handle} ${body.slice(query.at + 1 + query.text.length)}`);
    setQuery(null); setFound([]);
    requestAnimationFrame(() => { input.current?.focus(); input.current?.setSelectionRange(caret, caret); });
  };
  const open = !!query && found.length > 0;
  const onKeyDown = event => {
    if (!open) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setActive(index => (index + (event.key === 'ArrowDown' ? 1 : found.length - 1)) % found.length); }
    else if (event.key === 'Enter' || event.key === 'Tab') { event.preventDefault(); choose(found[active]); }
    else if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setQuery(null); }
  };
  const menu = open && (
    <ul role="listbox" aria-label="Mention someone" data-mention-menu className="absolute right-0 bottom-full left-0 z-20 mb-1 max-h-60 overflow-y-auto rounded-lg border border-line bg-white p-1 shadow-pop">
      {found.map((who, index) => (
        <li key={who.handle} role="option" aria-selected={index === active}>
          <button type="button" onMouseDown={event => event.preventDefault()} onClick={() => choose(who)}
            className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm ${index === active ? 'bg-hover' : 'hover:bg-hover'}`}>
            <CommentAvatar author={who} size="h-5 w-5" /><span className="truncate text-ink">{who.name || `@${who.handle}`}</span>{who.name && <span className="truncate text-xs text-ink-3">@{who.handle}</span>}
          </button>
        </li>
      ))}
    </ul>
  );
  return { menu, onKeyDown, update };
}

// The existing ChatComposer (Enter sends, Shift+Enter is a new line). A failed or offline post stays here as a draft
// with Discard and Retry; while it has failed, Retry is the one send control (section 5).
function CommentComposer({ storeKey, placeholder, blocked, onSend, people, autoFocus = false }) {
  const [draft, setDraft] = useState(() => loadDraft(storage, storeKey) || freshDraft());
  const [busy, setBusy] = useState(false);
  const key = useRef(storeKey);
  const input = useRef(null);
  const mention = useMentionMenu(people, input, draft.body, body => setDraft(current => ({ ...current, body })));
  useEffect(() => { if (key.current !== storeKey) { key.current = storeKey; setDraft(loadDraft(storage, storeKey) || freshDraft()); } }, [storeKey]);
  useEffect(() => { saveDraft(storage, storeKey, draft); }, [storeKey, draft]);
  if (blocked === SIGN_IN) return <a data-comment-sign-in href={`/login?next=${encodeURIComponent(window.location.pathname)}`} className="block rounded-md bg-hover px-2 py-1.5 text-xs text-ink hover:underline">Sign in to comment</a>;
  if (blocked) return <p data-comment-blocked className="rounded-md bg-hover px-2 py-1.5 text-xs text-ink-2">{blocked}</p>;
  const send = async () => {
    setBusy(true);
    try { await onSend(draft); setDraft(freshDraft()); } catch (error) { setDraft(current => ({ ...current, failed: failureText(error, navigator.onLine) })); } finally { setBusy(false); }
  };
  const over = draft.body.length > BODY_MAX;
  return (
    <div data-comment-composer className="relative">
      {mention.menu}
      <ChatComposer multiline autoFocus={autoFocus} inputRef={input} value={draft.body} placeholder={placeholder} busy={busy} disabled={!!draft.failed || over}
        onKeyDown={mention.onKeyDown} onChange={body => { setDraft(current => ({ ...current, body })); mention.update(); }} onSubmit={send} />
      {draft.body.length >= COUNTER_FROM && <p className={`mt-0.5 text-right text-[11px] tabular-nums ${over ? 'text-red-700' : 'text-ink-3'}`}>{draft.body.length.toLocaleString('en-US')} / {BODY_MAX.toLocaleString('en-US')}</p>}
      {draft.failed && (
        <div role="alert" data-comment-failed className="mt-1 flex items-center gap-2 text-xs text-red-700">
          <span className="min-w-0 flex-1">{draft.failed}</span>
          <Button size="sm" onClick={() => setDraft(freshDraft())}>Discard</Button>
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => { setDraft(current => ({ ...current, failed: null })); send(); }}>Retry</Button>
        </div>
      )}
    </div>
  );
}
