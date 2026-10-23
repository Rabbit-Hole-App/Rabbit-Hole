import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { commentsApi, displayName, takeResumedAnchor } from './comments-api.js';
import { saveUiPref, uiPrefs } from '../ui-prefs.js';

// A page's comments state (docs/features/canvas-comments.md section 5), kept out of the pages: the open draft (an anchor
// from Add comment), the selected thread, and the pins the canvas draws. `base` is the route family: your canvas's main
// board once it is saved (member family), or a publication (public family); null means no comments here (Q5).
// `link`: the page a thread link opens (/c/<board id> or /e/<token>), with ?thread=<id>; a link to this page opens the thread.
const THREAD = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// The pins the canvas draws. No comment pin without a text comment (owner, 2026-10-13): a thread's pin only while it has
// a live comment (every live comment has text; `comments` counts them), and the draft's ghost only while its New
// comment panel shows (`composing`). Oldest first, so an object's slot keeps its order as threads get busy.
// The toolbar badge (owner, 2026-10-21): the server's open_count (open threads with a live comment the reader may read),
// independent of the list's page and Status filter; the loaded threads only stand in before a list answers with it.
export const openCount = (threads, total) => total ?? threads.filter(thread => thread.status !== 'resolved' && (thread.comments ?? 1) > 0).length;
export const badgeText = count => (count > 99 ? '99+' : String(count));

export const pinsOf = (threads, selected, draft, composing) => [
  ...threads.filter(thread => (thread.comments ?? 1) > 0).sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0)).map(thread => ({ id: thread.id, anchor: thread.anchor, author: thread.author, unread: thread.unread, selected: thread.id === selected, label: displayName(thread.author),
    color: thread.color || null, can: thread.can || {}, comments: thread.comments ?? 1 })),
  ...(draft && composing ? [{ id: 'draft', anchor: draft, ghost: true }] : []),
];

// A deleted object's threads (owner decision 2026-10-23, Q13) leave the canvas, the panel and the counts at once, and come back
// with Undo. `live`: the canvas's commentable objects as AdaptiveCanvas reports them ({ ids, groups }); null before it does.
export const liveOf = live => anchor => anchor?.kind !== 'object' || !live || (anchor.object_kind === 'group' ? live.groups : live.ids).has(anchor.object_id);
// What the reader sees of a list: its threads on live objects, plus `kept` ones - threads this page saw before their object was
// deleted here, which the server leaves out until the board it has includes the object again (an Undo not yet saved). A kept
// thread joins only a list it would belong to (filter: the panel's status and audience).
export function visibleThreads(threads, kept, isLive, filter = {}) {
  const listed = new Set(threads.map(thread => thread.id));
  const fits = thread => (!filter.status || filter.status === 'all' || (filter.status === 'resolved') === (thread.status === 'resolved')) && (!filter.audience || filter.audience === 'all' || filter.audience === thread.audience);
  return [...threads, ...[...kept.values()].map(entry => entry.thread).filter(thread => !listed.has(thread.id) && fits(thread))].filter(thread => isLive(thread.anchor));
}
// The kept threads after a list answered (requested at `asked`; the board last saved at `saved`). A listed thread whose object
// is gone here is kept, its copy refreshed (a list asked before the delete was saved); one whose object is here is the server's
// again. A kept thread whose object is back here and that a list asked after a save made since its return still leaves out is
// gone for real (deleted, or moved, elsewhere).
export function afterList(kept, threads, asked, saved, isLive) {
  const next = new Map(kept), listed = new Map(threads.map(thread => [thread.id, thread]));
  for (const [id, thread] of listed) if (isLive(thread.anchor)) next.delete(id); else next.set(id, { thread, back: null });
  for (const [id, entry] of next) if (!listed.has(id) && entry.back != null && saved > entry.back && asked > saved) next.delete(id);
  return next;
}
// The kept threads after the canvas changed: every listed thread whose object just went is kept; a kept one notes when its
// object came back (null while it is gone).
export function afterLive(kept, threads, isLive, now) {
  const next = new Map(kept);
  for (const thread of threads) if (!isLive(thread.anchor)) next.set(thread.id, { thread, back: null });
  for (const [id, entry] of next) next.set(id, { ...entry, back: isLive(entry.thread.anchor) ? entry.back ?? now : null });
  return next;
}

