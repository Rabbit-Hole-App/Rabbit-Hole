// ─── Ask (phase 1 — read only): the chat panel behind the Agent tab, the run
// peek's ask box, and ⌘K's Ask tab. POST /api/ask streams SSE; org-scope
// ambiguity comes back as { choose } and renders candidate pills. ───
import { useEffect, useRef, useState } from 'react';
import { ArrowUp, AtSign, History, Loader2, MoreHorizontal, Paperclip, Pencil, Plus, SlidersHorizontal, Trash2, X } from 'lucide-react';
import { ago, api } from './api.js';
import { cn, ConfirmDialog, KindIcon, Menu, MenuItem, Toggle } from './ui.jsx';

// What the agent may read, per scope — the ⚙ picker mirrors Notion's "My sources".
const SOURCE_OPTIONS = {
  run: [['log', 'Log'], ['outputs', 'Outputs'], ['runbook', 'Runbook'], ['review', 'Review'], ['agent', 'AGENT.md']],
  app: [['runs', 'Runs'], ['requests', 'Request log'], ['runbook', 'Runbook'], ['review', 'Review'], ['agent', 'AGENT.md']],
};

// Model picker keys → labels (server holds the allowlist; auto = default).
const MODELS = [['auto', 'Auto'], ['opus-5', 'Opus 5'], ['sonnet-5', 'Sonnet 5'], ['haiku-4.5', 'Haiku 4.5']];

// Tiny safe markdown: **bold**, `code`, "- " bullets. Built as elements — no HTML injection.
function inline(s) {
  return s.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).map((part, i) => {
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={i} className="rounded-xs bg-code px-1 font-mono text-[0.9em]">{part.slice(1, -1)}</code>;
    }
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>;
    return part;
  });
}

export function Md({ text }) {
  const lines = String(text).split('\n');
  const out = [];
  let bullets = null;
  lines.forEach((l, i) => {
    if (/^\s*[-*] /.test(l)) {
      bullets = bullets || [];
      bullets.push(<li key={i}>{inline(l.replace(/^\s*[-*] /, ''))}</li>);
      return;
    }
    if (bullets) {
      out.push(<ul key={`ul${i}`} className="my-1 list-disc pl-5">{bullets}</ul>);
      bullets = null;
    }
    if (l.startsWith('Sources: ')) {
      out.push(<div key={i} className="pt-1 text-xs text-ink-3">{l}</div>);
    } else if (l.trim()) {
      out.push(<p key={i} className="my-1">{inline(l)}</p>);
    }
  });
  if (bullets) out.push(<ul key="ul-end" className="my-1 list-disc pl-5">{bullets}</ul>);
  return <div className="text-sm leading-normal">{out}</div>;
}

// Phase 2 proposal card: what will happen with the exact inputs; nothing runs
// until Run posts the approval. Change hands the args back to the input box.
const TOOL_LABEL = {
  run: 'Run', run_again: 'Run again', pause_schedule: 'Pause schedule',
  resume_schedule: 'Resume schedule', share: 'Share', unshare: 'Unshare',
};

