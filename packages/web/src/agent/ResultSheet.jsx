import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { History, Loader2, Minus, Network, Plus } from 'lucide-react';
import { ago, api } from '../api.js';
import { Md } from '../ask.jsx';
import { Button, cn, IconBtn, Pill } from '../ui.jsx';
import { getTurns, labelOf, resetThread, resultsKey, resultsView, setTurns, subscribeTurns, threadIds, threadsPath } from './bar.js';
import ConfirmCard from './ConfirmCard.jsx';
import { scopeOf } from './scope.js';
import { useSurface } from './surface.js';

// The Context panel (Map, app Graph tab) brings Results forward on a new turn:
// subscribeTurns(({ key, pushed }) => ...), key being a results key.
export { subscribeTurns } from './bar.js';

const useTurns = (key) => useSyncExternalStore(subscribeTurns, () => getTurns(key));
// Same header controls as AskPanel (ask.jsx:566-576).
const tool = 'flex h-6 cursor-pointer items-center gap-1 rounded-sm px-1.5 text-xs text-ink-2 hover:bg-hover hover:text-ink disabled:cursor-default disabled:opacity-50';
const pill = 'max-w-full cursor-pointer truncate rounded-full border border-line px-2.5 py-1 text-left text-sm hover:bg-hover';

// §6.6: none -> [Ask instead]; up to five -> pills; more -> a list. Each match reads
// '<title> · <Kind>' (Figma F6): detail is kindLabel(kind) for catalog results (commands.js).
function Results({ t }) {
  const view = resultsView(t.results);
  if (view === 'empty') return <p className="text-sm text-ink-2">No matches.<Button size="sm" variant="accent" className="ml-2" onClick={t.askInstead}>Ask instead</Button></p>;
  if (view === 'pills') return <div className="flex flex-wrap gap-1.5">{t.results.map((r) => <button key={r.slug} type="button" onClick={() => t.pick(r)} className={pill}>{r.title} · {r.detail}</button>)}</div>;
  return (
    <div className="flex flex-col">
      {t.results.map((r) => (
        <button key={r.slug} type="button" onClick={() => t.pick(r)} className="flex h-8 cursor-pointer items-center gap-2 rounded-sm px-2 text-left text-sm hover:bg-hover">
          <span className="min-w-0 flex-1 truncate">{r.title}</span>
          <span className="shrink-0 text-xs text-ink-3">{r.detail}</span>
        </button>
      ))}
    </div>
  );
}

// The evidence hierarchy (WP6): recorded decision; recorded question/session; code/source; inferred; model explanation.
const EVIDENCE = { decision: 'Recorded decision', question: 'Recorded question', session: 'Recorded session', code: 'Code evidence', inferred: 'Inferred relationship', model: 'Model explanation' };

function Turn({ t, onFile = null }) {
  if (t.kind === 'card') return <ConfirmCard card={t.card} onConfirm={t.confirm} onChange={t.change} onCancel={t.cancel} />;
  if (t.kind === 'results') return <Results t={t} />;
  if (t.kind === 'user') return <div className="flex justify-end"><div className="max-w-[85%] whitespace-pre-wrap rounded-lg bg-hover px-3 py-1.5 text-sm">{t.text}</div></div>;
  if (t.kind === 'note') return (
    <p role={t.error ? 'alert' : 'status'} className={cn('text-sm', t.error ? 'text-danger' : 'text-ink-2')}>
      {t.text}
      {t.open && <Button size="sm" variant="accent" className="ml-2" onClick={t.open}>Open</Button>}
      {t.undo && <Button size="sm" variant="accent" className="ml-1" onClick={t.undo}>Undo</Button>}
      {/* the router's offer (e.g. Connect for an unconnected repository): runs only when clicked */}
      {t.action && <Button size="sm" variant="accent" className="ml-1" onClick={t.action.run}>{t.action.label}</Button>}
    </p>
  );
  if (t.kind === 'choose') return (
    <div>
      <div className="pb-1.5 text-sm text-ink-2">Which one do you mean?</div>
      <div className="flex flex-wrap gap-1.5">
        {t.options.map((o) => <button key={o.label} type="button" title={o.hint} onClick={o.run} className={pill}>{o.label}</button>)}
      </div>
    </div>
  );
  return (
    <div className="min-w-0">
      {t.fixture && <Pill className="mb-1.5">Fixture · UI preview</Pill>}
      {t.text ? <Md text={t.text} onFile={onFile} /> : !t.done && <span className="flex items-center gap-2 text-xs text-ink-2"><Loader2 size={14} className="animate-spin text-ink-3" /><span className="shimmer">{t.stage || 'Thinking…'}</span></span>}
      {/* ponytail: no [Add to canvas] on sources - research runs only in canvas scope, where the bar is
          hidden (routes.js), and learnHandoff is off (flags.js). Add it when the bar shows on a canvas. */}
      {t.sources?.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-2">
          {t.sources.map((s, i) => <a key={i} href={s.href} target="_blank" rel="noreferrer" className="no-underline"><Pill>{s.label}</Pill></a>)}
        </div>
      )}
      {t.evidence?.length > 0 && (
        <ol data-evidence className="flex flex-col gap-1 pt-2 text-sm">
          {t.evidence.map((e, i) => <li key={i} data-evidence-kind={e.kind} className="rounded-md bg-code px-2.5 py-1.5"><span className="block text-xs text-ink-3">{EVIDENCE[e.kind]}</span>{e.label}{e.detail && <span className="text-ink-2"> · {e.detail}</span>}</li>)}
        </ol>
      )}
      {t.showGraph && <Button size="sm" className="mt-2" onClick={t.showGraph}><Network size={13} />Show on graph</Button>}
      {t.stopped && <p className="pt-1 text-xs text-ink-3">Stopped.</p>}
      {t.error && (
        <div role="alert" className="mt-1 flex items-start gap-2 rounded-lg border border-danger/40 bg-danger/5 px-3 py-2 text-sm text-danger">
          <span className="min-w-0 flex-1 break-words">✗ {t.error}{t.retry && ' Your message is kept.'}</span>
          {t.retry && <Button size="sm" onClick={t.retry}>Retry</Button>}
        </div>
      )}
    </div>
  );
}