// Ungroup's comment moves (owner decision 2026-10-23), apart from React so they can be tested. send: POST …/anchors; spots:
// [{ id: group id, x, y }], each group's former top centre; show(threads, keep): their anchors on the page at once.
// The server's moves are atomic and idempotent, so this never needs to know how far a request got: a failure or a lost answer
// sends Regroup (putting back whatever did move) and throws, so the canvas keeps the group; if that fails too, the next Ungroup
// or Undo converges. Undo is Regroup and Redo the same Ungroup again, one after another in the order pressed.
export async function ungroupMoves(send, spots, show) {
  const ungroup = { ungroup: spots.map(spot => ({ id: spot.id, x: Math.round(spot.x), y: Math.round(spot.y) })) }, regroup = { regroup: spots.map(spot => spot.id) };
  let moved;
  try { moved = (await send(ungroup))?.threads || []; } catch (error) { await send(regroup).catch(() => {}); throw error; }
  if (!moved.length) return null;
  show(moved);
  let queue = Promise.resolve();
  const run = (local, body) => {
    show(local, true);
    const step = queue.then(() => send(body));
    queue = step.catch(() => {});
    return step.then(answer => { if (answer?.threads) show(answer.threads, true); });
  };
  return {
    undo: () => run(moved.map(thread => ({ id: thread.id, anchor: thread.anchor.ungrouped || thread.anchor })), regroup),
    redo: () => run(moved, ungroup),
  };
}