function ProposalCard({ proposal, onDone, onChange }) {
  const [busy, setBusy] = useState(false);
  const approve = async () => {
    setBusy(true);
    try {
      const d = await api('/api/ask/approve', { method: 'POST', body: JSON.stringify({ proposal_id: proposal.id }) });
      onDone(`✓ ${TOOL_LABEL[proposal.tool] || proposal.tool} executed${d.runId ? ` — run \`${d.runId}\`` : ''}`);
    } catch (e) {
      onDone(`✗ ${e.message}`);
    }
  };
  return (
    <div className="max-w-[440px] rounded-md border border-line p-3">
      <div className="pb-1 text-sm font-medium">{TOOL_LABEL[proposal.tool] || proposal.tool}?</div>
      <pre className="overflow-x-auto rounded-sm bg-code p-2 font-mono text-xs whitespace-pre-wrap text-ink-2">{JSON.stringify(proposal.args, null, 2)}</pre>
      <div className="flex gap-2 pt-2">
        <button
          disabled={busy}
          onClick={approve}
          className="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-sm bg-accent px-2.5 text-[13px] font-medium text-white hover:bg-accent-hover disabled:opacity-50"
        >
          {busy && <Loader2 size={12} className="animate-spin" />} Run
        </button>
        <button
          onClick={() => onChange(`${TOOL_LABEL[proposal.tool] || proposal.tool} with ${JSON.stringify(proposal.args)} but `)}
          className="h-7 cursor-pointer rounded-sm px-2.5 text-[13px] text-ink-2 hover:bg-hover hover:text-ink"
        >
          Change
        </button>
        <button onClick={() => onDone('(proposal dismissed)')} className="h-7 cursor-pointer rounded-sm px-2.5 text-[13px] text-ink-2 hover:bg-hover hover:text-ink">
          Cancel
        </button>
      </div>
    </div>
  );
}

// One chat, scoped: {app} | {run} | {} (org). Style per the Notion AI reference —
// user turns as a right-aligned bubble, answers as plain text, pill input at the bottom.
export function AskPanel({ scope, placeholder = 'Ask anything…', compact = false, autoFocus = false }) {
  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [choices, setChoices] = useState(null); // { message, candidates }
  const [file, setFile] = useState(null); // one attachment per question
  const [mentions, setMentions] = useState([]); // @app chips
  const [plusOpen, setPlusOpen] = useState(false);
  const [threads, setThreads] = useState([]); // past chats for this scope
  const [histOpen, setHistOpen] = useState(false);
  const [rowMenu, setRowMenu] = useState(null); // thread id with its ⋯ open
  const [renaming, setRenaming] = useState(null); // { id, value }
  const [confirmDel, setConfirmDel] = useState(null); // thread pending delete
  const scopeKind = scope.run ? 'run' : scope.app ? 'app' : 'org';
  const scopeRef = scope.run || scope.app || null;
  const srcOpts = SOURCE_OPTIONS[scopeKind] || [];
  const [srcOn, setSrcOn] = useState(() => new Set(srcOpts.map(([k]) => k)));
  const [srcOpen, setSrcOpen] = useState(false);
  const [model, setModel] = useState('auto');
  const [modelOpen, setModelOpen] = useState(false);
  const [appNames, setAppNames] = useState(null); // lazy, for @-mentions
  const threadId = useRef(null);
  const boxRef = useRef(null);
  const inputRef = useRef(null);
  const fileRef = useRef(null);

  // "@yol" at the end of the input → app-name suggestions
  const atMatch = input.match(/@([a-z0-9-]*)$/);
  useEffect(() => {
    if (atMatch && appNames === null) api('/api/apps').then((d) => setAppNames(d.apps.map((a) => ({ name: a.name, kind: a.kind, schedule: a.schedule })))).catch(() => setAppNames([]));
  }, [!!atMatch]);
  const atHits = atMatch && appNames ? appNames.filter((a) => a.name.includes(atMatch[1])) : [];

  useEffect(() => {
    const focus = () => inputRef.current?.focus();
    window.addEventListener('small:ask-focus', focus);
    return () => window.removeEventListener('small:ask-focus', focus);
  }, []);

  // chats persist in D1 — resume the latest thread for this scope on mount
  const loadThread = async (id) => {
    try {
      const d = await api(`/api/ask/threads/${id}`);
      threadId.current = d.id;
      setMsgs(d.messages);
      setChoices(null);
    } catch { /* stale id — stay on the empty chat */ }
  };
  useEffect(() => {
    api(`/api/ask/threads?scope=${scopeKind}${scopeRef ? `&ref=${encodeURIComponent(scopeRef)}` : ''}`)
      .then(async (d) => {
        setThreads(d.threads || []);
        if (d.threads?.[0]) await loadThread(d.threads[0].id);
      })
      .catch(() => {});
  }, [scopeKind, scopeRef]);
  const newChat = () => { threadId.current = null; setMsgs([]); setChoices(null); setHistOpen(false); };
  useEffect(() => {
    if (boxRef.current) boxRef.current.scrollTop = boxRef.current.scrollHeight;
  }, [msgs]);

  const send = async (raw, scopeOverride) => {
    // @-chips ride at the front of the message text
    const message = [...mentions.map((m) => `@${m}`), raw.trim()].filter(Boolean).join(' ');
    if (!message || busy) return;
    setChoices(null);
    setBusy(true);
    setInput('');
    setMentions([]);
    const attached = file;
    setFile(null);
    setMsgs((m) => [...m, { role: 'user', content: attached ? `${message} 📎 ${attached.name}` : message }, { role: 'assistant', content: '' }]);
    const append = (t) => setMsgs((m) => {
      const next = m.slice();
      next[next.length - 1] = { ...next[next.length - 1], content: next[next.length - 1].content + t };
      return next;
    });
    try {
      const payload = {
        scope: scopeOverride || scope,
        message,
        thread_id: threadId.current,
        ...(srcOpts.length && srcOn.size < srcOpts.length ? { sources: [...srcOn] } : {}),
        ...(model !== 'auto' ? { model } : {}),
      };
      let r;
      if (attached) {
        const fd = new FormData();
        fd.append('body', JSON.stringify(payload));
        fd.append('file', attached);
        r = await fetch('/api/ask', { method: 'POST', body: fd });
      } else {
        r = await fetch('/api/ask', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }
      if ((r.headers.get('Content-Type') || '').includes('json')) {
        const d = await r.json();
        if (d.choose) {
          setMsgs((m) => m.slice(0, -2)); // no turn happened yet — the pills replace it
          setChoices({ message, candidates: d.choose });
        } else {
          append(`✗ ${d.error || `HTTP ${r.status}`}`);
        }
        return;
      }
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const events = buf.split('\n\n');
        buf = events.pop();
        for (const ev of events) {
          const type = (ev.match(/^event: (.+)$/m) || [])[1];
          const data = (ev.match(/^data: (.+)$/m) || [])[1];
          if (!type || !data) continue;
          const d = JSON.parse(data);
          if (type === 'chunk') append(d.text);
          else if (type === 'proposal') setMsgs((m) => [...m, { role: 'proposal', proposal: d }]);
          else if (type === 'done' && d.threadId) threadId.current = d.threadId;
          else if (type === 'error') append(`✗ ${d.error}`);
        }
      }
    } catch (e) {
      append(`✗ ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={cn('flex min-h-0 flex-col', compact ? 'max-h-[320px]' : 'flex-1')}>
      {!compact && (msgs.length > 0 || threads.length > 0) && (
        <div className="flex shrink-0 items-center justify-end gap-1 pb-1">
          {threads.length > 0 && (
            <div className="relative">
              <button
                onMouseDown={(e) => { e.stopPropagation(); setHistOpen(!histOpen); }}
                className="flex h-6 cursor-pointer items-center gap-1 rounded-sm px-1.5 text-xs text-ink-2 hover:bg-hover hover:text-ink"
              >
                <History size={12} strokeWidth={1.5} /> History
              </button>
              <Menu open={histOpen} onClose={() => setHistOpen(false)} className="top-7 right-0 max-h-64 w-80 overflow-y-auto">
                {threads.map((t) => (
                  <div key={t.id} className="group/h relative flex items-center">
                    {renaming?.id === t.id ? (
                      <form
                        className="flex-1 px-1 py-0.5"
                        onSubmit={async (e) => {
                          e.preventDefault();
                          const title = renaming.value.trim();
                          setRenaming(null);
                          if (!title) return;
                          try {
                            await api(`/api/ask/threads/${t.id}/rename`, { method: 'POST', body: JSON.stringify({ title }) });
                            setThreads((ts) => ts.map((x) => (x.id === t.id ? { ...x, title } : x)));
                          } catch { /* row keeps its old title */ }
                        }}
                      >
                        <input
                          autoFocus
                          value={renaming.value}
                          onChange={(e) => setRenaming({ ...renaming, value: e.target.value })}
                          onBlur={() => setRenaming(null)}
                          className="h-6 w-full rounded-sm bg-hover px-2 text-sm outline-none"
                        />
                      </form>
                    ) : (
                      <button
                        type="button"
                        onClick={() => { setHistOpen(false); loadThread(t.id); }}
                        className="flex h-8 min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-sm px-2 text-left text-sm hover:bg-hover"
                      >
                        <span className="min-w-0 flex-1 truncate">{t.title}</span>
                        <span className="shrink-0 text-xs text-ink-3">{ago(t.created_at)}</span>
                      </button>
                    )}
                    <button
                      type="button"
                      aria-label="Thread options"
                      onMouseDown={(e) => { e.stopPropagation(); setRowMenu(rowMenu === t.id ? null : t.id); }}
                      className="mr-0.5 inline-flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-sm text-ink-2 opacity-0 group-hover/h:opacity-100 hover:bg-hover hover:text-ink"
                    >
                      <MoreHorizontal size={14} strokeWidth={1.5} />
                    </button>
                    {rowMenu === t.id && (
                      <div className="absolute top-7 right-0 z-30 w-36 rounded-md bg-white p-1 shadow-pop" onMouseDown={(e) => e.stopPropagation()}>
                        <MenuItem icon={Pencil} type="button" onClick={() => { setRowMenu(null); setRenaming({ id: t.id, value: t.title }); }}>Rename</MenuItem>
                        <MenuItem icon={Trash2} type="button" className="text-danger" onClick={() => { setRowMenu(null); setConfirmDel(t); }}>Delete</MenuItem>
                      </div>
                    )}
                  </div>
                ))}
              </Menu>
            </div>
          )}
          <button onClick={newChat} className="flex h-6 cursor-pointer items-center gap-1 rounded-sm px-1.5 text-xs text-ink-2 hover:bg-hover hover:text-ink">
            <Plus size={12} strokeWidth={1.5} /> New chat
          </button>
        </div>
      )}
      {confirmDel && (
        <ConfirmDialog
          title="Delete this chat?"
          body={`"${confirmDel.title.slice(0, 80)}" and its messages are removed for good. Approved actions stay in the log.`}
          onConfirm={async () => {
            const t = confirmDel;
            setConfirmDel(null);
            try {
              await api(`/api/ask/threads/${t.id}/delete`, { method: 'POST' });
              setThreads((ts) => ts.filter((x) => x.id !== t.id));
              if (threadId.current === t.id) newChat();
            } catch { /* row stays if the delete failed */ }
          }}
          onCancel={() => setConfirmDel(null)}
        />
      )}
      <div ref={boxRef} className="min-h-0 flex-1 overflow-y-auto">
        {msgs.length === 0 && !choices && (
          <div className="py-3 text-sm text-ink-2">
            Ask about {scope.run ? 'this run — what happened, why it failed, what changed.' : scope.app ? 'this app — runs, logs, schedule, who has access.' : 'your workspace — any app, run, or person.'}
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={cn('py-1.5', m.role === 'user' && 'flex justify-end')}>
            {m.role === 'user' ? (
              <span className="max-w-[85%] rounded-lg bg-hover px-3 py-1.5 text-sm">{m.content}</span>
            ) : m.role === 'proposal' ? (
              <ProposalCard
                proposal={m.proposal}
                onDone={(text) => setMsgs((ms) => ms.map((x, j) => (j === i ? { role: 'assistant', content: text } : x)))}
                onChange={(text) => { setMsgs((ms) => ms.filter((_, j) => j !== i)); setInput(text); inputRef.current?.focus(); }}
              />
            ) : m.content ? (
              <Md text={m.content} />
            ) : (
              <Loader2 size={14} className="animate-spin text-ink-3" />
            )}
          </div>
        ))}
        {choices && (
          <div className="py-2">
            <div className="pb-1.5 text-sm text-ink-2">Which one do you mean?</div>
            <div className="flex flex-col gap-1">
              {choices.candidates.map((c) => (
                <button
                  key={c.app}
                  onClick={() => send(choices.message, { app: c.app })}
                  className="cursor-pointer rounded-sm border border-line px-3 py-1.5 text-left text-sm hover:bg-hover"
                >
                  <span className="font-medium">{c.app}</span>
                  {c.hint && <span className="block truncate text-xs text-ink-2">{c.hint}</span>}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="relative mt-2 shrink-0">
        {/* @-mention suggestions above the input */}
        {atHits.length > 0 && (
          <div className="absolute bottom-full left-0 z-20 mb-1 max-h-56 w-64 overflow-y-auto rounded-md bg-white p-1 shadow-pop">
            {atHits.map((a) => (
              <button
                key={a.name}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  setMentions((m) => (m.includes(a.name) ? m : [...m, a.name]));
                  setInput(input.replace(/@[a-z0-9-]*$/, ''));
                  inputRef.current?.focus();
                }}
                className="flex h-8 w-full cursor-pointer items-center gap-2 rounded-sm px-2 text-left text-sm hover:bg-hover"
              >
                <KindIcon kind={a.kind} schedule={a.schedule} />
                {a.name}
              </button>
            ))}
          </div>
        )}
        {(file || mentions.length > 0) && (
          <div className="mb-1 flex flex-wrap gap-1.5">
            {mentions.map((m) => (
              <span key={m} className="inline-flex items-center gap-1 rounded-full bg-hover px-2 py-0.5 text-xs">
                @{m}
                <button aria-label={`Remove ${m}`} className="cursor-pointer text-ink-2 hover:text-ink" onClick={() => setMentions((ms) => ms.filter((x) => x !== m))}><X size={11} /></button>
              </span>
            ))}
            {file && (
              <span className="inline-flex items-center gap-1.5 rounded-sm border border-line px-2 py-1 text-xs text-ink-2">
                <Paperclip size={12} strokeWidth={1.5} /> {file.name}
                <button aria-label="Remove attachment" className="cursor-pointer hover:text-ink" onClick={() => setFile(null)}><X size={12} /></button>
              </span>
            )}
          </div>
        )}
        <form
          className="flex items-center gap-2 rounded-lg border border-line px-2.5 py-1.5 focus-within:border-line-strong focus-within:shadow-[0_0_0_2px_rgba(35,131,226,0.2)]"
          onSubmit={(e) => { e.preventDefault(); send(input); }}
        >
          <div className="relative shrink-0">
            <button
              type="button"
              aria-label="Add"
              onMouseDown={(e) => { e.stopPropagation(); setPlusOpen(!plusOpen); }}
              className="inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-full border border-line text-ink-2 hover:bg-hover hover:text-ink"
            >
              <Plus size={14} strokeWidth={1.5} />
            </button>
            <Menu open={plusOpen} onClose={() => setPlusOpen(false)} className="bottom-8 left-0 w-64">
              <MenuItem icon={Paperclip} onClick={() => { setPlusOpen(false); fileRef.current?.click(); }}>
                Add images, PDFs, or CSVs
              </MenuItem>
              <MenuItem icon={AtSign} onClick={() => { setPlusOpen(false); setInput((v) => `${v}@`); inputRef.current?.focus(); }}>
                Mention an app
              </MenuItem>
            </Menu>
            <input
              ref={fileRef}
              type="file"
              accept=".png,.jpg,.jpeg,.gif,.webp,.pdf,.csv,.txt"
              className="hidden"
              onChange={(e) => { if (e.target.files[0]) setFile(e.target.files[0]); e.target.value = ''; }}
            />
          </div>
          {srcOpts.length > 0 && (
            <div className="relative shrink-0">
              <button
                type="button"
                aria-label="Sources"
                title="What the agent reads"
                onMouseDown={(e) => { e.stopPropagation(); setSrcOpen(!srcOpen); }}
                className="inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-full text-ink-2 hover:bg-hover hover:text-ink"
              >
                <SlidersHorizontal size={14} strokeWidth={1.5} />
              </button>
              <Menu open={srcOpen} onClose={() => setSrcOpen(false)} className="bottom-8 left-0 w-64 p-2">
                <div className="pb-1.5 text-xs font-medium text-ink-2">Sources</div>
                {srcOpts.map(([k, label]) => (
                  <div key={k} className="flex h-7 items-center justify-between text-sm">
                    {label}
                    <Toggle
                      on={srcOn.has(k)}
                      onChange={() => setSrcOn((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; })}
                    />
                  </div>
                ))}
                <div className="pt-1.5 text-xs text-ink-3">The agent only reads what's on here.</div>
              </Menu>
            </div>
          )}
          <input
            ref={inputRef}
            autoFocus={autoFocus}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={placeholder}
            className="h-7 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-3"
          />
          <div className="relative shrink-0">
            <button
              type="button"
              onMouseDown={(e) => { e.stopPropagation(); setModelOpen(!modelOpen); }}
              className="h-6 cursor-pointer rounded-sm px-1.5 text-xs text-ink-2 hover:bg-hover hover:text-ink"
            >
              {MODELS.find(([k]) => k === model)?.[1]}
            </button>
            <Menu open={modelOpen} onClose={() => setModelOpen(false)} className="right-0 bottom-8 w-40">
              {MODELS.map(([k, label]) => (
                <MenuItem key={k} type="button" onClick={() => { setModel(k); setModelOpen(false); }}>
                  <span className={cn(k === model && 'font-medium')}>{label}</span>
                </MenuItem>
              ))}
            </Menu>
          </div>
          <button
            type="submit"
            aria-label="Send"
            disabled={busy || !input.trim()}
            className="inline-flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-full bg-accent text-white disabled:opacity-30"
          >
            {busy ? <Loader2 size={13} className="animate-spin" /> : <ArrowUp size={13} strokeWidth={2} />}
          </button>
        </form>
      </div>
    </div>
  );
}