// One resource's results with History and New chat. They take over from AskPanel
// on Map and the app Graph tab (coaching.md: keep History and New Chat). The
// sheet renders it; those pages mount it in their Context panel instead
// (surface.resultsHost === 'panel'). The scopeKey prop takes a results key:
// resultsKey(scopeOf(surface)), selection excluded.
export function ResultList({ scopeKey: key, onFile = null }) {
  const turns = useTurns(key);
  const surface = useSurface();
  const live = scopeOf(surface);
  const scope = turns[0]?.scope || (resultsKey(live) === key ? live : null);
  const path = scope && threadsPath(scope);
  const busy = turns.some((t) => t.kind === 'answer' && !t.done);
  const [threads, setThreads] = useState(null);
  const [error, setError] = useState(null);
  const toggleHistory = () => {
    setError(null);
    if (threads) return setThreads(null);
    api(path).then((d) => setThreads(d.threads || [])).catch((e) => setError(e.message));
  };
  const openThread = async (id) => {
    try {
      const d = await api(threadsPath(scope, id));
      threadIds.set(key, d.id);
      const label = labelOf(scope);
      setTurns(key, d.messages.map((m, i) => ({ id: `${d.id}:${i}`, scope, label, done: true, kind: m.role === 'user' ? 'user' : 'answer', text: m.content })));
      setThreads(null);
    } catch (e) { setError(e.message); }
  };
  return (
    <div className="flex flex-col gap-2">
      {path && (
        <div className="flex items-center justify-end gap-1">
          <button type="button" disabled={busy} onClick={toggleHistory} className={cn(tool, threads && 'bg-active text-ink')}><History size={12} strokeWidth={1.5} />{threads ? 'Back to results' : 'History'}</button>
          <button type="button" disabled={busy} onClick={() => { resetThread(key); setThreads(null); }} className={tool}><Plus size={12} strokeWidth={1.5} />New chat</button>
        </div>
      )}
      {error && <p role="alert" className="text-sm text-danger">✗ {error}</p>}
      {threads ? (threads.length ? threads.map((t) => (
        <button key={t.id} type="button" onClick={() => openThread(t.id)} className="flex h-9 w-full cursor-pointer items-center gap-2 rounded-sm px-2 text-left text-sm hover:bg-hover">
          <span className="min-w-0 flex-1 truncate">{t.title}</span>
          <span className="shrink-0 text-xs text-ink-3">{ago(t.created_at)}</span>
        </button>
      )) : <p className="text-sm text-ink-3">No past chats.</p>) : turns.map((t) => <Turn key={t.id} t={t} onFile={onFile} />)}
    </div>
  );
}

// §6.5: grows upward from the bar with its content (a short answer is a compact card; a long one
// scrolls inside 45vh, user 2026-09-28). Dragging sets a height; collapsing leaves the latest
// result as one line in the bar.
export default function ResultSheet({ scope, label, onClose }) {
  const key = resultsKey(scope);
  const turns = useTurns(key);
  const [height, setHeight] = useState(null); // null: sized by the content
  const drag = useRef(null), box = useRef(null), card = useRef(null);
  const resize = (h) => setHeight(Math.max(96, Math.min(h, window.innerHeight * 0.7)));
  const now = () => height ?? card.current.getBoundingClientRect().height;
  useEffect(() => { box.current.scrollTop = box.current.scrollHeight; }, [turns]);
  return (
    <div data-result-sheet style={height ? { height } : undefined} className="absolute right-0 bottom-full left-0 px-4">
      <div ref={card} className={cn('mx-auto flex max-w-[780px] flex-col rounded-t-xl border border-b-0 border-line bg-white shadow-pop', height ? 'h-full' : 'min-h-24 max-h-[45vh]')}>
        <div role="separator" aria-label="Resize results" aria-orientation="horizontal" tabIndex={0} title="Drag to resize"
          className="h-1.5 shrink-0 cursor-row-resize touch-none rounded-t-xl hover:bg-line-strong/70 focus-visible:bg-line"
          onPointerDown={(e) => { if (e.button !== 0) return; e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); drag.current = { y: e.clientY, height: now() }; }}
          onPointerMove={(e) => { if (drag.current) resize(drag.current.height + drag.current.y - e.clientY); }}
          onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}
          onKeyDown={(e) => { if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); resize(now() + (e.key === 'ArrowUp' ? 24 : -24)); } }} />
        <div className="flex shrink-0 items-center gap-1 px-3 pb-1">
          <span className="mr-auto min-w-0 truncate text-xs text-ink-2">{label}</span>
          <IconBtn aria-label="Collapse results" title="Collapse (Esc)" onClick={onClose}><Minus size={14} /></IconBtn>
        </div>
        <div ref={box} className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-3 pb-3"><ResultList scopeKey={key} /></div>
      </div>
    </div>
  );
}
