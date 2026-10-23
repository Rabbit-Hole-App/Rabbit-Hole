// What a Chat prompt made (UI changes brief sections 1, 2 and 5): its cards under the prompt (chat-output-refs.js), and the
// "Generating on the canvas" indicator above the composer, both read from the cards' own job state (generation-state.js).
import { useEffect, useRef, useState } from 'react';
import { Ban, Box, Check, CircleAlert, FileText, Loader2, X } from 'lucide-react';
import { apiFetch } from './api.js';
import { cadReadUrl } from './CadCard.jsx';
import { openOutput, saveOutputs, watchOutputs, withOutputUpdates } from './chat-output-refs.js';
import { SETTLED_TEXT } from './generation-state.js';
import CommandPill from './CommandPill.jsx';
import { PromptControl } from './CardPrompt.jsx';
import { CAD_LINE } from './card-prompt.js';

const KIND = { cad: 'CAD model', video: 'Video', image: 'Image', notebook: 'Notebook', whiteboard: 'Whiteboard', paper: 'Paper', wiki: 'Article', explanation: 'Explanation', quiz: 'Quiz', flashcards: 'Flashcards', table: 'Table', flow: 'Diagram', mermaid: 'Diagram', graph: 'Graph', plot: 'Plot', snippet: 'Code', walkthrough: 'Walkthrough', scene: '3D scene' };
const kindName = kind => KIND[kind] || String(kind).replace(/^./, c => c.toUpperCase());

// A stable preview's picture: same-origin and cookie-scoped (never an expiring URL), read as the CAD card reads its poster.
function Thumb({ path, alt }) {
  const [src, setSrc] = useState(null), [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true, url = null;
    const abort = new AbortController();
    Promise.resolve().then(() => apiFetch(cadReadUrl(path, { ownerRead: true }), { signal: abort.signal }))
      .then(response => { if (!response.ok) throw Error(String(response.status)); return response.blob(); })
      .then(blob => { if (live) { url = URL.createObjectURL(blob); setSrc(url); } })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; abort.abort(); if (url) URL.revokeObjectURL(url); };
  }, [path]);
  if (failed) return <Box size={16} aria-hidden="true" className="shrink-0 text-ink-3" />;
  return src ? <img src={src} alt={alt} className="h-10 w-14 shrink-0 rounded border border-line bg-surface object-contain" />
    : <span aria-hidden="true" className="h-10 w-14 shrink-0 rounded border border-line bg-hover motion-safe:animate-pulse" />;
}

// The outputs under one user message. ops: the Chat's canvasOps; without it (no canvas) nothing is drawn.
export function ChatOutputs({ outputs, ops }) {
  const [problem, setProblem] = useState(null), [working, setWorking] = useState(null);
  if (!outputs?.length || !ops) return null;
  const open = async output => {
    setProblem(null); setWorking(output.cardId);
    try { const result = await openOutput(output, ops); if (result.problem) setProblem({ id: output.cardId, text: result.problem }); }
    finally { setWorking(null); }
  };
  return (
    <div data-chat-outputs className="mt-1 flex max-w-[85%] flex-col items-end gap-1">
      <div className="flex flex-wrap justify-end gap-1">
        {outputs.map(output => {
          const label = `${output.title || kindName(output.kind)} (${kindName(output.kind)})`;
          return (
            <button key={output.cardId} type="button" data-chat-output={output.cardId} data-output-kind={output.kind} aria-label={`Go to ${label}`} title={`Go to ${label}`}
              aria-busy={working === output.cardId || undefined} onClick={() => open(output)}
              className="flex min-h-11 max-w-full cursor-pointer items-center gap-2 rounded-lg border border-line bg-surface px-2 py-1 text-left text-xs text-ink-2 hover:bg-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
              {output.thumb ? <Thumb path={output.thumb} alt="" /> : <FileText size={14} aria-hidden="true" className="shrink-0 text-ink-3" />}
              <span className="min-w-0 truncate"><span className="font-medium text-ink">{output.title || kindName(output.kind)}</span><span className="block text-[11px] text-ink-3">{kindName(output.kind)}</span></span>
            </button>
          );
        })}
      </div>
      {problem && <p role="alert" data-chat-output-problem={problem.id} className="max-w-full text-right text-xs text-ink-2">{problem.text}</p>}
    </div>
  );
}

// Seconds since an ISO time, ticking while active.
function useSeconds(startedAt, active) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { if (!active) return undefined; const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, [active]);
  const start = Date.parse(startedAt || '');
  return Number.isFinite(start) ? Math.max(0, Math.floor((now - start) / 1000)) : null;
}