// `shown`: the page shows its Comments panel (open, on the Comments tab); a draft left behind a closed panel keeps its words
// but draws no ghost until the panel shows again. `editor`: the owner's own canvas page - it saves its board before an object
// comment is posted (the server refuses an object it does not have) and carries a group's comments through Ungroup.
export function useCanvasComments({ base, enabled = true, canAdd = true, openPanel, canvasApi, link = null, shown, editor = false }) {
  // Back from sign-in to post a new comment (SHARE-02): its anchor, and with it the kept draft, opens again.
  const [draft, setDraft] = useState(() => takeResumedAnchor());
  const [selected, setSelected] = useState(() => {
    const asked = new URLSearchParams(window.location.search).get('thread');
    return THREAD.test(asked || '') ? asked : null;
  });
  const [listed, setListed] = useState([]);
  const listedRef = useRef(listed);
  listedRef.current = listed;
  const [live, setLive] = useState(null);
  const [kept, setKept] = useState(() => new Map());
  const filter = useRef({});
  // The board's last save here (LearnPage's rh:board-saved), for afterList.
  const saved = useRef(-1);
  useEffect(() => {
    const mark = () => { saved.current = performance.now(); };
    window.addEventListener('rh:board-saved', mark);
    return () => window.removeEventListener('rh:board-saved', mark);
  }, []);
  // View > Comments (owner, 2026-10-21): a switch remembered on this device like the other View widgets (ui-prefs.js).
  const [showPins, setShowPins] = useState(() => uiPrefs().comments);
  const [openTotal, setOpenTotal] = useState(null);
  const isLive = useMemo(() => liveOf(live), [live]);
  const isLiveRef = useRef(isLive);
  isLiveRef.current = isLive;
  const listedAt = useCallback((list, total, asked = performance.now(), shape = {}) => {
    filter.current = shape;
    setListed(list); setOpenTotal(total ?? null);
    setKept(current => afterList(current, list, asked, saved.current, isLiveRef.current));
  }, []);
  useEffect(() => { setKept(current => afterLive(current, listed, isLive, performance.now())); }, [isLive]); // eslint-disable-line react-hooks/exhaustive-deps
  const threads = useMemo(() => visibleThreads(listed, kept, isLive, filter.current), [listed, kept, isLive]);
  // The badge: the server's count, less the loaded open threads hidden here, plus the kept ones shown here.
  const opened = list => list.filter(thread => thread.status !== 'resolved' && (thread.comments ?? 1) > 0).length;
  const total = openTotal == null ? null : Math.max(0, openTotal + opened(threads) - opened(listed));
  // A thread open in the panel whose object goes closes with it.
  useEffect(() => { if (selected && listed.some(thread => thread.id === selected) && !threads.some(thread => thread.id === selected)) setSelected(null); }, [selected, listed, threads]);
  // Bumped after a pin's colour or delete, so the panel reloads its list (and with it the pins) from the server.
  const [stamp, setStamp] = useState(0);
  const active = !!enabled && !!base;
  const client = useMemo(() => (base ? commentsApi(base) : null), [base]);
  useEffect(() => { if (active && (selected || draft)) openPanel(); }, [active]); // eslint-disable-line react-hooks/exhaustive-deps
  const addComment = useCallback(anchor => { setSelected(null); setDraft(anchor); openPanel(); }, [openPanel]);
  const openPin = useCallback(id => { setDraft(null); setSelected(id); openPanel(); }, [openPanel]);
  // A picked pin's colour and Del (owner, 2026-10-08): the server decides; an answer other than ok comes back as the
  // line to show by the pin, and the list reloads either way.
  const refused = error => error?.data?.error || "Couldn't change this comment.";
  const colorPin = useCallback(async (id, color) => {
    setListed(list => list.map(thread => (thread.id === id ? { ...thread, color } : thread)));
    try { await client.color(id, color); return null; } catch (error) { return refused(error); } finally { setStamp(n => n + 1); }
  }, [client]);
  const deletePin = useCallback(async id => {
    try { await client.removeThread(id); } catch (error) { setStamp(n => n + 1); return refused(error); }
    setListed(list => list.filter(thread => thread.id !== id));
    setKept(current => { const next = new Map(current); next.delete(id); return next; });
    setSelected(current => (current === id ? null : current));
    setStamp(n => n + 1);
    return null;
  }, [client]);
  // Ungroup (ungroupMoves): a thread's new anchor shows here at once; `keep` holds it until the server's board catches up (an
  // Undo's group is not saved yet, so the server leaves its threads out meanwhile).
  const showMoved = useCallback((list, keep = false) => {
    const by = new Map(list.map(thread => [thread.id, thread.anchor]));
    setListed(current => current.map(thread => (by.has(thread.id) ? { ...thread, anchor: by.get(thread.id) } : thread)));
    setKept(current => {
      const next = new Map(current);
      for (const thread of [...listedRef.current, ...[...current.values()].map(entry => entry.thread)]) {
        if (by.has(thread.id) && (keep || current.has(thread.id))) next.set(thread.id, { thread: { ...thread, anchor: by.get(thread.id) }, back: performance.now() });
      }
      return next;
    });
  }, []);
  const ungroupComments = useCallback(async spots => {
    const refresh = () => setStamp(n => n + 1);
    const steps = await ungroupMoves(client.moveAnchors, spots, showMoved).finally(refresh);
    return steps && { undo: () => steps.undo().finally(refresh), redo: () => steps.redo().finally(refresh) };
  }, [client, showMoved]);
  // View → Show comments hides every pin (and the draft's ghost) until it is turned back on.
  const pins = useMemo(() => (active && showPins ? pinsOf(threads, selected, draft, shown) : null), [active, showPins, threads, selected, draft, shown]);
  return {
    active,
    unread: active ? threads.filter(thread => thread.unread).length : 0,
    open: active ? openCount(threads, total) : 0,
    showPins, setPins: on => { setShowPins(on); try { saveUiPref('comments', on); } catch { /* storage refused: holds until a reload */ } },
    openPin, addComment,
    canvasProps: active ? { onAddComment: canAdd ? addComment : null, commentPins: pins, onCommentPin: openPin, onPinColor: colorPin, onPinDelete: deletePin, onCommentObjects: setLive, onUngroupComments: editor ? ungroupComments : null } : {},
    panelProps: active ? {
      base, draftAnchor: draft, selected, onSelect: setSelected, onThreads: listedAt, stamp,
      onDraftDone: id => { setDraft(null); if (id) setSelected(id); },
      threadLink: link ? id => `${window.location.origin}${link}?thread=${id}` : null,
      objectLive: isLive,
      visible: (list, shape) => visibleThreads(list, kept, isLive, shape),
      // The owner's board goes to the server first, so an object drawn a moment ago is there for the comment.
      beforePost: editor ? () => canvasApi.current?.persist?.() : null,
      onFocusAnchor: anchor => { if (anchor?.kind === 'object') canvasApi.current?.focusObject?.(anchor.object_id); },
    } : null,
  };
}