// One generation above the composer: the prompt it came from, its job's status words, elapsed time while it runs, and a way to
// the card. entry: { key, prompt, output, gen: generationState }. Active: a spinner (no progress bar: no card reports real
// progress) and a shimmer; settled (done, failed, cancelled): a still icon and the stable line, dismissible.
function GenerationRow({ entry, onOpen, onDismiss }) {
  const { gen, output, prompt } = entry;
  const cad = String(prompt || '').match(CAD_LINE);
  const seconds = useSeconds(output.startedAt, gen.active);
  const Icon = gen.phase === 'done' ? Check : gen.phase === 'cancelled' ? Ban : CircleAlert;
  // Prompt is drawn on hover, on keyboard focus inside the row, or after a tap on a touch screen (no hover there); an opened
  // popover stays open on its own (PromptControl), and the status words and the cad pill never wait for any of this.
  const [hover, setHover] = useState(false), [focus, setFocus] = useState(false), [tapped, setTapped] = useState(false);
  const row = useRef(null);
  return (
    <div ref={row} data-gen-indicator={output.cardId} data-gen-active={gen.active ? 'true' : 'false'} data-gen-phase={gen.phase} role="status" aria-live="polite"
      onPointerEnter={event => { if (event.pointerType !== 'touch') setHover(true); }} onPointerLeave={() => setHover(false)}
      onPointerDown={event => { if (event.pointerType === 'touch') setTapped(value => !value); }}
      onFocus={() => setFocus(true)} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocus(false); }}
      className="mb-1.5 flex w-full items-start gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-sm">
      {gen.active ? <Loader2 size={15} aria-hidden="true" className="mt-0.5 shrink-0 animate-spin text-ink-2 motion-reduce:animate-none" /> : <Icon size={15} aria-hidden="true" className={`mt-0.5 shrink-0 ${gen.phase === 'failed' ? 'text-fail' : 'text-ink-2'}`} />}
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-baseline gap-x-2 text-ink">
          <span data-gen-text className={gen.active ? 'shimmer' : ''}>{gen.active ? 'Generating on the canvas' : SETTLED_TEXT[gen.phase] || gen.label}</span>
          {gen.label && gen.active && <span data-gen-stage className="text-xs text-ink-2">{gen.label}</span>}
          {gen.active && seconds != null && <span data-gen-elapsed className="text-xs text-ink-2">{seconds}s</span>}
        </p>
        {/* The line is hidden until asked for (CardPrompt.jsx PromptControl, owner brief 2026-10-23); a /cad line shows its command as the cad pill. */}
        <div data-gen-prompt className="mt-1 flex flex-wrap items-center gap-1.5 empty:hidden">
          {cad && <CommandPill name="cad" text="cad" ariaLabel="cad command" className="h-5 rounded-md px-1.5 text-xs" />}
          <PromptControl text={cad ? cad[1] : prompt} copy={prompt} active={hover || focus || tapped} anchor={() => row.current} compact={false} />
        </div>
      </div>
      <button type="button" data-gen-open onClick={() => onOpen(output)} className="h-7 shrink-0 rounded-md px-2 text-xs font-medium text-ink-2 hover:bg-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-accent">Go to card</button>
      {!gen.active && <button type="button" data-gen-dismiss aria-label="Dismiss" title="Dismiss" onClick={() => onDismiss(entry.key)} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-ink-3 hover:bg-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"><X size={13} /></button>}
    </div>
  );
}

export function GenerationIndicator({ entries, ops, onDismiss }) {
  if (!entries.length || !ops) return null;
  return <div data-gen-indicators>{entries.map(entry => <GenerationRow key={entry.key} entry={entry} onOpen={output => openOutput(output, ops)} onDismiss={onDismiss} />)}</div>;
}

// The Chat's watch over its outputs' cards (every 1.5 s while any output is in the transcript): the indicator's entries - each
// card seen generating in this pane, while it runs and then in its settled state until dismissed - and each settled card's
// refreshed output, shown and saved. A job still running after a reload is seen running on the first look, so its indicator
// comes back with the transcript. dismissSettled(): the next prompt clears the settled ones.
const entryKey = list => JSON.stringify(list.map(({ key, prompt, gen, output }) => [key, prompt, gen.phase, gen.label, output.startedAt]));
export function useGenerationWatch(msgs, setMsgs, ops) {
  const latest = useRef(msgs);
  latest.current = msgs;
  const tracked = useRef(new Set()), dismissed = useRef(new Set());
  const [entries, setEntries] = useState([]);
  const outputs = msgs.reduce((count, m) => count + (m.role === 'user' ? m.outputs?.length || 0 : 0), 0);
  const look = useRef(() => {});
  look.current = () => {
    const { entries: all, updates } = watchOutputs(latest.current, ops);
    for (const { messageId, output } of updates) saveOutputs(messageId, [output]).catch(error => console.info('[chat] output not saved:', error.message));
    if (updates.length) setMsgs(current => withOutputUpdates(current, updates));
    for (const entry of all) if (entry.gen.active) tracked.current.add(entry.key);
    const shown = all.filter(entry => tracked.current.has(entry.key) && (entry.gen.active || !dismissed.current.has(entry.key)));
    setEntries(previous => (entryKey(previous) === entryKey(shown) ? previous : shown));
  };
  useEffect(() => {
    if (!ops || !outputs) { setEntries(previous => (previous.length ? [] : previous)); return undefined; }
    look.current();
    const timer = setInterval(() => look.current(), 1500);
    return () => clearInterval(timer);
  }, [ops, outputs]);
  const dismiss = key => { dismissed.current.add(key); look.current(); };
  const dismissSettled = () => { for (const entry of entries) if (!entry.gen.active) dismissed.current.add(entry.key); look.current(); };
  return { entries, dismiss, dismissSettled };
}
